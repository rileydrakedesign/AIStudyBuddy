import os
import uuid
import argparse
import re
from pymongo import MongoClient
from dotenv import load_dotenv
from PyPDF2 import PdfReader
from io import BytesIO
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_mongodb import MongoDBAtlasVectorSearch
from langchain_core.output_parsers import StrOutputParser
from langchain.prompts import PromptTemplate
import boto3
import sys
from bson import ObjectId
import pymupdf
from langchain_text_splitters import MarkdownHeaderTextSplitter
from langchain_experimental.text_splitter import SemanticChunker
from logger_setup import log

load_dotenv()

# ──────────────────────────────────────────────────────────────────────────────
# CONSTANTS & CLIENTS
# ──────────────────────────────────────────────────────────────────────────────
CONNECTION_STRING = os.getenv('MONGO_CONNECTION_STRING')
DB_NAME = "study_buddy_demo"
COLLECTION_NAME = "study_materials2"        # chunk storage
MAIN_FILE_COLLECTION_NAME = "documents"     # main-file metadata
MAIN_FILE_DB_NAME = "test"

client          = MongoClient(CONNECTION_STRING)
collection      = client[DB_NAME][COLLECTION_NAME]
main_collection = client[MAIN_FILE_DB_NAME][MAIN_FILE_COLLECTION_NAME]

s3_client = boto3.client(
    's3',
    aws_access_key_id     = os.getenv('AWS_ACCESS_KEY'),
    aws_secret_access_key = os.getenv('AWS_SECRET'),
    region_name           = os.getenv('AWS_REGION')
)

openai_api_key = os.getenv('OPENAI_API_KEY')
llm            = ChatOpenAI(model="gpt-4.1-mini", temperature=0)

# ──────────────────────────────────────────────────────────────────────────────
# UTILS
# ──────────────────────────────────────────────────────────────────────────────
def summarize_document(text_input: str) -> str:
    prompt_text = (
        "Given the document provided in the context variable, create a compressed version "
        "that maintains all of the important context, terms, definitions, and necessary "
        "information... | response:"
    )
    prompt  = PromptTemplate.from_template(prompt_text)
    parser  = StrOutputParser()
    chain   = prompt | llm | parser
    return chain.invoke({"text": text_input})


CHAPTER_RE = re.compile(r"^\s*#+\s*Chapter\s+(\d+)\b", re.I)   # e.g. “# Chapter 3”

def process_markdown_with_page_numbers(pdf_stream, user_id, class_id, doc_id, file_name):
    """
    Extract pages → markdown → chunks.
    Adds `chapter_idx` metadata when a “Chapter N” heading is encountered.
    """
    doc        = pymupdf.open(stream=pdf_stream, filetype="pdf")
    num_pages  = len(doc)
    current_chapter = None

    headers_to_split_on = [
        ("#",     "Level 1 Heading"),
        ("##",    "Level 2 Heading"),
        ("###",   "Level 3 Heading"),
        ("####",  "Level 4 Heading"),
        ("#####", "Level 5 Heading"),
        ("######","Level 6 Heading"),
    ]
    markdown_splitter  = MarkdownHeaderTextSplitter(headers_to_split_on)
    semantic_splitter  = SemanticChunker(OpenAIEmbeddings(), breakpoint_threshold_type="standard_deviation")

    pdf_meta = doc.metadata or {}
    title    = pdf_meta.get('title',  'Unknown')
    author   = pdf_meta.get('author', 'Unknown')

    all_chunks = []

    for page_index in range(num_pages):
        page_obj  = doc.load_page(page_index)
        page_md   = page_obj.get_text("markdown")
        if not page_md.strip():
            continue

        # ── Detect chapter head on *this* page ───────────────────────────────
        for ln in page_md.splitlines():
            m = CHAPTER_RE.match(ln)
            if m:
                current_chapter = int(m.group(1))
                break

        # ── Chunk the page markdown ─────────────────────────────────────────
        documents = markdown_splitter.split_text(page_md) or \
                    RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=200).create_documents(page_md)

        for doc_chunk in documents:
            chunk_text = doc_chunk.page_content.strip()
            if not chunk_text:
                continue

            target_texts = (
                semantic_splitter.split_text(chunk_text)
                if len(chunk_text) > 1000 else
                [chunk_text]
            )

            for sub in target_texts:
                chunk_metadata = {
                    "file_name"  : file_name,
                    "title"      : title,
                    "author"     : author,
                    "user_id"    : user_id,
                    "class_id"   : class_id,
                    "doc_id"     : doc_id,
                    "is_summary" : False,
                    "page_number": page_index + 1,
                    "chapter_idx": current_chapter       # ← NEW
                }
                all_chunks.append({"text": sub, "metadata": chunk_metadata})

    return all_chunks


def store_embeddings(chunks):
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    texts      = [c['text'] for c in chunks]
    metadatas  = [c['metadata'] for c in chunks]
    MongoDBAtlasVectorSearch.from_texts(texts, embeddings, collection=collection, metadatas=metadatas)


def load_pdf_data(user_id: str, class_name: str, s3_key: str, doc_id: str):
    """
    1) Fetch PDF from S3  → 2) chunk & embed  → 3) flip isProcessing=False.
    """
    try:
        response = s3_client.get_object(Bucket=os.getenv('AWS_S3_BUCKET_NAME'), Key=s3_key)
    except Exception:
        log.error(f"Error downloading {s3_key} from S3", exc_info=True)
        return

    if response['ContentLength'] == 0:
        log.warning(f"S3 file {s3_key} is empty")
        return

    pdf_stream = BytesIO(response['Body'].read())
    pdf_stream.seek(0)

    document = main_collection.find_one({"_id": ObjectId(doc_id)})
    if not document:
        log.error(f"No document with _id={doc_id}")
        return

    file_name = os.path.basename(s3_key)
    chunks    = process_markdown_with_page_numbers(pdf_stream, user_id, class_name, doc_id, file_name)

    # ── Build full-document input for GPT-4.1-mini ─────────────────────────────
    full_doc_text = " ".join(c["text"] for c in chunks)     # no upfront cut

    # GPT-4.1-mini: 1 000 000-token window → keep ~50 k for prompt + answer
    MAX_CTX_TOKENS = 950_000                     # safe input budget
    est_tokens     = len(full_doc_text) // 4     # ≈4 chars per token

    if est_tokens > MAX_CTX_TOKENS:
        log.warning(
            f"Doc {doc_id} too large for single-shot summary with GPT-4.1-mini "
            f"({est_tokens} tokens > {MAX_CTX_TOKENS}); skipping abstract chunk."
        )
    else:
        try:
            summary_text  = summarize_document(full_doc_text)
            summary_chunk = {
                "text": summary_text,
                "metadata": {
                    "file_name"  : file_name,
                    "title"      : chunks[0]["metadata"]["title"] if chunks else file_name,
                    "author"     : chunks[0]["metadata"]["author"] if chunks else "Unknown",
                    "user_id"    : user_id,
                    "class_id"   : class_name,
                    "doc_id"     : doc_id,
                    "is_summary" : True,      # semantic_search relies on this
                    "page_number": None,
                    "chapter_idx": None
                }
            }
            chunks.append(summary_chunk)
        except Exception as e:
            log.error(f"Summary generation failed for {doc_id}: {e}")

    # embed everything (summary included if it was created)
    store_embeddings(chunks)

    try:
        main_collection.update_one({"_id": ObjectId(doc_id)}, {"$set": {"isProcessing": False}})
        log.info("set isProcessing False", doc_id)
    except Exception as update_err:
        log.error(f"Error updating isProcessing for doc {doc_id}: {update_err}")

    log.info(f"Processed and stored embeddings for doc {doc_id}.")


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--user_id',     required=True)
    p.add_argument('--class_name',  required=True)
    p.add_argument('--s3_key',      required=True)
    p.add_argument('--doc_id',      required=True)
    a = p.parse_args()
    load_pdf_data(a.user_id, a.class_name, a.s3_key, a.doc_id)
