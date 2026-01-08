import re
import json
import sys
import math
import time
import asyncio
import traceback
from pathlib import Path
from typing import List, Tuple
from urllib.parse import quote
from json import dumps as _json_dumps
from botocore.exceptions import ClientError
from langchain.chains import create_history_aware_retriever
from langchain_core.callbacks import AsyncCallbackHandler
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import (
    PromptTemplate,
    ChatPromptTemplate,
    MessagesPlaceholder,
)
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from pymongo import MongoClient
from bson import ObjectId

import config
from logger_setup import log
from router import detect_route
from redis_setup import get_redis


# ------------------------------------------------------------------
# Robust OpenAI exception aliases (works with any SDK version)
# ------------------------------------------------------------------
try:
    # ≥ v1.0
    from openai._exceptions import (
        InvalidRequestError,
        BadRequestError,
        RateLimitError,
        APIConnectionError,
        Timeout as OpenAITimeout,
        APIStatusError,
    )  # type: ignore
except ImportError:
    try:
        # ≤ v0.28
        from openai.error import (   # type: ignore
            InvalidRequestError as InvalidRequestError,
            RateLimitError,
            APIConnectionError,
            Timeout as OpenAITimeout,
            APIError as APIStatusError,
        )
        BadRequestError = InvalidRequestError  # alias not exposed pre-1.0
    except ImportError:
        # Fallback—treat all as generic Exception
        InvalidRequestError = BadRequestError = RateLimitError = APIConnectionError = APIStatusError = OpenAITimeout = Exception  # type: ignore

# ──────────────────────────────────────────────────────────────
# CLIENTS & CONNECTIONS
# ──────────────────────────────────────────────────────────────
# Note: Environment variables are now loaded in semantic_service.py before any imports

# TLS-aware Redis client; verifies by default
r = get_redis()

# Rate-limit configuration
TPM_LIMIT = config.OPENAI_TPM_LIMIT
TOK_PER_CHAR = 1 / 4  # heuristic for token estimation

# MongoDB connection
client = MongoClient(config.MONGO_CONNECTION_STRING)
db_name = "study_buddy_demo"
collection_name = "study_materials2"
collection = client[db_name][collection_name]

# OpenAI embedding model
embedding_model = OpenAIEmbeddings(model="text-embedding-3-small")

# ──────────────────────────────────────────────────────────────
# FEATURE FLAG STARTUP LOGGING (P0/P1 - RAG Architecture v1.1)
# ──────────────────────────────────────────────────────────────
log.info(
    "[CONFIG] RAG Feature Flags: "
    f"contextual_headers={config.CONTEXTUAL_HEADERS_ENABLED}, "
    f"hybrid_search={config.HYBRID_SEARCH_ENABLED}, "
    f"reranking={config.RERANKING_ENABLED}, "
    f"multi_query={config.MULTI_QUERY_ENABLED}, "
    f"hierarchical_chunks={config.HIERARCHICAL_CHUNKING_ENABLED}"
)
log.info(f"[CONFIG] Route Models: {config.ROUTE_MODELS}")

# Route-specific RAG configuration
ROUTE_CONFIG = {
    "general_qa": {
        "k": config.RAG_K,
        "numCandidates": config.RAG_CANDIDATES,
        "temperature": config.RAG_TEMP_GENERAL,
        "max_output_tokens": config.RAG_MAX_TOKENS,
    },
    "follow_up": {
        "k": config.RAG_K_FOLLOWUP,
        "numCandidates": config.RAG_CANDIDATES,
        "temperature": config.RAG_TEMP_FOLLOWUP,
        "max_output_tokens": config.RAG_MAX_TOKENS,
    },
    "quote_finding": {
        "k": config.RAG_K_QUOTE,
        "numCandidates": 1200,  # Higher for quote finding
        "temperature": config.RAG_TEMP_QUOTE,
        "max_output_tokens": config.RAG_MAX_TOKENS_QUOTE,
    },
    "generate_study_guide": {
        "k": config.RAG_K_GUIDE,
        "numCandidates": 800,
        "temperature": config.RAG_TEMP_GUIDE,
        "max_output_tokens": config.RAG_MAX_TOKENS_GUIDE,
    },
    "summary": {
        "k": config.RAG_K_SUM,
        "numCandidates": 800,
        "temperature": config.RAG_TEMP_SUM,
        "max_output_tokens": config.RAG_MAX_TOKENS_SUM,
    },
}


def get_llm(route: str) -> ChatOpenAI:
    """
    Get a ChatOpenAI instance configured for the specified route.

    Uses route-specific models from config.ROUTE_MODELS for quality/cost optimization.
    Falls back to OPENAI_CHAT_MODEL if route not found.
    """
    cfg = ROUTE_CONFIG.get(route, ROUTE_CONFIG["general_qa"])

    # P1: Route-specific model selection
    model_name = config.ROUTE_MODELS.get(route, config.OPENAI_CHAT_MODEL)

    return ChatOpenAI(model=model_name, temperature=cfg["temperature"])


# Backend URL for file citations
backend_url = config.BACKEND_URL

# ------------------------------------------------------------------
# Context-window guard-rails
# ------------------------------------------------------------------
MAX_PROMPT_TOKENS = config.MAX_PROMPT_TOKENS  # safe ceiling for context window
est_tokens = lambda txt: int(len(txt) * TOK_PER_CHAR)  # heuristic token estimation

# Keep defined for telemetry but do not gate by default
SIMILARITY_THRESHOLD = config.SIMILARITY_THRESHOLD


# ──────────────────────────────────────────────────────────────
# ────────────────  NEW MODE-DETECTION HELPERS  ───────────────
# ──────────────────────────────────────────────────────────────
SUMMARY_RE    = re.compile(r"\bsummar(?:y|ize|ise)\b", re.I)
STUDYGUIDE_RE = re.compile(r"\b(study[-\s]?guide|make\s+me\s+a\s+guide)\b", re.I)
# ------------- Quote-finding helpers -------------
QUOTE_PATTERNS = [
    r"\bfind(?:\s+me)?\s+(?:a\s+)?quote(?:s)?(?:\s+(?:on|about|for))?\b",
    r"\bgive(?:\s+me)?\s+(?:a\s+)?quote(?:s)?(?:\s+(?:on|about|for))?\b",
    r"\bquote(?:\s+(?:on|about|for))?\b",
]
QUOTE_PATTERN_RE = re.compile("|".join(QUOTE_PATTERNS), re.I)

def strip_quote_phrases(query: str) -> str:
    """Remove boiler-plate ‘find a quote …’ phrases."""
    return re.sub(QUOTE_PATTERN_RE, "", query).strip()

def has_sufficient_quote_context(cleaned_query: str) -> bool:
    """Heuristic: ≥3 meaningful tokens after stripping filler."""
    return len(cleaned_query.split()) >= 3


def detect_query_mode(query: str) -> str:
    """
    Return 'study_guide', 'summary', or 'specific'.
    """
    if STUDYGUIDE_RE.search(query):
        return "study_guide"
    if SUMMARY_RE.search(query):
        return "summary"
    return "specific"


# ───────────────────────── NEW helper (place near other helpers) ─────────────────────────
def suggest_refine_queries() -> List[str]:
    """
    Return a few generic follow-up hints the UI can show when no chunks meet
    the similarity threshold.
    """
    return [
        "Ask about a specific key term, e.g. “Define entropy in Chapter 2”.",
        "Refer to a section number, e.g. “Summarise Section 3.4”.",
        "Break the question into a smaller part, e.g. “List the main theorems first”.",
    ]


def log_metrics(tag: str, data: dict):
    """Emit compact structured metrics for monitoring."""
    try:
        log.info("[METRICS] %s %s", tag, _json_dumps(data, ensure_ascii=False))
    except Exception:
        pass


def _tpm_bucket_key() -> str:
    return "openai:tpm:counter"

def reserve_tokens(tokens_needed: int) -> tuple[bool, int]:
    """Counter-based minute bucket using INCRBY + EXPIRE 70s.
    Returns (ok, used_after).
    """
    key = _tpm_bucket_key()
    pipe = r.pipeline()
    pipe.incrby(key, tokens_needed)
    pipe.expire(key, 70)
    used_after, _ = pipe.execute()
    if used_after <= TPM_LIMIT:
        return True, used_after
    try:
        r.decrby(key, tokens_needed)
    except Exception:
        pass
    return False, used_after


def try_acquire_tokens(tokens_needed: int, max_wait_s: float = 10.0) -> bool:
    waited = 0.0
    ok, _ = reserve_tokens(tokens_needed)
    if ok:
        return True
    while waited < max_wait_s:
        time.sleep(0.5)
        waited += 0.5
        ok, _ = reserve_tokens(tokens_needed)
        if ok:
            return True
    return False



# ──────────────────────────────────────────────────────────────
# -------- Existing utility helpers (unchanged where noted) ---
# ──────────────────────────────────────────────────────────────
def create_embedding(text: str):
    return embedding_model.embed_query(text)


def perform_semantic_search(query_vector, filters=None, *, limit: int = 12, numCandidates: int = 1000):
    pipeline = [
        {
            "$vectorSearch": {
                "index": "PlotSemanticSearch",
                "path": "embedding",
                "queryVector": query_vector,
                "numCandidates": numCandidates,
                "limit": limit,
                "filter": filters,
            }
        },
        {
            "$project": {
                "_id": 1,
                "text": 1,
                "file_name": 1,
                "title": 1,
                "author": 1,
                "page_number": 1,
                "chapter_idx": 1,
                "doc_id": 1,
                "is_summary": 1,
                "score": {"$meta": "vectorSearchScore"},
            }
        },
    ]
    return collection.aggregate(pipeline)


def get_file_citation(search_results):
    """
    Generate unique file citations with download links via backend proxy.
    """
    citations = []
    seen_files = set()

    for result in search_results:
        s3_key = result.get("file_name")
        file_title = result.get("file_name")
        doc_id = result.get("doc_id")

        if s3_key and s3_key not in seen_files:
            seen_files.add(s3_key)
            encoded_s3_key = quote(s3_key, safe="")
            download_url = f"{backend_url}/api/v1/download?s3_key={encoded_s3_key}"
            citations.append(
                {"href": download_url, "text": file_title, "docId": doc_id}
            )
        elif not s3_key and file_title not in seen_files:
            seen_files.add(file_title)
            citations.append({"href": None, "text": file_title, "docId": doc_id})

    return citations


def escape_curly_braces(text: str):
    return text.replace("{", "{{").replace("}", "}}")


# ------------------- NEW HELPERS FOR CHAPTER FETCHING -------------------


def fetch_summary_chunk(user_id: str, class_name: str, doc_id: str):
    """
    Retrieve the pre-computed document summary (is_summary=True).
    """
    filters = {"user_id": user_id, "is_summary": True}
    if doc_id != "null":
        filters["doc_id"] = doc_id
    elif class_name and class_name != "null":
        filters["class_id"] = class_name
    return collection.find_one(filters)


# ──────────────────────────────────────────────────────────────
# ON-DEMAND SUMMARY GENERATION (Lazy Summarization)
# ──────────────────────────────────────────────────────────────
def fetch_document_chunks_for_summary(user_id: str, doc_id: str, limit: int = 50) -> list[dict]:
    """
    Fetch document chunks for on-demand summarization.
    Returns chunks ordered by page number.
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
        {"$limit": limit},
        {"$project": {"text": 1, "original_text": 1, "page_number": 1, "file_name": 1}},
    ]
    return list(collection.aggregate(pipeline))


def fetch_section_summaries_for_doc(user_id: str, doc_id: str) -> list[dict]:
    """
    Fetch section summaries for a document, ordered by section index.
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


def combine_section_summaries_on_demand(
    section_summaries: list[dict],
    llm: ChatOpenAI | None = None,
) -> str:
    """
    Combine section summaries into a final document summary.
    Used for fast on-demand summary generation.
    """
    if not section_summaries:
        return ""

    if llm is None:
        llm = get_llm("summary")

    combined_text = "\n\n---\n\n".join(s["text"] for s in section_summaries)

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
        log.error("[ON-DEMAND] Failed to combine section summaries: %s", e)
        return combined_text[:4000]


def generate_summary_on_demand(
    user_id: str,
    class_name: str,
    doc_id: str,
    file_name: str | None = None,
    llm: ChatOpenAI | None = None,
) -> dict | None:
    """
    Generate a document summary on-demand when no cached summary exists.

    This function uses a tiered approach:
    1. FAST PATH: If section summaries exist, combine them (~3-5 seconds)
    2. SLOW PATH: Fall back to chunk-based summarization (may timeout for large docs)

    Returns a summary document dict compatible with fetch_summary_chunk format,
    or None if generation fails.
    """
    log.info("[ON-DEMAND] Generating summary for doc %s", doc_id)

    try:
        # FAST PATH: Check for section summaries first
        section_summaries = fetch_section_summaries_for_doc(user_id, doc_id)

        if section_summaries:
            log.info("[ON-DEMAND] Found %d section summaries for doc %s, using fast path",
                     len(section_summaries), doc_id)

            if llm is None:
                llm = get_llm("summary")

            summary_text = combine_section_summaries_on_demand(section_summaries, llm)

            if not summary_text:
                log.error("[ON-DEMAND] Failed to combine section summaries for doc %s", doc_id)
                return None

            # Get file_name from first chunk if not provided
            if not file_name:
                first_chunk = collection.find_one({"doc_id": doc_id, "is_summary": False})
                file_name = first_chunk.get("file_name", "Unknown Document") if first_chunk else "Unknown Document"

            log.info("[ON-DEMAND] Generated summary from sections for doc %s (%d chars)", doc_id, len(summary_text))

            # Cache the summary
            try:
                from langchain_mongodb import MongoDBAtlasVectorSearch

                summary_meta = {
                    "file_name": file_name,
                    "title": file_name,
                    "author": "Unknown",
                    "user_id": user_id,
                    "class_id": class_name,
                    "doc_id": doc_id,
                    "is_summary": True,
                    "page_number": None,
                    "source_type": "on_demand_sections",
                }

                MongoDBAtlasVectorSearch.from_texts(
                    [summary_text],
                    embedding_model,
                    metadatas=[summary_meta],
                    collection=collection
                )
                log.info("[ON-DEMAND] Cached section-based summary for doc %s", doc_id)
            except Exception as cache_err:
                log.warning("[ON-DEMAND] Failed to cache summary: %s", cache_err)

            return {
                "_id": ObjectId(),
                "text": summary_text,
                "file_name": file_name,
                "doc_id": doc_id,
                "user_id": user_id,
                "class_id": class_name,
                "is_summary": True,
                "page_number": None,
            }

        # SLOW PATH: Fall back to chunk-based summarization
        log.info("[ON-DEMAND] No section summaries for doc %s, using chunk-based summarization", doc_id)

        # Fetch chunks for this document
        chunks = fetch_document_chunks_for_summary(user_id, doc_id, limit=60)

        if not chunks:
            log.warning("[ON-DEMAND] No chunks found for doc %s", doc_id)
            return None

        # Get file_name from first chunk if not provided
        if not file_name and chunks:
            file_name = chunks[0].get("file_name", "Unknown Document")

        # Combine chunk texts (prefer original_text without contextual header)
        texts = []
        for chunk in chunks:
            text = chunk.get("original_text") or chunk.get("text", "")
            if text:
                texts.append(text)

        if not texts:
            log.warning("[ON-DEMAND] No text content in chunks for doc %s", doc_id)
            return None

        full_text = "\n\n".join(texts)

        # Estimate tokens and truncate if needed
        est_tokens_count = int(len(full_text) * TOK_PER_CHAR)
        max_context = config.MAX_PROMPT_TOKENS * 3  # Allow more for summarization

        if est_tokens_count > max_context:
            # Truncate to fit context window
            max_chars = int(max_context / TOK_PER_CHAR)
            full_text = full_text[:max_chars]
            log.info("[ON-DEMAND] Truncated text from %d to %d chars", len(full_text), max_chars)

        # Use provided LLM or create one
        if llm is None:
            llm = get_llm("summary")

        # Generate summary
        summary_prompt = PromptTemplate.from_template(
            "You are an expert study assistant.\n\n"
            "Document content below:\n\n{context}\n\n"
            "Write a comprehensive summary in markdown format capturing all key ideas, "
            "definitions, and results. Use clear headings (##), bullet points, and "
            "**bold** for key terms. Write ALL mathematical expressions in LaTeX format: "
            "$...$ for inline math, $$...$$ for display equations. Aim for 300-500 words."
        )

        summary_text = (summary_prompt | llm | StrOutputParser()).invoke({"context": full_text})

        if not summary_text:
            log.error("[ON-DEMAND] Empty summary generated for doc %s", doc_id)
            return None

        log.info("[ON-DEMAND] Generated summary for doc %s (%d chars)", doc_id, len(summary_text))

        # Cache the summary in MongoDB for future requests
        try:
            from langchain_mongodb import MongoDBAtlasVectorSearch

            summary_meta = {
                "file_name": file_name,
                "title": file_name,
                "author": "Unknown",
                "user_id": user_id,
                "class_id": class_name,
                "doc_id": doc_id,
                "is_summary": True,
                "page_number": None,
                "source_type": "on_demand",
            }

            MongoDBAtlasVectorSearch.from_texts(
                [summary_text],
                embedding_model,
                metadatas=[summary_meta],
                collection=collection
            )
            log.info("[ON-DEMAND] Cached summary for doc %s", doc_id)
        except Exception as cache_err:
            log.warning("[ON-DEMAND] Failed to cache summary: %s", cache_err)

        # Return in the same format as fetch_summary_chunk
        return {
            "_id": ObjectId(),  # Temporary ID for response
            "text": summary_text,
            "file_name": file_name,
            "doc_id": doc_id,
            "user_id": user_id,
            "class_id": class_name,
            "is_summary": True,
            "page_number": None,
        }

    except Exception as e:
        log.error("[ON-DEMAND] Failed to generate summary for doc %s: %s", doc_id, e, exc_info=True)
        return None


def get_summary_with_fallback(
    user_id: str,
    class_name: str,
    doc_id: str,
    llm: ChatOpenAI | None = None,
) -> dict | None:
    """
    Get document summary, falling back to on-demand generation if not cached.

    This is the main entry point for retrieving summaries with lazy summarization.

    1. Try to fetch cached summary
    2. If not found, generate on-demand and cache
    3. Return summary dict or None
    """
    # First, try to fetch cached summary
    cached = fetch_summary_chunk(user_id, class_name, doc_id)
    if cached:
        log.info("[SUMMARY] Using cached summary for doc %s", doc_id)
        return cached

    # No cached summary - generate on-demand
    log.info("[SUMMARY] No cached summary for doc %s, generating on-demand", doc_id)
    return generate_summary_on_demand(
        user_id=user_id,
        class_name=class_name,
        doc_id=doc_id,
        llm=llm,
    )


def fetch_chapter_text(
    user_id: str, class_name: str, doc_id: str, chapters: List[int]
) -> Tuple[str, List[dict]]:
    """
    Concatenate text for the requested chapter set (non-summary chunks).
    Returns (full_text, chunk_array_for_refs).
    """
    if not chapters:
        return "", []

    filters = {
        "user_id": user_id,
        "is_summary": False,
        "chapter_idx": {"$in": chapters},
    }
    if doc_id != "null":
        filters["doc_id"] = doc_id
    elif class_name and class_name != "null":
        filters["class_id"] = class_name

    pipeline = [
        {"$match": filters},
        {"$sort": {"page_number": 1}},
        {
            "$project": {
                "_id": 1,
                "text": 1,
                "page_number": 1,
                "doc_id": 1,
                "chapter_idx": 1,
            }
        },
    ]
    results = list(collection.aggregate(pipeline))
    full_text = " ".join(r["text"] for r in results)

    chunk_arr = [
        {
            "_id": str(r["_id"]),
            "chunkNumber": idx + 1,
            "text": r["text"],
            "pageNumber": r.get("page_number"),
            "docId": r.get("doc_id"),
        }
        for idx, r in enumerate(results)
    ]

    return full_text, chunk_arr


def condense_summary(summary_text: str, user_query: str, llm: ChatOpenAI) -> str:
    """
    Condense a long stored summary while taking into account the user's
    own instructions (e.g. 'bullet points', 'glossary', etc.).
    Logs the first 400 characters being condensed.
    """
    log.info(
        f"[CONDESNER] input length={len(summary_text)} | preview={summary_text[:400]!r}"
    )

    log.info(
        f"[USER QUERY] ={user_query}"
    )

    condenser_prompt = PromptTemplate.from_template(
        "You are an expert study assistant.\n\n"
        "Below is a detailed document summary delimited by <summary></summary> tags.\n"
        "<summary>\n{context}\n</summary>\n\n"
        "The user has asked: \"{user_query}\"\n\n"
        "Rewrite the summary so it is concise **while following any "
        "formatting or stylistic instructions implicit in the user's query**. "
        "Preserve key concepts, definitions, and results. "
        "Keep all mathematical expressions in LaTeX format ($...$ for inline, $$...$$ for display)."
    )

    return (condenser_prompt | llm | StrOutputParser()).invoke(
        {"context": summary_text, "user_query": user_query}
    )

def fetch_class_summaries(user_id: str, class_name: str):
    """
    Return only document-level summaries for the class.

    Excludes section summaries which are intermediate summaries used for
    on-demand document summary generation, not final doc summaries.

    Handles two data formats:
    - Old format: level="section" for section summaries
    - New format: source_type="section_summary" for section summaries
    """
    if class_name in (None, "", "null"):
        return []
    return list(collection.find({
        "user_id": user_id,
        "class_id": class_name,
        "is_summary": True,
        "level": {"$ne": "section"},           # Exclude old-format section summaries
        "source_type": {"$ne": "section_summary"},  # Exclude new-format section summaries
    }).sort("file_name", 1))


def get_class_summaries_with_fallback(user_id: str, class_name: str, max_on_demand: int = 3) -> list[dict]:
    """
    Get class summaries, generating on-demand for documents without cached summaries.

    This ensures study guides and class summaries work even before background
    summarization jobs complete.

    Args:
        user_id: User ID
        class_name: Class name
        max_on_demand: Maximum number of on-demand summaries to generate (to limit latency)

    Returns:
        List of summary documents
    """
    if class_name in (None, "", "null"):
        return []

    # Fetch existing summaries
    existing_summaries = fetch_class_summaries(user_id, class_name)
    existing_doc_ids = {s.get("doc_id") for s in existing_summaries}

    # Find documents in this class that don't have summaries
    docs_without_summary = list(collection.aggregate([
        {
            "$match": {
                "user_id": user_id,
                "class_id": class_name,
                "is_summary": False,
            }
        },
        {"$group": {"_id": "$doc_id", "file_name": {"$first": "$file_name"}}},
        {"$match": {"_id": {"$nin": list(existing_doc_ids)}}},
        {"$limit": max_on_demand},
    ]))

    if not docs_without_summary:
        # All documents have summaries (or no documents exist)
        return existing_summaries

    log.info(
        "[CLASS-SUMMARY] Found %d docs without summaries in class %s, generating up to %d on-demand",
        len(docs_without_summary), class_name, max_on_demand
    )

    # Generate on-demand summaries for documents missing them
    new_summaries = []
    for doc in docs_without_summary[:max_on_demand]:
        doc_id = doc["_id"]
        file_name = doc.get("file_name", "Unknown")

        summary = generate_summary_on_demand(
            user_id=user_id,
            class_name=class_name,
            doc_id=doc_id,
            file_name=file_name,
        )
        if summary:
            new_summaries.append(summary)

    # Combine existing and newly generated summaries
    all_summaries = existing_summaries + new_summaries

    log.info(
        "[CLASS-SUMMARY] Returning %d summaries (%d cached, %d on-demand)",
        len(all_summaries), len(existing_summaries), len(new_summaries)
    )

    return all_summaries

def condense_class_summaries(text: str, user_query: str, llm: ChatOpenAI) -> str:
    prompt = PromptTemplate.from_template(
        "You are an expert study assistant.\n\n"
        "Below are multiple document summaries for one class, delimited by "
        "<summary></summary> tags.\n<summary>\n{context}\n</summary>\n\n"
        "The user asked: \"{user_query}\"\n\n"
        "Write a single, coherent overview (≈200–250 words) that captures the key "
        "points, concepts, and definitions across all documents, following any "
        "formatting instructions in the user's query. "
        "Write all mathematical expressions in LaTeX format ($...$ for inline, $$...$$ for display)."
    )
    return (prompt | llm | StrOutputParser()).invoke(
        {"context": text, "user_query": user_query}
    )


# ------------ Hierarchical (map-reduce) class summarization ------------
def hierarchical_class_summary(
    summaries: list[dict],
    user_query: str,
    llm: ChatOpenAI,
    max_tokens_per_batch: int = 6000,
) -> str:
    """
    Map-reduce summarization for large classes with many/large documents.

    This handles classes that exceed direct summarization limits by:
    1. Grouping summaries into batches within token limits (map)
    2. Summarizing each batch independently
    3. Combining batch summaries into final output (reduce)

    Args:
        summaries: List of document summary dicts with "text" field
        user_query: User's original query for context
        llm: LLM instance for summarization
        max_tokens_per_batch: Maximum tokens per batch before splitting

    Returns:
        Final condensed summary string
    """
    if not summaries:
        return ""

    # Group summaries into token-bounded batches
    batches: list[list[str]] = []
    current_batch: list[str] = []
    current_tokens = 0

    for summary in summaries:
        text = summary.get("text", "")
        tokens = est_tokens(text)

        # Start new batch if adding this would exceed limit
        if current_tokens + tokens > max_tokens_per_batch and current_batch:
            batches.append(current_batch)
            current_batch = []
            current_tokens = 0

        current_batch.append(text)
        current_tokens += tokens

    # Don't forget the last batch
    if current_batch:
        batches.append(current_batch)

    log.info(
        "[HIERARCHICAL] Processing %d summaries in %d batches (max %d tokens/batch)",
        len(summaries), len(batches), max_tokens_per_batch
    )

    # If only one batch fits, use simple condensation
    if len(batches) == 1:
        combined = "\n\n---\n\n".join(batches[0])
        return condense_class_summaries(combined, user_query, llm)

    # MAP PHASE: Summarize each batch independently
    batch_prompt = PromptTemplate.from_template(
        "You are an expert study assistant.\n\n"
        "Below are document summaries from a class:\n\n"
        "{context}\n\n"
        "Write a concise summary (150-200 words) capturing the key themes, "
        "concepts, and important information across these documents. "
        "Write all mathematical expressions in LaTeX format ($...$ for inline, $$...$$ for display)."
    )

    intermediate_summaries: list[str] = []
    for i, batch in enumerate(batches):
        batch_text = "\n\n---\n\n".join(batch)
        try:
            batch_summary = (batch_prompt | llm | StrOutputParser()).invoke(
                {"context": batch_text}
            )
            intermediate_summaries.append(batch_summary)
            log.info("[HIERARCHICAL] Batch %d/%d summarized (%d chars)",
                     i + 1, len(batches), len(batch_summary))
        except Exception as e:
            log.error("[HIERARCHICAL] Batch %d failed: %s", i + 1, e)
            # Fallback: use truncated batch text
            intermediate_summaries.append(batch_text[:2000])

    # REDUCE PHASE: Combine intermediate summaries into final output
    final_combined = "\n\n---\n\n".join(intermediate_summaries)
    log.info("[HIERARCHICAL] Reduce phase: combining %d intermediate summaries",
             len(intermediate_summaries))

    return condense_class_summaries(final_combined, user_query, llm)


# ------------ Study-guide generation helper ------------
def generate_study_guide(context_text: str, user_query: str, llm: ChatOpenAI) -> str:
    """
    Build a markdown study guide with fixed sections.
    """
    sg_prompt = PromptTemplate.from_template(
        "You are an expert tutor creating a clear, well-structured study guide.\n\n"
        "<context>\n{context}\n</context>\n\n"
        "User request: \"{user_query}\"\n\n"
        "Return a markdown study guide with **exactly** these headings:\n"
        "1. # Study Guide\n"
        "2. ## Key Concepts\n"
        "3. ## Important Definitions\n"
        "4. ## Essential Formulas / Diagrams (omit if N/A)\n"
        "5. ## Practice Questions\n\n"
        "IMPORTANT: Write ALL mathematical expressions, equations, and formulas in LaTeX format:\n"
        "- Use $...$ for inline math (e.g., $E = mc^2$)\n"
        "- Use $$...$$ for display/block equations (e.g., $$\\int_a^b f(x)\\,dx$$)\n"
        "- Never use plain text or backticks for formulas\n\n"
        "Follow any extra formatting the user asked for and keep it under ~1 200 words."
    )
    return (sg_prompt | llm | StrOutputParser()).invoke(
        {"context": context_text, "user_query": user_query}
    )





# --------------------------- PROMPT LOADING -----------------------------


def load_prompts():
    prompts_file = Path(__file__).parent / "prompts.json"
    with prompts_file.open("r") as f:
        return json.load(f)


def construct_chain(prompt_template, user_query, chat_history, llm: ChatOpenAI):
    return (prompt_template | llm | StrOutputParser()).invoke(
        {"chat_history": chat_history, "input": user_query}
    )


# ──────────────────────────────────────────────────────────────
#                   STREAMING CALLBACK HANDLER
# ──────────────────────────────────────────────────────────────
class TokenStreamingCallback(AsyncCallbackHandler):
    """
    LangChain async callback handler for token streaming.
    Uses asyncio.Queue to bridge between LangChain callbacks and SSE generator.
    """

    def __init__(self):
        self.queue = asyncio.Queue()

    async def on_llm_new_token(self, token: str, **kwargs):
        """Called for each new token from OpenAI."""
        await self.queue.put({"type": "token", "content": token})

    async def on_llm_end(self, response, **kwargs):
        """Called when LLM completes."""
        await self.queue.put({"type": "done"})

    async def on_llm_error(self, error: Exception, **kwargs):
        """Called on LLM errors."""
        await self.queue.put({"type": "error", "message": str(error)})


# ──────────────────────────────────────────────────────────────
#                         MAIN ENTRY
# ──────────────────────────────────────────────────────────────
def process_semantic_search(
    user_id: str,
    class_name: str,
    doc_id: str,
    user_query: str,
    chat_history: List[dict],
    source: str,
):
    """
    Core search / generation pipeline with new query-mode handling.
    """
    log.info(
        "[PROC] START | user=%s class=%s doc=%s | raw_query=%s",
        user_id, class_name, doc_id, (user_query[:120] + "…") if len(user_query) > 120 else user_query,
    )

        # --- NEW: trace inbound request ---
    # 0) Detect mode + chapters
    mode = detect_query_mode(user_query)
    if mode == "summary":
        if doc_id and doc_id != "null":
            mode = "doc_summary"       # summarise the single document
        elif class_name and class_name != "null":
            mode = "class_summary"     # summarise all docs in this class
        else:  # user is in the "all classes" view
            return {
                "message": "Please select a class or document to summarise.",
                "citation": [], "chats": chat_history,
                "chunks": [], "chunkReferences": []
            }
    log.info(f"Mode: {mode}")

    # ------------------------------------------------------------
    # 0) ROUTE  (regex → optional LLM tie-breaker)
    # ------------------------------------------------------------
    route = detect_route(user_query)
    log.info(f"Router → {route}")
                
    # ── Quote-finding pre-check ───────────────────────────────
    if route == "quote_finding":
        cleaned_query = strip_quote_phrases(user_query)
        if not has_sufficient_quote_context(cleaned_query):
            friendly = (
                "Could you specify what the quote should relate to? "
                "For example: “a quote about the impact of the industrial revolution on society”."
            )
            chat_history.append({"role": "assistant", "content": friendly})
            return {
                "message": friendly,
                "status": "needs_context",
                "citation": [],
                "chats": chat_history,
                "chunks": [],
                "chunkReferences": [],
            }
        user_query_effective = cleaned_query
    else:
        user_query_effective = user_query


    # -------------------- History sanitisation --------------------
    # -----------------------------------------------------------
    #  Study-guide pipeline (executes before generic retrieval)
    #  Now with token validation and error handling
    # -----------------------------------------------------------
    if route == "generate_study_guide" or mode == "study_guide":
        try:
            # -------- Single-document study guide --------
            if doc_id and doc_id != "null":
                # Use fallback to generate on-demand if no cached summary
                summary_doc = get_summary_with_fallback(user_id, class_name, doc_id)
                if summary_doc:
                    context_txt = summary_doc["text"]
                    if est_tokens(context_txt) > MAX_PROMPT_TOKENS:
                        context_txt = condense_summary(context_txt, user_query, get_llm("summary"))
                    log.info(
                        "[PROC] Study-guide (doc) | summary_tokens=%d | will_condense=%s",
                        est_tokens(context_txt),
                        "YES" if est_tokens(context_txt) > MAX_PROMPT_TOKENS else "NO",
                    )
                    guide = generate_study_guide(context_txt, user_query, get_llm("generate_study_guide"))

                    chunk_array = [{
                        "_id": str(summary_doc["_id"]), "chunkNumber": 1,
                        "text": summary_doc["text"], "pageNumber": None,
                        "docId": summary_doc["doc_id"],
                    }]
                    citation = get_file_citation([summary_doc])
                    chunk_refs = [{"chunkId": chunk_array[0]["_id"], "displayNumber": 1, "pageNumber": None}]
                    chat_history.append({"role": "assistant", "content": guide, "chunkReferences": chunk_refs})
                    return {
                        "message": guide, "citation": citation, "chats": chat_history,
                        "chunks": chunk_array, "chunkReferences": chunk_refs,
                    }

            # -------- Class-level study guide (with token validation) --------
            if class_name and class_name != "null":
                # Use fallback to generate on-demand for docs without cached summaries
                docs = get_class_summaries_with_fallback(user_id, class_name)
                if docs:
                    # Calculate total tokens across all document summaries
                    combined_tokens = sum(est_tokens(d.get("text", "")) for d in docs)

                    log.info(
                        "[PROC] Study-guide (class) | combined_tokens=%d | n_docs=%d",
                        combined_tokens, len(docs),
                    )

                    # Check if too large even for hierarchical summarization
                    if combined_tokens > config.MAX_HIERARCHICAL_INPUT_TOKENS:
                        friendly = (
                            "This class contains too much content to generate a study guide. "
                            "Please open individual documents and create study guides for each one separately."
                        )
                        chat_history.append({"role": "assistant", "content": friendly})
                        return {
                            "message": friendly,
                            "status": "class_too_large",
                            "citation": [],
                            "chats": chat_history,
                            "chunks": [],
                            "chunkReferences": [],
                        }

                    # Use hierarchical summarization for large classes, else direct
                    if combined_tokens > config.MAX_CLASS_SUMMARY_TOKENS and config.HIERARCHICAL_CLASS_SUMMARY_ENABLED:
                        log.info("[PROC] Using hierarchical summarization for class study guide")
                        condensed = hierarchical_class_summary(docs, user_query, get_llm("summary"))
                    elif combined_tokens > MAX_PROMPT_TOKENS:
                        combined = "\n\n---\n\n".join(d["text"] for d in docs)
                        condensed = condense_class_summaries(combined, user_query, get_llm("summary"))
                    else:
                        condensed = "\n\n---\n\n".join(d["text"] for d in docs)

                    guide = generate_study_guide(condensed, user_query, get_llm("generate_study_guide"))

                    chunk_array = [{
                        "_id": str(d["_id"]), "chunkNumber": i + 1,
                        "text": d["text"], "pageNumber": None, "docId": d["doc_id"],
                    } for i, d in enumerate(docs)]
                    citation = get_file_citation(docs)
                    chunk_refs = [{"chunkId": c["_id"], "displayNumber": c["chunkNumber"], "pageNumber": None}
                                  for c in chunk_array]
                    chat_history.append({"role": "assistant", "content": guide, "chunkReferences": chunk_refs})
                    return {
                        "message": guide, "citation": citation, "chats": chat_history,
                        "chunks": chunk_array, "chunkReferences": chunk_refs,
                    }

        except (InvalidRequestError, BadRequestError) as oe:
            err_code = getattr(oe, "code", None) or getattr(getattr(oe, "error", None), "code", None)
            if err_code == "context_length_exceeded":
                friendly = (
                    "This class contains too much content to generate a study guide. "
                    "Please open individual documents and create study guides for each one separately."
                )
                chat_history.append({"role": "assistant", "content": friendly})
                log.warning("[STUDY-GUIDE] Context length exceeded for class %s", class_name)
                return {
                    "message": friendly,
                    "status": "context_too_large",
                    "citation": [],
                    "chats": chat_history,
                    "chunks": [],
                    "chunkReferences": [],
                }
            # Re-raise other InvalidRequest/BadRequest errors
            raise

        except Exception as e:
            log.error("[STUDY-GUIDE] Unexpected error: %s", e, exc_info=True)
            friendly = (
                "An error occurred while generating the study guide. "
                "Please try again or generate study guides for individual documents."
            )
            chat_history.append({"role": "assistant", "content": friendly})
            return {
                "message": friendly,
                "status": "error",
                "retryable": True,
                "citation": [],
                "chats": chat_history,
                "chunks": [],
                "chunkReferences": [],
            }

        #  ↳ If no summary found or no doc/class chosen, fall through to normal pipeline

    chat_history_cleaned = []
    for c in chat_history:
        item = {
            "role": c["role"],
            "content": escape_curly_braces(c.get("content", "")),
        }
        if "chunkReferences" in c:
            item["chunkReferences"] = c["chunkReferences"]
        chat_history_cleaned.append(item)

        # ------------------- SIMILARITY RETRIEVAL -------------------
    chunk_array = []
    similarity_results = []

    # Per-route knobs and LLM selection
    cfg = ROUTE_CONFIG.get(route, ROUTE_CONFIG["general_qa"])
    llm = get_llm(route)
    metrics = {"route": route, "mode": mode, "k": cfg.get("k"), "numCandidates": cfg.get("numCandidates"), "temperature": cfg.get("temperature")}

    # Reuse previous chunks for follow-up
    if route == "follow_up":
        last_refs = next(
            (m.get("chunkReferences") for m in reversed(chat_history_cleaned) if m["role"] == "assistant"), []
        )
        if last_refs:
            for ref in last_refs:
                chunk_id_val = ref.get("chunkId")
                try:
                    obj_id = ObjectId(chunk_id_val) if isinstance(chunk_id_val, str) else chunk_id_val
                except Exception:
                    obj_id = chunk_id_val
                chunk_doc = collection.find_one({"_id": obj_id})
                chunk_array.append(
                    {
                        "_id": str(obj_id),
                        "chunkNumber": ref.get("displayNumber"),
                        "text": chunk_doc.get("text") if chunk_doc else None,
                        "pageNumber": ref.get("pageNumber"),
                        "docId": chunk_doc.get("doc_id") if chunk_doc else None,
                    }
                )
            mode = "follow_up"  # Treat as no new retrieval

    if mode not in ("follow_up", "doc_summary", "class_summary"):
        # 1) Embed the user query
        tokens_needed = est_tokens(user_query_effective)
        embed_t0 = time.time()
        if not try_acquire_tokens(tokens_needed, max_wait_s=10.0):
            busy_msg = "System is busy processing other requests. Please retry in a few seconds."
            chat_history.append({"role": "assistant", "content": busy_msg})
            metrics.update({"status": "busy"})
            log_metrics("rag", metrics)
            return {"message": busy_msg, "status": "busy", "citation": [], "chats": chat_history, "chunks": [], "chunkReferences": []}
        query_vec = embedding_model.embed_query(user_query_effective)
        embed_ms = int((time.time() - embed_t0) * 1000)

        # 2) Build Mongo search filter to scope by user / class / doc
        # Exclude summaries for specific/quote/general routes
        filters = {"user_id": user_id, "is_summary": False}
        if doc_id and doc_id != "null":
            filters["doc_id"] = doc_id
        elif class_name not in (None, "", "null"):
            filters["class_id"] = class_name

        # 3) Run vector search
        search_t0 = time.time()
        search_cursor = perform_semantic_search(query_vec, filters, limit=cfg["k"], numCandidates=cfg["numCandidates"])

        # 4) Remove similarity threshold gate; dedupe by (doc_id, page_number)
        raw_results = list(search_cursor)
        metrics["hits_raw"] = len(raw_results)
        seen = set()
        similarity_results = []
        for r in raw_results:
            key = (r.get("doc_id"), r.get("page_number"))
            if key in seen:
                continue
            seen.add(key)
            similarity_results.append(r)
        search_ms = int((time.time() - search_t0) * 1000)
        top_scores = [round(r.get("score", 0.0), 4) for r in similarity_results[:5]]
        log.info("[RETRIEVAL] route=%s k=%s cand=%s hits=%d top_scores=%s latency_ms(embed=%d, search=%d)",
                 route, cfg["k"], cfg["numCandidates"], len(similarity_results), top_scores, embed_ms, search_ms)
        metrics["hits_unique"] = len(similarity_results)
        metrics["embed_ms"] = embed_ms
        metrics["search_ms"] = search_ms

        # Optional reranking (MMR) within the retrieved set for diversity
        mmr_applied = False
        mmr_ms = None
        try:
            mmr_start = time.time()
            texts = [r.get("text", "") for r in similarity_results]
            token_need = sum(est_tokens(t) for t in texts)
            if texts and try_acquire_tokens(token_need, max_wait_s=2.0):
                doc_embs = embedding_model.embed_documents(texts)
                # normalise
                def _norm(v):
                    n = math.sqrt(sum(x*x for x in v)) or 1.0
                    return [x / n for x in v]
                qn = _norm(query_vec)
                dns = [_norm(v) for v in doc_embs]
                def cos(u,v):
                    return sum(a*b for a,b in zip(u,v))
                lambda_ = 0.7
                selected, rest = [], list(range(len(dns)))
                # seed with best by query similarity
                rest.sort(key=lambda i: cos(qn, dns[i]), reverse=True)
                if rest:
                    selected.append(rest.pop(0))
                while rest:
                    best_i, best_score = None, -1.0
                    for i in rest:
                        sim_q = cos(qn, dns[i])
                        sim_d = max(cos(dns[i], dns[j]) for j in selected) if selected else 0.0
                        score = lambda_ * sim_q - (1 - lambda_) * sim_d
                        if score > best_score:
                            best_i, best_score = i, score
                    selected.append(best_i)
                    rest.remove(best_i)
                similarity_results = [similarity_results[i] for i in selected]
                mmr_ms = int((time.time() - mmr_start) * 1000)
                mmr_applied = True
                log.info("[RERANK] MMR applied over %d candidates in %dms", len(texts), mmr_ms)
        except Exception as e:
            log.warning("[RERANK] skipped: %s", e)
        metrics["mmr_applied"] = mmr_applied
        if mmr_ms is not None:
            metrics["mmr_ms"] = mmr_ms

        # 5) Build chunk_array for later prompt context
        for idx, r in enumerate(similarity_results):
            chunk_array.append(
                {
                    "_id": str(r["_id"]),
                    "chunkNumber": idx + 1,
                    "text": escape_curly_braces(r["text"]),
                    "pageNumber": r.get("page_number"),
                    "docId": r.get("doc_id"),
                }
            )

        if chunk_array:
            log.info(f"[CHUNKS] retained IDs={[c['chunkNumber'] for c in chunk_array]}")
        metrics["chunks_used"] = len(chunk_array)
        metrics["context_chars"] = sum(len(c.get("text") or "") for c in chunk_array)

        # ---------- Graceful “no-hit” handling ----------
        if not chunk_array:
            refine_message = (
                "I couldn’t find anything relevant for that question. "
                "Make sure you’re on the correct class or document and try asking a more specific question."
            )
            suggestions = suggest_refine_queries()
            chat_history.append(
                {
                    "role": "assistant",
                    "content": refine_message,
                    "suggestions": suggestions,
                }
            )
            payload = {
                "message": refine_message,
                "suggestions": suggestions,
                "status": "no_hit",
                "citation": [],
                "chats": chat_history,
                "chunks": [],
                "chunkReferences": [],
            }
            metrics.update({"status": "no_hit"})
            log_metrics("rag", metrics)
            return payload
# ─────────────────────────────────────────────────────────


    # ----------------------------------------------------------------
        # ----------------------------------------------------------------
    # WHOLE-DOCUMENT SUMMARY MODE  (returns condensed version)
    # ----------------------------------------------------------------
    if mode == "doc_summary":
        # Use fallback to generate on-demand if no cached summary
        summary_doc = get_summary_with_fallback(user_id, class_name, doc_id)
        if not summary_doc:
            log.warning("No stored summary found and on-demand generation failed; falling back to specific search")
            mode = "specific"
        else:
            # 1. Condense the long stored summary
            log.info(f"[FULL-MODE] passing stored summary (len={len(summary_doc['text'])}) to condenser")

            condensed_text = condense_summary(summary_doc["text"], user_query, get_llm("summary"))

            # 2. Build minimal chunk/citation info so the front-end can still
            #    show “chunk 1” if desired.
            chunk_array = [
                {
                    "_id": str(summary_doc["_id"]),
                    "chunkNumber": 1,
                    "text": summary_doc["text"],   # original full text
                    "pageNumber": None,
                    "docId": summary_doc["doc_id"],
                }
            ]
            citation = get_file_citation([summary_doc])
            chunk_refs = [
                {"chunkId": chunk_array[0]["_id"], "displayNumber": 1, "pageNumber": None}
            ]

            # 3. Append to chat_history and RETURN immediately
            chat_history.append(
                {"role": "assistant", "content": condensed_text, "chunkReferences": chunk_refs}
            )
            return {
                "message": condensed_text,
                "citation": citation,
                "chats": chat_history,
                "chunks": chunk_array,
                "chunkReferences": chunk_refs,
            }
            # ----------------------------------------------------------------
    # CLASS-LEVEL SUMMARY (aggregate doc summaries for the class)
    # Now with token validation and hierarchical summarization
    # ----------------------------------------------------------------
    if mode == "class_summary":
        try:
            # Use fallback to generate on-demand for docs without cached summaries
            docs = get_class_summaries_with_fallback(user_id, class_name)
            if not docs:
                log.warning("No summaries found for this class and on-demand generation failed; falling back to specific search.")
                mode = "specific"  # fall through to normal retrieval
            else:
                # Calculate total tokens across all document summaries
                combined_tokens = sum(est_tokens(d.get("text", "")) for d in docs)

                log.info(
                    "[PROC] Class-summary | combined_tokens=%d | n_docs=%d",
                    combined_tokens, len(docs),
                )

                # Check if too large even for hierarchical summarization
                if combined_tokens > config.MAX_HIERARCHICAL_INPUT_TOKENS:
                    friendly = (
                        "This class has too many documents or documents that are too large to summarize at once. "
                        "Please open individual documents to summarize them separately."
                    )
                    chat_history.append({"role": "assistant", "content": friendly})
                    return {
                        "message": friendly,
                        "status": "class_too_large",
                        "citation": [],
                        "chats": chat_history,
                        "chunks": [],
                        "chunkReferences": [],
                    }

                # Use hierarchical summarization for large classes, else direct
                if combined_tokens > config.MAX_CLASS_SUMMARY_TOKENS and config.HIERARCHICAL_CLASS_SUMMARY_ENABLED:
                    log.info("[PROC] Using hierarchical summarization for class summary")
                    condensed_text = hierarchical_class_summary(docs, user_query, get_llm("summary"))
                else:
                    combined = "\n\n---\n\n".join(d["text"] for d in docs)
                    condensed_text = condense_class_summaries(combined, user_query, get_llm("summary"))

                chunk_array = [
                    {
                        "_id": str(d["_id"]),
                        "chunkNumber": i + 1,
                        "text": d["text"],
                        "pageNumber": None,
                        "docId": d["doc_id"],
                    }
                    for i, d in enumerate(docs)
                ]
                citation = get_file_citation(docs)
                chunk_refs = [
                    {"chunkId": c["_id"], "displayNumber": c["chunkNumber"], "pageNumber": None}
                    for c in chunk_array
                ]

                chat_history.append({
                    "role": "assistant",
                    "content": condensed_text,
                    "chunkReferences": chunk_refs
                })
                return {
                    "message": condensed_text,
                    "citation": citation,
                    "chats": chat_history,
                    "chunks": chunk_array,
                    "chunkReferences": chunk_refs,
                }

        except (InvalidRequestError, BadRequestError) as oe:
            err_code = getattr(oe, "code", None) or getattr(getattr(oe, "error", None), "code", None)
            if err_code == "context_length_exceeded":
                friendly = (
                    "This class has too many documents or documents that are too large to summarize at once. "
                    "Please open individual documents to summarize them separately."
                )
                chat_history.append({"role": "assistant", "content": friendly})
                log.warning("[CLASS-SUMMARY] Context length exceeded for class %s", class_name)
                return {
                    "message": friendly,
                    "status": "context_too_large",
                    "citation": [],
                    "chats": chat_history,
                    "chunks": [],
                    "chunkReferences": [],
                }
            raise

        except Exception as e:
            log.error("[CLASS-SUMMARY] Unexpected error: %s", e, exc_info=True)
            friendly = (
                "An error occurred while summarizing this class. "
                "Please try again or summarize individual documents."
            )
            chat_history.append({"role": "assistant", "content": friendly})
            return {
                "message": friendly,
                "status": "error",
                "retryable": True,
                "citation": [],
                "chats": chat_history,
                "chunks": [],
                "chunkReferences": [],
            }



    # -------------------- PROMPT SELECTION --------------------
    prompts = load_prompts()
    base_prompt = (
        prompts.get("chrome_extension") if source == "chrome_extension"
        else prompts.get(route)
    )
    if not base_prompt:
        raise ValueError(f"Prompt for route '{route}' not found in prompts.json")


    # ---------- Uniform prompt skeleton ---------- 
    PROMPT_SKELETON = (
    "### ROLE\n"
    "You are an expert study assistant. Tasked with satisfying a user request based on the supplied context.\n\n"
    "### TASK INSTRUCTIONS\n"
    "{route_rules}\n\n"
    "### CITATION GUIDELINES\n"
    "{citing}\n\n"
    "### CONTEXT CHUNKS\n"
    "{context}\n\n"
    "### USER QUESTION\n"
    "{input}\n\n"
    "### CLARIFY / NO-HIT LOGIC\n"
    "If the context cannot fully answer but a single, precise follow-up question would enable an answer, "
    "ask that question. If nothing is relevant, reply exactly with NO_HIT_MESSAGE.\n"
    "### ANSWER REQUIREMENTS\n"
    "Respond **only** with information that directly addresses the user question and is derived from the context above. "
    "Do not introduce unrelated content.\n"
)


    # ---- Quote route: enforce in-text chunk citations ----
    if route == "quote_finding":
        referencing_instruction = (
            "After each quote, append a space followed by the chunk reference number(s) "
            "in square brackets using the chunk list provided below (e.g., [1], [2]). "
            "If multiple chunks support a single quote, include all consecutively like [1][3] with no commas or punctuation. "
            "Do not invent citations; only use numbers corresponding to the provided chunks."
            "\n\n"
        )
    else:
        referencing_instruction = (
            "Whenever you use content from a given chunk in your final answer, "
            "place a single bracketed reference in the form [N] at the end of that sentence. "
            "If multiple chunks support the same sentence, include each reference back-to-back with no punctuation, e.g., [1][3][4]. "
            "Do NOT write lists like [1, 3, 4] or ranges like [1-3]; only separate [N] tokens are allowed. "
            "Always use the numbering shown in the chunk list below (starting from 1).\n\n"
            "Please format your answer using Markdown. Write all mathematical expressions in LaTeX using '$' for "
            "inline math and '$$' for display math. Ensure code is in triple backticks.\n\n"
        )
    
        # ---------- Clarify-question rubric (new) ----------
    clarify_rubric = (
        "If the context chunks do not fully answer the question **but** a single, precise follow-up "
        "question would let you answer, ask that follow-up question instead of guessing. "
        "If nothing in the context is relevant, reply exactly with NO_HIT_MESSAGE.\n\n"
    )

    # ---------- Build prompt via uniform skeleton ----------
    citing      = referencing_instruction        # same content, shorter alias
    route_rules = base_prompt

    filled_skeleton = PROMPT_SKELETON.format(
        route_rules=route_rules,
        citing=citing,
        context="\n\n".join(
            f"<chunk id='{i+1}'>\n{c['text']}\n</chunk>" for i, c in enumerate(chunk_array)
        ) or "NULL",
        input="{input}",        # kept as placeholder for ChatPromptTemplate
    )

    formatted_prompt = filled_skeleton


    # ---------- RATE‑LIMIT RESERVATION ----------
    prompt_tokens = est_tokens(formatted_prompt)
    history_tokens = sum(est_tokens(m["content"]) for m in chat_history_cleaned)
    estimated_output = cfg.get("max_output_tokens", 700)
    total_needed = prompt_tokens + history_tokens + estimated_output
    if not try_acquire_tokens(total_needed, max_wait_s=10.0):
        busy_msg = "System is busy processing other requests. Please retry in a few seconds."
        chat_history.append({"role": "assistant", "content": busy_msg})
        return {"message": busy_msg, "status": "busy", "citation": [], "chats": chat_history, "chunks": [], "chunkReferences": []}
# --------------------------------------------


    # -------------------- FINAL GENERATION --------------------
    prompt_template = ChatPromptTemplate.from_messages(
        [("system", formatted_prompt), MessagesPlaceholder("chat_history"), ("user", "{input}")]
    )
    try:
        log.info(f"[PROMPT] first 800 chars: {formatted_prompt[:800]!r}")
        gen_t0 = time.time()
        answer = construct_chain(
            prompt_template,
            user_query_effective if route == "quote_finding" else user_query,
            chat_history_cleaned,
            llm,
        )

        gen_ms = int((time.time() - gen_t0) * 1000)
        log.info(f"[ANSWER] len={len(answer)} | starts={answer[:80]!r} | latency_ms(generate={gen_ms})")
        metrics["generate_ms"] = gen_ms


        # NEW — model signalled no relevant info
        if answer.strip() == "NO_HIT_MESSAGE":
            suggestions = suggest_refine_queries()
            chat_history.append(
                {"role": "assistant", "content": suggestions[0], "suggestions": suggestions}
            )
            return {
                "message": suggestions[0],
                "status":  "no_hit",
                "suggestions": suggestions,
                "citation": [],
                "chats": chat_history,
                "chunks": [],
                "chunkReferences": [],
            }

        # Quote post-validation: ensure quotes are verbatim from selected chunks
        if route == "quote_finding":
            lines = [ln.strip() for ln in answer.splitlines() if ln.strip()]
            chunk_texts = [c.get("text") or "" for c in chunk_array]
            def is_verbatim(ln: str) -> bool:
                m = re.search(r'“([^”]+)”|"([^"]+)"', ln)
                inner = (m.group(1) or m.group(2)) if m else ln
                inner = inner.strip()
                return any(inner and inner in t for t in chunk_texts)
            kept = [ln for ln in lines if is_verbatim(ln)]
            try:
                metrics["quote_total"] = len(lines)
                metrics["quote_kept"] = len(kept)
            except Exception:
                pass
            if kept:
                answer = "\n".join(kept)
            else:
                friendly = (
                    "I couldn’t verify any exact quotes in the selected context. "
                    "Could you narrow the topic or specify a section?"
                )
                chat_history.append({"role": "assistant", "content": friendly})
                try:
                    metrics.update({"status": "needs_context"})
                    log_metrics("rag", metrics)
                except Exception:
                    pass
                return {
                    "message": friendly,
                    "status":  "needs_context",
                    "citation": get_file_citation(similarity_results),
                    "chats":   chat_history,
                    "chunks":  chunk_array,
                    "chunkReferences": [
                        {"chunkId": it["_id"], "displayNumber": it["chunkNumber"], "pageNumber": it.get("pageNumber")}
                        for it in chunk_array
                    ],
                }

        # Per-sentence cite nudge for cite-critical routes
        if route in ("general_qa", "follow_up") and not re.search(r"\[\d+\]", answer):
            answer += "\n\nIf you want more precise citations, please specify a narrower section or term."

        # Renumber [N] citations so they always start at [1] in order of first appearance.
        def _renumber_citations(ans: str, chunks: list[dict]) -> tuple[str, list[dict]]:
            nums = re.findall(r"\[(\d+)\]", ans)
            if not nums:
                return ans, chunks
            nums_int = [int(n) for n in nums]
            valid = {c["chunkNumber"] for c in chunks}
            used_order: list[int] = []
            mapping: dict[int,int] = {}
            for n in nums_int:
                if n not in valid:
                    continue
                if n not in mapping:
                    mapping[n] = len(mapping) + 1
                    used_order.append(n)
            if not mapping:
                return ans, chunks
            def repl(m):
                old = int(m.group(1))
                return f"[{mapping.get(old, old)}]"
            ans2 = re.sub(r"\[(\d+)\]", repl, ans)
            by_num = {c["chunkNumber"]: c for c in chunks}
            new_chunks: list[dict] = []
            for old in used_order:
                c = by_num.get(old)
                if not c:
                    continue
                copy = dict(c)
                copy["chunkNumber"] = mapping[old]
                new_chunks.append(copy)
            return ans2, new_chunks or chunks

        if mode not in ("doc_summary", "class_summary"):
            answer, chunk_array = _renumber_citations(answer, chunk_array)


    # ---- 1) Context-length specific (still needs special copy) ----
    except (InvalidRequestError, BadRequestError) as oe:
        err_code = getattr(oe, "code", None) or getattr(getattr(oe, "error", None), "code", None)
        if err_code == "context_length_exceeded":
            if mode == "class_summary":
                friendly = (
                    "Too many documents to summarise the full class. "
                    "Try removing some documents or summarise individual ones directly in document chat."
                )
            elif route == "generate_study_guide" or mode == "study_guide":
                friendly = (
                    "Too many documents to generate a study guide for the full class. "
                    "Trim the selection or generate guides per document."
                )
            else:
                friendly = (
                    "This request is too large for the model’s context window. "
                    "Please shorten the question or narrow the document scope."
                )

            chat_history.append({"role": "assistant", "content": friendly})
            return {
                "message": friendly,
                "status":  "context_too_large",
                "citation": [],
                "chats":   chat_history,
                "chunks":  chunk_array,
                "chunkReferences": [],
            }

        # Any other InvalidRequest/BadRequest → fall through to generic handler below
        last_exception = oe

    # ---- 2) Transient LLM / network issues (retryable) ----
    except (RateLimitError, APIConnectionError, OpenAITimeout, APIStatusError) as oe:
        last_exception = oe

    # ---- 3) Catch-all for anything unanticipated ----
    except Exception as oe:  # pragma: no cover
        last_exception = oe

    # ---------- Generic graceful fallback (runs for all paths with `last_exception`) ----------
    if "last_exception" in locals():
        log.error("[LLM-ERROR] %s", traceback.format_exc(limit=3))
        friendly = (
            "The model or server is unavailable right now. "
            "Please hit **Try again**. If the issue persists, try later or contact support."
        )
        chat_history.append({"role": "assistant", "content": friendly})
        try:
            metrics.update({"status": "llm_error"})
            log_metrics("rag", metrics)
        except Exception:
            pass
        return {
            "message": friendly,
            "status":  "llm_error",
            "retryable": True,
            "citation": [],
            "chats":   chat_history,
            "chunks":  chunk_array,
            "chunkReferences": [],
        }


    # Citations & references
    citation = get_file_citation(similarity_results)
    chunk_refs = [
        {"chunkId": item["_id"], "displayNumber": item["chunkNumber"], "pageNumber": item.get("pageNumber")}
        for item in chunk_array
    ]

    # Append assistant turn to history for future follow-ups
    chat_history.append({"role": "assistant", "content": answer, "chunkReferences": chunk_refs})

    try:
        metrics.update({"status": "ok", "answer_chars": len(answer)})
        log_metrics("rag", metrics)
    except Exception:
        pass
    return {
        "message": answer,
        "citation": citation,
        "chats": chat_history,
        "chunks": chunk_array,
        "chunkReferences": chunk_refs,
    }


# ──────────────────────────────────────────────────────────────
#          ASYNC STREAMING VERSION (NEW FOR STORY 0.6)
# ──────────────────────────────────────────────────────────────
async def stream_semantic_search(
    user_id: str,
    class_name: str,
    doc_id: str,
    user_query: str,
    chat_history: List[dict],
    source: str,
):
    """
    Async streaming version of process_semantic_search.
    Yields tokens in real-time via SSE format for WebSocket consumption.

    REUSES all existing helper functions for retrieval, routing, citations.
    CHANGES only LLM invocation to be async with streaming callbacks.
    """
    from fastapi.responses import StreamingResponse

    log.info(
        "[STREAM] START | user=%s class=%s doc=%s | query=%s",
        user_id, class_name, doc_id, (user_query[:120] + "…") if len(user_query) > 120 else user_query,
    )

    async def token_generator():
        try:
            # ── 0) Mode & Route Detection (REUSE existing) ──
            mode = detect_query_mode(user_query)
            if mode == "summary":
                if doc_id and doc_id != "null":
                    mode = "doc_summary"
                elif class_name and class_name != "null":
                    mode = "class_summary"
                else:
                    error_msg = "Please select a class or document to summarise."
                    yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"
                    return

            route = detect_route(user_query)
            log.info(f"[STREAM] Route: {route}, Mode: {mode}")

            # ── Quote-finding pre-check (REUSE existing) ──
            if route == "quote_finding":
                cleaned_query = strip_quote_phrases(user_query)
                if not has_sufficient_quote_context(cleaned_query):
                    friendly = (
                        "Could you specify what the quote should relate to? "
                        'For example: "a quote about the impact of the industrial revolution on society".'
                    )
                    yield f"data: {json.dumps({'type': 'error', 'message': friendly})}\n\n"
                    return
                user_query_effective = cleaned_query
            else:
                user_query_effective = user_query

            # ── History sanitization (REUSE existing) ──
            chat_history_cleaned = [
                {
                    "role": m["role"],
                    "content": escape_curly_braces(m.get("content", ""))
                }
                for m in chat_history
            ]

            # ── Study-guide pipeline (STREAMING with token validation) ──
            if route == "generate_study_guide" or mode == "study_guide":
                try:
                    # Single-document study guide
                    if doc_id and doc_id != "null":
                        # Use fallback to generate on-demand if no cached summary
                        summary_doc = get_summary_with_fallback(user_id, class_name, doc_id)
                        if summary_doc:
                            context_txt = summary_doc["text"]
                            if est_tokens(context_txt) > MAX_PROMPT_TOKENS:
                                context_txt = condense_summary(context_txt, user_query, get_llm("summary"))
                            guide = generate_study_guide(context_txt, user_query, get_llm("generate_study_guide"))

                            # Stream complete guide as single response
                            yield f"data: {json.dumps({'type': 'token', 'content': guide})}\n\n"

                            citation = get_file_citation([summary_doc])
                            chunk_refs = [{"chunkId": str(summary_doc["_id"]), "displayNumber": 1, "pageNumber": None}]

                            yield f"data: {json.dumps({'type': 'done', 'citations': citation, 'chunkReferences': chunk_refs})}\n\n"
                            return

                    # Class-level study guide (with token validation)
                    if class_name and class_name != "null":
                        # Use fallback to generate on-demand for docs without cached summaries
                        docs = get_class_summaries_with_fallback(user_id, class_name)
                        if docs:
                            # Calculate total tokens across all document summaries
                            combined_tokens = sum(est_tokens(d.get("text", "")) for d in docs)

                            log.info(
                                "[STREAM] Study-guide (class) | combined_tokens=%d | n_docs=%d",
                                combined_tokens, len(docs),
                            )

                            # Check if too large even for hierarchical summarization
                            if combined_tokens > config.MAX_HIERARCHICAL_INPUT_TOKENS:
                                error_msg = (
                                    "This class contains too much content to generate a study guide. "
                                    "Please open individual documents and create study guides for each one separately."
                                )
                                yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"
                                return

                            # Use hierarchical summarization for large classes, else direct
                            if combined_tokens > config.MAX_CLASS_SUMMARY_TOKENS and config.HIERARCHICAL_CLASS_SUMMARY_ENABLED:
                                log.info("[STREAM] Using hierarchical summarization for class study guide")
                                condensed = hierarchical_class_summary(docs, user_query, get_llm("summary"))
                            elif combined_tokens > MAX_PROMPT_TOKENS:
                                combined = "\n\n---\n\n".join(d["text"] for d in docs)
                                condensed = condense_class_summaries(combined, user_query, get_llm("summary"))
                            else:
                                condensed = "\n\n---\n\n".join(d["text"] for d in docs)

                            guide = generate_study_guide(condensed, user_query, get_llm("generate_study_guide"))

                            # Stream complete guide as single response
                            yield f"data: {json.dumps({'type': 'token', 'content': guide})}\n\n"

                            citation = get_file_citation(docs)
                            chunk_refs = [{"chunkId": str(d["_id"]), "displayNumber": i + 1, "pageNumber": None} for i, d in enumerate(docs)]

                            yield f"data: {json.dumps({'type': 'done', 'citations': citation, 'chunkReferences': chunk_refs})}\n\n"
                            return

                except (InvalidRequestError, BadRequestError) as oe:
                    err_code = getattr(oe, "code", None) or getattr(getattr(oe, "error", None), "code", None)
                    if err_code == "context_length_exceeded":
                        error_msg = (
                            "This class contains too much content to generate a study guide. "
                            "Please open individual documents and create study guides for each one separately."
                        )
                        yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"
                        return
                    raise

                except Exception as e:
                    log.error("[STREAM-STUDY-GUIDE] Unexpected error: %s", e, exc_info=True)
                    error_msg = "An error occurred while generating the study guide. Please try again."
                    yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"
                    return

            # ── Document summary mode (STREAMING) ──
            if mode == "doc_summary":
                # Use fallback to generate on-demand if no cached summary
                summary_doc = get_summary_with_fallback(user_id, class_name, doc_id)
                if not summary_doc:
                    log.warning("[STREAM] No stored summary found and on-demand generation failed; falling back to specific search")
                    mode = "specific"
                else:
                    condensed_text = condense_summary(summary_doc["text"], user_query, get_llm("summary"))

                    # Stream complete summary as single response
                    yield f"data: {json.dumps({'type': 'token', 'content': condensed_text})}\n\n"

                    citation = get_file_citation([summary_doc])
                    chunk_refs = [{"chunkId": str(summary_doc["_id"]), "displayNumber": 1, "pageNumber": None}]

                    yield f"data: {json.dumps({'type': 'done', 'citations': citation, 'chunkReferences': chunk_refs})}\n\n"
                    return

            # ── Class summary mode (STREAMING with token validation) ──
            if mode == "class_summary":
                try:
                    # Use fallback to generate on-demand for docs without cached summaries
                    docs = get_class_summaries_with_fallback(user_id, class_name)
                    if not docs:
                        log.warning("[STREAM] No summaries found for this class and on-demand generation failed; falling back to specific search.")
                        mode = "specific"
                    else:
                        # Calculate total tokens across all document summaries
                        combined_tokens = sum(est_tokens(d.get("text", "")) for d in docs)

                        log.info(
                            "[STREAM] Class-summary | combined_tokens=%d | n_docs=%d",
                            combined_tokens, len(docs),
                        )

                        # Check if too large even for hierarchical summarization
                        if combined_tokens > config.MAX_HIERARCHICAL_INPUT_TOKENS:
                            error_msg = (
                                "This class has too many documents or documents that are too large to summarize at once. "
                                "Please open individual documents to summarize them separately."
                            )
                            yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"
                            return

                        # Use hierarchical summarization for large classes, else direct
                        if combined_tokens > config.MAX_CLASS_SUMMARY_TOKENS and config.HIERARCHICAL_CLASS_SUMMARY_ENABLED:
                            log.info("[STREAM] Using hierarchical summarization for class summary")
                            condensed_text = hierarchical_class_summary(docs, user_query, get_llm("summary"))
                        else:
                            combined = "\n\n---\n\n".join(d["text"] for d in docs)
                            condensed_text = condense_class_summaries(combined, user_query, get_llm("summary"))

                        # Stream complete summary as single response
                        yield f"data: {json.dumps({'type': 'token', 'content': condensed_text})}\n\n"

                        citation = get_file_citation(docs)
                        chunk_refs = [{"chunkId": str(d["_id"]), "displayNumber": i + 1, "pageNumber": None} for i, d in enumerate(docs)]

                        yield f"data: {json.dumps({'type': 'done', 'citations': citation, 'chunkReferences': chunk_refs})}\n\n"
                        return

                except (InvalidRequestError, BadRequestError) as oe:
                    err_code = getattr(oe, "code", None) or getattr(getattr(oe, "error", None), "code", None)
                    if err_code == "context_length_exceeded":
                        error_msg = (
                            "This class has too many documents or documents that are too large to summarize at once. "
                            "Please open individual documents to summarize them separately."
                        )
                        yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"
                        return
                    raise

                except Exception as e:
                    log.error("[STREAM-CLASS-SUMMARY] Unexpected error: %s", e, exc_info=True)
                    error_msg = "An error occurred while summarizing this class. Please try again."
                    yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"
                    return

            # ── Config for route ──
            cfg = ROUTE_CONFIG.get(route, ROUTE_CONFIG["general_qa"])
            chunk_array = []
            similarity_results = []

            # ── Follow-up mode: Reuse previous chunks (REUSE existing logic) ──
            if route == "follow_up":
                last_refs = next(
                    (m.get("chunkReferences") for m in reversed(chat_history_cleaned) if m["role"] == "assistant"), []
                )
                if last_refs:
                    for ref in last_refs:
                        chunk_id_val = ref.get("chunkId")
                        try:
                            obj_id = ObjectId(chunk_id_val) if isinstance(chunk_id_val, str) else chunk_id_val
                        except Exception:
                            obj_id = chunk_id_val
                        chunk_doc = collection.find_one({"_id": obj_id})
                        chunk_array.append({
                            "_id": str(obj_id),
                            "chunkNumber": ref.get("displayNumber"),
                            "text": chunk_doc.get("text") if chunk_doc else None,
                            "pageNumber": ref.get("pageNumber"),
                            "docId": chunk_doc.get("doc_id") if chunk_doc else None,
                        })
                    mode = "follow_up"

            # ── Vector Search (REUSE existing logic) ──
            if mode != "follow_up":
                # 1) Token reservation for embedding
                tokens_needed = est_tokens(user_query_effective)
                if not try_acquire_tokens(tokens_needed, max_wait_s=10.0):
                    busy_msg = "System is busy processing other requests. Please retry in a few seconds."
                    yield f"data: {json.dumps({'type': 'error', 'message': busy_msg})}\n\n"
                    return

                # 2) Embed query
                query_vec = embedding_model.embed_query(user_query_effective)

                # 3) Build filters
                filters = {"user_id": user_id, "is_summary": False}
                if doc_id and doc_id != "null":
                    filters["doc_id"] = doc_id
                elif class_name not in (None, "", "null"):
                    filters["class_id"] = class_name

                # 4) Run vector search
                search_cursor = perform_semantic_search(query_vec, filters, limit=cfg["k"], numCandidates=cfg["numCandidates"])

                # 5) Dedupe by (doc_id, page_number)
                raw_results = list(search_cursor)
                seen = set()
                for r in raw_results:
                    key = (r.get("doc_id"), r.get("page_number"))
                    if key in seen:
                        continue
                    seen.add(key)
                    similarity_results.append(r)

                # 6) Build chunk array
                for i, res in enumerate(similarity_results):
                    chunk_array.append({
                        "_id": str(res["_id"]),
                        "chunkNumber": i + 1,
                        "text": res.get("text", ""),
                        "pageNumber": res.get("page_number"),
                        "docId": res.get("doc_id"),
                    })

            # ── No results check ──
            if not chunk_array:
                refine_message = (
                    "I couldn't find anything relevant for that question. "
                    "Make sure you're on the correct class or document and try asking a more specific question."
                )
                yield f"data: {json.dumps({'type': 'error', 'message': refine_message})}\n\n"
                return

            # ── Build prompt (REUSE existing logic) ──
            prompts = load_prompts()
            base_prompt = prompts.get("chrome_extension") if source == "chrome_extension" else prompts.get(route)

            PROMPT_SKELETON = (
                "{route_rules}\n\n"
                "--- CONTEXT ---\n{context}\n\n"
                "{citing}\n\n"
                "Now answer the following user question:\n{input}"
            )

            referencing_instruction = (
                "IMPORTANT: Include inline [N] citations for every major claim or piece of information.\n"
                "If nothing in the context is relevant, reply exactly with NO_HIT_MESSAGE.\n\n"
            )

            # Escape curly braces in chunk text to prevent LangChain template variable errors
            def escape_braces_for_template(text: str) -> str:
                """Double curly braces so LangChain doesn't treat them as variables"""
                return text.replace("{", "{{").replace("}", "}}")

            context_text = "\n\n".join(
                f"<chunk id='{i+1}'>\n{escape_braces_for_template(c['text'])}\n</chunk>"
                for i, c in enumerate(chunk_array)
            ) or "NULL"

            filled_skeleton = PROMPT_SKELETON.format(
                route_rules=base_prompt,
                citing=referencing_instruction,
                context=context_text,
                input="{input}",
            )

            # ── Token reservation for generation ──
            prompt_tokens = est_tokens(filled_skeleton)
            history_tokens = sum(est_tokens(m["content"]) for m in chat_history_cleaned)
            estimated_output = cfg.get("max_output_tokens", 700)
            total_needed = prompt_tokens + history_tokens + estimated_output

            if not try_acquire_tokens(total_needed, max_wait_s=10.0):
                busy_msg = "System is busy processing other requests. Please retry in a few seconds."
                yield f"data: {json.dumps({'type': 'error', 'message': busy_msg})}\n\n"
                return

            # ── STREAMING LLM INVOCATION (NEW) ──
            # P1: Use route-specific model for streaming as well
            model_name = config.ROUTE_MODELS.get(route, config.OPENAI_CHAT_MODEL)
            log.info(f"[STREAM] About to invoke LLM | chunks={len(chunk_array)} | model={model_name}")

            callback = TokenStreamingCallback()
            llm = ChatOpenAI(
                model=model_name,
                temperature=cfg["temperature"],
                streaming=True,
                callbacks=[callback]
            )

            prompt_template = ChatPromptTemplate.from_messages(
                [("system", filled_skeleton), MessagesPlaceholder("chat_history"), ("user", "{input}")]
            )

            chain = prompt_template | llm | StrOutputParser()

            # Convert chat_history to LangChain message objects (CRITICAL!)
            langchain_history = []
            for msg in chat_history_cleaned:
                if msg["role"] == "user":
                    langchain_history.append(HumanMessage(content=msg["content"]))
                elif msg["role"] == "assistant":
                    langchain_history.append(AIMessage(content=msg["content"]))

            log.info(f"[STREAM] Starting LLM task | history_len={len(langchain_history)}")

            # Start async LLM task
            task = asyncio.create_task(
                chain.ainvoke({
                    "input": user_query_effective if route == "quote_finding" else user_query,
                    "chat_history": langchain_history,
                })
            )

            log.info(f"[STREAM] LLM task created, entering token loop")

            # Stream tokens as they arrive
            full_answer = ""
            token_count = 0
            keepalive_count = 0
            while True:
                try:
                    event = await asyncio.wait_for(callback.queue.get(), timeout=1.0)

                    if event["type"] == "done":
                        log.info(f"[STREAM] Received done event | token_count={token_count}")
                        # Generate citations (REUSE existing logic)
                        citation = get_file_citation(similarity_results)
                        chunk_refs = [
                            {"chunkId": item["_id"], "displayNumber": item["chunkNumber"], "pageNumber": item.get("pageNumber")}
                            for item in chunk_array
                        ]

                        # Send completion event with citations
                        yield f"data: {json.dumps({'type': 'done', 'citations': citation, 'chunkReferences': chunk_refs})}\n\n"
                        break

                    elif event["type"] == "token":
                        # Yield token to client
                        token_count += 1
                        if token_count == 1:
                            log.info(f"[STREAM] First token received")
                        full_answer += event["content"]
                        yield f"data: {json.dumps(event)}\n\n"

                    elif event["type"] == "error":
                        # LLM error
                        log.error(f"[STREAM] LLM error event: {event.get('message')}")
                        yield f"data: {json.dumps(event)}\n\n"
                        break

                except asyncio.TimeoutError:
                    # Keepalive (prevents Heroku timeout)
                    keepalive_count += 1
                    if keepalive_count % 10 == 1:
                        log.info(f"[STREAM] Keepalive {keepalive_count} (still waiting for tokens)")
                    yield f"data: {json.dumps({'type': 'keepalive'})}\n\n"

            # Wait for task completion
            await task
            log.info(f"[STREAM] COMPLETE | answer_len={len(full_answer)}")

        except Exception as e:
            log.error(f"[STREAM] ERROR: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(token_generator(), media_type="text/event-stream")


# ---------------- CLI entry (unchanged) ----------------
def main():
    if len(sys.argv) < 7:
        log.error("Error: Not enough arguments provided.")
        sys.exit(1)

    user_id, class_name, doc_id, user_query = sys.argv[1:5]
    chat_history = json.loads(sys.argv[5])
    source = sys.argv[6].lower()

    try:
        result = process_semantic_search(user_id, class_name, doc_id, user_query, chat_history, source)
        log.info(json.dumps(result))
    except Exception as e:
        log.error(f"Error: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log.error(f"Error: {str(e)}")
        sys.exit(1)
