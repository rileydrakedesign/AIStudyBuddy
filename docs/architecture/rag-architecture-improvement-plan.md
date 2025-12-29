# RAG Architecture Improvement Plan

**Version:** 1.1
**Date:** 2025-12-28
**Status:** ✅ APPROVED - Ready for Implementation
**Scope:** Python AI Service RAG Pipeline Modernization
**Architect Review:** Completed 2025-12-28 (see `rag-architecture-review.md`)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Pre-Implementation Requirements](#2-pre-implementation-requirements) *(NEW)*
3. [Current State Analysis](#3-current-state-analysis)
4. [Proposed Changes Overview](#4-proposed-changes-overview)
5. [P0: Critical Improvements](#5-p0-critical-improvements)
6. [P1: High-Value Improvements](#6-p1-high-value-improvements)
7. [P2: Enhanced Capabilities (Deferred)](#7-p2-enhanced-capabilities-deferred)
8. [Chain-Specific Improvements](#8-chain-specific-improvements)
9. [Data Model Changes](#9-data-model-changes)
10. [Infrastructure Requirements](#10-infrastructure-requirements)
11. [Migration Strategy](#11-migration-strategy)
12. [Testing Strategy](#12-testing-strategy)
13. [Rollback Plan](#13-rollback-plan)
14. [Success Metrics](#14-success-metrics)
15. [Operational Requirements](#15-operational-requirements) *(NEW)*

---

## 1. Executive Summary

### Objective

Modernize the Class Chat AI RAG pipeline to align with industry best practices while maintaining speed and concurrent request handling as primary constraints.

### Key Changes

| Priority | Change | Impact | Latency Delta |
|----------|--------|--------|---------------|
| P0 | Contextual chunk headers | +15-20% retrieval precision | 0ms |
| P0 | Hybrid search (BM25 + vector) | +25% recall for exact matches | +10-20ms |
| P1 | Cross-encoder reranking | +20% precision for quotes | +30-50ms |
| P1 | Route-specific model selection | Quality/cost optimization | Variable |
| P2 | Multi-query retrieval | +15% recall for complex questions | +100-200ms |
| P2 | Parent-child chunk linking | Better context in responses | +20ms |

### Non-Goals

- Full GraphRAG implementation (deferred - high complexity, uncertain ROI)
- Re-architecting service boundaries (out of scope per CLAUDE.md guardrails)
- Changing streaming/WebSocket infrastructure (preserved)
- Route-specific embedding models (deferred to P3 - cross-encoder achieves similar precision)

### Architect Review Summary

| Category | Status | Notes |
|----------|--------|-------|
| Service Boundaries | ✅ PASS | All changes within Python AI service |
| Data Model | ✅ PASS | Additive, backward compatible |
| Infrastructure | ⚠️ CONDITIONAL | Verify Atlas M10+ and dyno sizing |
| Dependencies | ✅ PASS | Verify slug size for sentence-transformers |
| Performance | ⚠️ MONITOR | Within bounds, requires ongoing monitoring |
| Migration | ✅ PASS | Feature flags enable safe rollout |
| Rollback | ✅ PASS | <1 min rollback via env vars |

---

## 2. Pre-Implementation Requirements

**CRITICAL:** Complete these verification steps before beginning implementation.

### 2.1 MongoDB Atlas Tier Verification

**Requirement:** Atlas M10+ cluster for Atlas Search (hybrid search)

**Verification Steps:**
```bash
# Option 1: Check via Atlas UI
# Navigate to: Atlas → Clusters → Your Cluster → Tier

# Option 2: Check via Atlas CLI
atlas clusters describe <cluster-name> --projectId <project-id>
```

**If on M0/M2/M5:**
- **Option A:** Upgrade to M10 (~$60/month) - Recommended
- **Option B:** Defer hybrid search, proceed with contextual headers and cross-encoder only

### 2.2 Heroku Dyno Sizing Verification

**Requirement:** Standard-2X dyno (1GB RAM) for cross-encoder model

**Verification Steps:**
```bash
heroku ps -a class-chat-python-f081e08f29b8
```

**Expected Output:** `web.1: up ... (standard-2x)`

**If on Standard-1X:**
```bash
heroku ps:resize web=standard-2x -a class-chat-python-f081e08f29b8
```

**Cost Impact:** Standard-2X is ~$50/month vs ~$25/month for Standard-1X

### 2.3 Slug Size Verification for sentence-transformers

**Requirement:** Heroku slug must remain under 500MB compressed

**Verification Steps:**
```bash
# Check if PyTorch already installed
heroku run "pip show torch" -a class-chat-python-f081e08f29b8

# If PyTorch not present, test locally first
pip install sentence-transformers
pip show torch  # Note size
```

**If slug exceeds limit:**
- Consider ONNX runtime variant of cross-encoder (smaller footprint)
- Or use `sentence-transformers` CPU-only build

### 2.4 Pre-Implementation Checklist

| # | Requirement | Status | Verified By | Date |
|---|-------------|--------|-------------|------|
| 1 | MongoDB Atlas M10+ confirmed | ☐ | | |
| 2 | Heroku Standard-2X confirmed | ☐ | | |
| 3 | Slug size < 500MB with dependencies | ☐ | | |
| 4 | TextSearch index created in Atlas | ☐ | | |
| 5 | Feature flags added with defaults=false | ☐ | | |

---

## 3. Current State Analysis

### 3.1 File Inventory

| Component | File Path | Lines of Interest |
|-----------|-----------|-------------------|
| Chunking Pipeline | `backend/python_scripts/load_data.py` | 169-350, 252-290, 474-476 |
| Semantic Search | `backend/python_scripts/semantic_search.py` | 232-259, 660-732 |
| Route Configuration | `backend/python_scripts/semantic_search.py` | 81-113 |
| Query Router | `backend/python_scripts/router.py` | 10-61 |
| LLM Chains | `backend/python_scripts/semantic_search.py` | 876-963, 410-428 |
| Prompts | `backend/python_scripts/prompts.json` | All |
| Configuration | `backend/python_scripts/config.py` | 127-145 |
| DOCX Processing | `backend/python_scripts/docx_processor.py` | 84-128 |
| FastAPI Endpoints | `backend/python_scripts/semantic_service.py` | 64-155 |
| Redis Tasks | `backend/python_scripts/tasks.py` | 23-56 |

### 3.2 Current Chunking Strategy

```
Document → Markdown Header Split → Recursive Character Split (1200/120) → Optional Semantic Chunking (>2000 chars)
```

**Parameters:**
- Chunk size: 1,200 characters
- Chunk overlap: 120 characters
- Semantic chunking threshold: 2,000 characters
- Batch size (producer→consumer): 8,000 characters

**Gaps Identified:**
1. Chunks lose document/section context after splitting
2. Fixed chunk sizes regardless of content type
3. No hierarchical chunk relationships
4. No metadata enrichment beyond basic fields

### 3.3 Current Retrieval Strategy

```
Query → Embed (text-embedding-3-small) → MongoDB $vectorSearch → Optional MMR Rerank → Dedupe → Context Assembly
```

**Parameters by Route:**

| Route | k | numCandidates | Temperature | Max Tokens |
|-------|---|---------------|-------------|------------|
| general_qa | 12 | 1000 | 0.2 | 700 |
| follow_up | 10 | 1000 | 0.2 | 700 |
| quote_finding | 20 | 1200 | 0.0 | 400 |
| generate_study_guide | 8 | 800 | 0.3 | 1200 |
| summary | 8 | 800 | 0.2 | 600 |

**Gaps Identified:**
1. Pure vector search misses exact keyword matches (critical for quotes)
2. MMR reranking operates in same embedding space (limited improvement)
3. Single query perspective limits recall
4. Same embedding model for all routes regardless of precision needs

### 3.4 Current Model Usage

| Purpose | Model | Location |
|---------|-------|----------|
| Chat/Generation | gpt-4o-mini | All routes |
| Embeddings | text-embedding-3-small | Ingestion + retrieval |
| Route Disambiguation | gpt-4.1-nano | router.py |
| Summarization | gpt-4o-mini | load_data.py |

**Gap:** Same generation model for all routes regardless of output complexity requirements.

---

## 4. Proposed Changes Overview

### 4.1 Architecture Diagram (Current vs Proposed)

**Current Flow:**
```
Query → Embed → Vector Search → MMR (optional) → Dedupe → LLM → Stream
```

**Proposed Flow:**
```
Query → Route Detection → Query Expansion (P2)
      → Embed (route-specific model)
      → Hybrid Search (BM25 + Vector)
      → Cross-Encoder Rerank
      → Parent Expansion (P2)
      → Context Assembly
      → LLM (route-specific model)
      → Post-Validation (quotes)
      → Stream
```

### 4.2 Change Dependencies

```
P0: Contextual Headers ──────────────────────────────────┐
                                                         │
P0: Hybrid Search ───────────────────────────────────────┼──► P1: Cross-Encoder
                                                         │
P1: Route-Specific Models ───────────────────────────────┘

P2: Multi-Query ─────────────────────────────────────────► Requires P1 complete

P2: Parent-Child Chunks ─────────────────────────────────► Requires re-ingestion
```

---

## 5. P0: Critical Improvements

### 5.1 Contextual Chunk Headers

**Objective:** Embed document and section context with each chunk to improve retrieval relevance.

**Files to Modify:**
- `backend/python_scripts/load_data.py`

**Implementation:**

```python
# Add to load_data.py after imports (around line 30)

def create_contextual_header(
    doc_title: str,
    section_headers: list[str] | None = None,
    doc_type: str | None = None
) -> str:
    """
    Create a contextual header to prepend to chunks.
    This improves retrieval by embedding document context with content.
    """
    parts = [f"Document: {doc_title}"]

    if doc_type:
        parts.append(f"Type: {doc_type}")

    if section_headers:
        # Include up to 2 levels of section hierarchy
        hierarchy = " > ".join(section_headers[-2:])
        parts.append(f"Section: {hierarchy}")

    return "\n".join(parts) + "\n\n"


def add_context_to_chunk(
    chunk_text: str,
    doc_title: str,
    section_headers: list[str] | None = None,
    doc_type: str | None = None
) -> str:
    """
    Prepend contextual header to chunk text before embedding.
    The header is included in the embedding but can be stripped for display.
    """
    header = create_contextual_header(doc_title, section_headers, doc_type)
    return header + chunk_text
```

**Modify chunk creation in `stream_chunks_to_atlas()` (around line 280-310):**

```python
# Before embedding, add context to each chunk
for i, chunk in enumerate(chunks):
    # Track current section headers from markdown splitting
    current_sections = chunk.metadata.get("headers", [])

    # Create contextualized version for embedding
    contextualized_text = add_context_to_chunk(
        chunk_text=chunk.page_content,
        doc_title=file_name,
        section_headers=current_sections,
        doc_type=file_ext  # "pdf" or "docx"
    )

    # Store both versions
    chunk.metadata["original_text"] = chunk.page_content
    chunk.page_content = contextualized_text  # This gets embedded
```

**Schema Addition:**

```python
# Add to chunk document structure
doc_record = {
    # ... existing fields ...
    "text": contextualized_text,           # Embedded text (with header)
    "original_text": original_chunk_text,  # Display text (without header)
    "section_headers": section_headers,    # For UI breadcrumbs
    "doc_type": file_ext,                  # pdf | docx
}
```

**Migration:** New chunks will have context; existing chunks continue to work (graceful degradation).

**Latency Impact:** 0ms (context added at ingestion time, not query time)

---

### 5.2 Hybrid Search (BM25 + Vector)

**CONDITIONAL:** Requires MongoDB Atlas M10+ tier. See Pre-Implementation Requirements.

**Objective:** Combine keyword-based search with semantic search for better recall on exact matches.

**Prerequisites:**
- Create MongoDB Atlas Search index for text search
- Requires Atlas M10+ cluster (text search indexes)

**Files to Modify:**
- `backend/python_scripts/semantic_search.py`
- `backend/python_scripts/config.py`

**Step 1: Create Text Search Index**

Create via MongoDB Atlas UI or mongosh:

```javascript
// Index definition for Atlas Search
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "text": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "original_text": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "user_id": {
        "type": "string"
      },
      "class_id": {
        "type": "string"
      },
      "doc_id": {
        "type": "string"
      },
      "is_summary": {
        "type": "boolean"
      }
    }
  }
}
```

**Index Name:** `TextSearch` (on collection `study_materials2`)

**Step 2: Add Text Search Function**

```python
# Add to semantic_search.py after perform_semantic_search() (around line 260)

def perform_text_search(
    query: str,
    filters: dict | None = None,
    *,
    limit: int = 12
) -> list[dict]:
    """
    Perform BM25 text search using MongoDB Atlas Search.

    Args:
        query: Raw text query
        filters: Dict with user_id, class_id, doc_id, is_summary filters
        limit: Maximum results to return

    Returns:
        List of matching documents with text search scores
    """
    # Build compound filter for Atlas Search
    filter_clauses = []
    if filters:
        if "user_id" in filters:
            filter_clauses.append({"equals": {"path": "user_id", "value": filters["user_id"]}})
        if "class_id" in filters:
            filter_clauses.append({"equals": {"path": "class_id", "value": filters["class_id"]}})
        if "doc_id" in filters:
            filter_clauses.append({"equals": {"path": "doc_id", "value": filters["doc_id"]}})
        if "is_summary" in filters:
            filter_clauses.append({"equals": {"path": "is_summary", "value": filters["is_summary"]}})

    # Build search stage
    search_stage = {
        "$search": {
            "index": "TextSearch",
            "compound": {
                "must": [
                    {
                        "text": {
                            "query": query,
                            "path": ["text", "original_text"],
                            "fuzzy": {"maxEdits": 1}  # Allow minor typos
                        }
                    }
                ]
            }
        }
    }

    # Add filters if present
    if filter_clauses:
        search_stage["$search"]["compound"]["filter"] = filter_clauses

    pipeline = [
        search_stage,
        {
            "$project": {
                "_id": 1,
                "text": 1,
                "original_text": 1,
                "file_name": 1,
                "title": 1,
                "author": 1,
                "page_number": 1,
                "doc_id": 1,
                "is_summary": 1,
                "score": {"$meta": "searchScore"},
            }
        },
        {"$limit": limit}
    ]

    return list(collection.aggregate(pipeline))
```

**Step 3: Add Reciprocal Rank Fusion**

```python
# Add to semantic_search.py (around line 320)

def reciprocal_rank_fusion(
    result_lists: list[list[dict]],
    k: int = 60,
    top_n: int = 12
) -> list[dict]:
    """
    Merge multiple ranked result lists using Reciprocal Rank Fusion (RRF).

    RRF score = sum(1 / (k + rank)) for each list where document appears.

    Args:
        result_lists: List of result lists, each sorted by relevance
        k: RRF constant (higher = more weight to lower ranks)
        top_n: Number of results to return

    Returns:
        Merged and re-ranked results
    """
    doc_scores: dict[str, dict] = {}  # _id -> {doc, score}

    for results in result_lists:
        for rank, doc in enumerate(results):
            doc_id = str(doc["_id"])
            rrf_score = 1.0 / (k + rank + 1)  # +1 for 0-indexed ranks

            if doc_id in doc_scores:
                doc_scores[doc_id]["score"] += rrf_score
            else:
                doc_scores[doc_id] = {"doc": doc, "score": rrf_score}

    # Sort by combined RRF score
    sorted_docs = sorted(
        doc_scores.values(),
        key=lambda x: x["score"],
        reverse=True
    )

    return [item["doc"] for item in sorted_docs[:top_n]]


def hybrid_search(
    query: str,
    query_vector: list[float],
    filters: dict | None = None,
    *,
    k: int = 12,
    num_candidates: int = 1000,
    vector_weight: float = 0.6,
    text_weight: float = 0.4
) -> list[dict]:
    """
    Perform hybrid search combining vector similarity and BM25 text search.

    Args:
        query: Raw text query for BM25
        query_vector: Embedded query for vector search
        filters: Scope filters
        k: Final number of results
        num_candidates: Vector search candidates
        vector_weight: Weight for vector results in RRF (default 0.6)
        text_weight: Weight for text results in RRF (default 0.4)

    Returns:
        Merged results from both search methods
    """
    # Fetch more candidates from each method for better fusion
    fetch_k = k * 2

    # Run both searches (could parallelize with asyncio)
    vector_results = list(perform_semantic_search(
        query_vector, filters, limit=fetch_k, numCandidates=num_candidates
    ))

    text_results = perform_text_search(query, filters, limit=fetch_k)

    # Apply RRF fusion
    # Weight by duplicating results (simple approximation)
    weighted_lists = []

    # Add vector results (weighted)
    for _ in range(int(vector_weight * 10)):
        weighted_lists.append(vector_results)

    # Add text results (weighted)
    for _ in range(int(text_weight * 10)):
        weighted_lists.append(text_results)

    return reciprocal_rank_fusion(weighted_lists, top_n=k)
```

**Step 4: Integrate into Main Search Flow**

```python
# Modify process_semantic_search() around line 670-680

# Replace:
# search_cursor = perform_semantic_search(query_vec, filters, limit=cfg["k"], numCandidates=cfg["numCandidates"])

# With:
use_hybrid = cfg.get("use_hybrid", True)  # Default to hybrid

if use_hybrid:
    raw_results = hybrid_search(
        query=user_query,
        query_vector=query_vec,
        filters=filters,
        k=cfg["k"],
        num_candidates=cfg["numCandidates"],
        vector_weight=cfg.get("vector_weight", 0.6),
        text_weight=cfg.get("text_weight", 0.4)
    )
else:
    raw_results = list(perform_semantic_search(
        query_vec, filters, limit=cfg["k"], numCandidates=cfg["numCandidates"]
    ))
```

**Step 5: Update Route Configuration**

```python
# Modify ROUTE_CONFIG in semantic_search.py (lines 81-113)

ROUTE_CONFIG = {
    "general_qa": {
        "k": config.RAG_K,
        "numCandidates": config.RAG_CANDIDATES,
        "temperature": config.RAG_TEMP_GENERAL,
        "max_output_tokens": config.RAG_MAX_TOKENS,
        "use_hybrid": True,
        "vector_weight": 0.6,
        "text_weight": 0.4,
    },
    "follow_up": {
        "k": config.RAG_K_FOLLOWUP,
        "numCandidates": config.RAG_CANDIDATES,
        "temperature": config.RAG_TEMP_FOLLOWUP,
        "max_output_tokens": config.RAG_MAX_TOKENS,
        "use_hybrid": False,  # Follow-ups use prior context
        "vector_weight": 0.7,
        "text_weight": 0.3,
    },
    "quote_finding": {
        "k": config.RAG_K_QUOTE,
        "numCandidates": 1200,
        "temperature": config.RAG_TEMP_QUOTE,
        "max_output_tokens": config.RAG_MAX_TOKENS_QUOTE,
        "use_hybrid": True,
        "vector_weight": 0.4,  # Higher text weight for exact matches
        "text_weight": 0.6,
    },
    "generate_study_guide": {
        "k": config.RAG_K_GUIDE,
        "numCandidates": 800,
        "temperature": config.RAG_TEMP_GUIDE,
        "max_output_tokens": config.RAG_MAX_TOKENS_GUIDE,
        "use_hybrid": True,
        "vector_weight": 0.7,
        "text_weight": 0.3,
    },
    "summary": {
        "k": config.RAG_K_SUM,
        "numCandidates": 800,
        "temperature": config.RAG_TEMP_SUM,
        "max_output_tokens": config.RAG_MAX_TOKENS_SUM,
        "use_hybrid": True,
        "vector_weight": 0.7,
        "text_weight": 0.3,
    },
}
```

**Latency Impact:** +10-20ms (two parallel searches + fusion)

**Fallback:** If text search index unavailable, falls back to vector-only.

---

## 6. P1: High-Value Improvements

### 6.1 Cross-Encoder Reranking

**CONDITIONAL:** Requires Heroku Standard-2X dyno. See Pre-Implementation Requirements.

**Objective:** Replace MMR with cross-encoder reranking for significantly higher precision.

**Files to Modify:**
- `backend/python_scripts/semantic_search.py`
- `backend/python_scripts/requirements.txt`

**Step 1: Add Dependency**

```txt
# Add to requirements.txt
sentence-transformers==2.2.2
```

**Step 2: Initialize Reranker**

```python
# Add to semantic_search.py after imports (around line 30)

from sentence_transformers import CrossEncoder

# Initialize cross-encoder (loaded once at module level)
# Model: ms-marco-MiniLM-L-6-v2 - fast, good quality, 22M params
_cross_encoder: CrossEncoder | None = None

def get_cross_encoder() -> CrossEncoder:
    """Lazy-load cross-encoder to avoid startup delay."""
    global _cross_encoder
    if _cross_encoder is None:
        _cross_encoder = CrossEncoder(
            'cross-encoder/ms-marco-MiniLM-L-6-v2',
            max_length=512,
            device='cpu'  # Use 'cuda' if GPU available
        )
    return _cross_encoder
```

**Step 3: Implement Reranking Function**

```python
# Add to semantic_search.py (around line 350)

def cross_encoder_rerank(
    query: str,
    chunks: list[dict],
    top_k: int = 12,
    text_field: str = "text"
) -> list[dict]:
    """
    Rerank chunks using cross-encoder for higher precision.

    Cross-encoders jointly encode query-document pairs, providing
    more accurate relevance scores than bi-encoder similarity.

    Args:
        query: User query
        chunks: List of chunk documents
        top_k: Number of top results to return
        text_field: Field containing chunk text

    Returns:
        Reranked chunks (top_k most relevant)
    """
    if not chunks:
        return chunks

    if len(chunks) <= top_k:
        # Not enough chunks to rerank, return as-is
        return chunks

    try:
        reranker = get_cross_encoder()

        # Create query-document pairs
        # Truncate long texts to fit model max_length
        pairs = [
            (query, chunk.get(text_field, chunk.get("original_text", ""))[:500])
            for chunk in chunks
        ]

        # Get relevance scores
        scores = reranker.predict(pairs, show_progress_bar=False)

        # Sort by score descending
        scored_chunks = list(zip(chunks, scores))
        scored_chunks.sort(key=lambda x: x[1], reverse=True)

        # Return top_k with scores attached
        result = []
        for chunk, score in scored_chunks[:top_k]:
            chunk["rerank_score"] = float(score)
            result.append(chunk)

        return result

    except Exception as e:
        log.warning("[RERANK] Cross-encoder failed, returning unranked: %s", e)
        return chunks[:top_k]
```

**Step 4: Replace MMR with Cross-Encoder**

```python
# Modify process_semantic_search() - replace MMR block (lines 691-732)

# OLD: MMR reranking code
# NEW: Cross-encoder reranking

# Configuration for which routes use cross-encoder
ROUTES_WITH_RERANKING = {"quote_finding", "general_qa", "generate_study_guide"}

rerank_applied = False
rerank_ms = None

if route in ROUTES_WITH_RERANKING and len(similarity_results) > cfg["k"]:
    try:
        rerank_start = time.time()

        similarity_results = cross_encoder_rerank(
            query=user_query,
            chunks=similarity_results,
            top_k=cfg["k"],
            text_field="original_text" if "original_text" in similarity_results[0] else "text"
        )

        rerank_ms = int((time.time() - rerank_start) * 1000)
        rerank_applied = True
        log.info("[RERANK] Cross-encoder applied over %d candidates in %dms",
                 len(similarity_results), rerank_ms)
    except Exception as e:
        log.warning("[RERANK] skipped: %s", e)
```

**Latency Impact:** +30-50ms for reranking step

**Route-Specific Application:**
- `quote_finding`: Always (precision critical)
- `general_qa`: Always (quality improvement)
- `generate_study_guide`: Always (comprehensive retrieval)
- `follow_up`: Skip (uses prior context)
- `summary`: Skip (uses stored summaries)

---

### 6.2 Route-Specific Model Selection

**Objective:** Use appropriate models for each task to optimize quality/cost/speed.

**Files to Modify:**
- `backend/python_scripts/config.py`
- `backend/python_scripts/semantic_search.py`

**Step 1: Add Route Model Configuration**

```python
# Add to config.py (around line 150)

# Route-specific LLM models
ROUTE_MODELS = {
    "general_qa": os.getenv("MODEL_GENERAL_QA", "gpt-4o-mini"),
    "follow_up": os.getenv("MODEL_FOLLOW_UP", "gpt-4o-mini"),
    "quote_finding": os.getenv("MODEL_QUOTE", "gpt-4o-mini"),
    "generate_study_guide": os.getenv("MODEL_STUDY_GUIDE", "gpt-4o"),  # Higher quality
    "summary": os.getenv("MODEL_SUMMARY", "gpt-4o-mini"),
}

# Route-specific embedding models
ROUTE_EMBEDDINGS = {
    "quote_finding": os.getenv("EMBED_QUOTE", "text-embedding-3-large"),  # Higher precision
    "default": os.getenv("EMBED_DEFAULT", "text-embedding-3-small"),
}

# Embedding dimensions by model
EMBEDDING_DIMENSIONS = {
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
}
```

**Step 2: Create Route-Aware Embedding Function**

```python
# Add to semantic_search.py (around line 90)

from langchain_openai import OpenAIEmbeddings

# Cache embedding models to avoid re-initialization
_embedding_models: dict[str, OpenAIEmbeddings] = {}

def get_embedding_model(route: str) -> OpenAIEmbeddings:
    """Get route-appropriate embedding model."""
    model_name = config.ROUTE_EMBEDDINGS.get(route, config.ROUTE_EMBEDDINGS["default"])

    if model_name not in _embedding_models:
        _embedding_models[model_name] = OpenAIEmbeddings(model=model_name)

    return _embedding_models[model_name]


def embed_query_for_route(query: str, route: str) -> list[float]:
    """Embed query using route-appropriate model."""
    model = get_embedding_model(route)
    return model.embed_query(query)
```

**Step 3: Create Route-Aware LLM Function**

```python
# Add to semantic_search.py (around line 110)

from langchain_openai import ChatOpenAI

def get_llm_for_route(
    route: str,
    temperature: float | None = None,
    streaming: bool = False,
    callbacks: list | None = None
) -> ChatOpenAI:
    """Get route-appropriate LLM with configuration."""
    model_name = config.ROUTE_MODELS.get(route, config.OPENAI_CHAT_MODEL)
    cfg = ROUTE_CONFIG.get(route, ROUTE_CONFIG["general_qa"])

    return ChatOpenAI(
        model=model_name,
        temperature=temperature if temperature is not None else cfg["temperature"],
        max_tokens=cfg["max_output_tokens"],
        streaming=streaming,
        callbacks=callbacks or []
    )
```

**Step 4: Update Main Search Flow**

```python
# Modify process_semantic_search() embedding step (around line 655)

# OLD:
# query_vec = create_embedding(user_query)

# NEW:
query_vec = embed_query_for_route(user_query, route)

# ...

# Modify LLM creation (around line 950)

# OLD:
# llm = ChatOpenAI(model=config.OPENAI_CHAT_MODEL, ...)

# NEW:
llm = get_llm_for_route(
    route=route,
    temperature=cfg["temperature"],
    streaming=False
)
```

**Important Note on Mixed Embedding Models:**

Using different embedding models for different routes creates a challenge: chunks are embedded with `text-embedding-3-small` at ingestion, but `quote_finding` queries would use `text-embedding-3-large`.

**Solution Options:**

1. **Dual Embedding at Ingestion** (Recommended for quote_finding):
   - Store both small and large embeddings
   - Adds storage cost but enables route-specific retrieval

2. **Query-Time Projection** (Alternative):
   - Use small embeddings for all retrieval
   - Apply cross-encoder reranking for precision (already planned)

**Recommendation:** For P1, keep single embedding model but use cross-encoder reranking for precision-critical routes. Dual embedding can be a P3 enhancement.

**Revised Config:**

```python
# config.py - P1 version (single embedding, route-specific LLM)
ROUTE_MODELS = {
    "general_qa": "gpt-4o-mini",
    "follow_up": "gpt-4o-mini",
    "quote_finding": "gpt-4o-mini",  # Precision via cross-encoder, not embedding
    "generate_study_guide": "gpt-4o",  # Higher quality for structured output
    "summary": "gpt-4o-mini",
}

# Keep single embedding model for now
EMBEDDING_MODEL = "text-embedding-3-small"
```

---

## 7. P2: Enhanced Capabilities (Deferred)

**ARCHITECT NOTE:** P2 changes are deferred pending evaluation of P0/P1 results. They add significant complexity (multi-query adds latency, parent-child adds storage). Implement only after P0/P1 are validated in production.

### 7.1 Multi-Query Retrieval (DEFERRED)

**Objective:** Generate query variations for broader recall on complex questions.

**Files to Modify:**
- `backend/python_scripts/semantic_search.py`

**Implementation:**

```python
# Add to semantic_search.py (around line 400)

QUERY_EXPANSION_PROMPT = """Generate 3 alternative search queries for finding relevant information.
Keep each alternative focused and specific.

Original question: {query}

Return exactly 3 alternatives, one per line, without numbering or bullets."""


async def generate_query_alternatives(
    query: str,
    llm: ChatOpenAI | None = None
) -> list[str]:
    """
    Generate alternative query phrasings for multi-query retrieval.

    Uses a fast, cheap model to create variations that may match
    different document phrasings.
    """
    if llm is None:
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.3, max_tokens=200)

    try:
        prompt = ChatPromptTemplate.from_template(QUERY_EXPANSION_PROMPT)
        chain = prompt | llm | StrOutputParser()

        result = await chain.ainvoke({"query": query})
        alternatives = [line.strip() for line in result.strip().split("\n") if line.strip()]

        return alternatives[:3]  # Limit to 3
    except Exception as e:
        log.warning("[MULTI-QUERY] Failed to generate alternatives: %s", e)
        return []


async def multi_query_search(
    query: str,
    filters: dict | None = None,
    *,
    k: int = 12,
    num_candidates: int = 1000,
    route: str = "general_qa"
) -> list[dict]:
    """
    Perform multi-query retrieval for better recall.

    1. Generate query alternatives
    2. Search with each query
    3. Merge results with RRF
    4. Rerank with cross-encoder
    """
    # Generate alternatives
    alternatives = await generate_query_alternatives(query)
    all_queries = [query] + alternatives

    log.info("[MULTI-QUERY] Searching with %d queries", len(all_queries))

    # Embed all queries
    embedding_model = get_embedding_model(route)
    all_vectors = embedding_model.embed_documents(all_queries)

    # Search with each query
    all_result_lists = []
    for qvec in all_vectors:
        if config.HYBRID_SEARCH_ENABLED:
            results = hybrid_search(
                query=query,  # Use original for text search
                query_vector=qvec,
                filters=filters,
                k=k,
                num_candidates=num_candidates
            )
        else:
            results = list(perform_semantic_search(qvec, filters, limit=k, numCandidates=num_candidates))
        all_result_lists.append(results)

    # Merge with RRF
    merged = reciprocal_rank_fusion(all_result_lists, top_n=k * 2)

    # Rerank with cross-encoder
    final = cross_encoder_rerank(query, merged, top_k=k)

    return final
```

**Integration:**

```python
# Add to ROUTE_CONFIG
ROUTE_CONFIG = {
    # ...
    "generate_study_guide": {
        # ...
        "use_multi_query": True,  # Enable for study guides
    },
    "general_qa": {
        # ...
        "use_multi_query": False,  # Keep fast for general QA
    },
}

# In process_semantic_search(), add branch for multi-query
if cfg.get("use_multi_query", False):
    similarity_results = await multi_query_search(
        query=user_query,
        filters=filters,
        k=cfg["k"],
        num_candidates=cfg["numCandidates"],
        route=route
    )
else:
    # Existing search logic
    ...
```

**Latency Impact:** +100-200ms (query generation + multiple searches)

**Apply To:**
- `generate_study_guide`: Yes (comprehensive coverage needed)
- Others: No (latency-sensitive)

---

### 7.2 Parent-Child Chunk Linking (DEFERRED)

**ARCHITECT NOTE:** This change adds 50-100% storage overhead due to denormalized parent text. Defer until storage costs are assessed post-P0/P1.

**Objective:** Retrieve precise small chunks, expand to parent context for LLM.

**This is a significant change requiring re-ingestion. Full specification:**

**Files to Modify:**
- `backend/python_scripts/load_data.py`
- `backend/python_scripts/semantic_search.py`

**Schema Changes:**

```python
# New chunk document structure
{
    # Existing fields
    "_id": ObjectId,
    "text": str,                    # Embedded text (child: small, parent: large)
    "embedding": list[float],       # Only children have embeddings
    "file_name": str,
    "doc_id": str,
    "user_id": str,
    "class_id": str,
    "page_number": int,
    "is_summary": bool,

    # New fields for hierarchy
    "chunk_type": str,              # "parent" | "child"
    "chunk_id": str,                # Unique ID: "{doc_id}_p{parent_idx}" or "{doc_id}_c{child_idx}"
    "parent_id": str | None,        # For children: reference to parent chunk_id
    "child_ids": list[str] | None,  # For parents: list of child chunk_ids
    "context_text": str | None,     # For children: the parent's text (denormalized for speed)
}
```

**Chunk Size Configuration:**

```python
# config.py
PARENT_CHUNK_SIZE = 2400      # Large chunks for context
PARENT_CHUNK_OVERLAP = 200
CHILD_CHUNK_SIZE = 600        # Small chunks for precise retrieval
CHILD_CHUNK_OVERLAP = 60
```

**Ingestion Changes:**

```python
# load_data.py - new hierarchical chunking function

def create_hierarchical_chunks(
    text: str,
    doc_meta: dict,
    parent_size: int = 2400,
    parent_overlap: int = 200,
    child_size: int = 600,
    child_overlap: int = 60
) -> tuple[list[dict], list[dict]]:
    """
    Create parent and child chunks with bidirectional linking.

    Returns:
        Tuple of (parent_chunks, child_chunks)
        Only child_chunks should be embedded.
    """
    doc_id = doc_meta["doc_id"]

    # Create parent chunks
    parent_splitter = RecursiveCharacterTextSplitter(
        chunk_size=parent_size,
        chunk_overlap=parent_overlap
    )
    parent_texts = parent_splitter.split_text(text)

    parent_chunks = []
    child_chunks = []

    # Create child chunks within each parent
    child_splitter = RecursiveCharacterTextSplitter(
        chunk_size=child_size,
        chunk_overlap=child_overlap
    )

    for parent_idx, parent_text in enumerate(parent_texts):
        parent_id = f"{doc_id}_p{parent_idx}"
        child_texts = child_splitter.split_text(parent_text)
        child_ids = []

        for child_idx, child_text in enumerate(child_texts):
            child_id = f"{doc_id}_c{parent_idx}_{child_idx}"
            child_ids.append(child_id)

            child_chunks.append({
                **doc_meta,
                "chunk_type": "child",
                "chunk_id": child_id,
                "parent_id": parent_id,
                "text": child_text,
                "context_text": parent_text,  # Denormalized for fast retrieval
                # embedding will be added later
            })

        parent_chunks.append({
            **doc_meta,
            "chunk_type": "parent",
            "chunk_id": parent_id,
            "parent_id": None,
            "child_ids": child_ids,
            "text": parent_text,
            "embedding": None,  # Parents are not embedded
        })

    return parent_chunks, child_chunks
```

**Retrieval Changes:**

```python
# semantic_search.py - modify retrieval to expand to parent context

def retrieve_with_parent_expansion(
    query_vec: list[float],
    filters: dict,
    k: int = 12,
    num_candidates: int = 1000
) -> list[dict]:
    """
    Retrieve child chunks, return with parent context.

    Child chunks provide precise retrieval.
    Parent context provides broader understanding for LLM.
    """
    # Search only children
    child_filters = {**filters, "chunk_type": "child"}
    children = list(perform_semantic_search(
        query_vec, child_filters, limit=k, numCandidates=num_candidates
    ))

    # For each child, attach parent context
    # Using denormalized context_text for speed (no extra query)
    for child in children:
        if "context_text" not in child or not child["context_text"]:
            # Fallback: fetch parent if not denormalized
            parent = collection.find_one({"chunk_id": child.get("parent_id")})
            if parent:
                child["context_text"] = parent["text"]

    return children


def build_context_with_parents(chunks: list[dict]) -> str:
    """
    Build context string using parent text for broader context.
    Deduplicates parents that appear multiple times.
    """
    seen_parents = set()
    context_parts = []

    for chunk in chunks:
        parent_id = chunk.get("parent_id")

        if parent_id and parent_id not in seen_parents:
            seen_parents.add(parent_id)
            # Use parent context for LLM
            context_parts.append(chunk.get("context_text", chunk["text"]))
        elif not parent_id:
            # No parent, use chunk directly
            context_parts.append(chunk["text"])

    return "\n\n---\n\n".join(context_parts)
```

**Migration Strategy:**

1. Add new fields to schema (backward compatible)
2. New ingestions create hierarchical chunks
3. Old chunks continue to work (no `chunk_type` = flat chunk)
4. Optional: batch re-ingest existing documents

**Latency Impact:** +20ms (parent context lookup, mitigated by denormalization)

---

## 8. Chain-Specific Improvements

### 8.1 Quote Finding Chain

**Current Issues:**
1. Pure vector search misses exact text matches
2. No validation that quotes are verbatim
3. High k (20) compensates for poor precision

**Improvements:**

```python
# prompts.json - enhanced quote prompt
{
    "quote_finding": "Find and return up to three **verbatim** quotations from the provided context that best answer the user's request.\n\nRULES:\n1. Each quote MUST appear exactly as written in the context\n2. Enclose each quote in quotation marks\n3. Add the citation [N] after each quote\n4. If fewer than 3 relevant quotes exist, return only what's available\n5. If no relevant quotes exist, respond with NO_HIT_MESSAGE\n\nFORMAT:\n\"Quote text here.\" [1]\n\n\"Second quote here.\" [2]"
}

# semantic_search.py - add quote validation
def validate_quotes_verbatim(
    llm_response: str,
    source_chunks: list[dict],
    fuzzy_threshold: float = 0.9
) -> tuple[str, list[str]]:
    """
    Validate that quotes in LLM response appear in source chunks.

    Returns:
        Tuple of (validated_response, list_of_invalid_quotes)
    """
    import re
    from difflib import SequenceMatcher

    # Extract quotes from response
    quote_pattern = r'"([^"]+)"'
    quotes = re.findall(quote_pattern, llm_response)

    # Combine all source text
    source_text = " ".join(c.get("text", "") for c in source_chunks)
    source_normalized = normalize_for_comparison(source_text)

    invalid_quotes = []

    for quote in quotes:
        quote_normalized = normalize_for_comparison(quote)

        # Check for exact match first
        if quote_normalized in source_normalized:
            continue

        # Check for fuzzy match
        ratio = SequenceMatcher(None, quote_normalized, source_normalized).ratio()
        if ratio < fuzzy_threshold:
            invalid_quotes.append(quote)

    return llm_response, invalid_quotes


def normalize_for_comparison(text: str) -> str:
    """Normalize text for quote comparison."""
    import re
    # Lowercase, remove extra whitespace, normalize quotes
    text = text.lower()
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'[""'']', '"', text)
    return text.strip()
```

**Route Config Update:**

```python
ROUTE_CONFIG["quote_finding"] = {
    "k": 15,                          # Reduced from 20 with better search
    "numCandidates": 1200,
    "temperature": 0.0,
    "max_output_tokens": 400,
    "use_hybrid": True,
    "vector_weight": 0.4,             # Higher text weight
    "text_weight": 0.6,
    "use_reranking": True,            # Always use cross-encoder
    "validate_quotes": True,          # Enable post-validation
}
```

### 8.2 Study Guide Chain

**Current Issues:**
1. Only 8 chunks may miss key concepts
2. Generic prompt doesn't adapt to content
3. No query decomposition for complex requests

**Improvements:**

```python
# prompts.json - enhanced study guide prompt
{
    "generate_study_guide": "You are an expert tutor creating a comprehensive study guide.\n\nINSTRUCTIONS:\n1. Analyze ALL provided context chunks thoroughly\n2. Identify the main topics, key concepts, and important details\n3. Structure the guide for effective studying\n4. Include specific examples and definitions from the context\n5. Add practice questions that test understanding\n\nFORMAT (use exactly these headings):\n\n# Study Guide: {topic}\n\n## Overview\n[2-3 sentence summary of the material]\n\n## Key Concepts\n[Bulleted list of main concepts with brief explanations]\n\n## Important Definitions\n[Term: definition format]\n\n## Detailed Notes\n[Organized notes by subtopic]\n\n## Formulas & Diagrams\n[If applicable, otherwise omit this section]\n\n## Practice Questions\n[3-5 questions ranging from recall to application]\n\nKeep the guide under 1500 words while being comprehensive."
}

# Route config update
ROUTE_CONFIG["generate_study_guide"] = {
    "k": 12,                          # Increased from 8
    "numCandidates": 1000,
    "temperature": 0.3,
    "max_output_tokens": 1500,        # Increased from 1200
    "use_hybrid": True,
    "vector_weight": 0.7,
    "text_weight": 0.3,
    "use_reranking": True,
    "use_multi_query": True,          # P2: Enable query expansion
    "model": "gpt-4o",                # Higher quality model
}
```

---

## 9. Data Model Changes

### 9.1 MongoDB Collection Schema Updates

**Collection:** `study_materials2`

**New Fields (Backward Compatible):**

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `original_text` | string | Chunk text without contextual header | null |
| `section_headers` | array | Section hierarchy for breadcrumbs | [] |
| `doc_type` | string | "pdf" \| "docx" | null |
| `chunk_type` | string | "parent" \| "child" \| null (flat) | null |
| `chunk_id` | string | Unique chunk identifier | null |
| `parent_id` | string | Reference to parent chunk | null |
| `child_ids` | array | References to child chunks | null |
| `context_text` | string | Denormalized parent text | null |

**New Indexes:**

```javascript
// Text search index (Atlas Search)
{
  "name": "TextSearch",
  "type": "search",
  "definition": {
    "mappings": {
      "fields": {
        "text": {"type": "string", "analyzer": "lucene.standard"},
        "original_text": {"type": "string", "analyzer": "lucene.standard"}
      }
    }
  }
}

// Chunk hierarchy index (for parent-child lookup)
{
  "name": "chunk_hierarchy_idx",
  "key": {"chunk_id": 1},
  "unique": true,
  "partialFilterExpression": {"chunk_id": {"$exists": true}}
}

// Parent lookup index
{
  "name": "parent_lookup_idx",
  "key": {"parent_id": 1},
  "partialFilterExpression": {"parent_id": {"$exists": true}}
}
```

### 9.2 Configuration Schema Updates

**File:** `backend/python_scripts/config.py`

```python
# New configuration variables

# Hybrid Search
HYBRID_SEARCH_ENABLED = os.getenv("HYBRID_SEARCH_ENABLED", "true").lower() == "true"
HYBRID_VECTOR_WEIGHT = float(os.getenv("HYBRID_VECTOR_WEIGHT", "0.6"))
HYBRID_TEXT_WEIGHT = float(os.getenv("HYBRID_TEXT_WEIGHT", "0.4"))

# Cross-Encoder Reranking
RERANKING_ENABLED = os.getenv("RERANKING_ENABLED", "true").lower() == "true"
RERANKER_MODEL = os.getenv("RERANKER_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")
RERANKER_MAX_LENGTH = int(os.getenv("RERANKER_MAX_LENGTH", "512"))

# Multi-Query Retrieval
MULTI_QUERY_ENABLED = os.getenv("MULTI_QUERY_ENABLED", "false").lower() == "true"
MULTI_QUERY_COUNT = int(os.getenv("MULTI_QUERY_COUNT", "3"))

# Route-Specific Models
ROUTE_MODELS = {
    "general_qa": os.getenv("MODEL_GENERAL_QA", "gpt-4o-mini"),
    "follow_up": os.getenv("MODEL_FOLLOW_UP", "gpt-4o-mini"),
    "quote_finding": os.getenv("MODEL_QUOTE", "gpt-4o-mini"),
    "generate_study_guide": os.getenv("MODEL_STUDY_GUIDE", "gpt-4o"),
    "summary": os.getenv("MODEL_SUMMARY", "gpt-4o-mini"),
}

# Hierarchical Chunking (P2)
HIERARCHICAL_CHUNKING_ENABLED = os.getenv("HIERARCHICAL_CHUNKING", "false").lower() == "true"
PARENT_CHUNK_SIZE = int(os.getenv("PARENT_CHUNK_SIZE", "2400"))
PARENT_CHUNK_OVERLAP = int(os.getenv("PARENT_CHUNK_OVERLAP", "200"))
CHILD_CHUNK_SIZE = int(os.getenv("CHILD_CHUNK_SIZE", "600"))
CHILD_CHUNK_OVERLAP = int(os.getenv("CHILD_CHUNK_OVERLAP", "60"))
```

---

## 10. Infrastructure Requirements

### 10.1 MongoDB Atlas

**Required Tier:** M10 or higher (for Atlas Search)

**New Indexes to Create:**
1. `TextSearch` - Atlas Search index for BM25
2. `chunk_hierarchy_idx` - Regular index for chunk_id
3. `parent_lookup_idx` - Regular index for parent_id

**Estimated Storage Increase:**
- Contextual headers: +15-20% per chunk
- Parent-child (P2): +50% (storing both parent and child)

### 10.2 Python Dependencies

**New Dependencies:**

```txt
# requirements.txt additions
sentence-transformers==2.2.2    # Cross-encoder reranking (~200MB)
```

**Memory Impact:**
- Cross-encoder model: ~100MB RAM
- Loaded lazily on first use

### 10.3 Heroku Configuration

**New Environment Variables:**

```bash
# Add to Heroku config vars
HYBRID_SEARCH_ENABLED=true
RERANKING_ENABLED=true
RERANKER_MODEL=cross-encoder/ms-marco-MiniLM-L-6-v2
MODEL_STUDY_GUIDE=gpt-4o

# Optional P2
MULTI_QUERY_ENABLED=false
HIERARCHICAL_CHUNKING=false
```

**Dyno Sizing:**
- Current: Standard-1X or Standard-2X
- Recommended: Standard-2X (512MB+ for cross-encoder model)

---

## 11. Migration Strategy

### 11.1 Phase 1: P0 Changes (No Re-ingestion)

**Duration:** 1-2 days

**Steps:**
1. Deploy code changes with feature flags disabled
2. Create MongoDB Atlas Search index (`TextSearch`)
3. Enable `HYBRID_SEARCH_ENABLED=true`
4. Monitor metrics for regression

**Rollback:** Set `HYBRID_SEARCH_ENABLED=false`

### 11.2 Phase 2: P1 Changes (No Re-ingestion)

**Duration:** 1-2 days

**Steps:**
1. Add `sentence-transformers` dependency
2. Deploy cross-encoder code
3. Enable `RERANKING_ENABLED=true`
4. Update route models (`MODEL_STUDY_GUIDE=gpt-4o`)
5. Monitor latency and quality

**Rollback:** Set `RERANKING_ENABLED=false`

### 11.3 Phase 3: Contextual Headers (New Ingestions Only)

**Duration:** 1 day

**Steps:**
1. Deploy contextual header code
2. New uploads get contextual headers
3. Existing chunks continue to work (graceful degradation)
4. Optional: Re-ingest high-value documents manually

**Rollback:** Revert ingestion code (new chunks don't get headers)

### 11.4 Phase 4: P2 Changes (DEFERRED - Optional Re-ingestion)

**Duration:** 3-5 days

**Steps:**
1. Enable `MULTI_QUERY_ENABLED=true` for study_guide route
2. If hierarchical chunking desired:
   - Enable `HIERARCHICAL_CHUNKING=true`
   - New uploads create parent-child chunks
   - Optional batch re-ingestion script for existing docs

**Rollback:** Disable feature flags

---

## 12. Testing Strategy

### 12.1 Unit Tests

**New Test Files:**

```
backend/python_scripts/tests/
├── test_hybrid_search.py
├── test_cross_encoder.py
├── test_contextual_headers.py
├── test_multi_query.py
└── test_quote_validation.py
```

**Key Test Cases:**

```python
# test_hybrid_search.py
def test_hybrid_search_combines_results():
    """Verify RRF fusion merges vector and text results."""

def test_hybrid_search_respects_filters():
    """Verify user/class/doc filters apply to both searches."""

def test_fallback_when_text_search_unavailable():
    """Verify graceful fallback to vector-only."""

# test_cross_encoder.py
def test_cross_encoder_reranks_by_relevance():
    """Verify cross-encoder improves ranking."""

def test_cross_encoder_handles_empty_input():
    """Verify graceful handling of edge cases."""

def test_cross_encoder_latency_acceptable():
    """Verify reranking completes within 100ms."""

# test_quote_validation.py
def test_validates_exact_quotes():
    """Verify exact quotes pass validation."""

def test_rejects_fabricated_quotes():
    """Verify non-existent quotes are flagged."""
```

### 12.2 Integration Tests

**Test Scenarios:**

1. **Quote Finding Accuracy**
   - Upload document with known quotes
   - Query for quotes
   - Verify returned quotes exist verbatim

2. **Study Guide Comprehensiveness**
   - Upload multi-topic document
   - Generate study guide
   - Verify all major topics covered

3. **Hybrid Search Precision**
   - Upload document with specific terminology
   - Query using exact terms
   - Verify term-containing chunks retrieved

4. **Latency Regression**
   - Benchmark each route
   - Verify P50 latency < 2 seconds
   - Verify P99 latency < 5 seconds

### 12.3 A/B Testing

**Recommended Approach:**

```python
# Feature flag for A/B testing
def should_use_new_retrieval(user_id: str) -> bool:
    """50/50 split for A/B testing."""
    return hash(user_id) % 2 == 0
```

**Metrics to Compare:**
- Retrieval precision (manual evaluation sample)
- User satisfaction (thumbs up/down if available)
- Latency P50/P99
- Token usage (cost)

---

## 13. Rollback Plan

### 13.1 Feature Flags

All changes are gated by environment variables:

| Feature | Flag | Safe Default |
|---------|------|--------------|
| Hybrid Search | `HYBRID_SEARCH_ENABLED` | `false` |
| Cross-Encoder | `RERANKING_ENABLED` | `false` |
| Multi-Query | `MULTI_QUERY_ENABLED` | `false` |
| Hierarchical Chunks | `HIERARCHICAL_CHUNKING` | `false` |
| Route Models | `MODEL_*` | `gpt-4o-mini` |

### 13.2 Rollback Procedures

**Immediate Rollback (< 5 min):**
```bash
heroku config:set HYBRID_SEARCH_ENABLED=false -a class-chat-python-f081e08f29b8
heroku config:set RERANKING_ENABLED=false -a class-chat-python-f081e08f29b8
```

**Code Rollback:**
```bash
git revert <commit-hash>
git push heroku main
```

### 13.3 Monitoring Alerts

**Set up alerts for:**
- P99 latency > 5 seconds
- Error rate > 1%
- Memory usage > 90%
- Cross-encoder load failures

---

## 14. Success Metrics

### 14.1 Quality Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Quote accuracy | ~70% | >90% | Manual eval (50 samples) |
| Study guide completeness | ~60% | >80% | Manual eval (20 samples) |
| Retrieval relevance | Unmeasured | >85% | Manual eval (100 queries) |

### 14.2 Performance Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| General QA P50 | ~800ms | <1000ms | Logs/APM |
| Quote Finding P50 | ~1200ms | <1500ms | Logs/APM |
| Study Guide P50 | ~2000ms | <2500ms | Logs/APM |

### 14.3 Cost Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Avg tokens/query | ~3000 | <3500 | OpenAI dashboard |
| Study guide cost | ~$0.02 | <$0.05 | OpenAI dashboard |

---

## 15. Operational Requirements

**ARCHITECT ADDITIONS:** The following operational requirements must be implemented alongside the code changes.

### 15.1 Startup Logging

Add explicit logging when feature flags are evaluated at service startup:

```python
# Add to semantic_search.py initialization (around line 50)

log.info(
    "[CONFIG] RAG Feature Flags: "
    f"hybrid={config.HYBRID_SEARCH_ENABLED}, "
    f"reranking={config.RERANKING_ENABLED}, "
    f"multi_query={config.MULTI_QUERY_ENABLED}, "
    f"hierarchical={config.HIERARCHICAL_CHUNKING_ENABLED}"
)
log.info(f"[CONFIG] Route Models: {config.ROUTE_MODELS}")
```

### 15.2 Circuit Breaker for Cross-Encoder

Implement circuit breaker to auto-disable cross-encoder if it fails repeatedly:

```python
# Add to semantic_search.py

import time
from dataclasses import dataclass

@dataclass
class CircuitBreaker:
    failure_count: int = 0
    last_failure_time: float = 0
    is_open: bool = False
    failure_threshold: int = 3
    reset_timeout_seconds: int = 300  # 5 minutes

    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.failure_threshold:
            self.is_open = True
            log.warning("[CIRCUIT-BREAKER] Cross-encoder circuit OPEN after %d failures", self.failure_count)

    def record_success(self):
        self.failure_count = 0
        self.is_open = False

    def should_allow_request(self) -> bool:
        if not self.is_open:
            return True
        # Check if timeout has elapsed
        if time.time() - self.last_failure_time > self.reset_timeout_seconds:
            log.info("[CIRCUIT-BREAKER] Cross-encoder circuit attempting reset")
            self.is_open = False
            self.failure_count = 0
            return True
        return False

_cross_encoder_circuit = CircuitBreaker()

def cross_encoder_rerank_with_circuit_breaker(
    query: str,
    chunks: list[dict],
    top_k: int = 12
) -> list[dict]:
    """Rerank with circuit breaker protection."""
    if not _cross_encoder_circuit.should_allow_request():
        log.debug("[RERANK] Circuit breaker open, skipping cross-encoder")
        return chunks[:top_k]

    try:
        result = cross_encoder_rerank(query, chunks, top_k)
        _cross_encoder_circuit.record_success()
        return result
    except Exception as e:
        _cross_encoder_circuit.record_failure()
        log.warning("[RERANK] Cross-encoder failed: %s", e)
        return chunks[:top_k]
```

### 15.3 Query Embedding Cache (Optional Enhancement)

Consider adding Redis-based cache for repeated query embeddings:

```python
# Add to semantic_search.py (optional, for high-traffic scenarios)

import hashlib

EMBEDDING_CACHE_TTL = 3600  # 1 hour

def get_cached_embedding(query: str, route: str) -> list[float] | None:
    """Check Redis for cached embedding."""
    cache_key = f"embed:{route}:{hashlib.sha256(query.encode()).hexdigest()[:16]}"
    cached = r.get(cache_key)
    if cached:
        return json.loads(cached)
    return None

def cache_embedding(query: str, route: str, embedding: list[float]):
    """Cache embedding in Redis."""
    cache_key = f"embed:{route}:{hashlib.sha256(query.encode()).hexdigest()[:16]}"
    r.setex(cache_key, EMBEDDING_CACHE_TTL, json.dumps(embedding))
```

### 15.4 Latency Metrics Logging

Add structured latency logging for each search phase:

```python
# Add to process_semantic_search() metrics

metrics = {
    "route": route,
    "embed_ms": embed_ms,
    "vector_search_ms": vector_search_ms,
    "text_search_ms": text_search_ms if use_hybrid else None,
    "rrf_ms": rrf_ms if use_hybrid else None,
    "rerank_ms": rerank_ms if rerank_applied else None,
    "llm_ms": llm_ms,
    "total_ms": total_ms,
    "chunks_retrieved": len(similarity_results),
    "hybrid_enabled": use_hybrid,
    "rerank_enabled": rerank_applied,
}
log.info("[METRICS] search %s", json.dumps(metrics))
```

### 15.5 Runbook Reference

Create operational runbook with the following sections:

1. **Feature Flag Toggle Procedures**
   - How to enable/disable each feature
   - Expected behavior when disabled

2. **Latency Investigation**
   - Which metrics to check
   - Common causes of latency spikes

3. **Cross-Encoder Troubleshooting**
   - Memory usage monitoring
   - Model loading failure recovery

4. **TextSearch Index Issues**
   - How to verify index status
   - How to recreate if corrupted

---

## Appendix A: File Change Summary

| File | Changes | Priority |
|------|---------|----------|
| `load_data.py` | Contextual headers, hierarchical chunking | P0, P2 |
| `semantic_search.py` | Hybrid search, cross-encoder, multi-query, route models, circuit breaker | P0, P1, P2 |
| `config.py` | New configuration variables | P0, P1, P2 |
| `prompts.json` | Enhanced prompts for quotes and study guides | P1 |
| `requirements.txt` | sentence-transformers | P1 |
| `router.py` | No changes | - |
| `semantic_service.py` | No changes | - |

---

## Appendix B: Environment Variable Reference

```bash
# P0: Hybrid Search
HYBRID_SEARCH_ENABLED=false    # Default false until Atlas tier verified
HYBRID_VECTOR_WEIGHT=0.6
HYBRID_TEXT_WEIGHT=0.4

# P1: Cross-Encoder
RERANKING_ENABLED=false        # Default false until dyno sizing verified
RERANKER_MODEL=cross-encoder/ms-marco-MiniLM-L-6-v2

# P1: Route Models
MODEL_GENERAL_QA=gpt-4o-mini
MODEL_FOLLOW_UP=gpt-4o-mini
MODEL_QUOTE=gpt-4o-mini
MODEL_STUDY_GUIDE=gpt-4o
MODEL_SUMMARY=gpt-4o-mini

# P2: Multi-Query (DEFERRED)
MULTI_QUERY_ENABLED=false
MULTI_QUERY_COUNT=3

# P2: Hierarchical Chunking (DEFERRED)
HIERARCHICAL_CHUNKING=false
PARENT_CHUNK_SIZE=2400
CHILD_CHUNK_SIZE=600
```

---

## Appendix C: Implementation Priority Matrix

| Change | Priority | Proceed? | Condition |
|--------|----------|----------|-----------|
| Contextual chunk headers | P0 | ✅ Yes | None |
| Hybrid search (BM25 + vector) | P0 | ⚠️ Conditional | Verify Atlas M10+ |
| Cross-encoder reranking | P1 | ⚠️ Conditional | Verify Standard-2X dyno |
| Route-specific models | P1 | ✅ Yes | None |
| Enhanced prompts | P1 | ✅ Yes | None |
| Quote validation | P1 | ✅ Yes | None |
| Multi-query retrieval | P2 | 🔄 Deferred | Evaluate after P0/P1 |
| Parent-child chunks | P2 | 🔄 Deferred | Storage cost assessment |
| Route-specific embeddings | P3 | 🔄 Deferred | Cross-encoder provides similar precision |

---

**Document Status:** ✅ APPROVED - Ready for Implementation

**Architect Review:** Completed 2025-12-28

**Next Steps:**
1. ☐ Complete Pre-Implementation Requirements checklist (Section 2.4)
2. ☐ Begin P0 implementation (contextual headers first)
3. ☐ Verify infrastructure requirements before hybrid search
4. ☐ Monitor metrics, proceed to P1 after validation
5. ☐ Schedule P2 evaluation meeting after P1 stabilization
