# load_data.py  – 25 Jul 2025
import os, argparse
import hashlib
from io import BytesIO
from queue import SimpleQueue
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import boto3  # AWS S3 client
import pymupdf
import asyncio
import time
import json

from bson import ObjectId
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
from openai import AsyncOpenAI, RateLimitError, APIConnectionError, Timeout as OpenAITimeout

import config
from logger_setup import log
from redis_setup import get_redis
from docx_processor import extract_docx_paragraphs, extract_docx_metadata, get_docx_stats, convert_docx_to_pdf, convert_docx_to_pdf_cloudmersive

# ──────────────────────────────────────────────────────────────
# CONSTANTS & CLIENTS
# ──────────────────────────────────────────────────────────────
DB_NAME = "study_buddy_demo"
COLLECTION_NAME = "study_materials2"
MAIN_FILE_DB_NAME = "test"
MAIN_FILE_COLLECTION_NAME = "documents"

# MongoDB clients
client = MongoClient(config.MONGO_CONNECTION_STRING)
collection = client[DB_NAME][COLLECTION_NAME]
main_collection = client[MAIN_FILE_DB_NAME][MAIN_FILE_COLLECTION_NAME]

# S3 client
s3_client = boto3.client(
    "s3",
    aws_access_key_id=config.AWS_ACCESS_KEY,
    aws_secret_access_key=config.AWS_SECRET,
    region_name=config.AWS_REGION,
)

# LLM and embedding models
llm = ChatOpenAI(model=config.OPENAI_CHAT_MODEL, temperature=0)
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

# Token estimation configuration
TOK_PER_CHAR = 1 / 4
MAX_TOKENS_PER_REQUEST = 300_000
est_tokens = lambda txt: int(len(txt) * TOK_PER_CHAR)

# Rate-limit guard using Redis
r = get_redis()
TPM_LIMIT = config.OPENAI_TPM_LIMIT



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
        return True
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
        "Write a concise yet comprehensive summary in markdown format capturing all key ideas, "
        "definitions, and results. Use the following markdown formatting:\n"
        "- Use ## for main section headings\n"
        "- Use ### for subsection headings\n"
        "- Use **bold** for key terms and important concepts\n"
        "- Use bullet points (-) or numbered lists (1.) for listing items\n"
        "- Use `code` formatting for technical terms or formulas\n"
        "- Keep the summary well-structured and organized with clear sections\n"
        "Limit to ~3–5 paragraphs or equivalent in structured markdown."
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
) -> tuple[str, list[str]]:
    """
    Parse PDF pages in parallel, push small batches through a queue.
    Consumer thread embeds + inserts each batch immediately.
    Returns a tuple: (full_doc_text, summary_parts) for downstream summarisation.
    """
    q: SimpleQueue[list[tuple[str, dict]]] = SimpleQueue()
    # Ingest metrics counters
    pages_total = 0
    pages_empty = 0
    chunks_produced = 0
    chunks_inserted = 0
    duplicates_skipped = 0
    embed_batches = 0
    embed_latency_ms_total = 0
    insert_retries_total = 0
    total_chars = 0
    max_chunk_chars = 0

    # ---------------- consumer ----------------
    # ---------------- consumer ----------------
    def consumer():
        nonlocal embed_batches, embed_latency_ms_total, duplicates_skipped, chunks_inserted, insert_retries_total
        while True:
            batch = q.get()
            if batch is None:            # poison‑pill
                break
            texts, metas = zip(*batch)
            log.info("Embedding + inserting %d texts", len(texts))

            # ① async embed (non‑blocking)
            tokens_needed = sum(int(len(t) * TOK_PER_CHAR) for t in texts)
            acquire_tokens(tokens_needed)          # NEW guard
            t0 = time.time()
            vectors = embed_texts_sync(list(texts))
            embed_batches += 1
            embed_latency_ms_total += int((time.time() - t0) * 1000)


            # ② build docs and insert directly (since from_embeddings not present)
            docs = []
            seen_hashes: set[str] = set()
            for vec, txt, meta_d in zip(vectors, texts, metas):
                doc_record = meta_d.copy()
                doc_record["text"]      = txt
                doc_record["embedding"] = vec
                # Stable hash per doc for dedup within this ingest
                norm = " ".join(txt.split()).lower()
                h = hashlib.sha1(norm.encode("utf-8")).hexdigest()
                if h in seen_hashes:
                    duplicates_skipped += 1
                    continue
                seen_hashes.add(h)
                doc_record["chunk_hash"] = h
                docs.append(doc_record)

            if docs:
                attempts = 0
                while True:
                    try:
                        collection.insert_many(docs)
                        chunks_inserted += len(docs)
                        break
                    except Exception as e:
                        attempts += 1
                        insert_retries_total += 1
                        if attempts > 3:
                            log.error("insert_many failed after retries: %s", e)
                            break
                        time.sleep(0.75 * attempts)

    t_cons = threading.Thread(target=consumer, daemon=True)
    t_cons.start()

    # ---------------- producer (page parsing) ----------------
    doc = pymupdf.open(stream=pdf_stream, filetype="pdf")

    headers           = [("#","H1"),("##","H2"),("###","H3"),("####","H4"),("#####","H5"),("######","H6")]
    md_splitter       = MarkdownHeaderTextSplitter(headers)
    semantic_splitter = SemanticChunker(embeddings, breakpoint_threshold_type="standard_deviation")

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
        nonlocal pages_total, pages_empty, chunks_produced, total_chars, max_chunk_chars
        page_md = doc.load_page(idx).get_text("markdown")
        pages_total += 1
        if not page_md.strip():
            log.warning("Empty markdown on page %d; skipping (extracted=false)", idx + 1)
            pages_empty += 1
            return []
        page_items = []
        docs = md_splitter.split_text(page_md) or RecursiveCharacterTextSplitter(
            chunk_size=1200, chunk_overlap=120
        ).create_documents(page_md)
        for d in docs:
            text = d.page_content.strip()
            if not text:
                continue
            if len(text) > 2000:
                # Guard SemanticChunker embedding calls with the same token limiter
                acquire_tokens(int(len(text) * TOK_PER_CHAR))
                pieces = semantic_splitter.split_text(text)
            else:
                pieces = [text]
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
                            "source_type": "pdf",  # NEW field for format identification
                        },
                    )
                )
                chunks_produced += 1
                total_chars += len(piece)
                if len(piece) > max_chunk_chars:
                    max_chunk_chars = len(piece)
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
    # Emit final metrics for this ingest
    try:
        metrics = {
            "doc_id": doc_id,
            "pages_total": pages_total,
            "pages_empty": pages_empty,
            "chunks_produced": chunks_produced,
            "chunks_inserted": chunks_inserted,
            "duplicates_skipped": duplicates_skipped,
            "embed_batches": embed_batches,
            "embed_latency_ms_total": embed_latency_ms_total,
            "insert_retries_total": insert_retries_total,
            "total_chars": total_chars,
            "max_chunk_chars": max_chunk_chars,
        }
        log.info("[METRICS] ingest %s", json.dumps(metrics))
    except Exception:
        pass
    log.info("Streaming ingest complete")

    return " ".join(summary_parts), summary_parts


# ──────────────────────────────────────────────────────────────
# DOCX PROCESSING PIPELINE
# ──────────────────────────────────────────────────────────────
def stream_docx_chunks_to_atlas(
    docx_stream,
    *,
    user_id: str,
    class_id: str,
    doc_id: str,
    file_name: str,
    batch_chars: int = 8_000,
) -> tuple[str, list[str]]:
    """
    Process DOCX paragraphs and push batches through a queue.
    Consumer thread embeds + inserts each batch immediately.
    Returns a tuple: (full_doc_text, summary_parts) for downstream summarization.
    """
    q: SimpleQueue[list[tuple[str, dict]]] = SimpleQueue()

    # Ingest metrics counters
    paragraphs_total = 0
    chunks_produced = 0
    chunks_inserted = 0
    duplicates_skipped = 0
    embed_batches = 0
    embed_latency_ms_total = 0
    insert_retries_total = 0
    total_chars = 0
    max_chunk_chars = 0

    # ---------------- consumer (identical to PDF) ----------------
    def consumer():
        nonlocal embed_batches, embed_latency_ms_total, duplicates_skipped, chunks_inserted, insert_retries_total
        while True:
            batch = q.get()
            if batch is None:  # poison-pill
                break
            texts, metas = zip(*batch)
            log.info("Embedding + inserting %d texts", len(texts))

            # ① async embed
            tokens_needed = sum(int(len(t) * TOK_PER_CHAR) for t in texts)
            acquire_tokens(tokens_needed)
            t0 = time.time()
            vectors = embed_texts_sync(list(texts))
            embed_batches += 1
            embed_latency_ms_total += int((time.time() - t0) * 1000)

            # ② build docs and insert
            docs = []
            seen_hashes: set[str] = set()
            for vec, txt, meta_d in zip(vectors, texts, metas):
                doc_record = meta_d.copy()
                doc_record["text"] = txt
                doc_record["embedding"] = vec
                # Dedup hash
                norm = " ".join(txt.split()).lower()
                h = hashlib.sha1(norm.encode("utf-8")).hexdigest()
                if h in seen_hashes:
                    duplicates_skipped += 1
                    continue
                seen_hashes.add(h)
                doc_record["chunk_hash"] = h
                docs.append(doc_record)

            if docs:
                attempts = 0
                while True:
                    try:
                        collection.insert_many(docs)
                        chunks_inserted += len(docs)
                        break
                    except Exception as e:
                        attempts += 1
                        insert_retries_total += 1
                        if attempts > 3:
                            log.error("insert_many failed after retries: %s", e)
                            break
                        time.sleep(0.75 * attempts)

    t_cons = threading.Thread(target=consumer, daemon=True)
    t_cons.start()

    # ---------------- producer (DOCX paragraph parsing) ----------------
    try:
        # Extract metadata
        docx_stream.seek(0)
        metadata = extract_docx_metadata(docx_stream)
        title = metadata.get("title", "Unknown")
        author = metadata.get("author", "Unknown")

        # Extract paragraphs with sequential numbering
        docx_stream.seek(0)
        paragraphs_with_numbers = extract_docx_paragraphs(docx_stream)

        # Get stats for logging
        docx_stream.seek(0)
        stats = get_docx_stats(docx_stream)
        log.info(f"DOCX stats: {stats}")

    except Exception as e:
        log.error(f"Failed to extract DOCX content: {e}")
        q.put(None)  # Stop consumer
        t_cons.join()
        raise

    summary_parts: list[str] = []
    batch, char_sum = [], 0

    def flush_batch():
        nonlocal char_sum
        if batch:
            q.put(batch.copy())
            batch.clear()
            char_sum = 0

    # Process each paragraph
    for paragraph_text, paragraph_num in paragraphs_with_numbers:
        paragraphs_total += 1

        # Use RecursiveCharacterTextSplitter for long paragraphs
        if len(paragraph_text) > 1200:
            splitter = RecursiveCharacterTextSplitter(
                chunk_size=1200, chunk_overlap=120
            )
            pieces = splitter.split_text(paragraph_text)
        else:
            pieces = [paragraph_text]

        for piece in pieces:
            summary_parts.append(piece)
            batch.append(
                (
                    piece,
                    {
                        "file_name": file_name,
                        "title": title,
                        "author": author,
                        "user_id": user_id,
                        "class_id": class_id,
                        "doc_id": doc_id,
                        "is_summary": False,
                        "page_number": paragraph_num,  # Store paragraph number as page_number
                        "source_type": "docx",          # NEW field for format identification
                    },
                )
            )
            chunks_produced += 1
            total_chars += len(piece)
            if len(piece) > max_chunk_chars:
                max_chunk_chars = len(piece)

            char_sum += len(piece)
            if char_sum >= batch_chars:
                flush_batch()

    flush_batch()  # final producer flush
    q.put(None)    # stop consumer
    t_cons.join()

    # Emit final metrics
    try:
        metrics = {
            "doc_id": doc_id,
            "format": "docx",
            "paragraphs_total": paragraphs_total,
            "chunks_produced": chunks_produced,
            "chunks_inserted": chunks_inserted,
            "duplicates_skipped": duplicates_skipped,
            "embed_batches": embed_batches,
            "embed_latency_ms_total": embed_latency_ms_total,
            "insert_retries_total": insert_retries_total,
            "total_chars": total_chars,
            "max_chunk_chars": max_chunk_chars,
        }
        log.info("[METRICS] docx_ingest %s", json.dumps(metrics))
    except Exception:
        pass

    log.info("DOCX streaming ingest complete")
    return " ".join(summary_parts), summary_parts


# ──────────────────────────────────────────────────────────────
# MAIN INGEST ENTRY (RENAMED & FORMAT-AGNOSTIC)
# ──────────────────────────────────────────────────────────────
def load_document_data(user_id: str, class_name: str, s3_key: str, doc_id: str):
    """
    Load and process a document (PDF or DOCX) from S3.

    Detects file type from S3 key extension and routes to appropriate processor.
    """
    # ---------- file type detection ----------
    file_ext = s3_key.lower().split('.')[-1]
    log.info(f"Processing document: {s3_key} (detected format: {file_ext})")

    if file_ext not in ['pdf', 'docx']:
        log.error(f"Unsupported file type: {file_ext} for {s3_key}")
        return

    # ---------- download from S3 ----------
    try:
        obj = s3_client.get_object(
            Bucket=config.AWS_S3_BUCKET_NAME, Key=s3_key
        )
    except Exception:
        log.error("Error downloading %s from S3", s3_key, exc_info=True)
        return

    if obj["ContentLength"] == 0:
        log.warning("S3 file %s is empty", s3_key)
        return

    # ---------- verify document exists in DB ----------
    file_stream = BytesIO(obj["Body"].read())
    file_stream.seek(0)

    if not main_collection.find_one({"_id": ObjectId(doc_id)}):
        log.error("No document with _id=%s", doc_id)
        return

    file_name = os.path.basename(s3_key)

    # ---------- route to format-specific processor ----------
    if file_ext == 'docx':
        log.info(f"Processing DOCX: {file_name}")

        # Convert DOCX to PDF for viewing (with citation navigation)
        pdf_s3_key = None
        try:
            cloudmersive_api_key = os.getenv("CLOUDMERSIVE_API_KEY")
            if cloudmersive_api_key:
                log.info("[DOCX-CONVERSION] Converting DOCX to PDF using Cloudmersive")
                file_stream.seek(0)
                pdf_buffer = convert_docx_to_pdf_cloudmersive(file_stream, cloudmersive_api_key)

                # Upload converted PDF to S3
                base_name = os.path.splitext(s3_key)[0]  # Remove .docx extension
                pdf_s3_key = f"{base_name}-converted.pdf"

                log.info(f"[DOCX-CONVERSION] Uploading converted PDF to S3: {pdf_s3_key}")
                s3_client.put_object(
                    Bucket=config.AWS_S3_BUCKET_NAME,
                    Key=pdf_s3_key,
                    Body=pdf_buffer.getvalue(),
                    ContentType="application/pdf"
                )
                log.info(f"[DOCX-CONVERSION] Successfully uploaded PDF to S3: {pdf_s3_key}")

                # Update document record with pdfS3Key
                main_collection.update_one(
                    {"_id": ObjectId(doc_id)},
                    {"$set": {"pdfS3Key": pdf_s3_key}}
                )
                log.info(f"[DOCX-CONVERSION] Updated document {doc_id} with pdfS3Key")
            else:
                log.warning("[DOCX-CONVERSION] CLOUDMERSIVE_API_KEY not set - skipping PDF conversion")
        except Exception as e:
            log.error(f"[DOCX-CONVERSION] Failed to convert DOCX to PDF: {e}", exc_info=True)
            # Continue with DOCX processing even if conversion fails

        # Process DOCX text for RAG (always use original DOCX)
        file_stream.seek(0)
        full_doc_text, parts = stream_docx_chunks_to_atlas(
            file_stream,
            user_id=user_id,
            class_id=class_name,
            doc_id=doc_id,
            file_name=file_name,
        )
    elif file_ext == 'pdf':
        log.info(f"Processing PDF: {file_name}")
        full_doc_text, parts = stream_chunks_to_atlas(
            file_stream,
            user_id=user_id,
            class_id=class_name,
            doc_id=doc_id,
            file_name=file_name,
        )
    else:
        log.error(f"Unexpected file type after validation: {file_ext}")
        return

    # ---------- summary generation ----------
    def safe_sum(txt: str) -> str:
        try:
            return summarize_document(txt) if est_tokens(txt) <= MAX_TOKENS_PER_REQUEST else ""
        except Exception:
            return ""

    def map_reduce_summary(chunks: list[str]) -> str:
        if not chunks:
            return ""
        # Group chunks into ~8k-char blocks, summarise each, then merge
        block, acc, out_summaries = [], 0, []
        for ch in chunks:
            L = len(ch)
            if acc + L > 8000 and block:
                block_text = " \n\n".join(block)
                sm = safe_sum(block_text)
                if sm:
                    out_summaries.append(sm)
                block, acc = [], 0
            block.append(ch); acc += L
        if block:
            sm = safe_sum(" \n\n".join(block))
            if sm:
                out_summaries.append(sm)
        if not out_summaries:
            return ""
        merged = "\n\n---\n\n".join(out_summaries)
        final = safe_sum(merged)
        return final or merged[:3000]

    summary_text = ""
    method = "single"
    if est_tokens(full_doc_text) <= MAX_TOKENS_PER_REQUEST:
        summary_text = safe_sum(full_doc_text)
    if not summary_text:
        summary_text = map_reduce_summary(parts)
        method = "map_reduce"
    try:
        log.info("[METRICS] summarizer %s", json.dumps({
            "doc_id": doc_id,
            "method": method,
            "input_chars": len(full_doc_text),
            "summary_chars": len(summary_text or "")
        }))
    except Exception:
        pass

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
    load_document_data(args.user_id, args.class_name, args.s3_key, args.doc_id)
# Ensure unique index on (doc_id, chunk_hash) for cross-run dedup (only when chunk_hash exists)
try:
    collection.create_index(
        [("doc_id", 1), ("chunk_hash", 1)],
        unique=True,
        partialFilterExpression={"chunk_hash": {"$exists": True}},
        name="uniq_doc_chunkhash",
    )
except Exception as e:
    log.warning("Index creation ignored: %s", e)
