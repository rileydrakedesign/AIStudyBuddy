# RAG Architecture Improvement Plan - Architect Review

**Reviewer:** Winston (Architect)
**Review Date:** 2025-12-28
**Document Reviewed:** `docs/architecture/rag-architecture-improvement-plan.md`
**Status:** ✅ APPROVED WITH CONDITIONS

---

## Executive Summary

The RAG Architecture Improvement Plan is **well-structured and architecturally sound**. It respects existing service boundaries, proposes backward-compatible schema changes, and includes comprehensive feature flagging for safe rollout.

**Verdict:** Approved for implementation with the conditions noted below.

| Category | Assessment |
|----------|------------|
| Service Boundary Compliance | ✅ PASS |
| Data Model Compatibility | ✅ PASS |
| Infrastructure Requirements | ⚠️ PASS WITH CONDITIONS |
| Dependency Compatibility | ✅ PASS |
| Performance/Latency | ⚠️ REQUIRES MONITORING |
| Migration Strategy | ✅ PASS |
| Rollback Safety | ✅ PASS |

---

## 1. Service Boundary Compliance

**Assessment: ✅ PASS**

The plan correctly identifies and respects the CLAUDE.md guardrails:

| Guardrail | Plan Compliance |
|-----------|-----------------|
| Do not change service boundaries (Frontend ↔ Node ↔ Python) | ✅ All changes contained within Python AI service |
| Keep ingestion in Python, triggered by Node → FastAPI | ✅ Ingestion pipeline modifications stay in Python |
| Preserve JWT HTTP-only cookie auth in Node | ✅ No auth changes proposed |
| Do not remove or bypass Redis in ingestion/chat | ✅ Redis usage unchanged |
| Keep streaming over WebSockets | ✅ Streaming infrastructure untouched |
| Respect existing request/response contracts | ✅ All API changes are additive |

**Verification Points:**

1. **Hybrid search, cross-encoder, multi-query** - All implemented in `semantic_search.py` (Python service only)
2. **Contextual headers, hierarchical chunking** - All implemented in `load_data.py` (Python service only)
3. **Route-specific models** - Configuration in `config.py` (Python service only)
4. **No changes to:**
   - `semantic_service.py` endpoints (API contracts preserved)
   - Node API orchestration logic
   - WebSocket streaming infrastructure

---

## 2. Data Model Compatibility

**Assessment: ✅ PASS**

### 2.1 Schema Changes Analysis

**Proposed New Fields for `study_materials2` Collection:**

| Field | Type | Backward Compatible | Risk |
|-------|------|---------------------|------|
| `original_text` | string | ✅ Yes (optional, null default) | Low |
| `section_headers` | array | ✅ Yes (optional, [] default) | Low |
| `doc_type` | string | ✅ Yes (optional, null default) | Low |
| `chunk_type` | string | ✅ Yes (optional, null default) | Low |
| `chunk_id` | string | ✅ Yes (optional, null default) | Low |
| `parent_id` | string | ✅ Yes (optional, null default) | Low |
| `child_ids` | array | ✅ Yes (optional, null default) | Low |
| `context_text` | string | ✅ Yes (optional, null default) | Low |

**Compatibility with Existing Schema:**

The existing `study_materials2` schema (per `data-models-and-schema-changes.md`) includes:
- `text`, `embedding`, `file_name`, `title`, `author`
- `user_id`, `class_id`, `doc_id`, `page_number`
- `is_summary`, `chunk_hash`
- `section_title`, `section_hierarchy` (already planned additions)

**Finding:** All proposed fields are **additive only**. Existing queries will continue to work. Mongoose/PyMongo handles missing fields gracefully with defaults.

### 2.2 Index Requirements

**New Indexes Proposed:**

```javascript
// Atlas Search Index (TEXT - new)
{
  "name": "TextSearch",
  "type": "search",
  "mappings": {
    "fields": {
      "text": {"type": "string"},
      "original_text": {"type": "string"}
    }
  }
}

// Regular Indexes (new)
{ "chunk_id": 1 }      // For parent-child lookup
{ "parent_id": 1 }     // For child-to-parent resolution
```

**Compatibility:**
- Existing `PlotSemanticSearch` vector index: **UNCHANGED**
- New `TextSearch` index: Requires Atlas M10+ (see Infrastructure section)
- Regular indexes: Non-blocking background creation

**Recommendation:** Create indexes **after** code deployment to avoid blocking during deploy.

---

## 3. Infrastructure Requirements

**Assessment: ⚠️ PASS WITH CONDITIONS**

### 3.1 MongoDB Atlas Tier

**Current Tier:** Unknown (need to verify)
**Required Tier:** M10+ for Atlas Search

**Condition:** Before implementing P0 Hybrid Search, verify current Atlas tier supports Atlas Search. If on M0/M2/M5:
- **Option A:** Upgrade to M10 (~$60/month)
- **Option B:** Defer hybrid search, proceed with other P0/P1 changes

**Action Item:** Check current tier via Atlas UI or `atlas clusters describe`.

### 3.2 Heroku Dyno Sizing

**Current Configuration (per infrastructure docs):**
- Python: Standard-1X or Standard-2X dyno
- 512MB RAM baseline

**P1 Requirement:** Cross-encoder model adds ~100MB RAM

**Assessment:**
- Standard-1X (512MB): May be tight with cross-encoder
- Standard-2X (1GB): Sufficient headroom

**Recommendation:** If on Standard-1X, upgrade to Standard-2X before enabling cross-encoder:
```bash
heroku ps:resize web=standard-2x -a class-chat-python-f081e08f29b8
```

### 3.3 Storage Impact

**Contextual Headers (P0):**
- Adds 40-80 chars per chunk header
- Estimated +15-20% chunk text size
- Embedding dimension unchanged (1536)
- **Storage increase:** Moderate (acceptable)

**Parent-Child Chunking (P2):**
- Stores both parent and child chunks
- Denormalized `context_text` field
- **Storage increase:** ~50-100% (significant)

**Recommendation:** Monitor storage after P0, reassess before P2.

---

## 4. Dependency Compatibility

**Assessment: ✅ PASS**

### 4.1 New Python Dependencies

**Proposed Addition:**
```txt
sentence-transformers==2.2.2
```

**Compatibility Check Against Existing `requirements.txt`:**

| Existing Dependency | Conflict Risk | Notes |
|---------------------|---------------|-------|
| langchain-openai==0.2.5 | ✅ None | Different package |
| langchain-core==0.3.15 | ✅ None | Different package |
| openai==1.54.0 | ✅ None | Different package |
| PyMuPDF==1.24.13 | ✅ None | Different package |
| pymongo==4.8.0 | ✅ None | Different package |
| torch (transitive) | ⚠️ Check | sentence-transformers requires PyTorch |

**PyTorch Consideration:**
- `sentence-transformers` requires PyTorch
- If PyTorch not already installed, adds ~500MB to slug
- Heroku slug limit: 500MB (compressed)

**Verification Step:**
```bash
heroku run "pip show torch" -a class-chat-python-f081e08f29b8
```

If PyTorch not present:
- Consider `sentence-transformers[cpu]` for smaller footprint
- Or use `cross-encoder/ms-marco-MiniLM-L-6-v2` ONNX variant

### 4.2 Version Pinning

**Recommendation:** Pin exact version to avoid surprise upgrades:
```txt
sentence-transformers==2.2.2
torch==2.1.0  # If adding PyTorch explicitly
```

---

## 5. Performance and Latency Analysis

**Assessment: ⚠️ REQUIRES MONITORING**

### 5.1 Latency Budget Analysis

**Current System (from plan):**

| Route | Current P50 | Heroku Timeout |
|-------|-------------|----------------|
| general_qa | ~800ms | 30s |
| quote_finding | ~1200ms | 30s |
| study_guide | ~2000ms | 30s |

**Proposed Changes and Cumulative Impact:**

| Change | Latency Delta | Cumulative (worst case) |
|--------|---------------|-------------------------|
| Hybrid Search | +10-20ms | 820ms |
| Cross-Encoder | +30-50ms | 870ms |
| Multi-Query (P2) | +100-200ms | 1070ms |

**Assessment:**
- **General QA:** 870ms P50 → Within 1s target ✅
- **Quote Finding:** 1250ms + 50ms = 1300ms → Acceptable ✅
- **Study Guide with Multi-Query:** 2200ms + 200ms = 2400ms → Close to 2.5s target ⚠️

**Concern:** Study guide route with multi-query may approach latency limits.

**Recommendation:**
1. Implement P0 and P1 first, measure actual latency
2. Gate multi-query behind feature flag (already proposed)
3. Consider async query generation to reduce perceived latency

### 5.2 Concurrent Request Handling

**Current Rate Limiting (from codebase):**
- TPM limit: 180,000 tokens/minute
- Redis-based token bucket

**Impact of Changes:**
- Hybrid search: No additional OpenAI calls ✅
- Cross-encoder: No OpenAI calls (local model) ✅
- Multi-query: +3 embedding calls per query ⚠️

**Multi-Query Token Impact:**
- 3 additional query embeddings per request
- ~50 tokens per query × 3 = 150 tokens
- Negligible impact on TPM budget

**Recommendation:** Monitor TPM utilization after enabling multi-query.

---

## 6. Migration Strategy Review

**Assessment: ✅ PASS**

### 6.1 Phased Rollout Alignment

The plan's phases align with existing deployment patterns:

| Plan Phase | Alignment with Existing Process |
|------------|--------------------------------|
| Phase 1: P0 (Hybrid Search) | ✅ Python-only deploy, matches existing pattern |
| Phase 2: P1 (Cross-Encoder) | ✅ Python-only deploy with new dependency |
| Phase 3: Contextual Headers | ✅ Ingestion change, no re-ingestion required |
| Phase 4: P2 (Multi-Query, Parent-Child) | ✅ Optional, feature-flagged |

### 6.2 Backward Compatibility

**Graceful Degradation Verified:**

| Scenario | Behavior |
|----------|----------|
| Existing chunks without `original_text` | Uses `text` field (fallback) |
| Existing chunks without `chunk_type` | Treated as flat chunks (no hierarchy) |
| TextSearch index unavailable | Falls back to vector-only search |
| Cross-encoder fails to load | Returns unranked results |

**Finding:** All proposed fallbacks are safe and preserve existing functionality.

### 6.3 Feature Flag Design

**Proposed Flags (from plan):**

| Flag | Default | Purpose |
|------|---------|---------|
| `HYBRID_SEARCH_ENABLED` | `false` | Toggle hybrid search |
| `RERANKING_ENABLED` | `false` | Toggle cross-encoder |
| `MULTI_QUERY_ENABLED` | `false` | Toggle multi-query (P2) |
| `HIERARCHICAL_CHUNKING` | `false` | Toggle parent-child (P2) |

**Assessment:** Well-designed flag strategy with safe defaults.

**Recommendation:** Add explicit logging when feature flags are enabled/disabled at startup:
```python
log.info(f"[CONFIG] HYBRID_SEARCH_ENABLED={HYBRID_SEARCH_ENABLED}")
log.info(f"[CONFIG] RERANKING_ENABLED={RERANKING_ENABLED}")
```

---

## 7. Rollback Safety

**Assessment: ✅ PASS**

### 7.1 Rollback Procedures

**Immediate Rollback (Environment Variables):**
```bash
heroku config:set HYBRID_SEARCH_ENABLED=false -a class-chat-python-f081e08f29b8
heroku config:set RERANKING_ENABLED=false -a class-chat-python-f081e08f29b8
```
**Recovery Time:** <1 minute ✅

**Code Rollback:**
```bash
heroku rollback -a class-chat-python-f081e08f29b8
```
**Recovery Time:** <5 minutes ✅

### 7.2 Data Rollback

**Schema Changes:** All additive, no rollback needed for schema.

**Index Rollback:** If TextSearch index causes issues:
```javascript
db.study_materials2.dropIndex("TextSearch")
```

### 7.3 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cross-encoder OOM | Low | Medium | Monitor memory, upgrade dyno |
| TextSearch index creation blocks | Low | Low | Create in background |
| Latency regression | Medium | Medium | Feature flags, monitoring |
| Incompatible dependency | Low | High | Test in development first |

---

## 8. Integration Considerations

### 8.1 API Contract Preservation

**Verified:** No changes to external API contracts:
- `/api/v1/semantic_search` - Request/response unchanged
- `/api/v1/semantic_search_stream` - Streaming unchanged
- `/api/v1/process_upload` - Request unchanged

**Internal Changes Only:**
- New functions added within `semantic_search.py`
- Existing function signatures preserved

### 8.2 Node ↔ Python Integration

**Unchanged:**
- Node calls Python via HTTP (existing pattern)
- Redis queue for ingestion jobs (unchanged)
- No new endpoints required

### 8.3 Frontend Impact

**Minimal:**
- No frontend changes required for P0/P1
- Response format unchanged
- Citations format unchanged

---

## 9. Conditions for Approval

### 9.1 Pre-Implementation Requirements

1. **Verify MongoDB Atlas Tier**
   - Confirm M10+ for Atlas Search
   - If M0/M2/M5, either upgrade or defer hybrid search

2. **Verify Heroku Dyno Sizing**
   - Confirm Standard-2X for cross-encoder memory
   - If Standard-1X, upgrade before P1

3. **Verify Slug Size**
   - Test `sentence-transformers` install in development
   - Confirm slug remains under 500MB limit

### 9.2 Implementation Requirements

1. **Add Startup Logging for Feature Flags**
   ```python
   log.info(f"[CONFIG] Feature flags: hybrid={HYBRID_SEARCH_ENABLED}, rerank={RERANKING_ENABLED}")
   ```

2. **Add Latency Metrics**
   - Log hybrid_search_ms, rerank_ms, total_search_ms per request
   - Enable alerting on P99 > 3s

3. **Create Runbook**
   - Document rollback procedures
   - Document monitoring queries
   - Share with team

### 9.3 Post-Implementation Requirements

1. **A/B Testing**
   - Run 1 week A/B test before full rollout
   - Compare retrieval precision, latency, user satisfaction

2. **Performance Review**
   - After 1 week, review latency metrics
   - Decide on multi-query enablement based on data

---

## 10. Recommendations Summary

### 10.1 Proceed As-Is

- ✅ Contextual chunk headers (P0)
- ✅ Feature flag design
- ✅ Route-specific model selection (P1)
- ✅ Quote validation logic
- ✅ Enhanced prompts

### 10.2 Proceed with Verification

- ⚠️ Hybrid search - Verify Atlas M10+ first
- ⚠️ Cross-encoder - Verify dyno sizing first
- ⚠️ sentence-transformers - Test slug size first

### 10.3 Defer for Later Evaluation

- 🔄 Parent-child chunking (P2) - Significant storage increase, evaluate after P0/P1
- 🔄 Route-specific embeddings - Complexity vs. benefit unclear, cross-encoder achieves similar precision

### 10.4 Suggested Additions

1. **Add circuit breaker for external calls**
   - If cross-encoder fails 3x, disable for 5 minutes

2. **Add caching for query embeddings**
   - Cache embeddings for repeated queries (Redis, 1-hour TTL)

3. **Consider ONNX runtime for cross-encoder**
   - Faster inference, smaller footprint than PyTorch

---

## 11. Final Verdict

**APPROVED FOR IMPLEMENTATION** with the conditions specified in Section 9.

The plan demonstrates:
- Strong understanding of existing architecture
- Respect for service boundaries
- Comprehensive rollback strategy
- Pragmatic phased approach

**Next Steps:**
1. Address pre-implementation requirements (Section 9.1)
2. Begin P0 implementation (contextual headers first, then hybrid search)
3. Monitor metrics, proceed to P1 after validation

---

**Signed:** Winston, Architect
**Date:** 2025-12-28
