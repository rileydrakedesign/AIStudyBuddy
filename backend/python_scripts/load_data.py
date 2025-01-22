#!/usr/bin/env python3
import os
import uuid
import argparse
from pymongo import MongoClient
from dotenv import load_dotenv
from PyPDF2 import PdfReader
from io import BytesIO
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_openai import ChatOpenAI
from langchain_mongodb import MongoDBAtlasVectorSearch
from langchain_core.output_parsers import StrOutputParser
from langchain.prompts import PromptTemplate
import boto3
import sys
from bson import ObjectId
import pymupdf4llm
from langchain_text_splitters import MarkdownHeaderTextSplitter
from langchain_experimental.text_splitter import SemanticChunker
import pymupdf

load_dotenv()

# Initialize MongoDB client and collection
connection_string = os.getenv('MONGO_CONNECTION_STRING')
client = MongoClient(connection_string)
db_name = "study_buddy_demo"
collection_name = "study_materials2"
collection = client[db_name][collection_name]

# The collection storing file metadata
main_file_collection_name = "documents"
main_file_db_name = "test"
main_collection = client[main_file_db_name][main_file_collection_name]

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
        "Given the document provided in the context variable, create a compressed version that maintains all of the important context, terms, definitions, "
        "and necessary information encapsulated by the original document. The response should be a comprehensive summary that outlines the important information "
        "in the document in detail. Ensure that the summary includes all terms and definitions in or close to their entirety, preserving the original meanings and context. "
        "Do not summarize what the document is about; instead, summarize the actual contents, ensuring all critical information is included. The output should be no more than 1500 words "
        "and should only contain the summary with no other sentences. context: {text} | response:"
    )
    prompt = PromptTemplate.from_template(prompt_text)
    parser = StrOutputParser()
    chain = prompt | llm | parser
    response = chain.invoke({"text": text_input})
    return response

def process_markdown_with_page_numbers(pdf_stream, user_id, class_id, doc_id, file_name):
    """
    Process the PDF one page at a time, extracting a markdown-like string
    from each page with page_obj.get_text("markdown"). Then split into chunks
    by headings and store the page_number in each chunk's metadata.
    """

    # Open the PDF with PyMuPDF
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

    # If a chunk is too large, we split further with a semantic approach
    semantic_splitter = SemanticChunker(
        OpenAIEmbeddings(),
        breakpoint_threshold_type="standard_deviation"
    )

    all_chunks = []

    # Retrieve PDF metadata if available
    pdf_meta = doc.metadata
    title = pdf_meta.get('title', 'Unknown') if pdf_meta else 'Unknown'
    author = pdf_meta.get('author', 'Unknown') if pdf_meta else 'Unknown'

    # Iterate over each page
    for page_index in range(num_pages):
        page_obj = doc.load_page(page_index)
        # Extract "markdown" text directly from the page
        page_md = page_obj.get_text("markdown")

        if not page_md.strip():
            # Page is empty or has no recognizable text
            continue

        # Split the page's markdown by headings
        documents = markdown_splitter.split_text(page_md)
        if not documents:
            # If no headings found, fall back to a simpler text splitter
            fallback_splitter = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=200)
            documents = fallback_splitter.create_documents(page_md)

        # For each "document" in this page
        for doc_chunk in documents:
            chunk_text = doc_chunk.page_content.strip()
            if not chunk_text:
                continue

            # If still large, use the semantic splitter
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
                        "page_number": page_index + 1  # Store page
                    }
                    all_chunks.append({
                        "text": sub,
                        "metadata": chunk_metadata
                    })
            else:
                # Otherwise, keep as is
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



def store_embeddings(chunks, collection):
    """Generate embeddings for the chunks and store them in MongoDB."""
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    texts = [chunk['text'] for chunk in chunks]
    metadatas = [chunk['metadata'] for chunk in chunks]

    # Insert them via the MongoDBAtlasVectorSearch from langchain
    MongoDBAtlasVectorSearch.from_texts(texts, embeddings, collection=collection, metadatas=metadatas)

def main():
    """Process command-line arguments and process the PDF, storing page-numbered chunks."""
    parser = argparse.ArgumentParser(description='Process a PDF file and store embeddings.')
    parser.add_argument('--user_id', required=True, help='User ID')
    parser.add_argument('--class_name', required=True, help='Class Name')
    parser.add_argument('--s3_key', required=True, help='S3 Key of the PDF file')
    parser.add_argument('--doc_id', required=True, help='MongoDB Document ID')
    args = parser.parse_args()

    user_id = args.user_id
    class_name = args.class_name
    s3_key = args.s3_key
    doc_id = args.doc_id

    # Fetch the PDF file from S3
    try:
        print(f"Attempting to download file from S3 with key: {s3_key}")
        response = s3_client.get_object(Bucket=os.getenv('AWS_S3_BUCKET_NAME'), Key=s3_key)

        # Print response metadata to verify file retrieval
        print(f"S3 Object Metadata: {response.get('Metadata', {})}")
        print(f"S3 Object Content Length: {response['ContentLength']} bytes")
    
        if response['ContentLength'] == 0:
            raise ValueError(f"The file {s3_key} in S3 is empty.")

        pdf_stream = BytesIO(response['Body'].read())
        pdf_stream.seek(0)  # Reset stream to the beginning

        print(f'Downloaded {s3_key} from S3 successfully.')
    except Exception as e:
        print(f'Error downloading {s3_key} from S3: {e}', file=sys.stderr)
        sys.exit(1)

    # Extract a local "file name" from s3_key
    file_name = os.path.basename(s3_key)

    # Retrieve the corresponding Document from MongoDB
    document = main_collection.find_one({'_id': ObjectId(doc_id)})
    if not document:
        print('No document found in MongoDB with specified ID.', file=sys.stderr)
        sys.exit(1)

    # 1) Convert the PDF to markdown, chunk by page, so we have page_number
    chunks = process_markdown_with_page_numbers(pdf_stream, user_id, class_name, doc_id, file_name)


    # 2) Store embeddings
    store_embeddings(chunks, collection)

    print(f'Processed and stored embeddings for {s3_key} successfully.')

    # Close MongoDB connection
    client.close()

if __name__ == '__main__':
    main()
