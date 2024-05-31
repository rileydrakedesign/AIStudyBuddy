from pymongo import MongoClient
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import MongoDBAtlasVectorSearch
from langchain_community.document_loaders import TextLoader
from langchain_community.llms import OpenAI
import os
from io import BytesIO
from dotenv import load_dotenv
from PyPDF2 import PdfReader
from langchain.text_splitter import RecursiveCharacterTextSplitter
import streamlit as st
from streamlit_extras.add_vertical_space import add_vertical_space
from langchain_community.document_loaders import PyPDFLoader

load_dotenv()

#initialize DB
connectionString = os.getenv('MONGO_CONNECTION_STRING')
client = MongoClient(connectionString)
dbName = "study_buddy_demo"
collectionName = "study_materials2"
collection = client[dbName][collectionName]
openai_api_key = os.getenv('OPENAI_API_KEY')

#directory loader used here but add code for user upload functionality to get conntext files
#loader = TextLoader('./sample/study_materials.txt')
#data = loader.load()


def process_pdf(pdf_path):
    """Processes a PDF file to extract text, split into chunks, and generate embeddings."""
    pdf_reader = PdfReader(pdf_path)
    pdf_info = pdf_reader.metadata
    file_name = pdf_path.name
    title = pdf_info.get('/Title', 'Unknown')
    author = pdf_info.get('/Author', 'Unknown')
    
    chunks = []
    for page_num, page in enumerate(pdf_reader.pages, start=1):
        page_text = page.extract_text()
        if page_text:
            page_text = page_text.replace('\n', ' ')
            text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200, length_function=len)
            page_chunks = text_splitter.split_text(text=page_text)
            for chunk in page_chunks:
                chunks.append({
                    "text": chunk,
                    "metadata": {
                        "file_name": file_name,
                        "title": title,
                        "author": author,
                        "page_number": page_num
                    }
                })
    return chunks

def store_embeddings(chunks, collection):
    """Generates embeddings for the chunks and stores them in MongoDB."""
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    texts = [chunk['text'] for chunk in chunks]
    metadatas = [chunk['metadata'] for chunk in chunks]
    #add a dynamic dictionary of metadata to the from_texts call to add other info on embedding like user id
    return MongoDBAtlasVectorSearch.from_texts(texts, embeddings, collection=collection, metadatas=metadatas)

def main():
    st.header("Chat with Tutor.")
    #query = st.text_input("Message your tutor here.")  # User input for query
    pdf = st.file_uploader("Upload your class materials.", type='pdf')  # File uploader for PDFs


    if pdf:

        chunks = process_pdf(pdf)

        chunks = process_pdf(pdf)
        st.write(chunks)

        store_embeddings(chunks, collection) 

        

        



'''
openai_api_key = os.getenv('OPENAI_API_KEY')

embeddings = OpenAIEmbeddings(openai_api_key=openai_api_key)

vectorStore = MongoDBAtlasVectorSearch.from_documents(data, embeddings, collection=collection)
'''

if __name__ == '__main__':
    main()
