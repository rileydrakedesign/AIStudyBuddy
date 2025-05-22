# load_data.py  – RAPTOR-ready ingest pipeline
# =========================================================
import os
import uuid
import argparse
from io import BytesIO
from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient
from PyPDF2 import PdfReader               #  (kept for possible future use)
import pymupdf
import boto3
import sys
from logger_setup import log

# ----------------- langchain / LLM helpers ----------------
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_text_splitters import (
    RecursiveCharacterTextSplitter,
    MarkdownHeaderTextSplitter,
)
from langchain_experimental.text_splitter import SemanticChunker
from langchain_mongodb import MongoDBAtlasVectorSearch
from langchain_core.output_parsers import StrOutputParser
from langchain.prompts import PromptTemplate

# ----------------- NEW: clustering / math -----------------
from sklearn.cluster import KMeans
from math import ceil

# ----------------------------------------------------------
load_dotenv()

# ----------------- Constants & configuration --------------
CONNECTION_STRING          = os.getenv("MONGO_CONNECTION_STRING")
DB_NAME                    = "study_buddy_demo"
COLLECTION_NAME            = "study_materials2"          # chunk & summary store
MAIN_FILE_COLLECTION_NAME  = "documents"                 # metadata
MAIN_FILE_DB_NAME          = "test"

MAX_LEAF_CHUNKS            = 400     # > → build RAPTOR tree
FAN_OUT                    = 8       # max children per parent
DOC_SUMMARY_THRESHOLD      = 12_000  # tokens – generate summary if above
CLUSTER_SUMMARY_TOKENS     = 200     # ≈150–200 tokens per parent summary

# ----------------- Mongo & S3 clients ---------------------
client          = MongoClient(CONNECTION_STRING)
collection      = client[DB_NAME][COLLECTION_NAME]
main_collection = client[MAIN_FILE_DB_NAME][MAIN_FILE_COLLECTION_NAME]

s3_client = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY"),
    aws_secret_access_key=os.getenv("AWS_SECRET"),
    region_name=os.getenv("AWS_REGION"),
)

# ----------------- LLM setup ------------------------------
llm = ChatOpenAI(model="gpt-3.5-turbo-0125", temperature=0)
embedding_model = OpenAIEmbeddings(model="text-embedding-3-small")

# ==========================================================
#                     Utility functions
# ==========================================================

def _simple_token_len(text: str) -> int:
    """Approximate token count (≈0.75 * words). Good enough for thresholds."""
    return int(len(text.split()) * 0.75) + 1


def summarize_document(text_input: str) -> str:
    """One-shot abstractive summary (~150–300 tokens)."""
    prompt_text = (
        "You are an elite study-guide writer.\n\n"
        "INSTRUCTIONS\n"
        "------------\n"
        "1. Read the document in {text}.\n"
        "2. Write a **concise abstract** (≈150 tokens) that captures every core "
        "idea, argument, and result a diligent student must know.\n"
        "3. Then produce a **bullet list of key terms and their one-sentence "
        "definitions**. Include only the most essential terms (8-15 items).\n\n"
        "FORMAT STRICTLY AS:\n"
        "SUMMARY:\n"
        "<abstract>\n\n"
        "KEY TERMS & DEFINITIONS:\n"
        "• Term 1 – definition\n"
        "• Term 2 – definition\n"
        "(continue bullets as needed)\n\n"
        "Be accurate and do not invent facts."
    )
    prompt = PromptTemplate.from_template(prompt_text)
    parser = StrOutputParser()
    chain  = prompt | llm | parser
    return chain.invoke({"text": text_input})


# ==========================================================
#                Chunk-level text extraction
# ==========================================================

def process_markdown_with_page_numbers(pdf_stream, user_id, class_id, doc_id, file_name):
    """
    Extract Markdown from each page, split into semantic chunks,
    return list[{"text":..., "metadata":{...}}].
    """
    doc       = pymupdf.open(stream=pdf_stream, filetype="pdf")
    num_pages = len(doc)

    headers_to_split_on = [
        ("#", "H1"), ("##", "H2"), ("###", "H3"),
        ("####", "H4"), ("#####", "H5"), ("######", "H6"),
    ]
    markdown_splitter  = MarkdownHeaderTextSplitter(headers_to_split_on)
    semantic_splitter  = SemanticChunker(
        embedding_model, breakpoint_threshold_type="standard_deviation"
    )
    fallback_splitter  = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=200)

    all_chunks = []

    pdf_meta = doc.metadata
    title  = pdf_meta.get("title",  "Unknown") if pdf_meta else "Unknown"
    author = pdf_meta.get("author", "Unknown") if pdf_meta else "Unknown"

    for page_idx in range(num_pages):
        page_md = doc.load_page(page_idx).get_text("markdown")
        if not page_md.strip():
            continue

        documents = markdown_splitter.split_text(page_md) or fallback_splitter.create_documents(page_md)

        for d in documents:
            chunk_text = d.page_content.strip()
            if not chunk_text:
                continue

            raw_subs = (
                semantic_splitter.split_text(chunk_text)
                if len(chunk_text) > 1000
                else [chunk_text]
            )

            for sub in raw_subs:
                all_chunks.append(
                    {
                        "text": sub,
                        "metadata": {
                            "file_name":  file_name,
                            "title":      title,
                            "author":     author,
                            "user_id":    user_id,
                            "class_id":   class_id,
                            "doc_id":     doc_id,
                            "is_summary": False,
                            "page_number": page_idx + 1,
                            "level":      "leaf",
                            "parent_id":  None,
                        },
                    }
                )
    return all_chunks


# ==========================================================
#              RAPTOR tree-builder (NEW SECTION)
# ==========================================================

def build_raptor_tree(leaves: list, fan_out: int = FAN_OUT) -> list:
    """
    Input  : list of leaf dicts (text + metadata, parent_id still None)
    Output : leaves + newly created parent summaries (section/chapter) –
             every node has .metadata.level and .metadata.parent_id set.
    """
    layer       = leaves
    level_names = {"leaf": "section", "section": "chapter", "chapter": "doc"}

    current_level = "leaf"
    while len(layer) > fan_out:
        next_level = level_names[current_level]
        k          = ceil(len(layer) / fan_out)
        vectors    = [embedding_model.embed_query(n["text"]) for n in layer]
        labels     = KMeans(n_clusters=k, n_init="auto").fit_predict(vectors)

        new_layer = []
        for lbl in set(labels):
            cluster   = [n for n, l in zip(layer, labels) if l == lbl]
            concat_txt = " ".join(n["text"] for n in cluster)
            summary    = summarize_document(concat_txt)

            parent_id = str(uuid.uuid4())

            # update children
            for child in cluster:
                child["metadata"]["parent_id"] = parent_id

            new_layer.append(
                {
                    "text": summary,
                    "metadata": {
                        **cluster[0]["metadata"],
                        "level":     next_level,
                        "parent_id": None,
                        "is_summary": True,
                    },
                    "_id": parent_id,
                }
            )

        layer.extend(new_layer)   # keep for storage
        layer        = new_layer  # next iteration
        current_level = next_level

    return leaves + layer  # full set


# -------------------- helper: vector store insert -----------
def store_nodes(nodes: list):
    """Embed (if not already) & insert nodes in batch."""
    texts      = [n["text"] for n in nodes]
    metadatas  = [n["metadata"] for n in nodes]
    MongoDBAtlasVectorSearch.from_texts(
        texts, embedding_model, collection=collection, metadatas=metadatas
    )


# ==========================================================
#                 Main entry: load_pdf_data
# ==========================================================

def load_pdf_data(user_id: str, class_name: str, s3_key: str, doc_id: str):
    """
    1) Pull PDF from S3
    2) Chunk → maybe RAPTOR → maybe doc summary
    3) Embed + write to Mongo
    4) Mark isProcessing = False
    """

    try:
        response = s3_client.get_object(Bucket=os.getenv("AWS_S3_BUCKET_NAME"), Key=s3_key)
    except Exception:
        log.error(f"Error downloading {s3_key} from S3", exc_info=True)
        return

    if response["ContentLength"] == 0:
        log.warning(f"S3 file {s3_key} is empty")
        return

    pdf_stream = BytesIO(response["Body"].read())
    pdf_stream.seek(0)

    if not main_collection.find_one({"_id": ObjectId(doc_id)}):
        log.error(f"No document with _id={doc_id}")
        return

    file_name = os.path.basename(s3_key)

    # ---------- 1) leaf extraction ----------
    leaves = process_markdown_with_page_numbers(
        pdf_stream, user_id, class_name, doc_id, file_name
    )

    total_tokens = sum(_simple_token_len(c["text"]) for c in leaves)
    nodes        = leaves[:]   # will append summaries
    top_children = []          # placeholders for doc summary parenting

    # ---------- 2) RAPTOR / summary logic ----------
    if len(leaves) > MAX_LEAF_CHUNKS:
        # BIG file → build tree
        nodes = build_raptor_tree(leaves)
        top_children = [n for n in nodes if n["metadata"]["level"] == "chapter"]
        doc_summary_text = summarize_document(" ".join(n["text"] for n in top_children))
    elif total_tokens > DOC_SUMMARY_THRESHOLD:
        # MEDIUM file → flat + doc summary
        top_children = leaves
        doc_summary_text = summarize_document(" ".join(c["text"] for c in leaves))
    else:
        # SMALL file → flat only, no doc summary
        doc_summary_text = None

    # ---------- 3) inject doc-level summary ----------
    if doc_summary_text:
        doc_node_id = str(uuid.uuid4())
        nodes.append(
            {
                "text": doc_summary_text,
                "metadata": {
                    **leaves[0]["metadata"],
                    "level":     "doc",
                    "parent_id": None,
                    "is_summary": True,
                },
                "_id": doc_node_id,
            }
        )
        # link its immediate children
        for child in top_children:
            child["metadata"]["parent_id"] = doc_node_id

    # ---------- 4) store everything ----------
    try:
        store_nodes(nodes)
    except Exception:
        log.error("Error inserting nodes", exc_info=True)
        return

    # ---------- 5) flip isProcessing ----------
    try:
        main_collection.update_one(
            {"_id": ObjectId(doc_id)}, {"$set": {"isProcessing": False}}
        )
    except Exception as update_err:
        log.error(f"Error updating isProcessing for doc {doc_id}: {update_err}")

    log.info(f"[load_data] Stored {len(nodes)} nodes for doc {doc_id}")


# ----------------------------------------------------------
# For local CLI testing
# ----------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--user_id", required=True)
    parser.add_argument("--class_name", required=True)
    parser.add_argument("--s3_key", required=True)
    parser.add_argument("--doc_id", required=True)
    args = parser.parse_args()

    load_pdf_data(args.user_id, args.class_name, args.s3_key, args.doc_id)
