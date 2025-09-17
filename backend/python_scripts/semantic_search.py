import os, re, json, sys, math
from pathlib import Path
from typing import List, Tuple
from router import detect_route
import boto3
from urllib.parse import quote
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from langchain.chains import create_history_aware_retriever
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
from logger_setup import log
from json import dumps as _json_dumps
import openai
import traceback   # for last-chance logging
import time      
import redis      


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
# ENV + CLIENTS
# ──────────────────────────────────────────────────────────────
load_dotenv()

# ─────────────  Rate‑limit guard (shared with ingest)  ─────────────
# TLS verification enabled by default; no ssl_cert_reqs override
r = redis.Redis.from_url(os.getenv("REDIS_URL"))

TPM_LIMIT    = int(os.getenv("OPENAI_TPM_LIMIT", "180000"))  # same org quota
TOK_PER_CHAR = 1 / 4                                         # heuristic


connection_string = os.getenv("MONGO_CONNECTION_STRING")
client = MongoClient(connection_string)
db_name = "study_buddy_demo"
collection_name = "study_materials2"
collection = client[db_name][collection_name]

embedding_model = OpenAIEmbeddings(model="text-embedding-3-small")

# Route-tunable defaults
ROUTE_CONFIG = {
    "general_qa":           {"k": int(os.getenv("RAG_K", "12")),  "numCandidates": int(os.getenv("RAG_CANDIDATES", "1000")), "temperature": float(os.getenv("RAG_TEMP_GENERAL", "0.2")), "max_output_tokens": int(os.getenv("RAG_MAX_TOKENS", "700"))},
    "follow_up":            {"k": int(os.getenv("RAG_K_FOLLOWUP", "10")), "numCandidates": int(os.getenv("RAG_CANDIDATES", "1000")), "temperature": float(os.getenv("RAG_TEMP_FOLLOWUP", "0.2")), "max_output_tokens": int(os.getenv("RAG_MAX_TOKENS", "700"))},
    "quote_finding":        {"k": int(os.getenv("RAG_K_QUOTE", "20")), "numCandidates": int(os.getenv("RAG_CANDIDATES", "1200")), "temperature": float(os.getenv("RAG_TEMP_QUOTE", "0.0")), "max_output_tokens": int(os.getenv("RAG_MAX_TOKENS_QUOTE", "400"))},
    "generate_study_guide": {"k": int(os.getenv("RAG_K_GUIDE", "8")),   "numCandidates": int(os.getenv("RAG_CANDIDATES", "800")),  "temperature": float(os.getenv("RAG_TEMP_GUIDE", "0.3")), "max_output_tokens": int(os.getenv("RAG_MAX_TOKENS_GUIDE", "1200"))},
    "summary":              {"k": int(os.getenv("RAG_K_SUM", "8")),    "numCandidates": int(os.getenv("RAG_CANDIDATES", "800")),  "temperature": float(os.getenv("RAG_TEMP_SUM", "0.2")), "max_output_tokens": int(os.getenv("RAG_MAX_TOKENS_SUM", "600"))},
}

def get_llm(route: str) -> ChatOpenAI:
    cfg = ROUTE_CONFIG.get(route, ROUTE_CONFIG["general_qa"])
    return ChatOpenAI(model=os.getenv("OPENAI_CHAT_MODEL", "gpt-4.1-nano"), temperature=cfg["temperature"])

backend_url = os.getenv("BACKEND_URL", "https://localhost:3000/api/v1")

# ------------------------------------------------------------------
# Context-window guard-rails
# ------------------------------------------------------------------
MAX_PROMPT_TOKENS = int(os.getenv("MAX_PROMPT_TOKENS", "8000"))          # safe ceiling for gpt-4-mini       # heuristic ≈ 4 chars/token
est_tokens        = lambda txt: int(len(txt) * TOK_PER_CHAR)

# Keep defined for telemetry but do not gate by default
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.0"))


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
    Generate unique file citations with S3 download links.
    """
    citations = []
    seen_files = set()
    s3_client = boto3.client(
        "s3",
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY"),
        aws_secret_access_key=os.getenv("AWS_SECRET"),
        region_name=os.getenv("AWS_REGION"),
    )
    bucket_name = os.getenv("AWS_S3_BUCKET_NAME")

    for result in search_results:
        s3_key = result.get("file_name")
        file_title = result.get("file_name")
        doc_id = result.get("doc_id")

        if s3_key and s3_key not in seen_files:
            seen_files.add(s3_key)
            encoded_s3_key = quote(s3_key, safe="")
            download_url = f"{backend_url}/download?s3_key={encoded_s3_key}"
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
        "Preserve key concepts, definitions, and results."
    )

    return (condenser_prompt | llm | StrOutputParser()).invoke(
        {"context": summary_text, "user_query": user_query}
    )

def fetch_class_summaries(user_id: str, class_name: str):
    """Return every stored doc-level summary chunk for the class."""
    if class_name in (None, "", "null"):
        return []
    return list(collection.find({
        "user_id":  user_id,
        "class_id": class_name,
        "is_summary": True
    }).sort("file_name", 1))

def condense_class_summaries(text: str, user_query: str, llm: ChatOpenAI) -> str:
    prompt = PromptTemplate.from_template(
        "You are an expert study assistant.\n\n"
        "Below are multiple document summaries for one class, delimited by "
        "<summary></summary> tags.\n<summary>\n{context}\n</summary>\n\n"
        "The user asked: \"{user_query}\"\n\n"
        "Write a single, coherent overview (≈200–250 words) that captures the key "
        "points, concepts, and definitions across all documents, following any "
        "formatting instructions in the user's query."
    )
    return (prompt | llm | StrOutputParser()).invoke(
        {"context": text, "user_query": user_query}
    )

# ------------ NEW  study-guide generation helper ------------
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
    # -----------------------------------------------------------
    if route == "generate_study_guide" or mode == "study_guide":
        # -------- Single-document study guide --------
        if doc_id and doc_id != "null":
            summary_doc = fetch_summary_chunk(user_id, class_name, doc_id)
            if summary_doc:
                context_txt = summary_doc["text"]
                if est_tokens(context_txt) > MAX_PROMPT_TOKENS:
                    context_txt = condense_summary(context_txt, user_query, get_llm("summary"))
                    # ── NEW LOG ───────────────────────────────────────────
                log.info(
                    "[PROC] Study-guide (doc) | summary_tokens=%d | will_condense=%s",
                    est_tokens(context_txt),
                    "YES" if est_tokens(context_txt) > MAX_PROMPT_TOKENS else "NO",
                )
                # ──────────────────────────────────────────────────────
                guide = generate_study_guide(context_txt, user_query, get_llm("generate_study_guide"))

                chunk_array = [{
                    "_id": str(summary_doc["_id"]), "chunkNumber": 1,
                    "text": summary_doc["text"], "pageNumber": None,
                    "docId": summary_doc["doc_id"],
                }]
                citation   = get_file_citation([summary_doc])
                chunk_refs = [{"chunkId": chunk_array[0]["_id"], "displayNumber": 1, "pageNumber": None}]
                chat_history.append({"role": "assistant", "content": guide, "chunkReferences": chunk_refs})
                return {
                    "message": guide, "citation": citation, "chats": chat_history,
                    "chunks": chunk_array, "chunkReferences": chunk_refs,
                }

        # -------- Class-level study guide --------
        if class_name and class_name != "null":
            docs = fetch_class_summaries(user_id, class_name)
            if docs:
                combined = "\n\n---\n\n".join(d["text"] for d in docs)
                if est_tokens(combined) > MAX_PROMPT_TOKENS:
                    combined = condense_class_summaries(combined, user_query, get_llm("summary"))
                    
                # ── NEW LOG ───────────────────────────────────────────
                log.info(
                    "[PROC] Study-guide (class) | combined_tokens=%d | will_condense=%s | n_docs=%d",
                    est_tokens(combined),
                    "YES" if est_tokens(combined) > MAX_PROMPT_TOKENS else "NO",
                    len(docs),
                )
                # ──────────────────────────────────────────────────────

                guide = generate_study_guide(combined, user_query, get_llm("generate_study_guide"))

                chunk_array = [{
                    "_id": str(d["_id"]), "chunkNumber": i+1,
                    "text": d["text"], "pageNumber": None, "docId": d["doc_id"],
                } for i, d in enumerate(docs)]
                citation   = get_file_citation(docs)
                chunk_refs = [{"chunkId": c["_id"], "displayNumber": c["chunkNumber"], "pageNumber": None}
                            for c in chunk_array]
                chat_history.append({"role": "assistant", "content": guide, "chunkReferences": chunk_refs})
                return {
                    "message": guide, "citation": citation, "chats": chat_history,
                    "chunks": chunk_array, "chunkReferences": chunk_refs,
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
        filters = {"user_id": user_id}
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
        summary_doc = fetch_summary_chunk(user_id, class_name, doc_id)
        if not summary_doc:
            log.warning("No stored summary found; falling back to specific search")
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
    # ----------------------------------------------------------------
    if mode == "class_summary":
        docs = fetch_class_summaries(user_id, class_name)
        if not docs:
            log.warning("No summaries found for this class; falling back to specific search.")
            mode = "specific"            # fall through to normal retrieval
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
            "If multiple chunks support a single quote, include all consecutively like [1][3]. "
            "Do not invent citations; only use numbers corresponding to the provided chunks."
            "\n\n"
        )
    else:
        referencing_instruction = (
            "Whenever you use content from a given chunk in your final answer, "
            "place a bracketed reference [1], [2], [3], etc. at the end of the relevant sentence.\n\n"
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
