from pymongo import MongoClient
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import MongoDBAtlasVectorSearch
from langchain_community.document_loaders import TextLoader
from langchain_community.llms import OpenAI
from langchain.chains import RetrievalQA
import gradio as gr 
from gradio.themes.base import Base 
import os
from dotenv import load_dotenv

connectionString = os.getenv('MONGO_CONNECTION_STRING')
client = MongoClient(connectionString)
dbName = "study_buddy_demo"
collectionName = "study_materials"
collection = client[dbName][collectionName]

openai_api_key = os.getenv('OPENAI_API_KEY')

embeddings = OpenAIEmbeddings(openai_api_key=openai_api_key)

vectorStore = MongoDBAtlasVectorSearch.from_documents(embedding=embeddings, collection=collection)

def query_data(query):
    docs = vectorStore.similarity_search(query, K=1)
    as_output = docs[0].page_content

    llm = OpenAI(openai_api_key=openai_api_key, temperature=0)
    retriever = vectorStore.as_retriever()
    qa = RetrievalQA.from_chain_type(llm, chain_type="stuff", retriever=retriever)
    retriever_output = qa.run(query)

    return as_output, retriever_output

query_data("what is Coercion in R")