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


with st.sidebar:
    st.title('study buddy ai')
    st.markdown('''
    ## About
    beta version of study buddy ai 
    allows users to upload their class pdfs and get an AI tutor
 
    ''')
    add_vertical_space(5)
    st.write('by riley drake')

def main():
    st.header("Chat with tutor.")

    #pdf upload 
    pdf = st.file_uploader("Upload your class materials.", type='pdf')

    #database definition
    connectionString = os.getenv('MONGO_CONNECTION_STRING')
    client = MongoClient(connectionString)
    dbName = "study_buddy_demo"
    collectionName = "study_materials"
    collection = client[dbName][collectionName]
    openai_api_key = os.getenv('OPENAI_API_KEY')

    #pdf reader check if one uploaded first
    
    if pdf is not None:
        pdf_reader = PdfReader(pdf)

        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text()

        #split text into chunks 

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len,
        )
        chunks = text_splitter.split_text(text=text)

        st.write(chunks)
            
        #st.write(text)

        embeddings = OpenAIEmbeddings(openai_api_key=openai_api_key)
        vectorStore = MongoDBAtlasVectorSearch.from_texts(chunks, embeddings, collection=collection)
        pdf_name = pdf.name[:-4]
        with open(f"{pdf_name}.pkl", "wb") as f:
            pickle.dump(vectorStore, f)





if __name__ == '__main__':
    main()