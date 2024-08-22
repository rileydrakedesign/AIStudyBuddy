import os
import uuid
from pymongo import MongoClient
from dotenv import load_dotenv
from PyPDF2 import PdfReader
from io import BytesIO
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import MongoDBAtlasVectorSearch
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
import streamlit as st
from streamlit_extras.add_vertical_space import add_vertical_space
from unstructured.partition.auto import partition
from langchain_community.document_loaders import UnstructuredFileLoader
from pydantic import BaseModel
from langchain_experimental.text_splitter import SemanticChunker


# Load environment variables
load_dotenv()

# Initialize MongoDB client and collection
connection_string = os.getenv('MONGO_CONNECTION_STRING')
client = MongoClient(connection_string)
db_name = "study_buddy_demo"
collection_name = "study_materials2"
collection = client[db_name][collection_name]

# Initialize LLM for summarization
openai_api_key = os.getenv('OPENAI_API_KEY')
llm = ChatOpenAI(model="gpt-3.5-turbo-0125", temperature=0)

def get_user_id():
    """Authenticate user or pull authentication info from another script and get user ID"""
    user_id = "rileydrake"
    return user_id

def get_class(class_name):
    """Return class ID from class name"""
    class_id = class_name
    return class_id

def generate_doc_id():
    """Generate a unique document ID"""
    return str(uuid.uuid4())

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

def process_pdf(pdf_path, user_id, class_id):
    """Process a PDF file to extract text, split into chunks, and generate embeddings"""
    pdf_reader = PdfReader(pdf_path)
    pdf_info = pdf_reader.metadata
    file_name = pdf_path.name
    title = pdf_info.get('/Title', 'Unknown')
    author = pdf_info.get('/Author', 'Unknown')
    doc_id = generate_doc_id()

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
    """Streamlit UI for uploading PDFs and processing them"""

    user_id = get_user_id()

    st.header("Chat with Tutor.")
    class_name = st.text_input("Class name:")  # Class name input
    class_id = get_class(class_name)
    pdf = st.file_uploader("Upload your class materials.", type='pdf')  # File uploader for PDFs

    if pdf and class_name:
        chunks = process_pdf(pdf, user_id, class_id)
        st.write(chunks)
        store_embeddings(chunks, collection)

    # Close MongoDB connection after documents are processed
    client.close()

if __name__ == '__main__':
    main()
