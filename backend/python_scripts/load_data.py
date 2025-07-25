import os, re, argparse, math
from io import BytesIO
from collections import Counter, defaultdict
from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_text_splitters import (
    RecursiveCharacterTextSplitter,
    MarkdownHeaderTextSplitter,
)
from langchain_experimental.text_splitter import SemanticChunker
from langchain_core.output_parsers import StrOutputParser
from langchain.prompts import PromptTemplate
from langchain_mongodb import MongoDBAtlasVectorSearch
import boto3, pymupdf
from logger_setup import log



load_dotenv()

# ──────────────────────────────────────────────────────────────
# CONSTANTS & CLIENTS
# ──────────────────────────────────────────────────────────────
CONNECTION_STRING         = os.getenv("MONGO_CONNECTION_STRING")
DB_NAME                   = "study_buddy_demo"
COLLECTION_NAME           = "study_materials2"
MAIN_FILE_DB_NAME         = "test"
MAIN_FILE_COLLECTION_NAME = "documents"

client          = MongoClient(CONNECTION_STRING)
collection      = client[DB_NAME][COLLECTION_NAME]
main_collection = client[MAIN_FILE_DB_NAME][MAIN_FILE_COLLECTION_NAME]

s3_client = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY"),
    aws_secret_access_key=os.getenv("AWS_SECRET"),
    region_name=os.getenv("AWS_REGION"),
)

llm = ChatOpenAI(model="gpt-4.1-nano", temperature=0)

# ──────────────────────────────────────────────────────────────
# SUMMARY UTIL
# ──────────────────────────────────────────────────────────────
def summarize_document(text_input: str) -> str:
    prompt = PromptTemplate.from_template(
        "You are an expert study assistant.\n\n"
        "Document below delimited by <doc></doc> tags.\n\n"
        "<doc>\n{context}\n</doc>\n\n"
        "Write a concise yet comprehensive summary capturing all key ideas, "
        "definitions and results. Limit to ~3–5 paragraphs."
    )
    return (prompt | llm | StrOutputParser()).invoke({"context": text_input})

TOK_PER_CHAR           = 1 / 4
MAX_TOKENS_PER_REQUEST = 300_000
est_tokens = lambda txt: int(len(txt) * TOK_PER_CHAR)



# ──────────────────────────────────────────────────────────────
# CHUNKING WITH NEW CHAPTER MAP
# ──────────────────────────────────────────────────────────────
def process_markdown_with_page_numbers(pdf_stream, user_id, class_id, doc_id, file_name):
    """
    One‑pass PDF → markdown → semantic chunks.
    Closes the PyMuPDF document at the end to free page objects (big RAM win).
    """
    doc = pymupdf.open(stream=pdf_stream, filetype="pdf")

    headers           = [("#","H1"),("##","H2"),("###","H3"),("####","H4"),("#####","H5"),("######","H6")]
    md_splitter       = MarkdownHeaderTextSplitter(headers)
    semantic_splitter = SemanticChunker(OpenAIEmbeddings(), breakpoint_threshold_type="standard_deviation")

    meta   = doc.metadata or {}
    title  = meta.get("title",  "Unknown")
    author = meta.get("author", "Unknown")

    chunks = []
    for page_idx in range(len(doc)):
        page_md = doc.load_page(page_idx).get_text("markdown")
        if not page_md.strip():
            continue

        docs = md_splitter.split_text(page_md) or RecursiveCharacterTextSplitter(
            chunk_size=1500, chunk_overlap=200
        ).create_documents(page_md)

        for d in docs:
            text = d.page_content.strip()
            if not text:
                continue
            for piece in (semantic_splitter.split_text(text) if len(text) > 1000 else [text]):
                chunks.append({
                    "text": piece,
                    "metadata": {
                        "file_name":  file_name,
                        "title":      title,
                        "author":     author,
                        "user_id":    user_id,
                        "class_id":   class_id,
                        "doc_id":     doc_id,
                        "is_summary": False,
                        "page_number": page_idx + 1,
                    },
                })

    doc.close()               # ← releases all page objects (~100‑200 MB for large PDFs)
    return chunks



# ──────────────────────────────────────────────────────────────
# BATCHED EMBEDDINGS  (NEW)
# ──────────────────────────────────────────────────────────────
def store_embeddings(chunks, batch_chars: int = 8_000):
    """
    Stream‑embed *chunks* in small batches to control memory.
    Uses MongoDBAtlasVectorSearch.from_texts (built‑in embed + insert).
    """
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    texts, metas, char_sum = [], [], 0

    def flush():
        nonlocal char_sum
        if texts:
            log.info("Flushing %d texts to Atlas", len(texts))
            MongoDBAtlasVectorSearch.from_texts(        # embed + bulk insert
                texts, embeddings, metadatas=metas, collection=collection
            )
            texts.clear(); metas.clear()
            char_sum = 0                               # reset counter

    for c in chunks:
        texts.append(c["text"])
        metas.append(c["metadata"])
        char_sum += len(c["text"])
        if char_sum >= batch_chars:
            flush()

    flush()   # flush any remainder


# ──────────────────────────────────────────────────────────────
# MAIN INGEST
# ──────────────────────────────────────────────────────────────
def load_pdf_data(user_id: str, class_name: str, s3_key: str, doc_id: str):

    try:
        obj = s3_client.get_object(Bucket=os.getenv("AWS_S3_BUCKET_NAME"), Key=s3_key)
    except Exception:
        log.error(f"Error downloading {s3_key} from S3", exc_info=True); return
    if obj["ContentLength"] == 0:
        log.warning(f"S3 file {s3_key} is empty"); return

    pdf_stream = BytesIO(obj["Body"].read()); pdf_stream.seek(0)
    if not main_collection.find_one({"_id": ObjectId(doc_id)}):
        log.error(f"No document with _id={doc_id}"); return

    file_name = os.path.basename(s3_key)
    chunks    = process_markdown_with_page_numbers(pdf_stream, user_id, class_name, doc_id, file_name)

    # ── Smart summary guard-rails  (NEW) ─────────────────────────────────
    full_doc_text = " ".join(c["text"] for c in chunks)
    summary_text  = None

    def safe_sum(txt: str):
        return summarize_document(txt) if est_tokens(txt) <= MAX_TOKENS_PER_REQUEST else None

    summary_text = safe_sum(full_doc_text)

    if summary_text is None:            # split by page midpoint
        max_page = max(c["metadata"]["page_number"] or 0 for c in chunks)
        mid_page = max_page // 2 or 1
        first_txt  = " ".join(c["text"] for c in chunks if (c["metadata"]["page_number"] or 0) <= mid_page)
        second_txt = " ".join(c["text"] for c in chunks if (c["metadata"]["page_number"] or 0) > mid_page)
        s1, s2 = safe_sum(first_txt), safe_sum(second_txt)
        if s1 and s2:
            summary_text = f"{s1}\n\n---\n\n{s2}"
        else:
            log.warning(f"Summary skipped for doc {doc_id}: context too large.")

    if summary_text:
        chunks.append({
            "text": summary_text,
            "metadata": {
                "file_name":  file_name,
                "title":      chunks[0]["metadata"]["title"]  if chunks else file_name,
                "author":     chunks[0]["metadata"]["author"] if chunks else "Unknown",
                "user_id":    user_id,
                "class_id":   class_name,
                "doc_id":     doc_id,
                "is_summary": True,
                "page_number": None,
            },
        })

   

    store_embeddings(chunks)

    try:
        main_collection.update_one({"_id": ObjectId(doc_id)}, {"$set": {"isProcessing": False}})
        log.info("set isProcessing False", doc_id)
    except Exception as e:
        log.error(f"Error updating isProcessing for doc {doc_id}: {e}")

    log.info(f"Processed and stored embeddings for doc {doc_id}.")

# ---------------------------------------------------------------------
# CLI for local testing
# ---------------------------------------------------------------------
if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--user_id", required=True)
    ap.add_argument("--class_name", required=True)
    ap.add_argument("--s3_key", required=True)
    ap.add_argument("--doc_id", required=True)
    a = ap.parse_args()
    load_pdf_data(a.user_id, a.class_name, a.s3_key, a.doc_id)
