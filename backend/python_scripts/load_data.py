import os
import uuid
import argparse
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

load_dotenv()

# Initialize constants
CONNECTION_STRING = os.getenv('MONGO_CONNECTION_STRING')
DB_NAME = "study_buddy_demo"
COLLECTION_NAME = "study_materials2"  # chunk storage
MAIN_FILE_COLLECTION_NAME = "documents"  # main file metadata
MAIN_FILE_DB_NAME = "test"  # your DB name for 'documents' collection

# Initialize Mongo
client = MongoClient(CONNECTION_STRING)
collection = client[DB_NAME][COLLECTION_NAME]
main_collection = client[MAIN_FILE_DB_NAME][MAIN_FILE_COLLECTION_NAME]

# Initialize S3 client
s3_client = boto3.client(
    's3',
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY'),
    aws_secret_access_key=os.getenv('AWS_SECRET'),
    region_name=os.getenv('AWS_REGION')
)

# Initialize LLM for summarization
openai_api_key = os.getenv('OPENAI_API_KEY')
llm = ChatOpenAI(model="gpt-3.5-turbo-0125", temperature=0)

def summarize_document(text_input):
    """Generate a summary for the given text input using an LLM."""
    prompt_text = (
        "Given the document provided in the context variable, create a compressed version that maintains all "
        "of the important context, terms, definitions, and necessary information... | response:"
    )
    prompt = PromptTemplate.from_template(prompt_text)
    parser = StrOutputParser()
    chain = prompt | llm | parser
    response = chain.invoke({"text": text_input})
    return response

def process_markdown_with_page_numbers(pdf_stream, user_id, class_id, doc_id, file_name):
    """
    Same logic as before; iterates over each page,
    extracts markdown text, does chunking, etc.
    """
    doc = pymupdf.open(stream=pdf_stream, filetype="pdf")
    num_pages = len(doc)

    headers_to_split_on = [
        ("#", "Level 1 Heading"),
        ("##", "Level 2 Heading"),
        ("###", "Level 3 Heading"),
        ("####", "Level 4 Heading"),
        ("#####", "Level 5 Heading"),
        ("######", "Level 6 Heading"),
    ]
    markdown_splitter = MarkdownHeaderTextSplitter(headers_to_split_on)
    semantic_splitter = SemanticChunker(OpenAIEmbeddings(), breakpoint_threshold_type="standard_deviation")

    all_chunks = []

    pdf_meta = doc.metadata
    title = pdf_meta.get('title', 'Unknown') if pdf_meta else 'Unknown'
    author = pdf_meta.get('author', 'Unknown') if pdf_meta else 'Unknown'

    for page_index in range(num_pages):
        page_obj = doc.load_page(page_index)
        page_md = page_obj.get_text("markdown")

        if not page_md.strip():
            continue

        documents = markdown_splitter.split_text(page_md)
        if not documents:
            fallback_splitter = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=200)
            documents = fallback_splitter.create_documents(page_md)

        for doc_chunk in documents:
            chunk_text = doc_chunk.page_content.strip()
            if not chunk_text:
                continue

            if len(chunk_text) > 1000:
                sub_chunks = semantic_splitter.split_text(chunk_text)
                for sub in sub_chunks:
                    chunk_metadata = {
                        "file_name": file_name,
                        "title": title,
                        "author": author,
                        "user_id": user_id,
                        "class_id": class_id,
                        "doc_id": doc_id,
                        "is_summary": False,
                        "page_number": page_index + 1
                    }
                    all_chunks.append({
                        "text": sub,
                        "metadata": chunk_metadata
                    })
            else:
                chunk_metadata = {
                    "file_name": file_name,
                    "title": title,
                    "author": author,
                    "user_id": user_id,
                    "class_id": class_id,
                    "doc_id": doc_id,
                    "is_summary": False,
                    "page_number": page_index + 1
                }
                all_chunks.append({
                    "text": chunk_text,
                    "metadata": chunk_metadata
                })

    return all_chunks

def store_embeddings(chunks):
    """Generate embeddings for the chunks and store them in MongoDB."""
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    texts = [chunk['text'] for chunk in chunks]
    metadatas = [chunk['metadata'] for chunk in chunks]
    MongoDBAtlasVectorSearch.from_texts(texts, embeddings, collection=collection, metadatas=metadatas)

def load_pdf_data(user_id: str, class_name: str, s3_key: str, doc_id: str):
    """
    This function is called by FastAPI. 
    1) Fetch PDF from S3
    2) Chunk & embed
    3) Flip isProcessing = false when done
    """

    try:
        response = s3_client.get_object(Bucket=os.getenv('AWS_S3_BUCKET_NAME'), Key=s3_key)
    except Exception as e:
        print(f"Error downloading {s3_key} from S3: {e}", file=sys.stderr)
        return

    if response['ContentLength'] == 0:
        print(f"File {s3_key} in S3 is empty.", file=sys.stderr)
        return

    pdf_stream = BytesIO(response['Body'].read())
    pdf_stream.seek(0)

    # The doc in main_collection
    document = main_collection.find_one({"_id": ObjectId(doc_id)})
    if not document:
        print(f"No document with _id={doc_id}", file=sys.stderr)
        return

    file_name = os.path.basename(s3_key)
    chunks = process_markdown_with_page_numbers(pdf_stream, user_id, class_name, doc_id, file_name)

    # Store embeddings
    store_embeddings(chunks)

    # Mark isProcessing = false
    try:
        main_collection.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {"isProcessing": False}}
        )
    except Exception as update_err:
        print(f"Error updating isProcessing for doc {doc_id}: {update_err}", file=sys.stderr)

    print(f"Processed and stored embeddings for doc {doc_id} successfully.")

    # You can close the client if you like, though in FastAPI you typically keep the global client open:
    # client.close()

# (Optional) keep the "main" or argparse for local dev
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--user_id', required=True)
    parser.add_argument('--class_name', required=True)
    parser.add_argument('--s3_key', required=True)
    parser.add_argument('--doc_id', required=True)
    args = parser.parse_args()

    load_pdf_data(args.user_id, args.class_name, args.s3_key, args.doc_id)
