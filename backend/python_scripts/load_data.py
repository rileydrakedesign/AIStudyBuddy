# load_data.py  – 25 Jul 2025
import os, argparse
from io import BytesIO
from queue import SimpleQueue
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

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
import asyncio
from openai import AsyncOpenAI, RateLimitError, APIConnectionError, Timeout as OpenAITimeout
import time
import redis                         


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

llm         = ChatOpenAI(model="gpt-4.1-nano", temperature=0)
embeddings  = OpenAIEmbeddings(model="text-embedding-3-small")

TOK_PER_CHAR           = 1 / 4
MAX_TOKENS_PER_REQUEST = 300_000
est_tokens             = lambda txt: int(len(txt) * TOK_PER_CHAR)

# ──────────────────  Rate‑limit guard  ──────────────────
r = redis.Redis.from_url(os.getenv("REDIS_URL"), ssl_cert_reqs=None)

# Your org’s tokens‑per‑minute limit for text‑embedding‑3‑small
TPM_LIMIT = int(os.getenv("OPENAI_TPM_LIMIT", "180000"))

# Use the same heuristic as elsewhere
TOK_PER_CHAR = 1 / 4



# ──────────────────────────────────────────────────────────────
# ASYNC EMBEDDING HELPER
# ──────────────────────────────────────────────────────────────
async_client = AsyncOpenAI()       # one shared client

async def async_embed_texts(
    texts: list[str],
    *,
    batch_size: int = 80,
    concurrency: int = 2,
) -> list[list[float]]:
    """
    Embed *texts* concurrently.
    Splits into ≤batch_size chunks and keeps ≤concurrency requests in flight.
    """
    sem     = asyncio.Semaphore(concurrency)
    results = [None] * len(texts)   # type: ignore

    async def worker(start_idx: int, slice_: list[str]):
        async with sem:
            retries = 2
            while True:
                try:
                    resp = await async_client.embeddings.create(
                        model="text-embedding-3-small", input=slice_
                    )
                    break
                except (RateLimitError, APIConnectionError, OpenAITimeout) as e:
                    if retries == 0:
                        raise e
                    retries -= 1
                    await asyncio.sleep(1.5)
            for i, d in enumerate(resp.data):
                results[start_idx + i] = d.embedding   # type: ignore

    tasks = [
        worker(i, texts[i:i + batch_size])
        for i in range(0, len(texts), batch_size)
    ]
    await asyncio.gather(*tasks)
    return results

def embed_texts_sync(texts: list[str]) -> list[list[float]]:
    """Sync wrapper so the consumer thread can call it easily."""
    return asyncio.run(async_embed_texts(texts))


def reserve_tokens(tokens_needed: int, bucket_key: str = "openai:tpm") -> bool:
    """
    Try to reserve `tokens_needed` tokens for the next minute.
    Returns True if reservation succeeded, else False.
    """
    now = int(time.time())
    pipe = r.pipeline()

    # 1) Leak tokens older than 60 s
    pipe.zremrangebyscore(bucket_key, 0, now - 60)

    # 2) How many tokens remain after leak?
    pipe.zcard(bucket_key)
    current = pipe.execute()[-1]

    # 3) Reserve if room
    if current + tokens_needed <= TPM_LIMIT:
        pipe = r.pipeline()
        # Any unique member IDs; we add one per token (fast for TPM ≤ 300k)
        for i in range(tokens_needed):
            pipe.zadd(bucket_key, {f"{now}:{i}": now})
        pipe.execute()
        remaining = TPM_LIMIT - (current + tokens_needed)
        log.info(
            "[RateLimit] Reserved %d tokens | %d remaining this minute",
            tokens_needed, remaining
        )
        return True
    # Not enough room – log and signal caller to wait
    log.info(
        "[RateLimit] Bucket full – need %d tokens, have %d/%d. Waiting …",
        tokens_needed, current, TPM_LIMIT
    )
    return False

def acquire_tokens(tokens_needed: int):
    """Block until tokens are available."""
    while not reserve_tokens(tokens_needed):
        time.sleep(0.5)        # half‑second back‑off


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

# ──────────────────────────────────────────────────────────────
# PRODUCER → CONSUMER INGEST
# ──────────────────────────────────────────────────────────────
def stream_chunks_to_atlas(
    pdf_stream,
    *,                    # force keyword args for clarity
    user_id: str,
    class_id: str,
    doc_id: str,
    file_name: str,
    batch_chars: int = 8_000,
) -> str:
    """
    Parse PDF pages in parallel, push small batches through a queue.
    Consumer thread embeds + inserts each batch immediately.
    Returns the *full_doc_text* needed for summary generation.
    """
    q: SimpleQueue[list[tuple[str, dict]]] = SimpleQueue()

    # ---------------- consumer ----------------
    # ---------------- consumer ----------------
    def consumer():
        while True:
            batch = q.get()
            if batch is None:            # poison‑pill
                break
            texts, metas = zip(*batch)
            log.info("Embedding + inserting %d texts", len(texts))

            # ① async embed (non‑blocking)
            tokens_needed = sum(int(len(t) * TOK_PER_CHAR) for t in texts)
            acquire_tokens(tokens_needed)          # NEW guard
            vectors = embed_texts_sync(list(texts))


            # ② build docs and insert directly (since from_embeddings not present)
            docs = []
            for vec, txt, meta_d in zip(vectors, texts, metas):
                doc_record = meta_d.copy()
                doc_record["text"]      = txt
                doc_record["embedding"] = vec
                docs.append(doc_record)

            collection.insert_many(docs)

    t_cons = threading.Thread(target=consumer, daemon=True)
    t_cons.start()

    # ---------------- producer (page parsing) ----------------
    doc = pymupdf.open(stream=pdf_stream, filetype="pdf")

    headers           = [("#","H1"),("##","H2"),("###","H3"),("####","H4"),("#####","H5"),("######","H6")]
    md_splitter       = MarkdownHeaderTextSplitter(headers)
    semantic_splitter = SemanticChunker(OpenAIEmbeddings(), breakpoint_threshold_type="standard_deviation")

    meta   = doc.metadata or {}
    title  = meta.get("title",  "Unknown")
    author = meta.get("author", "Unknown")

    summary_parts: list[str] = []
    batch, char_sum = [], 0

    def flush_batch():
        nonlocal char_sum
        if batch:
            q.put(batch.copy())
            batch.clear(); char_sum = 0

    def parse_page(idx: int):
        page_md = doc.load_page(idx).get_text("markdown")
        if not page_md.strip():
            return []
        page_items = []
        docs = md_splitter.split_text(page_md) or RecursiveCharacterTextSplitter(
            chunk_size=1500, chunk_overlap=200
        ).create_documents(page_md)
        for d in docs:
            text = d.page_content.strip()
            if not text:
                continue
            pieces = (
                semantic_splitter.split_text(text) if len(text) > 1000 else [text]
            )
            for piece in pieces:
                summary_parts.append(piece)
                page_items.append(
                    (
                        piece,
                        {
                            "file_name":  file_name,
                            "title":      title,
                            "author":     author,
                            "user_id":    user_id,
                            "class_id":   class_id,
                            "doc_id":     doc_id,
                            "is_summary": False,
                            "page_number": idx + 1,
                        },
                    )
                )
        return page_items

    with ThreadPoolExecutor(max_workers=os.cpu_count() or 2) as ex:
        futures = [ex.submit(parse_page, i) for i in range(len(doc))]
        for fut in as_completed(futures):
            for text, meta_d in fut.result():
                batch.append((text, meta_d))
                char_sum += len(text)
                if char_sum >= batch_chars:
                    flush_batch()

    doc.close()
    flush_batch()    # final producer flush
    q.put(None)      # stop consumer
    t_cons.join()
    log.info("Streaming ingest complete")

    return " ".join(summary_parts)

# ──────────────────────────────────────────────────────────────
# MAIN INGEST ENTRY
# ──────────────────────────────────────────────────────────────
def load_pdf_data(user_id: str, class_name: str, s3_key: str, doc_id: str):

    try:
        obj = s3_client.get_object(
            Bucket=os.getenv("AWS_S3_BUCKET_NAME"), Key=s3_key
        )
    except Exception:
        log.error("Error downloading %s from S3", s3_key, exc_info=True); return
    if obj["ContentLength"] == 0:
        log.warning("S3 file %s is empty", s3_key); return

    pdf_stream = BytesIO(obj["Body"].read()); pdf_stream.seek(0)
    if not main_collection.find_one({"_id": ObjectId(doc_id)}):
        log.error("No document with _id=%s", doc_id); return

    file_name = os.path.basename(s3_key)

    # ---------- producer → consumer pipeline ----------
    full_doc_text = stream_chunks_to_atlas(
        pdf_stream,
        user_id=user_id,
        class_id=class_name,
        doc_id=doc_id,
        file_name=file_name,
    )

    # ---------- summary generation ----------
    def safe_sum(txt: str):
        return summarize_document(txt) if est_tokens(txt) <= MAX_TOKENS_PER_REQUEST else None

    summary_text = safe_sum(full_doc_text)
    if summary_text is None:
        # try half‑split fallback
        tokens = full_doc_text.split()
        mid    = len(tokens) // 2 or 1
        s1 = safe_sum(" ".join(tokens[:mid]))
        s2 = safe_sum(" ".join(tokens[mid:]))
        if s1 and s2:
            summary_text = f"{s1}\n\n---\n\n{s2}"

    if summary_text:
        summary_meta = {
            "file_name":  file_name,
            "title":      file_name,
            "author":     "Unknown",
            "user_id":    user_id,
            "class_id":   class_name,
            "doc_id":     doc_id,
            "is_summary": True,
            "page_number": None,
        }
        MongoDBAtlasVectorSearch.from_texts(
            [summary_text], embeddings, metadatas=[summary_meta], collection=collection
        )

    # ---------- mark complete ----------
    try:
        main_collection.update_one(
            {"_id": ObjectId(doc_id)}, {"$set": {"isProcessing": False}}
        )
        log.info("set isProcessing False %s", doc_id)
    except Exception as e:
        log.error("Error updating isProcessing for doc %s: %s", doc_id, e)

    log.info("Ingest finished for doc %s", doc_id)

# ---------------------------------------------------------------------
# CLI for local testing
# ---------------------------------------------------------------------
if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--user_id", required=True)
    ap.add_argument("--class_name", required=True)
    ap.add_argument("--s3_key", required=True)
    ap.add_argument("--doc_id", required=True)
    args = ap.parse_args()
    load_pdf_data(args.user_id, args.class_name, args.s3_key, args.doc_id)
