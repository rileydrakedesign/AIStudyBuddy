import os
import argparse
import re
from io import BytesIO
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
import boto3
import pymupdf
from logger_setup import log

load_dotenv()

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS & CLIENTS
# ─────────────────────────────────────────────────────────────────────────────
CONNECTION_STRING = os.getenv("MONGO_CONNECTION_STRING")

DB_NAME = "study_buddy_demo"
COLLECTION_NAME = "study_materials2"       # chunk storage
MAIN_FILE_DB_NAME = "test"
MAIN_FILE_COLLECTION_NAME = "documents"    # main-file metadata

client = MongoClient(CONNECTION_STRING)
collection = client[DB_NAME][COLLECTION_NAME]
main_collection = client[MAIN_FILE_DB_NAME][MAIN_FILE_COLLECTION_NAME]

s3_client = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY"),
    aws_secret_access_key=os.getenv("AWS_SECRET"),
    region_name=os.getenv("AWS_REGION"),
)

# Summariser: GPT-4.1-mini (1 M-token window)
llm = ChatOpenAI(model="gpt-4.1-mini", temperature=0)

# ─────────────────────────────────────────────────────────────────────────────
# UTILITIES
# ─────────────────────────────────────────────────────────────────────────────
def summarize_document(text_input: str) -> str:
    """
    One-shot summary of an entire document using GPT-4.1-mini.
    """
    prompt_text = (
        "You are an expert study assistant.\n\n"
        "Document below delimited by <doc></doc> tags.\n\n"
        "<doc>\n{context}\n</doc>\n\n"
        "Write a concise yet comprehensive summary capturing all key ideas, "
        "definitions and results. Limit to ~3-5 paragraphs."
    )
    prompt = PromptTemplate.from_template(prompt_text)
    parser = StrOutputParser()
    chain = prompt | llm | parser
    return chain.invoke({"context": text_input})


CHAPTER_RE = re.compile(r"^\s*#+\s*Chapter\s+(\d+)\b", re.I)  # “# Chapter 3” etc.


def process_markdown_with_page_numbers(pdf_stream, user_id, class_id, doc_id, file_name):
    """
    Extract markdown from each page, split into semantic chunks,
    and attach metadata including chapter indices.
    """
    doc = pymupdf.open(stream=pdf_stream, filetype="pdf")
    num_pages = len(doc)
    current_chapter = None

    headers = [
        ("#", "H1"),
        ("##", "H2"),
        ("###", "H3"),
        ("####", "H4"),
        ("#####", "H5"),
        ("######", "H6"),
    ]
    md_splitter = MarkdownHeaderTextSplitter(headers)
    semantic_splitter = SemanticChunker(
        OpenAIEmbeddings(), breakpoint_threshold_type="standard_deviation"
    )

    meta = doc.metadata or {}
    title = meta.get("title", "Unknown")
    author = meta.get("author", "Unknown")

    all_chunks = []

    for page_idx in range(num_pages):
        page_md = doc.load_page(page_idx).get_text("markdown")
        if not page_md.strip():
            continue

        # Detect chapter on this page
        for ln in page_md.splitlines():
            m = CHAPTER_RE.match(ln)
            if m:
                current_chapter = int(m.group(1))
                break

        # Split markdown
        documents = md_splitter.split_text(page_md) or RecursiveCharacterTextSplitter(
            chunk_size=1500, chunk_overlap=200
        ).create_documents(page_md)

        for d in documents:
            chunk_text = d.page_content.strip()
            if not chunk_text:
                continue

            sub_texts = (
                semantic_splitter.split_text(chunk_text)
                if len(chunk_text) > 1000
                else [chunk_text]
            )

            for sub in sub_texts:
                all_chunks.append(
                    {
                        "text": sub,
                        "metadata": {
                            "file_name": file_name,
                            "title": title,
                            "author": author,
                            "user_id": user_id,
                            "class_id": class_id,
                            "doc_id": doc_id,
                            "is_summary": False,
                            "page_number": page_idx + 1,
                            "chapter_idx": current_chapter,
                        },
                    }
                )

    return all_chunks


def store_embeddings(chunks):
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    texts = [c["text"] for c in chunks]
    metadatas = [c["metadata"] for c in chunks]
    MongoDBAtlasVectorSearch.from_texts(
        texts, embeddings, collection=collection, metadatas=metadatas
    )


def load_pdf_data(user_id: str, class_name: str, s3_key: str, doc_id: str):
    """
    Main entry point—called by FastAPI.
    """
    try:
        res = s3_client.get_object(
            Bucket=os.getenv("AWS_S3_BUCKET_NAME"), Key=s3_key
        )
    except Exception:
        log.error(f"Error downloading {s3_key} from S3", exc_info=True)
        return
    if res["ContentLength"] == 0:
        log.warning(f"S3 file {s3_key} is empty")
        return

    pdf_stream = BytesIO(res["Body"].read())
    pdf_stream.seek(0)

    if not main_collection.find_one({"_id": ObjectId(doc_id)}):
        log.error(f"No document with _id={doc_id}")
        return

    file_name = os.path.basename(s3_key)
    chunks = process_markdown_with_page_numbers(
        pdf_stream, user_id, class_name, doc_id, file_name
    )

    # ── Full-doc summary (GPT-4.1-mini) ────────────────────────────────────
    full_doc_text = " ".join(c["text"] for c in chunks)
    MAX_CTX_TOKENS = 950_000                  # leave 50k for prompt/answer
    est_tokens = len(full_doc_text) // 4      # ≈4 chars ≈1 token

    if est_tokens > MAX_CTX_TOKENS:
        log.warning(
            f"Doc {doc_id} too large for single-shot summary "
            f"({est_tokens} > {MAX_CTX_TOKENS} tokens); skipping abstract."
        )
    else:
        try:
            summary_text = summarize_document(full_doc_text)
            chunks.append(
                {
                    "text": summary_text,
                    "metadata": {
                        "file_name": file_name,
                        "title": chunks[0]["metadata"]["title"] if chunks else file_name,
                        "author": chunks[0]["metadata"]["author"] if chunks else "Unknown",
                        "user_id": user_id,
                        "class_id": class_name,
                        "doc_id": doc_id,
                        "is_summary": True,
                        "page_number": None,
                        "chapter_idx": None,
                    },
                }
            )
        except Exception as e:
            log.error(f"Summary generation failed for {doc_id}: {e}")

    # ── Store embeddings (summary included if present) ────────────────────
    store_embeddings(chunks)

    try:
        main_collection.update_one(
            {"_id": ObjectId(doc_id)}, {"$set": {"isProcessing": False}}
        )
        log.info("set isProcessing False", doc_id)
    except Exception as e:
        log.error(f"Error updating isProcessing for doc {doc_id}: {e}")

    log.info(f"Processed and stored embeddings for doc {doc_id}.")


# ---------------------------------------------------------------------------
# CLI for local testing
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--user_id", required=True)
    p.add_argument("--class_name", required=True)
    p.add_argument("--s3_key", required=True)
    p.add_argument("--doc_id", required=True)
    args = p.parse_args()

    load_pdf_data(args.user_id, args.class_name, args.s3_key, args.doc_id)
