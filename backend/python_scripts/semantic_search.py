import os
import re                # NEW – for chapter / summary detection
import json
import sys
from pathlib import Path
from typing import List, Tuple, Dict, Any
import math 
from bson import ObjectId    
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

from logger_setup import log

# ──────────────────────────────────────────────────────────────
# ENV + CLIENTS
# ──────────────────────────────────────────────────────────────
load_dotenv()

connection_string = os.getenv("MONGO_CONNECTION_STRING")
client = MongoClient(connection_string)
db_name = "study_buddy_demo"
collection_name = "study_materials2"
collection = client[db_name][collection_name]

MAIN_FILE_DB_NAME         = "test"             # NEW
MAIN_FILE_COLLECTION_NAME = "documents"        # NEW
main_collection = client[MAIN_FILE_DB_NAME][MAIN_FILE_COLLECTION_NAME]   # NEW

embedding_model = OpenAIEmbeddings(model="text-embedding-3-small")
llm = ChatOpenAI(model="gpt-4.1-mini", temperature=0.5)

TOK_PER_CHAR       = 1 / 4          # NEW –  ≈4 chars/token
MAX_CONTEXT_TOKENS = 8_000          # NEW –  safe GPT-4-mini window
est_tokens = lambda txt: int(len(txt) * TOK_PER_CHAR)   # NEW

backend_url = os.getenv("BACKEND_URL", "https://localhost:3000/api/v1")

# ──────────────────────────────────────────────────────────────
# ────────────────  NEW MODE-DETECTION HELPERS  ───────────────
# ──────────────────────────────────────────────────────────────
# add after SUMMARY_RE
SUMMARY_RE = re.compile(r"\bsummar(?:y|ize|ise)\b", re.I)  # summary keyword

def detect_query_mode(query: str) -> str:
    """
    Return 'summary' when the user is asking for ANY summary; else 'specific'.
    The exact target (doc vs class) is decided later.
    """
    return "summary" if SUMMARY_RE.search(query) else "specific"

# New
def fetch_full_doc_text_and_chunks(user_id: str, doc_id: str) -> Tuple[str, List[Dict[str, Any]]]:
    """Return concatenated text + chunk metadata (non-summary)."""
    pipeline = [
        {"$match": {"user_id": user_id, "doc_id": doc_id, "is_summary": False}},
        {"$sort": {"page_number": 1}},
        {"$project": {"_id": 1, "text": 1, "page_number": 1, "doc_id": 1, "cluster_id": 1}},
    ]
    results = list(collection.aggregate(pipeline))
    full_text = " ".join(r["text"] for r in results)
    chunk_arr = [
        {"_id": str(r["_id"]), "chunkNumber": i+1, "text": r["text"],
         "pageNumber": r.get("page_number"), "docId": r.get("doc_id"),
         "clusterId": r.get("cluster_id")}
        for i, r in enumerate(results)
    ]

    log.info(f"[FETCH DOC] user={user_id} doc={doc_id} → chunks={len(results)} "
         f"chars={len(full_text)}")

    return full_text, chunk_arr


def vector_search_for_term(query_vec, doc_id: str, limit: int = 2):
    """Return *limit* best chunks for a term embedding."""
    log.info(f"[TERM SEARCH] doc={doc_id} | limit={limit}")

    pipeline = [
        {"$vectorSearch": {
            "index": "PlotSemanticSearch",
            "path": "embedding",
            "queryVector": query_vec,
            "numCandidates": 500,
            "limit": limit,
            "filter": {"doc_id": doc_id, "is_summary": False},
        }},
        {"$project": {"_id": 1, "text": 1, "page_number": 1, "doc_id": 1,
                      "cluster_id": 1, "score": {"$meta": "vectorSearchScore"}}},
    ]
    return list(collection.aggregate(pipeline))


def diversify_by_cluster(candidates: List[dict]) -> List[dict]:
    """Keep ≤1 chunk per cluster_id."""
    out, seen = [], set()
    for c in candidates:
        cid = c.get("cluster_id")
        if cid is None or cid not in seen:
            out.append(c)
            if cid is not None:
                seen.add(cid)
    return out


def build_small_doc_study_guide(full_text: str) -> str:
    prompt = PromptTemplate.from_template(
        "You are an expert study assistant.\n\n"
        "<doc>\n{context}\n</doc>\n\n"
        "Generate a study guide: for each key idea create a Q & A flashcard."
    )

    log.info(f"[SMALL GUIDE] context_tokens≈{est_tokens(full_text)}")

    return (prompt | llm | StrOutputParser()).invoke({"context": full_text})


def build_large_doc_study_guide(key_terms: List[str], chunks: List[dict]) -> str:
    prompt = PromptTemplate.from_template(
        "You are an expert study assistant.\n\n"
        "Key terms:\n{terms}\n\nContext passages:\n{context}\n\n"
        "For **each** term write a flashcard (**Q:** / **A:**) using ONLY the context."
    )
    log.info(f"[LARGE GUIDE] terms={len(key_terms)} | ctx_chunks={len(chunks)}")

    return (prompt | llm | StrOutputParser()).invoke({
        "terms": "\n".join(f"- {t}" for t in key_terms),
        "context": "\n\n".join(f"Chunk {i+1}: {c['text']}" for i, c in enumerate(chunks)),
    })

# ──────────────────────────────────────────────────────────────
# Key-term refinement agent  (filters noise, may add missing ones)
# ──────────────────────────────────────────────────────────────
def refine_key_terms(raw_terms: List[str], summary_text: str) -> List[str]:
    """
    Pass the raw TF-IDF terms + the doc summary to an LLM that returns a
    newline-separated list of **only** the relevant study terms. It may add
    obvious missing key concepts.  The output must remain a plain list of words.
    """
    prompt = PromptTemplate.from_template(
        "You are an expert study assistant.\n\n"
        "Here is the current list of extracted key terms (one per line):\n"
        "{terms}\n\n"
        "And here is the document's summary for context:\n"
        "{summary}\n\n"
        "Return a *refined* key-term list (capped at 10 keywords maximum ranked by importance), one term per line, **no numbering**, "
        "removing any irrelevant words (e.g., 'page', 'figure') and adding any "
        "important missing concepts explicitly mentioned in the summary. "
        "Lastly, it very important that your response only contains the terms formatted as requested (one term per line, **no numbering**)."
    )
    response = (prompt | llm | StrOutputParser()).invoke(
        {"terms": "\n".join(raw_terms), "summary": summary_text}
    )
    cleaned = [t.strip() for t in response.splitlines() if t.strip()]
    log.info(f"[REFINE TERMS] in={len(raw_terms)} out={len(cleaned)}")
    return cleaned or raw_terms  # fallback to original if parsing failed



# ──────────────────────────────────────────────────────────────
# -------- Existing utility helpers (unchanged where noted) ---
# ──────────────────────────────────────────────────────────────
def create_embedding(text: str):
    return embedding_model.embed_query(text)


def perform_semantic_search(query_vector, filters=None):
    pipeline = [
        {
            "$vectorSearch": {
                "index": "PlotSemanticSearch",
                "path": "embedding",
                "queryVector": query_vector,
                "numCandidates": 1000,
                "limit": 3,
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


def condense_summary(summary_text: str, user_query: str) -> str:
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

def condense_class_summaries(text: str, user_query: str) -> str:
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




# --------------------------- PROMPT LOADING -----------------------------


def load_prompts():
    prompts_file = Path(__file__).parent / "prompts.json"
    with prompts_file.open("r") as f:
        return json.load(f)


def construct_chain(prompt_template, user_query, chat_history):
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
    Core search / generation pipeline (now includes study-guide flow).
    """
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

    # ---------------- Router initialisation ----------------
    from semantic_router import Route, RouteLayer
    from semantic_router.encoders import OpenAIEncoder

    general_qa = Route(
        name="general_qa",
        utterances=[
            "Define the term 'mitosis'",
            "When did the Civil War start?",
            "Explain the concept of supply and demand",
        ],
    )
    generate_study_guide = Route(
        name="generate_study_guide",
        utterances=[
            "Create a study guide",
            "Generate a study guide",
            "Study guide for this chapter",
        ],
    )
    generate_notes = Route(
        name="generate_notes",
        utterances=[
            "Write notes on",
            "Generate notes for",
        ],
    )
    follow_up = Route(
        name="follow_up",
        utterances=[
            "elaborate more on this",
            "go on",
        ],
    )

    rl = RouteLayer(
        encoder=OpenAIEncoder(),
        routes=[general_qa, generate_study_guide, generate_notes, follow_up],
    )
    route = rl(user_query).name or "general_qa"
    log.info(f"Prompt route: {route}")

    # -------------------- History sanitisation --------------------
    chat_history_cleaned = []
    for c in chat_history:
        item = {
            "role": c["role"],
            "content": escape_curly_braces(c.get("content", "")),
        }
        if "chunkReferences" in c:
            item["chunkReferences"] = c["chunkReferences"]
        chat_history_cleaned.append(item)

    # ──────────────────────────────────────────────────────────────
    # NEW  ➜  DOC-LEVEL STUDY-GUIDE HANDLER
    # ──────────────────────────────────────────────────────────────
    if route == "generate_study_guide":
        if not doc_id or doc_id == "null":
            msg = "Please open a specific document first to generate a study guide."
            chat_history.append({"role": "assistant", "content": msg})
            return {
                "message": msg,
                "citation": [],
                "chats": chat_history,
                "chunks": [],
                "chunkReferences": [],
            }

        # 1) retrieve full text & base chunks
        full_text, all_chunks = fetch_full_doc_text_and_chunks(user_id, doc_id)

        # ── DEBUG 8A ────────────────────────────────────────────────
        log.info(f"[GUIDE] doc={doc_id} | total_tokens≈{est_tokens(full_text)} "
         f"(limit={MAX_CONTEXT_TOKENS}) | base_chunks={len(all_chunks)}")
        # ────────────────────────────────────────────────────────────


        # 2) small vs large doc decision
        if est_tokens(full_text) <= MAX_CONTEXT_TOKENS:
            # —— SMALL DOC PATH ——
            answer = build_small_doc_study_guide(full_text)
            chunk_array = [{
                "_id": all_chunks[0]["_id"] if all_chunks else "N/A",
                "chunkNumber": 1,
                "text": all_chunks[0]["text"] if all_chunks else full_text[:200],
                "pageNumber": all_chunks[0].get("pageNumber") if all_chunks else None,
                "docId": doc_id,
            }]
            citation   = get_file_citation(all_chunks[:1]) if all_chunks else []
            chunk_refs = [{"chunkId": chunk_array[0]["_id"], "displayNumber": 1,
                           "pageNumber": chunk_array[0]["pageNumber"]}]
        else:
            # —— LARGE DOC PATH ——
            doc_meta  = main_collection.find_one({"_id": ObjectId(doc_id)}, {"key_terms": 1})
            key_terms = doc_meta.get("key_terms", []) if doc_meta else []

            # fetch stored summary text for refinement context
            summary_doc = fetch_summary_chunk(user_id, None, doc_id)
            summary_txt = summary_doc["text"] if summary_doc else ""

            if key_terms:
                key_terms = refine_key_terms(key_terms, summary_txt)

            if not key_terms:
                # graceful fallback
                answer, chunk_array, citation, chunk_refs = (
                    build_small_doc_study_guide(full_text[:20_000]),
                    [], [], []
                )
            else:
                term_vecs  = embedding_model.embed_documents(key_terms)
                cands      = [
                    c for v in term_vecs for c in vector_search_for_term(v, doc_id, 2)
                ]
                div_chunks = diversify_by_cluster(cands)
                answer     = build_large_doc_study_guide(key_terms, div_chunks)

                log.info(f"[GUIDE PATH] LARGE | terms={len(key_terms)} | "
                f"diversified_chunks={len(div_chunks)} | answer_chars={len(answer)}")

                chunk_array = [{
                    "_id": str(c["_id"]), "chunkNumber": i+1, "text": c["text"],
                    "pageNumber": c.get("page_number"), "docId": c.get("doc_id"),
                } for i, c in enumerate(div_chunks)]
                citation   = get_file_citation(div_chunks)
                chunk_refs = [{
                    "chunkId": c["_id"], "displayNumber": c["chunkNumber"],
                    "pageNumber": c["pageNumber"]
                } for c in chunk_array]

        chat_history.append(
            {"role": "assistant", "content": answer, "chunkReferences": chunk_refs}
        )
        return {
            "message": answer,
            "citation": citation,
            "chats": chat_history,
            "chunks": chunk_array,
            "chunkReferences": chunk_refs,
        }

    # -------------------- MODE-SPECIFIC PATHS --------------------
    chunk_array = []
    similarity_results = []

    # (existing follow-up reuse)
    if route == "follow_up":
        last_refs = next(
            (m.get("chunkReferences") for m in reversed(chat_history_cleaned) if m["role"] == "assistant"), []
        )
        if last_refs:
            for ref in last_refs:
                chunk_doc = collection.find_one({"_id": ref.get("chunkId")})
                chunk_array.append(
                    {
                        "_id": ref.get("chunkId"),
                        "chunkNumber": ref.get("displayNumber"),
                        "text": chunk_doc.get("text") if chunk_doc else None,
                        "pageNumber": ref.get("pageNumber"),
                        "docId": chunk_doc.get("doc_id") if chunk_doc else None,
                    }
                )
            mode = "follow_up"  # Treat as no new retrieval

    # ----------------------------------------------------------------
    # WHOLE-DOCUMENT SUMMARY MODE
    # ----------------------------------------------------------------
    if mode == "doc_summary":
        summary_doc = fetch_summary_chunk(user_id, class_name, doc_id)
        if not summary_doc:
            log.warning("No stored summary found; falling back to specific search")
            mode = "specific"
        else:
            condensed_text = condense_summary(summary_doc["text"], user_query)
            chunk_array = [{
                "_id": str(summary_doc["_id"]), "chunkNumber": 1,
                "text": summary_doc["text"], "pageNumber": None,
                "docId": summary_doc["doc_id"],
            }]
            citation = get_file_citation([summary_doc])
            chunk_refs = [{"chunkId": chunk_array[0]["_id"], "displayNumber": 1,
                           "pageNumber": None}]
            chat_history.append({
                "role": "assistant", "content": condensed_text, "chunkReferences": chunk_refs
            })
            return {
                "message": condensed_text,
                "citation": citation,
                "chats": chat_history,
                "chunks": chunk_array,
                "chunkReferences": chunk_refs,
            }

    # ----------------------------------------------------------------
    # CLASS-LEVEL SUMMARY MODE
    # ----------------------------------------------------------------
    if mode == "class_summary":
        docs = fetch_class_summaries(user_id, class_name)
        if not docs:
            log.warning("No summaries found for this class; falling back to specific search.")
            mode = "specific"
        else:
            combined = "\n\n---\n\n".join(d["text"] for d in docs)
            condensed_text = condense_class_summaries(combined, user_query)
            chunk_array = [{
                "_id": str(d["_id"]), "chunkNumber": i+1,
                "text": d["text"], "pageNumber": None,
                "docId": d["doc_id"],
            } for i, d in enumerate(docs)]
            citation = get_file_citation(docs)
            chunk_refs = [{
                "chunkId": c["_id"], "displayNumber": c["chunkNumber"],
                "pageNumber": None} for c in chunk_array]
            chat_history.append({
                "role": "assistant", "content": condensed_text,
                "chunkReferences": chunk_refs
            })
            return {
                "message": condensed_text,
                "citation": citation,
                "chats": chat_history,
                "chunks": chunk_array,
                "chunkReferences": chunk_refs,
            }

    # -------------------- PROMPT SELECTION (unchanged) --------------------
    prompts = load_prompts()
    base_prompt = prompts.get("chrome_extension") if source == "chrome_extension" else prompts.get(route)
    if not base_prompt:
        raise ValueError(f"Prompt for route '{route}' not found in prompts.json")

    referencing_instruction = (
        "Whenever you use content from a given chunk in your final answer, "
        "place a bracketed reference [1], [2], [3], etc. at the end of the relevant sentence.\n\n"
        "Please format your answer using Markdown."
    )
    enhanced_prompt = referencing_instruction + base_prompt

    # Build context from chunk_array
    context = "\n\n".join(f"Chunk {idx+1}: {c['text']}" for idx, c in enumerate(chunk_array)) if chunk_array else ""
    formatted_prompt = PromptTemplate.from_template(enhanced_prompt).format(
        context=escape_curly_braces(context)
    )

    # -------------------- FINAL GENERATION --------------------
    prompt_template = ChatPromptTemplate.from_messages(
        [("system", formatted_prompt), MessagesPlaceholder("chat_history"), ("user", "{input}")]
    )
    answer = construct_chain(prompt_template, user_query, chat_history_cleaned)

    # Citations & references
    citation = get_file_citation(similarity_results)
    chunk_refs = [
        {"chunkId": item["_id"], "displayNumber": item["chunkNumber"],
         "pageNumber": item.get("pageNumber")}
        for item in chunk_array
    ]

    # Append assistant turn to history
    chat_history.append(
        {"role": "assistant", "content": answer, "chunkReferences": chunk_refs}
    )

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
        log.debug(json.dumps(result))
    except Exception as e:
        log.error(f"Error: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log.error(f"Error: {str(e)}")
        sys.exit(1)
