import os
import re                # NEW – for chapter / summary detection
import json
import sys
from pathlib import Path
from typing import List, Tuple

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

embedding_model = OpenAIEmbeddings(model="text-embedding-3-small")
llm = ChatOpenAI(model="gpt-3.5-turbo-0125", temperature=0.5)

backend_url = os.getenv("BACKEND_URL", "https://localhost:3000/api/v1")

# ──────────────────────────────────────────────────────────────
# ────────────────  NEW MODE-DETECTION HELPERS  ───────────────
# ──────────────────────────────────────────────────────────────
SUMMARY_RE = re.compile(r"\bsummar(?:y|ize|ise)\b", re.I)  # summary keyword


def extract_chapters(query: str) -> List[int]:
    """
    Parse chapter numbers from the user query.
    Supports:
      • “chapter 3”                    → [3]
      • “chapters 3, 5, 7”             → [3,5,7]
      • “chapters 2-4”                 → [2,3,4]
    """
    chapters = set()

    # range: “chapters 2-5”
    for m in re.finditer(r"chapters?\s+(\d+)\s*-\s*(\d+)", query, re.I):
        start, end = int(m.group(1)), int(m.group(2))
        chapters.update(range(min(start, end), max(start, end) + 1))

    # comma-separated list: “chapters 2, 4, 6”
    for m in re.finditer(r"chapters?\s+((?:\d+\s*,\s*)+\d+)", query, re.I):
        nums = [int(n.strip()) for n in m.group(1).split(",")]
        chapters.update(nums)

    # single: “chapter 3”
    for m in re.finditer(r"chapter\s+(\d+)", query, re.I):
        chapters.add(int(m.group(1)))

    return sorted(chapters)


def detect_query_mode(query: str) -> Tuple[str, List[int]]:
    """
    Decide between four modes:
        • specific        – default top-K search
        • scope-question  – top-K restricted to selected chapters
        • scope-summary   – summarise selected chapters
        • full            – whole-document summary
    Returns (mode, chapter_idx_list).
    """
    chapters = extract_chapters(query)
    wants_summary = bool(SUMMARY_RE.search(query))

    if wants_summary:
        if chapters:
            return "scope-summary", chapters
        return "full", []

    if chapters:
        return "scope-question", chapters

    return "specific", []


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
    Core search / generation pipeline with new query-mode handling.
    """
    # 0) Detect mode + chapters
    mode, chap_list = detect_query_mode(user_query)
    log.debug(f"Mode: {mode}, Chapters: {chap_list}")

    # Existing router (kept intact for prompt selection)
    from semantic_router import Route, RouteLayer
    from semantic_router.encoders import OpenAIEncoder

    # --- Router definition (unchanged) ---
    general_qa = Route(
        name="general_qa",
        utterances=[
            "Define the term 'mitosis'",
            "When did the Civil War start?",
            "What is the theory of relativity?",
            "Explain the concept of supply and demand",
            "Who discovered penicillin?",
            "How does photosynthesis work?",
        ],
    )
    generate_study_guide = Route(
        name="generate_study_guide",
        utterances=[
            "Create a study guide for biology",
            "Generate a study guide on World War II",
            "Make a study guide for my chemistry class",
            "Study guide for this chapter on genetics",
            "Prepare a study guide for algebra",
        ],
    )
    generate_notes = Route(
        name="generate_notes",
        utterances=[
            "Write notes on the French Revolution",
            "Generate notes for my physics lecture",
            "Take notes for this chapter on cell biology",
            "Notes for this topic on climate change",
            "Summarize notes for my economics class",
        ],
    )
    follow_up = Route(
        name="follow_up",
        utterances=[
            "elaborate more on this",
            "tell me more about that",
            "expand on that",
            "what do you mean by that",
            "explain that again",
            "what was that again",
            "go on",
        ],
    )
    rl = RouteLayer(encoder=OpenAIEncoder(), routes=[general_qa, generate_study_guide, generate_notes, follow_up])
    route = rl(user_query).name or "general_qa"
    log.debug(f"Prompt route: {route}")

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

    # -------------------- MODE-SPECIFIC PATHS --------------------
    chunk_array = []
    similarity_results = []

    # Reuse previous chunks for follow-up
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
    if mode == "full":
        # Retrieve pre-computed summary chunk
        summary_doc = fetch_summary_chunk(user_id, class_name, doc_id)
        if not summary_doc:
            log.warning("No stored summary found; falling back to specific search")
            mode = "specific"
        else:
            chunk_array.append(
                {
                    "_id": str(summary_doc["_id"]),
                    "chunkNumber": 1,
                    "text": summary_doc["text"],
                    "pageNumber": None,
                    "docId": summary_doc["doc_id"],
                }
            )
            similarity_results = [summary_doc]

    if mode == "scope-summary":
        chap_text, chunk_array = fetch_chapter_text(user_id, class_name, doc_id, chap_list)
        if not chap_text:
            log.warning("Requested chapters not found; falling back to specific search")
            mode = "specific"
        else:
            # One-shot summarisation of concatenated chapters
            sum_template = PromptTemplate.from_template(
                "You are an expert study assistant.\n\nBelow is material from chapters {chapters} "
                "delimited by <doc> </doc> tags.\n<doc>\n{context}\n</doc>\n\n"
                "Write a clear, concise summary capturing all key concepts, definitions, and results. "
                "Limit to 3–5 paragraphs."
            )
            summary_text = (sum_template | llm | StrOutputParser()).invoke(
                {"chapters": ", ".join(map(str, chap_list)), "context": chap_text}
            )
            # Treat summary_text as the answer; no further prompt formatting needed
            citation = get_file_citation(chunk_array)
            chunk_refs = [
                {"chunkId": item["_id"], "displayNumber": item["chunkNumber"], "pageNumber": item.get("pageNumber")}
                for item in chunk_array
            ]
            chat_history.append(
                {"role": "assistant", "content": summary_text, "chunkReferences": chunk_refs}
            )
            return {
                "message": summary_text,
                "citation": citation,
                "chats": chat_history,
                "chunks": chunk_array,
                "chunkReferences": chunk_refs,
            }

    # ----------------------------------------------------------------
    if mode in ("specific", "scope-question"):
        # 1) Rephrase query for retrieval
        reprompt = PromptTemplate.from_template(
            "You are an assistant tasked with taking a natural language query from a user "
            "and converting it into a query for a vectorstore. Strip out all irrelevant detail. "
            "Return ONLY the refined query.\n\nuser query: {input}"
        )
        semantic_query = construct_chain(reprompt, user_query, chat_history_cleaned)
        query_vector = create_embedding(semantic_query)

        # 2) Build base filters
        filters = {"user_id": {"$eq": user_id}}
        if doc_id != "null":
            filters["doc_id"] = {"$eq": doc_id}
        elif class_name and class_name != "null":
            filters["class_id"] = {"$eq": class_name}

        # Add chapter filter for scope-question
        if mode == "scope-question" and chap_list:
            filters["chapter_idx"] = {"$in": chap_list}
        log.debug(f"VectorSearch filters: {filters}")

        # 3) Vector search
        similarity_results = list(perform_semantic_search(query_vector, filters))
        filtered_results = [d for d in similarity_results if d["score"] > 0.35]

        for idx, doc in enumerate(filtered_results):
            chunk_array.append(
                {
                    "_id": str(doc["_id"]),
                    "chunkNumber": idx + 1,
                    "text": doc["text"],
                    "pageNumber": doc.get("page_number"),
                    "docId": doc.get("doc_id"),
                }
            )

    # -------------------- PROMPT SELECTION --------------------
    prompts = load_prompts()
    if source == "chrome_extension":
        base_prompt = prompts.get("chrome_extension")
    else:
        base_prompt = prompts.get(route)
    if not base_prompt:
        raise ValueError(f"Prompt for route '{route}' not found in prompts.json")

    referencing_instruction = (
        "Whenever you use content from a given chunk in your final answer, "
        "place a bracketed reference [1], [2], [3], etc. at the end of the relevant sentence.\n\n"
        "Please format your answer using Markdown. Write all mathematical expressions in LaTeX using '$' for "
        "inline math and '$$' for display math. Ensure code is in triple backticks.\n\n"
    )
    enhanced_prompt = referencing_instruction + base_prompt

    # Build context from chunk_array
    context = (
        "\n\n".join(f"Chunk {idx+1}: {c['text']}" for idx, c in enumerate(chunk_array))
        if chunk_array
        else ""
    )
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
        {"chunkId": item["_id"], "displayNumber": item["chunkNumber"], "pageNumber": item.get("pageNumber")}
        for item in chunk_array
    ]

    # Append assistant turn to history for future follow-ups
    chat_history.append({"role": "assistant", "content": answer, "chunkReferences": chunk_refs})

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
