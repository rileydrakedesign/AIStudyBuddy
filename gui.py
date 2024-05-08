import streamlit as st
from streamlit_extras.add_vertical_space import add_vertical_space
from PyPDF2 import PdfReader
from langchain.text_splitter import RecursiveCharacterTextSplitter
import os
from dotenv import load_dotenv
import pickle
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import MongoDBAtlasVectorSearch
from pymongo import MongoClient
from langchain.llms import OpenAI
from langchain.chains.question_answering import load_qa_chain
from langchain.callbacks import get_openai_callback


# Load environment variables
load_dotenv()

# Sidebar configuration for the application
with st.sidebar:
    st.title('Study Buddy AI')
    st.markdown('''
    ## About
    Beta version of Study Buddy AI allows users to upload their class PDFs and get an AI tutor.
    ''')
    add_vertical_space(5)
    st.write('by Riley Drake')

def process_pdf(pdf):
    """Processes a PDF file to extract text, split into chunks, and generate embeddings."""
    pdf_reader = PdfReader(pdf)
    text = ""
    
    # Extract text from each page of the PDF
    for page in pdf_reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text
    
    # Split text into manageable chunks
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len,
    )
    chunks = text_splitter.split_text(text=text)
    return chunks

def check_embedding_exists():
    '''create a script here that checks database to see if user has alrerady uploaded 
        a pdf that matches the new one, maybe give each pdf a hash identifier and search
        mongo for that'''
    pass

def store_embeddings(chunks, collection, openai_api_key):
    """Generates embeddings for the chunks and stores them in MongoDB."""
    embeddings = OpenAIEmbeddings(openai_api_key=openai_api_key)
    vector_store = MongoDBAtlasVectorSearch.from_texts(chunks, embeddings, collection=collection)
    return vector_store


def query_data(query, vector_store):
    docs = vector_store.similarity_search(query, 1)
    if len(docs) == 0 or docs[0][1] < 0.7:
        return("unable to find matching results")
    else: 
        return docs
    

def main():

    st.header("Chat with Tutor.")

    #prompt user for questions
    query = st.text_input("Message your tutor here.")
    st.write(query)

    # PDF upload 
    pdf = st.file_uploader("Upload your class materials.", type='pdf')

    # Database configuration
    connection_string = os.getenv('MONGO_CONNECTION_STRING')
    client = MongoClient(connection_string)
    db_name = "study_buddy_demo"
    collection_name = "study_materials"
    collection = client[db_name][collection_name]
    openai_api_key = os.getenv('OPENAI_API_KEY')
    embeddings = OpenAIEmbeddings(openai_api_key=openai_api_key)

    # Process the PDF if one is uploaded
    if pdf is not None:
        chunks = process_pdf(pdf)
        st.write(chunks)  # Display chunks to the user
        
        # Generate and store embeddings
        vector_store = store_embeddings(chunks, collection, openai_api_key)
 
        if query:
            docs = vector_store.similarity_search(query=query, k=3)
 
            llm = OpenAI()
            chain = load_qa_chain(llm=llm, chain_type="stuff")
            with get_openai_callback() as cb:
                response = chain.run(input_documents=docs, question=query)
                print(cb)
            st.write(response)

        #retrieval = query_data(query, vector_store)
        #st.write(retrieval)
        
        '''create a script here that checks database to see if user has alrerady uploaded 
        a pdf that matches the new one, maybe give each pdf a hash identifier and search
        mongo for that'''
        # Optionally, save the vector store locally for backup
        #with open(f"{pdf_name}.pkl", "wb") as f:
            #pickle.dump(vector_store, f)

    
    

    #retrieval = query_data(query, vector_store)
    #st.write(retrieval)


if __name__ == '__main__':
    main()
