# load_data.py  – RAPTOR-ready ingest pipeline (fast edition)
# ===========================================================
import os, uuid, argparse, gc, asyncio
from io import BytesIO
from math import ceil
from typing import List
from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient
import pymupdf
import boto3
from logger_setup import log

# ─────────────── lang-chain / LLM helpers ────────────────
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_text_splitters import (
    RecursiveCharacterTextSplitter,
    MarkdownHeaderTextSplitter,
)
from langchain_experimental.text_splitter import SemanticChunker
from langchain_mongodb import MongoDBAtlasVectorSearch
from langchain_core.output_parsers import StrOutputParser
from langchain.prompts import PromptTemplate

# ─────────────── vector math / clustering ────────────────
from sklearn.cluster import MiniBatchKMeans          # ★ change ❷

# =========================================================
load_dotenv()

# ─────────────── app constants ───────────────────────────
CONNECTION_STRING          = os.getenv("MONGO_CONNECTION_STRING")
DB_NAME                    = "study_buddy_demo"
COLLECTION_NAME            = "study_materials2"
MAIN_FILE_COLLECTION_NAME  = "documents"
MAIN_FILE_DB_NAME          = "test"

MAX_LEAF_CHUNKS            = 400
FAN_OUT                    = 8
DOC_SUMMARY_THRESHOLD      = 12_000          # tokens
EMBEDDING_BATCH_SIZE       = 128             # ★ change ❶

# ─────────────── external clients ────────────────────────
client          = MongoClient(CONNECTION_STRING)
collection      = client[DB_NAME][COLLECTION_NAME]
main_collection = client[MAIN_FILE_DB_NAME][MAIN_FILE_COLLECTION_NAME]

s3_client = boto3.client(
    "s3",
    aws_access_key_id     = os.getenv("AWS_ACCESS_KEY"),
    aws_secret_access_key = os.getenv("AWS_SECRET"),
    region_name           = os.getenv("AWS_REGION"),
)

# ─────────────── models ──────────────────────────────────
llm             = ChatOpenAI(model="gpt-3.5-turbo-0125", temperature=0)
embedding_model = OpenAIEmbeddings(model="text-embedding-3-small")

# =========================================================
#                     utilities
# =========================================================
def _simple_token_len(txt: str) -> int:
    return int(len(txt.split()) * 0.75) + 1


prompt_tpl = PromptTemplate.from_template(
    "You are an elite study-guide writer.\n\n"
    "1. Read the document in {text}.\n"
    "2. Produce a concise abstract (~150 tokens).\n"
    "3. Then list 8-15 key terms with one-sentence definitions.\n\n"
    "FORMAT STRICTLY AS:\n"
    "SUMMARY:\n"
    "<abstract>\n\n"
    "KEY TERMS & DEFINITIONS:\n"
    "• Term – definition\n"
    "(continue bullets)\n\n"
    "Be accurate and do not invent facts."
)
summary_parser = StrOutputParser()

def summarize_document(text: str) -> str:
    chain = prompt_tpl | llm | summary_parser
    return chain.invoke({"text": text})

# ---------- ★ change ❸ – async/batched summariser ----------
async def summarize_many(text_blocks: List[str], concurrency: int = 8) -> List[str]:
    """Return summaries in parallel to hide LLM latency."""
    prompts = [{"text": t} for t in text_blocks]
    chains  = [prompt_tpl | llm | summary_parser for _ in prompts]

    log.info(f"▶ LLM abatch starting – {len(prompts)} prompts")
    out = await llm.abatch(
        prompts,
        chains=chains,
        max_concurrency=concurrency,
    )
    log.info("✔ LLM abatch finished")
    return out


# =========================================================
#            per-page markdown → semantic chunks
# =========================================================
def process_markdown_with_page_numbers(pdf_stream, user_id, class_id, doc_id, fname):
    doc        = pymupdf.open(stream=pdf_stream, filetype="pdf")
    num_pages  = len(doc)

    md_splitter  = MarkdownHeaderTextSplitter(
        [("#", "H1"), ("##", "H2"), ("###", "H3"),
         ("####", "H4"), ("#####", "H5"), ("######", "H6")]
    )
    sem_splitter = SemanticChunker(
        embedding_model, breakpoint_threshold_type="standard_deviation"
    )
    fallback     = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=200)

    meta_pdf  = doc.metadata or {}
    base_meta = {
        "file_name": fname,
        "title":     meta_pdf.get("title",  "Unknown"),
        "author":    meta_pdf.get("author", "Unknown"),
        "user_id":   user_id,
        "class_id":  class_id,
        "doc_id":    doc_id,
        "level":     "leaf",
        "is_summary": False,
    }

    chunks = []
    for p_idx in range(num_pages):
        page_md = doc.load_page(p_idx).get_text("markdown").strip()
        if not page_md:
            continue

        docs = md_splitter.split_text(page_md) or fallback.create_documents(page_md)
        for d in docs:
            txt = d.page_content.strip()
            if not txt:
                continue
            parts = sem_splitter.split_text(txt) if len(txt) > 1000 else [txt]
            for part in parts:
                chunks.append(
                    {
                        "text": part,
                        "metadata": {
                            **base_meta,
                            "page_number": p_idx + 1,
                            "parent_id":   None,
                        },
                    }
                )
    return chunks

# =========================================================
#                 RAPTOR tree builder
# =========================================================
def build_raptor_tree(leaves: list, fan_out=FAN_OUT) -> list:
    level_map     = {"leaf": "section", "section": "chapter", "chapter": "doc"}
    current_layer = leaves
    current_lvl   = "leaf"
    round_idx     = 0                     # ← used for logging

    while len(current_layer) > fan_out:
        next_lvl = level_map[current_lvl]
        k        = ceil(len(current_layer) / fan_out)

        # ---------- ★ change ❶ – batched embeddings ----------
        num_texts = len(current_layer)                       # FIXED (was undefined)
        log.info(f"▶ round {round_idx}: embedding {num_texts} texts")
        vecs = embedding_model.embed_documents([n["text"] for n in current_layer])
        log.info("✔ embeddings done")

        labels = MiniBatchKMeans(
            n_clusters=k,
            batch_size=max(256, k * 2),
            n_init="auto",
        ).fit_predict(vecs)

        # ---- group nodes by cluster id
        clusters: dict[int, list] = {}
        for node, lbl in zip(current_layer, labels):
            clusters.setdefault(lbl, []).append(node)

        # ---- summarize each cluster in parallel (★ change ❸)
        cluster_texts = [" ".join(n["text"] for n in grp) for grp in clusters.values()]  # FIXED generator→list
        summaries = asyncio.run(summarize_many(cluster_texts))

        # keep cluster order deterministic
        cluster_items = list(clusters.items())                 # FIXED ordering

        new_layer = []
        for parent_txt, (lbl, grp) in zip(summaries, cluster_items):
            parent_id = str(uuid.uuid4())
            for child in grp:
                child["metadata"]["parent_id"] = parent_id

            new_layer.append(
                {
                    "text": parent_txt,
                    "metadata": {
                        **grp[0]["metadata"],
                        "level":      next_lvl,
                        "parent_id":  None,
                        "is_summary": True,
                    },
                    "_id": parent_id,
                }
            )

        current_layer.extend(new_layer)
        current_layer  = new_layer
        current_lvl    = next_lvl
        round_idx     += 1                                       # increment for log

        del vecs, labels, clusters, cluster_items
        gc.collect()

    return leaves + current_layer

# =========================================================
#              batched insert → Mongo vector store
# =========================================================
def _grouper(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i : i + size]

def store_nodes(nodes: list):
    for batch in _grouper(nodes, EMBEDDING_BATCH_SIZE):
        texts     = [n["text"]     for n in batch]
        metadatas = [n["metadata"] for n in batch]
        MongoDBAtlasVectorSearch.from_texts(
            texts, embedding_model, collection=collection, metadatas=metadatas
        )
        log.info("✔ Mongo batch inserted")
        gc.collect()

# =========================================================
#                        main
# =========================================================
def load_pdf_data(user_id: str, class_name: str, s3_key: str, doc_id: str):
    # 1. download
    log.info("=== upload start ===")
    try:
        obj = s3_client.get_object(
            Bucket=os.getenv("AWS_S3_BUCKET_NAME"), Key=s3_key
        )
    except Exception:
        log.error("S3 download failed", exc_info=True)
        return
    if obj["ContentLength"] == 0:
        log.warning("S3 file is empty");  return

    pdf_stream = BytesIO(obj["Body"].read());  pdf_stream.seek(0)
    if not main_collection.find_one({"_id": ObjectId(doc_id)}):
        log.error(f"No document with id {doc_id}");  return
    fname = os.path.basename(s3_key)

    # 2. leaves
    leaves = process_markdown_with_page_numbers(
        pdf_stream, user_id, class_name, doc_id, fname
    )

    token_total = sum(_simple_token_len(c["text"]) for c in leaves)
    nodes       = leaves[:]
    top_kids    = []

    # 3. RAPTOR / summary routing
    if len(leaves) > MAX_LEAF_CHUNKS:
        nodes       = build_raptor_tree(leaves)
        top_kids    = [n for n in nodes if n["metadata"]["level"] == "chapter"]
        doc_summary = summarize_document(" ".join(n["text"] for n in top_kids))
    elif token_total > DOC_SUMMARY_THRESHOLD:
        top_kids    = leaves
        doc_summary = summarize_document(" ".join(n["text"] for n in leaves))
    else:
        doc_summary = None

    # 4. attach doc summary
    if doc_summary:
        doc_id_node = str(uuid.uuid4())
        nodes.append(
            {
                "text": doc_summary,
                "metadata": {
                    **leaves[0]["metadata"],
                    "level":      "doc",
                    "parent_id":  None,
                    "is_summary": True,
                },
                "_id": doc_id_node,
            }
        )
        for child in top_kids:
            child["metadata"]["parent_id"] = doc_id_node

    # 5. store
    try:
        store_nodes(nodes)
    except Exception:
        log.error("Mongo insert failed", exc_info=True);  return

    # 6. flip isProcessing
    main_collection.update_one(
        {"_id": ObjectId(doc_id)}, {"$set": {"isProcessing": False}}
    )
    log.info(f"[load_data] Stored {len(nodes)} nodes for doc {doc_id}")

# --- CLI --------------------------------------------------
if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--user_id", required=True)
    p.add_argument("--class_name", required=True)
    p.add_argument("--s3_key", required=True)
    p.add_argument("--doc_id", required=True)
    args = p.parse_args()
    load_pdf_data(args.user_id, args.class_name, args.s3_key, args.doc_id)
