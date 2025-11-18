# Story 0.6: Functionality Preservation Guide

**CRITICAL DOCUMENT**: This guide ensures NO existing functionality is broken during the streaming implementation.

**Story**: Real OpenAI Streaming Implementation - Brownfield Addition
**Created**: 2025-11-10
**Purpose**: Document ALL existing features that must remain intact

---

## ⚠️ CRITICAL PRINCIPLE

**When implementing streaming changes**:
1. ✅ **ADD** new streaming functions alongside existing sync functions
2. ✅ **PRESERVE** all existing logic paths unchanged
3. ✅ **REUSE** existing helper functions (do NOT duplicate)
4. ❌ **NEVER** delete existing functionality
5. ❌ **NEVER** modify existing function signatures

---

## Table of Contents

1. [Python Service: semantic_search.py](#1-python-service-semantic_searchpy)
2. [Node Backend: chat_controllers.ts](#2-node-backend-chat_controllersts)
3. [Frontend: Chat.tsx](#3-frontend-chattsx)
4. [Integration Test Cases](#4-integration-test-cases)
5. [Pre-Deployment Checklist](#5-pre-deployment-checklist)

---

## 1. Python Service: semantic_search.py

### 1.1 CRITICAL: Keep Existing Function Unchanged

**Function**: `process_semantic_search()` (lines 450-1126)

**ACTION REQUIRED**:
- ✅ **ADD** new function `stream_semantic_search()` (NEW FUNCTION)
- ✅ **KEEP** existing `process_semantic_search()` completely unchanged
- ✅ Both functions MUST coexist in the same file

**Why**: The existing endpoint `/api/v1/semantic_search` must continue working for backward compatibility.

---

### 1.2 Existing Functionalities That MUST Work After Changes

#### 1.2.1 Multi-Route Support (Lines 485-507)

**Functionality**: Route detection with 5 routes
- `general_qa` (default)
- `follow_up` (reuses previous chunks)
- `quote_finding` (with quote validation)
- `generate_study_guide` (doc or class level)
- `summary` (splits into doc_summary or class_summary)

**Preservation Strategy**:
```python
# ✅ REUSE in new streaming function:
route = detect_route(user_query)  # line 485 - unchanged

# ❌ DO NOT duplicate this logic
# ❌ DO NOT modify detect_route() function
```

**Test Cases**:
- ✅ Send "What is X?" → should route to `general_qa`
- ✅ Send "Tell me more" → should route to `follow_up`
- ✅ Send "Find a quote about X" → should route to `quote_finding`
- ✅ Send "Generate a study guide" → should route to `generate_study_guide`
- ✅ Send "Summarize this" → should route to `summary` → `doc_summary` or `class_summary`

---

#### 1.2.2 Quote Finding Pre-Check (Lines 489-507)

**Functionality**: Validates quote queries have sufficient context

**Code Block** (MUST PRESERVE):
```python
if route == "quote_finding":
    cleaned_query = strip_quote_phrases(user_query)
    if not has_sufficient_quote_context(cleaned_query):
        friendly = (
            "Could you specify what the quote should relate to? "
            "For example: "a quote about the impact of the industrial revolution on society"."
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
```

**Preservation Strategy**:
- ✅ COPY this exact logic to new streaming function
- ✅ In streaming, yield error event instead of return

**Test Cases**:
- ✅ Send "Find a quote" (insufficient context) → should ask for clarification
- ✅ Send "Find a quote about democracy" → should proceed with search

---

#### 1.2.3 Study Guide Generation (Lines 514-575)

**Functionality**: Two-path study guide generation
- **Path 1**: Single-document study guide (lines 516-542)
- **Path 2**: Class-level study guide (lines 544-574)

**Code Block** (MUST PRESERVE):
```python
if route == "generate_study_guide" or mode == "study_guide":
    # Single-document path
    if doc_id and doc_id != "null":
        summary_doc = fetch_summary_chunk(user_id, class_name, doc_id)
        if summary_doc:
            context_txt = summary_doc["text"]
            if est_tokens(context_txt) > MAX_PROMPT_TOKENS:
                context_txt = condense_summary(context_txt, user_query, get_llm("summary"))
            guide = generate_study_guide(context_txt, user_query, get_llm("generate_study_guide"))
            # ... return with citations

    # Class-level path
    if class_name and class_name != "null":
        docs = fetch_class_summaries(user_id, class_name)
        if docs:
            combined = "\n\n---\n\n".join(d["text"] for d in docs)
            if est_tokens(combined) > MAX_PROMPT_TOKENS:
                combined = condense_class_summaries(combined, user_query, get_llm("summary"))
            guide = generate_study_guide(combined, user_query, get_llm("generate_study_guide"))
            # ... return with citations
```

**Preservation Strategy**:
- ✅ Study guide generation should NOT stream (already fast, <5s)
- ✅ Keep early return pattern (returns before vector search)
- ✅ Do NOT change `generate_study_guide()` helper function

**Test Cases**:
- ✅ Send "Generate a study guide" with doc selected → should return guide with single doc citation
- ✅ Send "Generate a study guide" with class selected → should return guide with all doc citations
- ✅ Send "Generate a study guide" with no doc/class selected → should fall through to normal RAG

---

#### 1.2.4 Document Summary Mode (Lines 757-794)

**Functionality**: Condenses stored summary for single document

**Code Block** (MUST PRESERVE):
```python
if mode == "doc_summary":
    summary_doc = fetch_summary_chunk(user_id, class_name, doc_id)
    if not summary_doc:
        log.warning("No stored summary found; falling back to specific search")
        mode = "specific"
    else:
        condensed_text = condense_summary(summary_doc["text"], user_query, get_llm("summary"))
        chunk_array = [{"_id": str(summary_doc["_id"]), "chunkNumber": 1, ...}]
        citation = get_file_citation([summary_doc])
        chunk_refs = [{"chunkId": chunk_array[0]["_id"], "displayNumber": 1, "pageNumber": None}]
        chat_history.append({"role": "assistant", "content": condensed_text, "chunkReferences": chunk_refs})
        return {...}
```

**Preservation Strategy**:
- ✅ Keep early return pattern (returns before vector search)
- ✅ Keep fallback to specific search if no summary found
- ✅ Do NOT change `condense_summary()` or `fetch_summary_chunk()` functions

**Test Cases**:
- ✅ Send "Summarize this document" with doc selected → should return condensed summary
- ✅ Send "Summarize" with doc that has no stored summary → should fall back to vector search

---

#### 1.2.5 Class Summary Mode (Lines 798-834)

**Functionality**: Aggregates summaries for all docs in a class

**Code Block** (MUST PRESERVE):
```python
if mode == "class_summary":
    docs = fetch_class_summaries(user_id, class_name)
    if not docs:
        log.warning("No summaries found for this class; falling back to specific search.")
        mode = "specific"
    else:
        combined = "\n\n---\n\n".join(d["text"] for d in docs)
        condensed_text = condense_class_summaries(combined, user_query, get_llm("summary"))
        chunk_array = [{"_id": str(d["_id"]), "chunkNumber": i + 1, ...} for i, d in enumerate(docs)]
        citation = get_file_citation(docs)
        chunk_refs = [{"chunkId": c["_id"], "displayNumber": c["chunkNumber"], ...} for c in chunk_array]
        chat_history.append({...})
        return {...}
```

**Preservation Strategy**:
- ✅ Keep early return pattern
- ✅ Keep fallback to specific search if no summaries found
- ✅ Do NOT change `condense_class_summaries()` or `fetch_class_summaries()` functions

**Test Cases**:
- ✅ Send "Summarize this class" with class selected → should return combined summary with all doc citations

---

#### 1.2.6 Follow-Up Mode (Lines 597-618)

**Functionality**: Reuses chunks from previous assistant message (no new vector search)

**Code Block** (MUST PRESERVE):
```python
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
        mode = "follow_up"  # Skip vector search
```

**Preservation Strategy**:
- ✅ Follow-up MUST reuse previous chunks (no new search)
- ✅ Keep mode change to "follow_up" (skips vector search at line 620)
- ✅ Do NOT change chunk lookup logic

**Test Cases**:
- ✅ Send "What is X?" → then send "Tell me more" → should reuse same chunks from first response
- ✅ Verify no new MongoDB vector search happens for follow-up

---

#### 1.2.7 Redis Token Reservation (Lines 190-220, 622-629, 912-920)

**Functionality**: Rate limiting via Redis token bucket

**Code Blocks** (MUST PRESERVE):
```python
# Token reservation function (lines 190-220)
def reserve_tokens(tokens_needed: int) -> tuple[bool, int]:
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

# Usage before embedding (lines 622-629)
if not try_acquire_tokens(tokens_needed, max_wait_s=10.0):
    busy_msg = "System is busy processing other requests. Please retry in a few seconds."
    chat_history.append({"role": "assistant", "content": busy_msg})
    metrics.update({"status": "busy"})
    log_metrics("rag", metrics)
    return {"message": busy_msg, "status": "busy", ...}

# Usage before generation (lines 912-920)
total_needed = prompt_tokens + history_tokens + estimated_output
if not try_acquire_tokens(total_needed, max_wait_s=10.0):
    busy_msg = "System is busy processing other requests. Please retry in a few seconds."
    chat_history.append({"role": "assistant", "content": busy_msg})
    return {"message": busy_msg, "status": "busy", ...}
```

**Preservation Strategy**:
- ✅ REUSE `try_acquire_tokens()` in streaming function
- ✅ Reserve tokens BEFORE starting stream (not during)
- ✅ Do NOT change token reservation logic
- ✅ Keep Redis key format: `openai:tpm:counter`

**Test Cases**:
- ✅ Simulate high load → should return "System is busy" message
- ✅ Wait 10s → should succeed after bucket refills

---

#### 1.2.8 MongoDB Vector Search (Lines 633-660)

**Functionality**: Atlas Vector Search with filters and deduplication

**Code Block** (MUST PRESERVE):
```python
# Build filters (lines 633-639)
filters = {"user_id": user_id, "is_summary": False}
if doc_id and doc_id != "null":
    filters["doc_id"] = doc_id
elif class_name not in (None, "", "null"):
    filters["class_id"] = class_name

# Run search (lines 641-643)
search_cursor = perform_semantic_search(query_vec, filters, limit=cfg["k"], numCandidates=cfg["numCandidates"])

# Dedupe by (doc_id, page_number) (lines 645-656)
raw_results = list(search_cursor)
seen = set()
similarity_results = []
for r in raw_results:
    key = (r.get("doc_id"), r.get("page_number"))
    if key in seen:
        continue
    seen.add(key)
    similarity_results.append(r)
```

**Preservation Strategy**:
- ✅ REUSE `perform_semantic_search()` function unchanged
- ✅ Keep filter logic (user, class, doc scoping)
- ✅ Keep deduplication by (doc_id, page_number)
- ✅ Do NOT change per-route `k` and `numCandidates` values

**Test Cases**:
- ✅ Search with doc selected → should only return chunks from that doc
- ✅ Search with class selected → should return chunks from all docs in class
- ✅ Search with no doc/class → should return chunks from all user's documents
- ✅ Verify no duplicate chunks with same (doc_id, page_number)

---

#### 1.2.9 MMR Reranking (Lines 665-705)

**Functionality**: Optional diversity reranking via Maximal Marginal Relevance

**Code Block** (MUST PRESERVE):
```python
mmr_applied = False
mmr_ms = None
try:
    mmr_start = time.time()
    texts = [r.get("text", "") for r in similarity_results]
    token_need = sum(est_tokens(t) for t in texts)
    if texts and try_acquire_tokens(token_need, max_wait_s=2.0):
        doc_embs = embedding_model.embed_documents(texts)
        # MMR algorithm (lines 673-696)
        lambda_ = 0.7
        selected, rest = [], list(range(len(dns)))
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
        mmr_applied = True
except Exception as e:
    log.warning("[RERANK] skipped: %s", e)
```

**Preservation Strategy**:
- ✅ Keep MMR logic unchanged (lambda=0.7 is tuned)
- ✅ Keep graceful fallback (if fails, skip reranking)
- ✅ Keep token reservation check (max_wait_s=2.0 is intentional)
- ✅ Do NOT change MMR algorithm or parameters

**Test Cases**:
- ✅ Search with 10+ results → verify MMR reranking happens (check logs for "[RERANK] MMR applied")
- ✅ Simulate token bucket exhaustion → should skip MMR gracefully

---

#### 1.2.10 Citation Renumbering (Lines 1004-1036)

**Functionality**: Renumbers [N] citations to start at [1] in order of first appearance

**Code Block** (MUST PRESERVE):
```python
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

# Usage (line 1036)
if mode not in ("doc_summary", "class_summary"):
    answer, chunk_array = _renumber_citations(answer, chunk_array)
```

**Preservation Strategy**:
- ✅ Keep renumbering logic unchanged (critical for frontend display)
- ✅ Skip renumbering for summary modes (as intended)
- ✅ Do NOT change regex pattern or mapping algorithm

**Test Cases**:
- ✅ Response with "[3][1][2]" → should renumber to "[1][2][3]"
- ✅ Response with "[5]" (invalid chunk) → should remove invalid citation
- ✅ Summary mode response → should NOT renumber

---

#### 1.2.11 Chrome Extension Source Handling (Lines 841-843)

**Functionality**: Uses different prompt for Chrome extension requests

**Code Block** (MUST PRESERVE):
```python
base_prompt = (
    prompts.get("chrome_extension") if source == "chrome_extension"
    else prompts.get(route)
)
```

**Preservation Strategy**:
- ✅ Keep source-based prompt selection
- ✅ Pass `source` parameter through to streaming function

**Test Cases**:
- ✅ Send request with header `X-Source: chrome_extension` → should use chrome_extension prompt
- ✅ Send normal request → should use route-specific prompt

---

#### 1.2.12 Quote Validation (Lines 960-997)

**Functionality**: Post-generation validation for quote_finding route

**Code Block** (MUST PRESERVE):
```python
if route == "quote_finding":
    lines = [ln.strip() for ln in answer.splitlines() if ln.strip()]
    chunk_texts = [c.get("text") or "" for c in chunk_array]
    def is_verbatim(ln: str) -> bool:
        m = re.search(r'"([^"]+)"|"([^"]+)"', ln)
        inner = (m.group(1) or m.group(2)) if m else ln
        inner = inner.strip()
        return any(inner and inner in t for t in chunk_texts)
    kept = [ln for ln in lines if is_verbatim(ln)]
    if kept:
        answer = "\n".join(kept)
    else:
        friendly = (
            "I couldn't verify any exact quotes in the selected context. "
            "Could you narrow the topic or specify a section?"
        )
        chat_history.append({"role": "assistant", "content": friendly})
        return {"message": friendly, "status": "needs_context", ...}
```

**Preservation Strategy**:
- ✅ Keep post-validation for quote_finding route
- ✅ Filter out non-verbatim quotes
- ✅ Return friendly error if no quotes verified

**Test Cases**:
- ✅ Send "Find a quote" → response should contain only verbatim quotes from chunks
- ✅ Send "Find a quote" with no matching context → should ask to narrow topic

---

#### 1.2.13 No-Hit Handling (Lines 724-749, 944-957)

**Functionality**: Returns friendly message when no chunks match

**Code Blocks** (MUST PRESERVE):
```python
# No chunks found after vector search (lines 724-749)
if not chunk_array:
    refine_message = (
        "I couldn't find anything relevant for that question. "
        "Make sure you're on the correct class or document and try asking a more specific question."
    )
    suggestions = suggest_refine_queries()
    chat_history.append({"role": "assistant", "content": refine_message, "suggestions": suggestions})
    return {"message": refine_message, "suggestions": suggestions, "status": "no_hit", ...}

# Model signals NO_HIT_MESSAGE (lines 944-957)
if answer.strip() == "NO_HIT_MESSAGE":
    suggestions = suggest_refine_queries()
    chat_history.append({"role": "assistant", "content": suggestions[0], "suggestions": suggestions})
    return {"message": suggestions[0], "status": "no_hit", "suggestions": suggestions, ...}
```

**Preservation Strategy**:
- ✅ Keep no-hit detection (empty chunk_array or NO_HIT_MESSAGE)
- ✅ Keep suggestions generation
- ✅ Return with status="no_hit"

**Test Cases**:
- ✅ Search for completely unrelated topic → should return "I couldn't find anything relevant"
- ✅ Model returns NO_HIT_MESSAGE → should show suggestions

---

#### 1.2.14 Error Handling (Lines 1040-1101)

**Functionality**: Graceful error handling for LLM/network issues

**Code Blocks** (MUST PRESERVE):
```python
# Context length exceeded (lines 1040-1067)
except (InvalidRequestError, BadRequestError) as oe:
    err_code = getattr(oe, "code", None) or getattr(getattr(oe, "error", None), "code", None)
    if err_code == "context_length_exceeded":
        if mode == "class_summary":
            friendly = "Too many documents to summarise the full class. Try removing some documents..."
        elif route == "generate_study_guide" or mode == "study_guide":
            friendly = "Too many documents to generate a study guide for the full class..."
        else:
            friendly = "This request is too large for the model's context window..."
        chat_history.append({"role": "assistant", "content": friendly})
        return {"message": friendly, "status": "context_too_large", ...}

# Transient errors (lines 1072-1074)
except (RateLimitError, APIConnectionError, OpenAITimeout, APIStatusError) as oe:
    last_exception = oe

# Generic fallback (lines 1081-1101)
if "last_exception" in locals():
    log.error("[LLM-ERROR] %s", traceback.format_exc(limit=3))
    friendly = "The model or server is unavailable right now. Please hit **Try again**..."
    chat_history.append({"role": "assistant", "content": friendly})
    return {"message": friendly, "status": "llm_error", "retryable": True, ...}
```

**Preservation Strategy**:
- ✅ Keep all error types: InvalidRequestError, BadRequestError, RateLimitError, APIConnectionError, OpenAITimeout, APIStatusError
- ✅ Keep mode-specific error messages
- ✅ Keep retryable flag for transient errors

**Test Cases**:
- ✅ Simulate context_length_exceeded → should return mode-specific error message
- ✅ Simulate network error → should return "model or server is unavailable" with retryable=True

---

### 1.3 Helper Functions That MUST NOT Change

**Critical**: These functions are used throughout `process_semantic_search()` and MUST NOT be modified:

| Function | Lines | Purpose | Used By Streaming? |
|----------|-------|---------|-------------------|
| `detect_query_mode()` | 155-163 | Detect summary/study_guide mode | ✅ YES - Reuse |
| `detect_route()` | router.py:50-61 | Route detection | ✅ YES - Reuse |
| `strip_quote_phrases()` | 146-148 | Remove quote boilerplate | ✅ YES - Reuse |
| `has_sufficient_quote_context()` | 150-152 | Validate quote context | ✅ YES - Reuse |
| `suggest_refine_queries()` | 167-177 | Generate refinement hints | ✅ YES - Reuse |
| `reserve_tokens()` | 190-205 | Redis token reservation | ✅ YES - Reuse |
| `try_acquire_tokens()` | 208-219 | Token acquisition with retry | ✅ YES - Reuse |
| `create_embedding()` | 226-227 | OpenAI embedding | ✅ YES - Reuse |
| `perform_semantic_search()` | 230-257 | MongoDB vector search | ✅ YES - Reuse |
| `get_file_citation()` | 260-283 | Generate file citations | ✅ YES - Reuse |
| `escape_curly_braces()` | 286-287 | Escape braces in text | ✅ YES - Reuse |
| `fetch_summary_chunk()` | 293-302 | Get stored summary | ✅ YES - Reuse |
| `fetch_chapter_text()` | 305-352 | Get chapter text | ✅ YES - Reuse |
| `condense_summary()` | 355-381 | Condense long summary | ✅ YES - Reuse |
| `fetch_class_summaries()` | 383-391 | Get class summaries | ✅ YES - Reuse |
| `condense_class_summaries()` | 393-405 | Condense class summaries | ✅ YES - Reuse |
| `generate_study_guide()` | 408-426 | Generate study guide | ✅ YES - Reuse |
| `load_prompts()` | 435-438 | Load prompts.json | ✅ YES - Reuse |
| `get_llm()` | 114-117 | Get ChatOpenAI instance | ✅ YES - Reuse (add streaming=True) |

**Preservation Rule**: Do NOT modify any of these helper functions. They are shared and battle-tested.

---

### 1.4 What TO CHANGE vs What NOT TO CHANGE

#### ✅ SAFE TO ADD (New Code):
```python
# 1. New async callback handler (COMPLETELY NEW)
class TokenStreamingCallback(AsyncCallbackHandler):
    def __init__(self):
        self.queue = asyncio.Queue()

    async def on_llm_new_token(self, token: str, **kwargs):
        await self.queue.put({"type": "token", "content": token})

    async def on_llm_end(self, response, **kwargs):
        await self.queue.put({"type": "done"})

    async def on_llm_error(self, error: Exception, **kwargs):
        await self.queue.put({"type": "error", "message": str(error)})

# 2. New streaming function (COMPLETELY NEW)
async def stream_semantic_search(
    user_id: str,
    class_name: str | None,
    doc_id: str | None,
    user_query: str,
    chat_history: list,
    source: str
) -> StreamingResponse:
    # Implementation here (reuses ALL existing helpers)
    pass
```

#### ❌ DO NOT CHANGE (Existing Code):
```python
# 1. DO NOT modify existing function signature
def process_semantic_search(  # ← Keep signature unchanged
    user_id: str,
    class_name: str,
    doc_id: str,
    user_query: str,
    chat_history: List[dict],
    source: str,
):
    # ← Keep entire function body unchanged
    pass

# 2. DO NOT modify any helper functions
def perform_semantic_search(query_vector, filters=None, *, limit: int = 12, numCandidates: int = 1000):
    # ← Keep unchanged
    pass

# 3. DO NOT modify route detection
route = detect_route(user_query)  # ← Keep unchanged

# 4. DO NOT modify token reservation
if not try_acquire_tokens(tokens_needed, max_wait_s=10.0):
    # ← Keep unchanged
    pass
```

---

## 2. Node Backend: chat_controllers.ts

### 2.1 CRITICAL: Preserve All Session Management Logic

**Function**: `generateChatCompletion()` (lines 141-349)

**ACTION REQUIRED**:
- ✅ **KEEP** all auth, session, and rate limiting logic unchanged (lines 148-238)
- ✅ **REPLACE ONLY** the Python API call section (lines 260-267)
- ✅ **MOVE** free tier increment to after stream completes (line 177)

---

### 2.2 Existing Functionalities That MUST Work After Changes

#### 2.2.1 Authentication (Lines 148-152)

**Code Block** (MUST PRESERVE):
```typescript
const currentUser = await User.findById(res.locals.jwtData.id);
if (!currentUser) {
  return res.status(401).json({ message: "User not registered or token malfunctioned" });
}
```

**Preservation Strategy**:
- ✅ Keep unchanged - runs BEFORE streaming starts
- ✅ Auth check happens before any Python API call

**Test Cases**:
- ✅ Send request without JWT → should return 401
- ✅ Send request with invalid JWT → should return 401

---

#### 2.2.2 Free Tier Rate Limiting (Lines 157-180)

**Code Block** (CRITICAL CHANGE REQUIRED):
```typescript
// CURRENT (WRONG - increments BEFORE streaming):
if (currentUser.plan === "free") {
  // ... reset logic ...
  if (currentUser.chatRequestCount >= 25) {
    return res.status(403).json({
      message: "Free plan limit reached (25 chats/month)...",
    });
  }
  currentUser.chatRequestCount += 1;  // ← MOVED TO AFTER STREAM COMPLETES
  await currentUser.save();
}

// NEW (CORRECT - increment AFTER streaming):
let shouldIncrementCount = false;
if (currentUser.plan === "free") {
  // ... reset logic (unchanged) ...
  if (currentUser.chatRequestCount >= 25) {
    return res.status(403).json({
      message: "Free plan limit reached (25 chats/month)...",
    });
  }
  shouldIncrementCount = true;  // ← Defer until stream completes
}

// Later, after stream completes:
pythonStream.data.on('end', async () => {
  if (!streamError && shouldIncrementCount) {
    currentUser.chatRequestCount += 1;
    await currentUser.save();
  }
});
```

**Preservation Strategy**:
- ✅ Keep 25 chat/month limit check (unchanged)
- ✅ Keep monthly reset logic (unchanged)
- ⚠️ **CRITICAL**: Move increment to AFTER successful stream completion
- ⚠️ **CRITICAL**: Do NOT increment on stream error

**Test Cases**:
- ✅ Free user sends 24th chat → should succeed, counter increments to 24
- ✅ Free user sends 25th chat → should succeed, counter increments to 25
- ✅ Free user sends 26th chat → should reject with 403 "limit reached"
- ✅ Free user stream fails → counter should NOT increment
- ✅ Premium user → should NOT have any limit

---

#### 2.2.3 Session Creation Logic (Lines 189-224)

**Code Block** (MUST PRESERVE):
```typescript
let chatSession;

// 1) If chatSessionId provided, find or create it
if (chatSessionId && chatSessionId !== "null") {
  chatSession = await ChatSession.findOne({ _id: chatSessionId, userId });

  if (!chatSession) {
    chatSession = new ChatSession({
      _id: chatSessionId,
      userId,
      sessionName: docIdForPython
        ? "Document Chat"
        : source === "chrome_extension"
        ? "Extension Chat"
        : "New Chat",
      messages: [],
      source,
      ephemeral: ephemeral === true,
    });
    await chatSession.save();
  } else if (chatSession.source !== source) {
    return res.status(400).json({ message: "Chat session source mismatch" });
  }
} else {
  // 2) Create a new session
  chatSession = new ChatSession({
    userId,
    sessionName: docIdForPython
      ? "Document Chat"
      : source === "chrome_extension"
      ? "Extension Chat"
      : "New Chat",
    messages: [],
    source,
    ephemeral: ephemeral === true || !!docIdForPython,
  });
  await chatSession.save();
}

// Store class/document references
if (classNameForPython) chatSession.assignedClass = classNameForPython;
if (docIdForPython) chatSession.assignedDocument = docIdForPython;
```

**Preservation Strategy**:
- ✅ Keep ALL session creation logic unchanged
- ✅ Keep ephemeral session handling
- ✅ Keep source mismatch check
- ✅ Keep assignedClass and assignedDocument setting

**Test Cases**:
- ✅ Send with existing sessionId → should find and use existing session
- ✅ Send with new sessionId → should create new session with that ID
- ✅ Send without sessionId → should create new session with auto-generated ID
- ✅ Send with docId → should create ephemeral "Document Chat" session
- ✅ Send with source=chrome_extension → should create "Extension Chat" session
- ✅ Send with sessionId from different source → should reject with 400 "source mismatch"

---

#### 2.2.4 User Message Push (Lines 230-238)

**Code Block** (MUST PRESERVE):
```typescript
if (!retry) {  // ← Only on first ask
  chatSession.messages.push({
    content: message,
    role: "user",
    citation: null,
    chunkReferences: [],
  });
}
```

**Preservation Strategy**:
- ✅ Keep retry check (do NOT push duplicate user message on retry)
- ✅ Keep message structure unchanged

**Test Cases**:
- ✅ Send normal message → should push user message to session
- ✅ Send with retry=true → should NOT push duplicate user message

---

#### 2.2.5 Citation Text Update for Document Chats (Lines 282-297)

**Code Block** (MUST PRESERVE):
```typescript
if (chatSession.assignedDocument && citation && Array.isArray(citation)) {
  try {
    let doc = await Document.findOne({ docId: chatSession.assignedDocument });
    if (!doc) doc = await Document.findById(chatSession.assignedDocument);

    if (doc) {
      citation = citation.map((cit) => ({ ...cit, text: doc.fileName }));
    }
  } catch (docError) {
    (req as any).log.warn(
      { err: docError, docId: chatSession.assignedDocument },
      "Error fetching document for citation update"
    );
  }
}
```

**Preservation Strategy**:
- ✅ Keep citation text update logic
- ✅ Apply AFTER stream completes (inside `stream.on('end')`)
- ✅ Keep graceful error handling

**Test Cases**:
- ✅ Document chat → citation text should be document filename (not S3 key)
- ✅ Class chat → citation text should remain as original (document titles)

---

#### 2.2.6 Retry Mechanism (Lines 300-333)

**Code Block** (MUST PRESERVE):
```typescript
if (retry === true) {
  const lastIdx = chatSession.messages.length - 2;  // -1 = user just pushed
  if (lastIdx >= 0 && chatSession.messages[lastIdx].role === "assistant") {
    const prevMsg = chatSession.messages[lastIdx];

    // Move current content into versions[]
    if (!prevMsg.versions) prevMsg.versions = [prevMsg.content];
    prevMsg.versions.push(aiResponse);
    prevMsg.currentVersion = prevMsg.versions.length - 1;

    // Overwrite displayed fields
    prevMsg.content = aiResponse;
    prevMsg.citation = citation;
    prevMsg.chunkReferences = chunkReferences;
  } else {
    // Fallback: if for some reason we can't find it, just push
    chatSession.messages.push({
      content: aiResponse,
      role: "assistant",
      citation,
      chunkReferences,
    });
  }
} else {
  // Normal first response
  chatSession.messages.push({
    content: aiResponse,
    role: "assistant",
    citation,
    chunkReferences,
  });
}
```

**Preservation Strategy**:
- ✅ Keep version history logic
- ✅ Apply AFTER stream completes (inside `stream.on('end')`)
- ✅ Keep fallback for missing previous message

**Test Cases**:
- ✅ Send "What is X?" → then click retry → should create versions array with 2 versions
- ✅ Retry multiple times → should accumulate versions
- ✅ Switch between versions → should display correct content

---

#### 2.2.7 MongoDB Save Timing (Line 335)

**Code Block** (CRITICAL CHANGE REQUIRED):
```typescript
// CURRENT (WRONG - saves immediately):
await chatSession.save();  // line 335

// NEW (CORRECT - save after stream completes):
pythonStream.data.on('end', async () => {
  // ... accumulate full response ...
  // ... update citation text ...
  // ... handle retry logic ...

  await chatSession.save();  // ← ONLY save after stream completes
});
```

**Preservation Strategy**:
- ⚠️ **CRITICAL**: Move `chatSession.save()` to inside `stream.on('end')`
- ⚠️ **CRITICAL**: Do NOT save partial response during streaming
- ✅ Save only after full response received

**Test Cases**:
- ✅ Reload page mid-stream → should NOT see partial message
- ✅ Stream completes → should see full message in MongoDB

---

### 2.3 What TO CHANGE vs What NOT TO CHANGE

#### ✅ SAFE TO CHANGE:
```typescript
// 1. Replace blocking POST with streaming (lines 260-267)
// OLD:
const responseFromPython = await axios.post(semanticSearchEndpoint, requestData);
const resultMessage = responseFromPython.data;

// NEW:
const pythonStream = await axios.post(streamEndpoint, requestData, {
  responseType: 'stream',
  headers: { 'X-Request-ID': (req as any).id }
});

// 2. Add SSE parsing and WebSocket emission (NEW)
pythonStream.data.on('data', (chunk: Buffer) => {
  // Parse SSE events
  // Emit WebSocket events
});

// 3. Move free tier increment (line 177)
// OLD: currentUser.chatRequestCount += 1; await currentUser.save();
// NEW: shouldIncrementCount = true; (increment later in stream.on('end'))

// 4. Move MongoDB save (line 335)
// OLD: await chatSession.save(); (immediately)
// NEW: await chatSession.save(); (inside stream.on('end'))
```

#### ❌ DO NOT CHANGE:
```typescript
// 1. Auth check (lines 148-152)
const currentUser = await User.findById(res.locals.jwtData.id);
if (!currentUser) {
  return res.status(401).json({ message: "User not registered or token malfunctioned" });
}

// 2. Free tier limit check (lines 157-175)
if (currentUser.plan === "free") {
  // ... reset logic ...
  if (currentUser.chatRequestCount >= 25) {
    return res.status(403).json({
      message: "Free plan limit reached (25 chats/month)...",
    });
  }
}

// 3. Session creation (lines 189-224)
let chatSession;
if (chatSessionId && chatSessionId !== "null") {
  chatSession = await ChatSession.findOne({ _id: chatSessionId, userId });
  // ... rest of logic
}

// 4. User message push (lines 230-238)
if (!retry) {
  chatSession.messages.push({
    content: message,
    role: "user",
    // ...
  });
}

// 5. Citation text update (lines 282-297)
if (chatSession.assignedDocument && citation && Array.isArray(citation)) {
  // ... Document lookup and citation update
}

// 6. Retry mechanism (lines 300-333)
if (retry === true) {
  // ... version history logic
}
```

---

## 3. Frontend: Chat.tsx

### 3.1 CRITICAL: Preserve All Existing Features

**Component**: `Chat` (lines 81-end)

**ACTION REQUIRED**:
- ✅ **DELETE** simulated streaming code (lines 487-500)
- ✅ **ADD** WebSocket listeners for streaming events
- ✅ **KEEP** all other functionality unchanged

---

### 3.2 Existing Functionalities That MUST Work After Changes

#### 3.2.1 Document-Ready WebSocket Event (Lines 191-217)

**Code Block** (MUST PRESERVE):
```typescript
const handleDocumentReady = (data: { docId: string; fileName: string; className: string }) => {
  setClassDocs((prev) => {
    const docs = prev[data.className] ?? [];
    const exists = docs.some((d) => d._id === data.docId);

    const updatedDocs = exists
      ? docs.map((d) => (d._id === data.docId ? { ...d, isProcessing: false } : d))
      : [...docs, { _id: data.docId, fileName: data.fileName, className: data.className, isProcessing: false }];

    return { ...prev, [data.className]: updatedDocs };
  });
};

socket.on("document-ready", handleDocumentReady);

return () => {
  socket.off("document-ready", handleDocumentReady);
};
```

**Preservation Strategy**:
- ✅ Keep `document-ready` event listener unchanged
- ✅ Do NOT remove or modify this listener
- ✅ Add new chat streaming listeners separately

**Test Cases**:
- ✅ Upload document → should see document appear in sidebar when processing completes
- ✅ Upload multiple documents → should update all documents independently

---

#### 3.2.2 Class Selection and Persistence (Lines 225-304)

**Code Block** (MUST PRESERVE):
```typescript
// Fetch classes on load (lines 225-256)
useEffect(() => {
  const fetchClasses = async () => {
    const { classes } = await getUserClasses();
    setClasses(classes);

    const storedClass = localStorage.getItem("selectedClass");

    // Auto-select first class if user has classes but no valid selection
    if (classes.length > 0) {
      if (storedClass === "null" || !storedClass) {
        setSelectedClass(classes[0].name);
      } else if (classes.some((cls) => cls.name === storedClass)) {
        setSelectedClass(storedClass);
      } else {
        setSelectedClass(classes[0].name);
      }
    } else {
      setSelectedClass(null);
    }
  };
  if (auth?.isLoggedIn) fetchClasses();
}, [auth]);

// Auto-select first class if needed (lines 277-297)
useEffect(() => {
  if (classes.length > 0) {
    setSelectedClass((currentSelection) => {
      const hasValidSelection = currentSelection && classes.some((cls) => cls.name === currentSelection);
      if (!hasValidSelection) {
        return classes[0].name;
      }
      return currentSelection;
    });
  } else if (classes.length === 0) {
    setSelectedClass((currentSelection) => {
      return currentSelection !== null ? null : currentSelection;
    });
  }
}, [classes]);

// Save selected class locally (lines 302-304)
useEffect(() => {
  localStorage.setItem("selectedClass", selectedClass || "null");
}, [selectedClass]);
```

**Preservation Strategy**:
- ✅ Keep all class selection logic unchanged
- ✅ Keep localStorage persistence
- ✅ Keep auto-select first class behavior

**Test Cases**:
- ✅ Reload page → should restore previously selected class
- ✅ Delete selected class → should auto-select first remaining class
- ✅ User has no classes → should show "Create a class" prompt

---

#### 3.2.3 Chat Session Loading (Lines 309-334)

**Code Block** (MUST PRESERVE):
```typescript
useEffect(() => {
  if (!(auth?.isLoggedIn && auth.user)) return;

  getUserChatSessions()
    .then((data: { chatSessions: ChatSession[] }) => {
      const sessionsSorted = data.chatSessions.sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });
      setChatSessions(sessionsSorted);

      if (sessionsSorted.length > 0) {
        const first = sessionsSorted[0];
        setCurrentChatSessionId(first._id);
        setChatMessages(collapseRetries(first.messages));
        setSelectedClass(first.assignedClass || null);
      }
    })
    .catch((err) => {
      console.error("Error loading chat sessions:", err);
      toast.error("Loading Chat Sessions Failed", { id: "loadchatsessions" });
    });
}, [auth]);
```

**Preservation Strategy**:
- ✅ Keep session loading logic unchanged
- ✅ Keep sort by updatedAt (most recent first)
- ✅ Keep `collapseRetries()` call (handles retry versions)
- ✅ Keep auto-load first session

**Test Cases**:
- ✅ Login → should load most recent chat session
- ✅ No chat sessions → should show empty state
- ✅ Session with retry versions → should show only current version

---

#### 3.2.4 Auto-Scroll Behavior (Lines 346-363)

**Code Block** (MUST PRESERVE):
```typescript
useEffect(() => {
  const container = chatContainerRef.current;
  if (!container) return;

  const handleScroll = () => {
    const { scrollTop, scrollHeight, clientHeight } = container;
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 50);
  };

  container.addEventListener("scroll", handleScroll);
  return () => container.removeEventListener("scroll", handleScroll);
}, []);

useEffect(() => {
  if (isAtBottom && messagesEndRef.current)
    messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
}, [chatMessages, partialAssistantMessage, isAtBottom]);
```

**Preservation Strategy**:
- ✅ Keep auto-scroll logic unchanged
- ✅ Auto-scroll should trigger on `partialAssistantMessage` updates (streaming tokens)
- ✅ Keep "sticky scroll" behavior (only auto-scroll if user is at bottom)

**Test Cases**:
- ✅ Receive streaming tokens → should auto-scroll to show new tokens
- ✅ User scrolls up mid-stream → should NOT auto-scroll
- ✅ User scrolls back to bottom → should resume auto-scroll

---

#### 3.2.5 Free Tier Usage Counter (Lines 261-272, 407-411, 442-445)

**Code Block** (MUST PRESERVE):
```typescript
// Fetch usage on load (lines 261-272)
useEffect(() => {
  const fetchUsage = async () => {
    const data = await verifyUser();
    setUserPlan(data.plan || "free");
    if (data.plan === "free") setChatUsage({ count: data.chatRequestCount, limit: 25 });
  };
  if (auth?.isLoggedIn) fetchUsage();
}, [auth]);

// Check limit before submit (lines 407-411)
if (chatUsage && chatUsage.count >= chatUsage.limit) {
  toast.error("Monthly chat limit reached for the free plan");
  return;
}

// Increment local counter after success (lines 442-445)
setChatUsage((prev) =>
  prev ? { ...prev, count: Math.min(prev.count + 1, prev.limit) } : prev
);
```

**Preservation Strategy**:
- ✅ Keep usage fetch on load
- ✅ Keep local counter increment (optimistic UI)
- ✅ Keep limit check before submit

**Test Cases**:
- ✅ Free user at 24/25 → should show usage counter, allow send
- ✅ Free user at 25/25 → should reject with toast "limit reached"
- ✅ Premium user → should NOT show usage counter

---

#### 3.2.6 Message Reactions (Lines 135-163)

**Code Block** (MUST PRESERVE):
```typescript
const handleSetReaction = async (
  idx: number,
  newReaction: "like" | "dislike" | null
) => {
  // Optimistic UI
  setChatMessages((prev) => {
    const next = [...prev];
    if (next[idx]?.role === "assistant") {
      next[idx] = { ...next[idx], reaction: newReaction };
    }
    return next;
  });

  try {
    if (currentChatSessionId)
      await setReaction(currentChatSessionId, idx, newReaction);
  } catch (err) {
    console.error("Failed to set reaction", err);
    // Revert on error
    setChatMessages((prev) => {
      const next = [...prev];
      if (next[idx]?.role === "assistant") {
        next[idx] = { ...next[idx], reaction: null };
      }
      return next;
    });
  }
};
```

**Preservation Strategy**:
- ✅ Keep reaction handling unchanged
- ✅ Keep optimistic UI pattern
- ✅ Keep error reversion

**Test Cases**:
- ✅ Click thumbs up → should set reaction=like, persist to backend
- ✅ Click thumbs down → should set reaction=dislike
- ✅ Click again → should toggle off (reaction=null)
- ✅ Backend fails → should revert to null

---

#### 3.2.7 Document Chat Mode (Lines 118, activeDocId state)

**State** (MUST PRESERVE):
```typescript
const [activeDocId, setActiveDocId] = useState<string | null>(null);
```

**Preservation Strategy**:
- ✅ Keep `activeDocId` state unchanged
- ✅ Pass to `sendChatRequest()` when document chat is active
- ✅ Document chat should work with streaming

**Test Cases**:
- ✅ Click document in sidebar → should open document chat with page-level citations
- ✅ Send message in document chat → citations should link to specific pages
- ✅ Close document chat → should return to class chat

---

#### 3.2.8 Preset Prompts (Lines 519-526)

**Code Block** (MUST PRESERVE):
```typescript
const handlePresetPrompt = (prompt: string) => {
  if (isGenerating) return;  // Guard while streaming
  if (inputRef.current) {
    inputRef.current.value = prompt;  // Seed the textarea
  }
  handleSubmit();  // Reuse the normal path
};
```

**Preservation Strategy**:
- ✅ Keep preset prompt handling unchanged
- ✅ Keep `isGenerating` guard

**Test Cases**:
- ✅ Click preset prompt → should auto-fill textarea and send
- ✅ Click preset while generating → should do nothing (guarded)

---

### 3.3 What TO CHANGE vs What NOT TO CHANGE

#### ✅ SAFE TO DELETE:
```typescript
// DELETE: Simulated streaming (lines 487-500)
typeIntervalRef.current = setInterval(() => {
  i += 1;
  setPartialAssistantMessage(fullText.substring(0, i));
  if (i >= fullText.length) {
    clearInterval(typeIntervalRef.current);
    setChatMessages([...updatedWithoutLast, finalAssistantMsg]);
    setPartialAssistantMessage("");
    setIsGenerating(false);
  }
}, 2);
```

#### ✅ SAFE TO ADD:
```typescript
// ADD: WebSocket listeners in handleSubmit
const socket = initializeSocket();

const handleToken = (data: { sessionId: string; token: string }) => {
  if (data.sessionId === currentChatSessionId) {
    setPartialAssistantMessage(prev => prev + data.token);
  }
};

const handleComplete = (data: { sessionId: string; citations: any[]; chunkReferences: any[] }) => {
  if (data.sessionId === currentChatSessionId) {
    const finalMessage = {
      role: "assistant" as const,
      content: partialAssistantMessage,
      citation: data.citations,
      chunkReferences: data.chunkReferences
    };
    setChatMessages(prev => [...prev, finalMessage]);
    setPartialAssistantMessage("");
    setIsGenerating(false);
    // Cleanup listeners
    socket.off('chat-stream-token', handleToken);
    socket.off('chat-stream-complete', handleComplete);
    socket.off('chat-stream-error', handleError);
  }
};

const handleError = (data: { sessionId: string; error: string }) => {
  if (data.sessionId === currentChatSessionId) {
    toast.error("Stream interrupted. Please retry.");
    setIsGenerating(false);
    // Cleanup listeners
  }
};

socket.on('chat-stream-token', handleToken);
socket.on('chat-stream-complete', handleComplete);
socket.on('chat-stream-error', handleError);

// ADD: Cleanup on unmount
useEffect(() => {
  return () => {
    if (streamListenersRef.current) {
      const socket = initializeSocket();
      socket.off('chat-stream-token', streamListenersRef.current.token);
      socket.off('chat-stream-complete', streamListenersRef.current.complete);
      socket.off('chat-stream-error', streamListenersRef.current.error);
    }
  };
}, []);
```

#### ❌ DO NOT CHANGE:
```typescript
// 1. Document-ready listener (lines 191-217)
socket.on("document-ready", handleDocumentReady);

// 2. Class selection logic (lines 225-304)
useEffect(() => {
  const fetchClasses = async () => { /* ... */ };
  if (auth?.isLoggedIn) fetchClasses();
}, [auth]);

// 3. Chat session loading (lines 309-334)
getUserChatSessions().then((data) => { /* ... */ });

// 4. Auto-scroll (lines 346-363)
useEffect(() => {
  if (isAtBottom && messagesEndRef.current) {
    messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }
}, [chatMessages, partialAssistantMessage, isAtBottom]);

// 5. Message reactions (lines 135-163)
const handleSetReaction = async (idx, newReaction) => { /* ... */ };

// 6. Free tier usage (lines 261-272, 407-411, 442-445)
if (chatUsage && chatUsage.count >= chatUsage.limit) {
  toast.error("Monthly chat limit reached for the free plan");
  return;
}
```

---

## 4. Integration Test Cases

### 4.1 Critical Path Testing (MUST PASS BEFORE DEPLOYMENT)

#### Test Suite 1: Core Chat Functionality

| Test ID | Test Case | Expected Result | Priority |
|---------|-----------|----------------|----------|
| CP-01 | Send normal message in class chat | Streams tokens in real-time, displays citations | 🔴 CRITICAL |
| CP-02 | Send "Tell me more" (follow-up) | Reuses previous chunks, no new search | 🔴 CRITICAL |
| CP-03 | Send "Find a quote about X" | Returns verbatim quotes with [N] citations | 🔴 CRITICAL |
| CP-04 | Send "Generate a study guide" | Returns formatted study guide with sections | 🔴 CRITICAL |
| CP-05 | Send "Summarize this document" (doc selected) | Returns condensed summary | 🔴 CRITICAL |
| CP-06 | Send "Summarize this class" (class selected) | Returns combined summary | 🔴 CRITICAL |
| CP-07 | Click retry button | Generates new response, creates version history | 🔴 CRITICAL |
| CP-08 | Click citation link | Opens document viewer at correct page | 🔴 CRITICAL |
| CP-09 | Expand chunk reference | Shows original chunk text | 🟡 HIGH |
| CP-10 | Click thumbs up/down | Sets reaction, persists to backend | 🟡 HIGH |

---

#### Test Suite 2: Streaming-Specific

| Test ID | Test Case | Expected Result | Priority |
|---------|-----------|----------------|----------|
| ST-01 | Measure TTFT (time to first token) | <2 seconds | 🔴 CRITICAL |
| ST-02 | Send long query (500+ chars) | Streams correctly, no timeout | 🔴 CRITICAL |
| ST-03 | Send 10 consecutive queries | No memory leaks, listeners cleaned up | 🔴 CRITICAL |
| ST-04 | Navigate away mid-stream | Listeners cleaned up, no errors | 🔴 CRITICAL |
| ST-05 | User scrolls up mid-stream | Auto-scroll pauses, resumes when at bottom | 🟡 HIGH |
| ST-06 | Simulate Python crash mid-stream | Error toast shown, retry option available | 🟡 HIGH |
| ST-07 | Simulate network timeout | Error toast after 60s, retry option | 🟡 HIGH |
| ST-08 | 2+ users streaming simultaneously | No cross-user token leakage | 🔴 CRITICAL |
| ST-09 | Enable React StrictMode | No duplicate tokens displayed | 🟡 HIGH |
| ST-10 | Reload page mid-stream | No partial message in MongoDB | 🔴 CRITICAL |

---

#### Test Suite 3: Free Tier & Rate Limiting

| Test ID | Test Case | Expected Result | Priority |
|---------|-----------|----------------|----------|
| FT-01 | Free user sends 24th chat | Success, counter increments to 24 | 🔴 CRITICAL |
| FT-02 | Free user sends 25th chat | Success, counter increments to 25 | 🔴 CRITICAL |
| FT-03 | Free user sends 26th chat | Rejected with 403 "limit reached" | 🔴 CRITICAL |
| FT-04 | Free user stream fails mid-stream | Counter does NOT increment | 🔴 CRITICAL |
| FT-05 | Premium user | No limit enforced | 🟡 HIGH |
| FT-06 | Month rolls over | Counter resets to 0 | 🟡 HIGH |
| FT-07 | Simulate Redis token bucket exhaustion | Returns "System is busy" message | 🟡 HIGH |

---

#### Test Suite 4: Document Chat

| Test ID | Test Case | Expected Result | Priority |
|---------|-----------|----------------|----------|
| DC-01 | Click document in sidebar | Opens document chat modal | 🔴 CRITICAL |
| DC-02 | Send message in document chat | Streams tokens, shows page-level citations | 🔴 CRITICAL |
| DC-03 | Click page citation | Jumps to correct page in document viewer | 🔴 CRITICAL |
| DC-04 | Close document chat | Returns to class chat, preserves context | 🟡 HIGH |
| DC-05 | Document chat with PDF | Citations show page numbers | 🟡 HIGH |

---

#### Test Suite 5: Backward Compatibility

| Test ID | Test Case | Expected Result | Priority |
|---------|-----------|----------------|----------|
| BC-01 | Load existing chat session | Messages display correctly with citations | 🔴 CRITICAL |
| BC-02 | Load session with retry versions | Shows current version, can switch | 🟡 HIGH |
| BC-03 | Load session with reactions | Reactions display correctly | 🟡 HIGH |
| BC-04 | Upload document | Document processing works, emits document-ready | 🔴 CRITICAL |
| BC-05 | Chrome extension request | Uses chrome_extension prompt | 🟡 HIGH |

---

### 4.2 Edge Cases (MUST HANDLE GRACEFULLY)

| Test ID | Edge Case | Expected Behavior | Priority |
|---------|-----------|-------------------|----------|
| EC-01 | Query with no matching chunks | "I couldn't find anything relevant..." message | 🔴 CRITICAL |
| EC-02 | Quote query with insufficient context | Asks for clarification | 🟡 HIGH |
| EC-03 | Context length exceeded | Mode-specific error message | 🟡 HIGH |
| EC-04 | OpenAI API error | "Model or server unavailable" with retry | 🟡 HIGH |
| EC-05 | User has no classes | Shows "Create a class" prompt | 🟡 HIGH |
| EC-06 | User has no documents in class | Shows "Upload a document" prompt | 🟡 HIGH |
| EC-07 | Summary requested with no stored summary | Falls back to vector search | 🟡 HIGH |
| EC-08 | Class summary with 20+ documents | Context limit warning | 🟢 MEDIUM |

---

## 5. Pre-Deployment Checklist

### 5.1 Code Review Checklist

**Before merging streaming changes, verify**:

#### Python Service (semantic_search.py, semantic_service.py)
- [ ] New `stream_semantic_search()` function added (not modified existing)
- [ ] Existing `process_semantic_search()` unchanged
- [ ] All helper functions unchanged (no modifications)
- [ ] New `/api/v1/semantic_search_stream` endpoint added
- [ ] Old `/api/v1/semantic_search` endpoint unchanged (backward compatibility)
- [ ] Token reservation happens BEFORE streaming starts
- [ ] All 5 routes tested: general_qa, follow_up, quote_finding, generate_study_guide, summary
- [ ] Quote validation logic copied to streaming function
- [ ] Study guide early return preserved (no streaming for study guides)
- [ ] Summary modes early return preserved
- [ ] Follow-up mode reuses chunks (no new search)
- [ ] Citation renumbering logic preserved
- [ ] MMR reranking logic preserved
- [ ] Error handling for all OpenAI exceptions
- [ ] Logging added for streaming lifecycle

#### Node Backend (chat_controllers.ts)
- [ ] Auth check unchanged (lines 148-152)
- [ ] Free tier limit check unchanged (lines 157-175)
- [ ] Free tier increment moved to AFTER stream completes
- [ ] Session creation logic unchanged (lines 189-224)
- [ ] User message push preserved (lines 230-238)
- [ ] Blocking POST replaced with streaming (lines 260-267)
- [ ] SSE parsing implemented correctly
- [ ] WebSocket events emitted to user's room
- [ ] Full response accumulated in memory
- [ ] MongoDB save moved to `stream.on('end')`
- [ ] Citation text update preserved (lines 282-297)
- [ ] Retry mechanism preserved (lines 300-333)
- [ ] Error handling for stream failures
- [ ] Logging added for stream events

#### Frontend (Chat.tsx)
- [ ] Simulated streaming code deleted (lines 487-500)
- [ ] WebSocket listeners added for 3 events
- [ ] Listener cleanup in useEffect unmount
- [ ] `partialAssistantMessage` accumulation works
- [ ] Finalization on `chat-stream-complete`
- [ ] Error toast on `chat-stream-error`
- [ ] Document-ready listener unchanged (lines 191-217)
- [ ] Class selection logic unchanged (lines 225-304)
- [ ] Chat session loading unchanged (lines 309-334)
- [ ] Auto-scroll behavior unchanged (lines 346-363)
- [ ] Free tier usage counter unchanged (lines 261-272, 407-411, 442-445)
- [ ] Message reactions unchanged (lines 135-163)
- [ ] Document chat mode unchanged
- [ ] Preset prompts unchanged (lines 519-526)

---

### 5.2 Testing Checklist

**Run ALL test suites**:
- [ ] Core Chat Functionality (10 tests) - ALL PASS
- [ ] Streaming-Specific (10 tests) - ALL PASS
- [ ] Free Tier & Rate Limiting (7 tests) - ALL PASS
- [ ] Document Chat (5 tests) - ALL PASS
- [ ] Backward Compatibility (5 tests) - ALL PASS
- [ ] Edge Cases (8 tests) - ALL HANDLE GRACEFULLY

**Performance**:
- [ ] TTFT (time to first token) < 2 seconds (average across 10 queries)
- [ ] No memory leaks (Chrome DevTools Memory profiler after 10+ queries)
- [ ] No duplicate listeners (React StrictMode enabled)

**Monitoring**:
- [ ] Heroku logs show streaming metrics (started, first_token, completed)
- [ ] Redis stream state keys created and cleaned up
- [ ] MongoDB writes only after stream completes (no incremental writes)

---

### 5.3 Rollback Preparation

**Have ready BEFORE deployment**:
- [ ] Git commit hash of last working version
- [ ] Rollback script prepared
- [ ] Feature flag `ENABLE_STREAMING` configured (default: false)
- [ ] Team notified of deployment window
- [ ] Monitoring dashboard open (Heroku metrics)

**Rollback triggers** (if any occur):
- [ ] Streaming success rate <95%
- [ ] TTFT >3 seconds (regression)
- [ ] Memory leaks detected
- [ ] Free tier counter bugs (charging on failure)
- [ ] MongoDB partial writes detected
- [ ] Existing features broken (citations, reactions, document chat)

---

## 6. Summary: Golden Rules for Preservation

### 🔴 NEVER DO THIS:
1. ❌ Modify existing `process_semantic_search()` function
2. ❌ Delete any helper functions
3. ❌ Change function signatures of existing functions
4. ❌ Remove existing WebSocket events (`document-ready`)
5. ❌ Modify MongoDB schema
6. ❌ Change Redis key formats or TTL values
7. ❌ Remove error handling code
8. ❌ Skip testing backward compatibility

### ✅ ALWAYS DO THIS:
1. ✅ Add new functions alongside existing ones
2. ✅ Reuse existing helper functions (don't duplicate)
3. ✅ Keep all existing logic paths unchanged
4. ✅ Test ALL 45+ test cases before deployment
5. ✅ Verify no memory leaks (React StrictMode)
6. ✅ Check free tier accounting works correctly
7. ✅ Ensure MongoDB writes only after stream completes
8. ✅ Clean up WebSocket listeners on unmount

---

## 7. Emergency Contacts

**If something breaks in production**:

1. **Immediate Rollback** (5 minutes):
   ```bash
   git revert <commit-hash>
   git push heroku main
   ```

2. **Feature Flag Disable** (1 minute):
   ```bash
   heroku config:set ENABLE_STREAMING=false --app class-chat-node-8a0ef9662b5a
   heroku config:set ENABLE_STREAMING=false --app class-chat-python-f081e08f29b8
   ```

3. **Check Logs**:
   ```bash
   heroku logs --tail --app class-chat-node-8a0ef9662b5a
   heroku logs --tail --app class-chat-python-f081e08f29b8
   ```

---

**Document Status**: ✅ COMPREHENSIVE PRESERVATION GUIDE COMPLETE

**Next Steps**:
1. Print this checklist and keep it during implementation
2. Check off each item as you complete it
3. Run ALL 45+ test cases before deployment
4. Have rollback plan ready

---

*🏗️ Preservation Guide by Winston*
*📅 Date: 2025-11-10*
*⚠️ CRITICAL: Follow this guide exactly to avoid breaking existing functionality*
