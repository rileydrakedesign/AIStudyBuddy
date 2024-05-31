from pymongo import MongoClient
from langchain_openai import OpenAIEmbeddings
from langchain_mongodb import MongoDBAtlasVectorSearch
from langchain_community.llms import OpenAI
import os
from dotenv import load_dotenv
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
from pprint import pprint
import json

load_dotenv()

# Initialize DB
connectionString = os.getenv('MONGO_CONNECTION_STRING')
client = MongoClient(connectionString)
dbName = "study_buddy_demo"
collectionName = "study_materials2"
collection = client[dbName][collectionName]

# Static strings for file names (these will be dynamically selected by the user in the real implementation)
prompt_filename = "100es24write2.pdf"
# rubric_filename = ""
essay_filename = "100E Paper 2 (1).pdf"

# Initialize embedding model and LLM
embedding_model = OpenAIEmbeddings(model="text-embedding-3-small")
llm = ChatOpenAI(model="gpt-3.5-turbo-0125", temperature=0.5)

def retrieve_chunks(file_name):
    """Retrieve all text chunks for a given file name.
    Used to pull pdf text that a user selects from their uploaded files"""
    chunks = []
    results = collection.find({"file_name": file_name}, {"text": 1})
    for result in results:
        chunks.append(result['text'])
    return " ".join(chunks)

def create_embedding(text):
    """Create an embedding for the given text.
    creates embedding of user query for semantic"""
    return embedding_model.embed_query(text)

def perform_semantic_search(query_vector, exclude_filenames=None):
    """Perform a semantic search with an optional exclusion of a specific filename."""
    pipeline = [
        {
            "$vectorSearch": {
                "index": "PlotSemanticSearch",
                "path": "embedding",
                "queryVector": query_vector,
                "numCandidates": 1000,
                "limit": 3,
            }
        },
        {
            "$project": {
                "text": 1,
                "file_name": 1,
                "title": 1,
                "author": 1,
                "page_number": 1,
                "score": {"$meta": "vectorSearchScore"}
            }
        }
    ]
    
    if exclude_filenames:
        pipeline.insert(1, {"$match": {"file_name": {"$nin": exclude_filenames}}})
    
    return collection.aggregate(pipeline)

def format_prompt(template, **kwargs):
    """Format the given template with the provided keyword arguments."""
    prompt = PromptTemplate.from_template(template)
    return prompt.format(**kwargs)

def load_prompts(file_path):
    """Load prompts from a JSON file."""
    with open(file_path, 'r') as file:
        return json.load(file)

def main():
    
    # Load prompts from JSON file
    prompts = load_prompts('prompts.json')

    # Retrieve text for prompt, rubric, and essay
    prompt_text = retrieve_chunks(prompt_filename)
    # rubric_text = retrieve_chunks(rubric_filename)
    essay_text = retrieve_chunks(essay_filename)

    # Example user query
    user_query = "Give a recount of when women were cleaning up streets in Chicago in the 1910s. Provide the title and page of the document this information was found in."

    # Create embeddings
    query_vector = create_embedding(user_query)
    essay_prompt_vector = create_embedding(prompt_text)

    # Perform semantic search for a normal question
    #search_results = perform_semantic_search(query_vector)




    # Check if it is an essay grading question or a normal question
    is_essay_grade = True  # Change this based on the actual question type

    # Perform the appropriate semantic search
    if is_essay_grade:
        search_results = perform_semantic_search(essay_prompt_vector, exclude_filenames = [prompt_filename, essay_filename])
        selected_prompt = prompts["grading"]
        # Store the results in a variable for later use
        similarity_results = [doc for doc in search_results]
        # Format similarity results as context
        context = " ".join([doc['text'] for doc in similarity_results])
        formatted_prompt = format_prompt(selected_prompt, prompt_text=prompt_text, essay_text=essay_text, context=context)
    else:
        search_results = perform_semantic_search(query_vector)
        selected_prompt = prompts["question_answering"]
        # Store the results in a variable for later use
        similarity_results = [doc for doc in search_results]
        # Format similarity results as context
        context = " ".join([doc['text'] for doc in similarity_results])
        formatted_prompt = format_prompt(selected_prompt, text= user_query, context= context)

    # Invoke LLM
    pprint(similarity_results)
    formatted_context = llm.invoke(formatted_prompt)

    # Pretty print the response
    
    pprint(formatted_context)

if __name__ == "__main__":
    main()



