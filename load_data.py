from pymongo import MongoClient
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import MongoDBAtlasVectorSearch
from langchain_community.document_loaders import TextLoader
from langchain_community.llms import OpenAI
import gradio as gr 
from gradio.themes.base import Base 
import os
from dotenv import load_dotenv


connectionString = os.getenv('MONGO_CONNECTION_STRING')
client = MongoClient(connectionString)
dbName = "study_buddy_demo"
collectionName = "study_materials"
collection = client[dbName][collectionName]

#directory loader used here but add code for user upload functionality to get conntext files
loader = TextLoader('./sample/study_materials.txt')
data = loader.load()

openai_api_key = os.getenv('OPENAI_API_KEY')

embeddings = OpenAIEmbeddings(openai_api_key=openai_api_key)

vectorStore = MongoDBAtlasVectorSearch.from_documents(data, embeddings, collection=collection)

