# summary_worker.py - Background summarization worker
# Handles async document summarization after ingestion completes

import json
from bson import ObjectId
from pymongo import MongoClient
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.output_parsers import StrOutputParser
from langchain.prompts import PromptTemplate
from langchain_mongodb import MongoDBAtlasVectorSearch

import config
from logger_setup import log

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

# LLM and embedding models
llm = ChatOpenAI(model=config.OPENAI_CHAT_MODEL, temperature=0)
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

# Token estimation
TOK_PER_CHAR = 1 / 4
MAX_TOKENS_PER_REQUEST = 300_000
est_tokens = lambda txt: int(len(txt) * TOK_PER_CHAR)


# ──────────────────────────────────────────────────────────────
# SUMMARIZATION FUNCTIONS
# ──────────────────────────────────────────────────────────────
def summarize_text(text_input: str) -> str:
    """
    Generate a structured summary of the provided text.
    """
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


def safe_summarize(txt: str) -> str:
    """
    Safely attempt to summarize text, returning empty string on failure.
    """
    try:
        if est_tokens(txt) <= MAX_TOKENS_PER_REQUEST:
            return summarize_text(txt)
        return ""
    except Exception as e:
        log.warning("[SUMMARY] Failed to summarize chunk: %s", e)
        return ""


def map_reduce_summary(chunks: list[str]) -> str:
    """
    For large documents: summarize chunks in groups, then merge summaries.

    This implements a 2-level hierarchy:
    1. Group chunks into ~8k-char blocks, summarize each
    2. Merge all block summaries into final summary
    """
    if not chunks:
        return ""

    # Stage 1: Group chunks and summarize each group
    block, acc, intermediate_summaries = [], 0, []

    for chunk in chunks:
        chunk_len = len(chunk)
        if acc + chunk_len > 8000 and block:
            # Summarize current block
            block_text = " \n\n".join(block)
            summary = safe_summarize(block_text)
            if summary:
                intermediate_summaries.append(summary)
            block, acc = [], 0
        block.append(chunk)
        acc += chunk_len

    # Handle remaining block
    if block:
        summary = safe_summarize(" \n\n".join(block))
        if summary:
            intermediate_summaries.append(summary)

    if not intermediate_summaries:
        return ""

    # Stage 2: Merge intermediate summaries
    merged = "\n\n---\n\n".join(intermediate_summaries)
    final_summary = safe_summarize(merged)

    # Fallback: if final merge fails, use truncated merged text
    return final_summary or merged[:4000]


def fetch_document_chunks(user_id: str, doc_id: str) -> list[str]:
    """
    Retrieve all non-summary chunks for a document, ordered by page number.
    Returns list of chunk texts.
    """
    pipeline = [
        {
            "$match": {
                "user_id": user_id,
                "doc_id": doc_id,
                "is_summary": False,
            }
        },
        {"$sort": {"page_number": 1}},
        {"$project": {"text": 1, "original_text": 1}},
    ]

    results = list(collection.aggregate(pipeline))

    # Prefer original_text (without contextual header) if available
    texts = []
    for r in results:
        text = r.get("original_text") or r.get("text", "")
        if text:
            texts.append(text)

    return texts


def fetch_section_summaries(user_id: str, doc_id: str) -> list[dict]:
    """
    Retrieve section summaries for a document, ordered by section index.
    Returns list of section summary documents.
    """
    pipeline = [
        {
            "$match": {
                "user_id": user_id,
                "doc_id": doc_id,
                "is_summary": True,
                "summary_type": "section",
            }
        },
        {"$sort": {"section_index": 1}},
        {"$project": {"text": 1, "section_index": 1, "start_page": 1, "end_page": 1}},
    ]

    return list(collection.aggregate(pipeline))


def combine_section_summaries(section_summaries: list[dict]) -> str:
    """
    Combine section summaries into a final document summary.
    Much faster than summarizing all chunks.
    """
    if not section_summaries:
        return ""

    # Combine all section summaries
    combined_text = "\n\n---\n\n".join(s["text"] for s in section_summaries)

    # Generate final summary from combined sections
    final_prompt = PromptTemplate.from_template(
        "You are an expert study assistant.\n\n"
        "Below are summaries of different sections of a document:\n\n"
        "{context}\n\n"
        "Write a comprehensive document summary in markdown format that:\n"
        "- Captures the main themes and key ideas from all sections\n"
        "- Uses ## for main headings and ### for subheadings\n"
        "- Highlights **key terms** and important concepts\n"
        "- Is well-organized and flows logically\n"
        "- Is approximately 300-500 words\n"
    )

    try:
        return (final_prompt | llm | StrOutputParser()).invoke({"context": combined_text})
    except Exception as e:
        log.error("[SUMMARY] Failed to combine section summaries: %s", e)
        # Fallback: return combined text truncated
        return combined_text[:4000]


# ──────────────────────────────────────────────────────────────
# MAIN WORKER FUNCTION
# ──────────────────────────────────────────────────────────────
def generate_document_summary(
    *,
    user_id: str,
    class_name: str,
    doc_id: str,
    file_name: str,
) -> dict:
    """
    Background job to generate and store a document summary.

    This function:
    1. First checks for section summaries (generated during ingestion)
    2. If section summaries exist, combines them (fast path)
    3. Otherwise, falls back to chunk-based summarization (slow path)
    4. Stores the summary in MongoDB with is_summary=True
    5. Updates the document record with summary_status

    Returns a dict with status and summary info.
    """
    log.info("[SUMMARY] Starting background summarization for doc %s", doc_id)

    # Update document status to indicate summarization in progress
    try:
        main_collection.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {"summaryStatus": "processing"}}
        )
    except Exception as e:
        log.warning("[SUMMARY] Could not update summaryStatus to processing: %s", e)

    try:
        # FAST PATH: Check for section summaries first
        section_summaries = fetch_section_summaries(user_id, doc_id)

        if section_summaries:
            log.info("[SUMMARY] Found %d section summaries for doc %s, using fast path",
                     len(section_summaries), doc_id)
            summary_text = combine_section_summaries(section_summaries)
            method = "section_combine"
            total_tokens = sum(est_tokens(s["text"]) for s in section_summaries)
        else:
            # SLOW PATH: Fall back to chunk-based summarization
            log.info("[SUMMARY] No section summaries found for doc %s, using chunk-based summarization", doc_id)

            # Fetch all chunks for this document
            chunks = fetch_document_chunks(user_id, doc_id)

            if not chunks:
                log.warning("[SUMMARY] No chunks found for doc %s", doc_id)
                main_collection.update_one(
                    {"_id": ObjectId(doc_id)},
                    {"$set": {"summaryStatus": "no_chunks"}}
                )
                return {"status": "no_chunks", "doc_id": doc_id}

            # Combine all chunks to estimate total size
            full_text = "\n\n".join(chunks)
            total_tokens = est_tokens(full_text)

            log.info("[SUMMARY] Doc %s: %d chunks, ~%d tokens", doc_id, len(chunks), total_tokens)

            # Choose summarization strategy based on size
            if total_tokens <= MAX_TOKENS_PER_REQUEST:
                # Single-pass summarization for smaller documents
                summary_text = safe_summarize(full_text)
                method = "single"
            else:
                # Map-reduce for large documents
                summary_text = map_reduce_summary(chunks)
                method = "map_reduce"

        if not summary_text:
            log.error("[SUMMARY] Failed to generate summary for doc %s", doc_id)
            main_collection.update_one(
                {"_id": ObjectId(doc_id)},
                {"$set": {"summaryStatus": "failed"}}
            )
            return {"status": "failed", "doc_id": doc_id, "method": method}

        # Store the summary in the vector store
        summary_meta = {
            "file_name": file_name,
            "title": file_name,
            "author": "Unknown",
            "user_id": user_id,
            "class_id": class_name,
            "doc_id": doc_id,
            "is_summary": True,
            "page_number": None,
            "source_type": "summary",
        }

        MongoDBAtlasVectorSearch.from_texts(
            [summary_text],
            embeddings,
            metadatas=[summary_meta],
            collection=collection
        )

        # Update document status to indicate summary is ready
        main_collection.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {
                "summaryStatus": "ready",
                "hasSummary": True,
            }}
        )

        # Log metrics
        log.info("[SUMMARY] Completed: %s", json.dumps({
            "doc_id": doc_id,
            "method": method,
            "input_chunks": len(chunks),
            "input_tokens": total_tokens,
            "summary_chars": len(summary_text),
        }))

        return {
            "status": "success",
            "doc_id": doc_id,
            "method": method,
            "summary_chars": len(summary_text),
        }

    except Exception as e:
        log.error("[SUMMARY] Error generating summary for doc %s: %s", doc_id, e, exc_info=True)

        # Mark as failed so on-demand generation can be attempted
        try:
            main_collection.update_one(
                {"_id": ObjectId(doc_id)},
                {"$set": {"summaryStatus": "failed"}}
            )
        except Exception:
            pass

        return {"status": "error", "doc_id": doc_id, "error": str(e)}
