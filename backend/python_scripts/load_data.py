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



# Load environment variables
load_dotenv()

# Initialize MongoDB client and collection
connection_string = os.getenv('MONGO_CONNECTION_STRING')
client = MongoClient(connection_string)
db_name = "study_buddy_demo"
collection_name = "study_materials2"
collection = client[db_name][collection_name]

# Delete all documents in the collection
#collection.delete_many({})

#initialize collection that file meta is stored in
main_file_collection_name = "documents"
main_file_db_name = "test"
main_collection = client[main_file_db_name][main_file_collection_name]

# Initialize S3 client
s3_client = boto3.client('s3',
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY'),
    aws_secret_access_key=os.getenv('AWS_SECRET'),
    region_name=os.getenv('AWS_REGION'))

# Initialize LLM for summarization
openai_api_key = os.getenv('OPENAI_API_KEY')
llm = ChatOpenAI(model="gpt-3.5-turbo-0125", temperature=0)


def summarize_document(text_input):
    """Generate a summary for the given text input"""
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

def process_markdown(pdf_stream, user_id, class_id, doc_id, file_name):
    doc = pymupdf.open(stream=pdf_stream, filetype="pdf")

    # Convert to Markdown
    md_text = pymupdf4llm.to_markdown(doc)

    headers_to_split_on = [
    ("#", "Level 1 Heading"),
    ("##", "Level 2 Heading"),
    ("###", "Level 3 Heading"),
    ("####", "Level 4 Heading"),
    ("#####", "Level 5 Heading"),
    ("######", "Level 6 Heading"),
    ]

    # Split Markdown by headings
    splitter = MarkdownHeaderTextSplitter(headers_to_split_on)
    documents = splitter.split_text(md_text)
    

    if not documents:
        # Fallback splitter
        splitter = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=200)
        documents = splitter.create_documents(md_text)

    semantic_splitter = SemanticChunker(OpenAIEmbeddings(), breakpoint_threshold_type="standard_deviation")


    chunks = []
    for doc_chunk in documents:
        chunk_text = doc_chunk.page_content
        

        chunk_metadata = {
            "file_name": file_name,
            "title": doc.metadata.get('title', 'Unknown'),
            "author": doc.metadata.get('author', 'Unknown'),
            "user_id": user_id,
            "class_id": class_id,
            "doc_id": doc_id,
            "is_summary": False,
        }

        # Check if chunk_text exceeds the recommended size
        if len(chunk_text) > 1000:
            # Further split using SemanticChunker
            sub_chunks = semantic_splitter.split_text(chunk_text)
            for sub_chunk in sub_chunks:
                # Create a copy of the metadata for each sub-chunk
                sub_chunk_metadata = chunk_metadata.copy()

                chunks.append({
                    "text": sub_chunk,
                    "metadata": sub_chunk_metadata
                })
        else:
            # Use the chunk as is
            chunks.append({
                "text": chunk_text,
                "metadata": chunk_metadata
            })


    return chunks

def process_pdf_semantic_chunker(pdf_stream, user_id, class_id, doc_id, file_name):
    """Process a PDF file to extract text, split into chunks, and generate embeddings"""
    pdf_reader = PdfReader(pdf_stream)
    pdf_info = pdf_reader.metadata
    title = pdf_info.get('/Title', 'Unknown')
    author = pdf_info.get('/Author', 'Unknown')
    doc_id = doc_id

    full_text = ""
    chunks = []
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=200, length_function=len)

    semantic_splitter = SemanticChunker(OpenAIEmbeddings(), breakpoint_threshold_type="standard_deviation")

    for page_num, page in enumerate(pdf_reader.pages, start=1):
        page_text = page.extract_text()
        if page_text:
            page_text = page_text.replace('\n', ' ')
            full_text += page_text + " "
            page_chunks = semantic_splitter.split_text(text=page_text)
            for chunk in page_chunks:
                chunks.append({
                    "text": chunk,
                    "metadata": {
                        "file_name": file_name,
                        "title": title,
                        "author": author,
                        "page_number": page_num,
                        "user_id": user_id,
                        "class_id": class_id,
                        "doc_id": doc_id,
                        "is_summary": False
                    }
                })

    summary_text = summarize_document(full_text)
    summary_chunks = text_splitter.split_text(text=summary_text)

    # Add summary chunks to the list
    for chunk_num, chunk in enumerate(summary_chunks, start=1):
        chunks.append({
            "text": chunk,
            "metadata": {
                "file_name": file_name,
                "title": title,
                "author": author,
                "page_number": f"summary-{chunk_num}",
                "user_id": user_id,
                "class_id": class_id,
                "doc_id": doc_id,
                "is_summary": True
            }
        })

    return chunks


def store_embeddings(chunks, collection):
    """Generate embeddings for the chunks and store them in MongoDB"""
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    texts = [chunk['text'] for chunk in chunks]
    metadatas = [chunk['metadata'] for chunk in chunks]
    return MongoDBAtlasVectorSearch.from_texts(texts, embeddings, collection=collection, metadatas=metadatas)

def main():
    
    """Process command-line arguments and process the PDF"""

    parser = argparse.ArgumentParser(description='Process a PDF file and store embeddings.')
    parser.add_argument('--user_id', required=True, help='User ID')
    parser.add_argument('--class_name', required=True, help='Class Name')
    parser.add_argument('--s3_key', required=True, help='S3 Key of the PDF file')
    parser.add_argument('--doc_id', required=True, help='MongoDB Document ID')
    args = parser.parse_args()

    user_id = args.user_id
    class_name = args.class_name  # Use class_name as class_id or implement a mapping function
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
        pdf_stream.seek(0)  # Reset stream position to the beginning

        print(f'Downloaded {s3_key} from S3 successfully.')
    except Exception as e:
        print(f'Error downloading {s3_key} from S3: {e}', file=sys.stderr)
        sys.exit(1)

    # Extract file name from s3_key
    file_name = os.path.basename(s3_key)

    # Retrieve the corresponding Document from MongoDB
    document = main_collection.find_one({'_id': ObjectId(doc_id)})
    if not document:
        print(f'No document found in MongoDB with specified ID', file=sys.stderr)
        sys.exit(1)

     # Process the PDF file
    chunks = process_markdown(pdf_stream, user_id, class_name, doc_id, file_name)
    # Store embeddings
    store_embeddings(chunks, collection)
    print(f'Processed and stored embeddings for {s3_key} successfully.')

    # Close MongoDB connection after documents are processed
    client.close()


if __name__ == '__main__':
    main()
