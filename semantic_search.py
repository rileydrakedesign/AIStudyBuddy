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
from load_data import main
from langchain_core.output_parsers import StrOutputParser

load_dotenv()

# Initialize DB
connectionString = os.getenv('MONGO_CONNECTION_STRING')
client = MongoClient(connectionString)
dbName = "study_buddy_demo"
collectionName = "study_materials2"
collection = client[dbName][collectionName]

#collection.delete_many({})

"""dynamically load these from the ui file make a
 function to store and get these vars because there will be a lot 
 the user will have the option to input text or select/upload a file
 so this must be handled in a function on ui side and on this side in some way
 maybe as a dictionary or object in this file and a function in the other file"""

#for essay chat
#prompt_filename = "100es24write2.pdf"
#essay_filename = "100E Paper 2 (1).pdf"

#for study guide test
filter_files = {"author": "Dawn Holmes"}
exclude_file = {"file_name": "PSTAT 8 Summary of Main Topics.pdf"}

#more meta 
current_user_id = "rileydrake"
current_docs = {}
current_classes = {"PSTAT 8"}

#variable that determines if chunk summaries are passed rather than full chunks 
summarized_context = False

# Initialize embedding model and LLM
embedding_model = OpenAIEmbeddings(model="text-embedding-3-small")
llm = ChatOpenAI(model="gpt-3.5-turbo-0125", temperature=0.5)

def create_embedding(text):
    """Create an embedding for the given text.
    creates embedding of user query for semantic"""
    return embedding_model.embed_query(text)

def gather_text_from_summary_documents(current_user_id, current_docs, current_classes):
    """Gather text from filtered documents based on metadata."""
    filters = {
        "user_id": current_user_id,
        "is_summary": True,
        "doc_id": {"$in": current_docs},
        "class_id": {"$in": current_classes}
    }

    pipeline = [
        {"$match": filters},
        {"$sort": {"file_name": 1, "page_number": 1}},
        {"$project": {"text": 1, "file_name": 1, "page_number": 1}}
    ]

    results = collection.aggregate(pipeline)
    full_text = " ".join(result['text'] for result in results)
    
    return full_text


def perform_semantic_search(query_vector, filters=None):
    """Perform a semantic search with an optional exclusion of a specific filename."""
    pipeline = [
        {
            "$vectorSearch": {
                "index": "PlotSemanticSearch",
                "path": "embedding",
                "queryVector": query_vector,
                "numCandidates": 1000,
                "limit": 3,
                "filter": filters
            }
        },
        {
            "$project": {
                "text": 1,
                "file_name": 1,
                "title": 1,
                "author": 1,
                "page_number": 1,
                "is_summary": 1,
                "score": {"$meta": "vectorSearchScore"}
            }
        }
    ]
    match_stage = {}

    #if filters:
        #match_stage.update(filters)

    #if match_stage:
        #pipeline.insert(1, {"$match": match_stage})

    results = collection.aggregate(pipeline)
    
    return results
    
def get_citation(search_results):

    """Add a system to check all three citations returned from the RAG 
    and just return the one that the LLM used (most likely amounts to returing just
    the top K similar result citation)"""

    authors = []
    titles = []
    page_numbers = []
    citations = []
    i = 0

    # Process and store the metadata from the results
    for result in search_results:
        authors.append(result.get('author'))
        titles.append(result.get('title'))
        page_numbers.append(result.get('page_number'))
        citation = f"{titles[i]}, {authors[i]}, {page_numbers[i]}"
        citations.append(citation)
        i+=1
    
    return citations

    

def format_prompt(template, **kwargs):
    """Format the given template with the provided keyword arguments."""
    prompt = PromptTemplate.from_template(template)
    return prompt.format(**kwargs)

def load_prompts(file_path):
    """Load prompts from a JSON file."""
    with open(file_path, 'r') as file:
        return json.load(file)
    
def choose_prompt(user_query):

    """Choose the appropriate prompt and context type for a given user query."""
    # System prompt to guide the LLM
    system_prompt = (
        """You are an agent designed to select the proper prompt and context type for a given user request. 
        The three prompt names are: question_answering (used for queries that reflect general questions), 
        generate_notes (used for queries that want notes generated about documents or classes), 
        generate_study_guide (used for queries that want a study guide generated about documents or classes). 
        The context types are: summaries or full_documents. If the query is looking for highly specific information such as specific definitions 
        about specific terms or documents, then use full_documents. If it is more general over large amounts of documents use summaries. 
        For queries concerning study guide generation, always use summaries as context. 
        If you are unsure, default to using full_documents.
        Finally, you must format your response so that it only contains the chosen prompt and context formatted in the following way 
        Prompt Type: chosen prompt name
        Context Type: chosen context type"""
    )
    
    # Initialize LLM
    llm = ChatOpenAI(model="gpt-3.5-turbo-0125", temperature=0)
    
    # Construct the prompt to pass to the LLM
    prompt_template = PromptTemplate.from_template(
        system_prompt + "\n\nUser Query: {user_query}"
    )
    
    parser = StrOutputParser()
    chain = prompt_template | llm | parser
    response = chain.invoke({"user_query": user_query})
    
    # Parse the response to get the context type and prompt type
    response_lines = response.strip().split('\n')
    context_type = None
    prompt_type = None
    
    for line in response_lines:
        if line.startswith("Context Type:"):
            context_type = line.split(":", 1)[1].strip()
        elif line.startswith("Prompt Type:"):
            prompt_type = line.split(":", 1)[1].strip()
    
    if not context_type or not prompt_type:
        context_type = "full_documents"
        prompt_type = "question_answering"

    # Load prompts from the JSON file
    #selected_prompt = prompts.get(prompt_type, prompts["general question answering"])
    
    return context_type, prompt_type
    
def generate_notes():
    pass

def generate_study_guide():
    pass


def main():

    """for now start with just general q/a over docs 
    MVP functionality:
        - context selector that decides between summaries, full docs, or both
        based on the query 
        - proper RAG is done either summary text or semantic search text is passed
        to final prompt
        - initial final prompt is just a q/a system general prompt
            - study guide, notes, and flash cards added later
        - citation functionality added to return meta as a citation 
            - to do so meta must be gathered and passed into the RAG 
            - summaries will also need the original meta from their parent doc"""
    
    # Load prompts from JSON file
    prompts = load_prompts('prompts.json')

    # Retrieve text for prompt, rubric, and essay
    #prompt_text = retrieve_chunks(prompt_filename)
    # rubric_text = retrieve_chunks(rubric_filename)
    #essay_text = retrieve_chunks(essay_filename)

    # Example user query
    user_query = "give an extensive list of set operations."

    chosen_context, chosen_prompt = choose_prompt(user_query)

    print(chosen_context, chosen_prompt)

    is_summary = False 
    
    if chosen_context == "summaries":
        is_summary = True
    else:
        is_summary = False

    print(is_summary)
    

    # Create embeddings
    query_vector = create_embedding(user_query)

    filters = {"is_summary": {"$eq": True}, "user_id": {"$eq": "rileydrake"}}
    #essay_prompt_vector = create_embedding(prompt_text)

    #pprint(gather_text_from_summary_documents(filters= filter_files, exclude_filenames= exclude_file))

    #search_results = perform_semantic_search(essay_prompt_vector, exclude_filenames= exclude_file, filters= filter_files)

    # Perform semantic search for a normal question
    #search_results = perform_semantic_search(query_vector)


    # Check if it is an essay grading question or a normal question
    #is_essay_grade = True  # Change this based on the actual question type

    # Perform the appropriate semantic search
    search_results = perform_semantic_search(query_vector, filters)
    #pprint(search_results)
    selected_prompt = prompts[chosen_prompt]
    # Store the results in a variable for later use
    similarity_results = [doc for doc in search_results]
    # Format similarity results as context
    context = " ".join([doc['text'] for doc in similarity_results])

    formatted_prompt = format_prompt(selected_prompt, text= user_query, context= context)
    #get citation from semantic search
    citation = get_citation(similarity_results)

    pprint(formatted_prompt)

    # Invoke LLM
    pprint(similarity_results)
    formatted_response = llm.invoke(formatted_prompt)
    #check if there is a RAG returned so that this error is cautht if the citation dict is empty
    pprint(citation[0])

    # Pretty print the response
    pprint(formatted_response)
    

if __name__ == "__main__":
    main()



