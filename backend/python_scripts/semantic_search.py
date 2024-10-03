import os
import json
import sys
from pymongo import MongoClient
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from pprint import pprint
from load_data import main
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.prompts import MessagesPlaceholder
from langchain.chains import create_history_aware_retriever
from semantic_router import Route
from semantic_router.layer import RouteLayer
from semantic_router.encoders import CohereEncoder, OpenAIEncoder



# Load environment variables
load_dotenv()

# Initialize MongoDB client and collection
connection_string = os.getenv('MONGO_CONNECTION_STRING')
client = MongoClient(connection_string)
db_name = "study_buddy_demo"
collection_name = "study_materials2"
collection = client[db_name][collection_name]

# Initialize embedding model and LLM
embedding_model = OpenAIEmbeddings(model="text-embedding-3-small")
llm = ChatOpenAI(model="gpt-3.5-turbo-0125", temperature=0.5)

# Global variables for current user and class context
#current_classes = {"PSTAT 8"}
#current_user_id = "rileydrake"


def create_embedding(text):
    """Create an embedding for the given text."""
    return embedding_model.embed_query(text)

def gather_text_from_summary_documents(user_id, classes):
    """Gather text from filtered summary documents based on metadata."""
    filters = {
        "user_id": user_id,
        "is_summary": True,
        "class_id": {"$in": classes}
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
    """Perform a semantic search with optional filters."""
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
    results = collection.aggregate(pipeline)
    return results

def get_citation(search_results):
    """Generate citations from search results."""
    citations = []
    for result in search_results:
        citation = f"{result.get('title')}, {result.get('author')}, {result.get('page_number')}"
        citations.append(citation)
    return citations

def format_prompt(template, **kwargs):
    """Format the given template with the provided keyword arguments."""
    prompt = PromptTemplate.from_template(template)
    return prompt.format(**kwargs)

def load_prompts(file_path):
    """Load prompts from a JSON file."""
    with open(file_path, 'r') as file:
        return json.load(file)


def construct_chain(prompt_template, user_query, chat_history):
    # Construct a chain to answer questions on your data
    parser = StrOutputParser()
    chain = prompt_template | llm | parser
    response = chain.invoke({"chat_history": chat_history, "input": user_query})

    return(response)

def semantic_router(user_query):
    
    # Define routes for general question and answer
    general_qa = Route(
        name="general_qa",
        utterances=[
            "Define the term 'mitosis'",
            "When did the Civil War start?",
            "What is the theory of relativity?",
            "Explain the concept of supply and demand",
            "Who discovered penicillin?",
            "How does photosynthesis work?"
        ]
    )

    # Define routes for generating study guides
    generate_study_guide = Route(
        name="generate_study_guide",
        utterances=[
            "Create a study guide for biology",
            "Generate a study guide on World War II",
            "Make a study guide for my chemistry class",
            "Study guide for this chapter on genetics",
            "Prepare a study guide for algebra"
        ]
    )

    # Define routes for generating notes
    generate_notes = Route(
        name="generate_notes",
        utterances=[
            "Write notes on the French Revolution",
            "Generate notes for my physics lecture",
            "Take notes for this chapter on cell biology",
            "Notes for this topic on climate change",
            "Summarize notes for my economics class"
        ]
    )

    # List of all routes
    routes = [
        general_qa,
        generate_study_guide,
        generate_notes
    ]

    encoder = OpenAIEncoder()
    rl = RouteLayer(encoder=encoder, routes=routes)

    route_name = rl(user_query).name

    if route_name is None:
        return "general_qa"
    else:
        return route_name
    
def message_to_dict(message):
    if isinstance(message, HumanMessage):
        return {"role": "human", "content": message.content}
    elif isinstance(message, AIMessage):
        return {"role": "ai", "content": message.content}
    else:
        raise TypeError(f"Unexpected message type: {type(message)}")
    

def main():
    """Main function to handle user interactions and perform semantic search."""
    # Load prompts from JSON file
    prompts = load_prompts('/Users/rileydrake/Desktop/AIStudyBuddy/backend/prompts.json')

    # Get user_id, message, and chat history from command-line arguments
    user_id = sys.argv[1]
    user_query = sys.argv[2]
    chat_history = json.loads(sys.argv[3])

    #print(user_id)

    # Filter chat_history to include only role and content (not citation)
    chat_history_cleaned = [{"role": chat["role"], "content": chat["content"]} for chat in chat_history]

    rephrase_prompt = PromptTemplate(
        template="""You are an assistant tasked with taking a natural languge query from a user
        and converting it into a query for a vectorstore. In the process, strip out all 
        information that is not relevant for the retrieval task and return a new, simplified
        question for vectorstore retrieval. The new user query should capture the semantic meaning of what
        the user is searching for in the most efficient way so that the proper documents are retrieved from the vectorstore.
        Only return the response with no other information or descriptors. 
        user query: {input}
        """
    )

    semantic_query = construct_chain(rephrase_prompt, user_query, chat_history_cleaned)

    route = semantic_router(semantic_query)

    # Create embeddings for the query
    query_vector = create_embedding(semantic_query)
    filters = {"user_id": {"$eq": "{user_id}"}}
        
    # Perform semantic search
    search_results = perform_semantic_search(query_vector, filters)
    similarity_results = [doc for doc in search_results]
    filtered_results = [doc for doc in similarity_results if doc['score'] > 0.50]

    # Format the prompt and generate response
    selected_prompt = prompts[route]
    context = " ".join([doc['text'] for doc in filtered_results])
    formatted_prompt = format_prompt(selected_prompt, context=context)

    prompt_template = ChatPromptTemplate.from_messages([
        ("system", formatted_prompt),
        MessagesPlaceholder(variable_name="chat_history"),
        ("user", "{input}")
    ])
    
    citation = get_citation(similarity_results)

    #call LLM chain
    response = construct_chain(prompt_template, user_query, chat_history_cleaned)

    # Print the response as JSON to be captured by the Node.js script
    print(json.dumps({"message": response, "citation": citation, "chats": chat_history}))

if __name__ == "__main__":
    main()



