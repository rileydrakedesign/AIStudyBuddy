import os
import json
import sys
from pymongo import MongoClient
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_openai import OpenAIEmbeddings
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
from botocore.exceptions import ClientError
import boto3
from urllib.parse import quote

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

# Initialize backend URL
backend_url = os.getenv('BACKEND_URL', 'https://localhost:3000/api/v1')

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
            # MINIMAL CHANGE: Project _id so that it's included in the final results
            "$project": {
                "_id": 1,
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

def get_file_citation(search_results):
    """
    Generate citations with clickable links from search results.
    This is purely an example; actual citation usage is up to your front end.
    """
    citations = []
    seen_files = set()
    s3_client = boto3.client(
        's3',
        aws_access_key_id=os.getenv('AWS_ACCESS_KEY'),
        aws_secret_access_key=os.getenv('AWS_SECRET'),
        region_name=os.getenv('AWS_REGION')  # Replace with your AWS region
    )
    bucket_name = os.getenv('AWS_S3_BUCKET_NAME')  # Replace with your S3 bucket name

    for result in search_results:
        s3_key = result.get('file_name')  # We assume 'file_name' is unique
        file_title = result.get('file_name')

        if s3_key and s3_key not in seen_files:
            seen_files.add(s3_key)
            encoded_s3_key = quote(s3_key, safe='')
            download_url = f"{backend_url}/download?s3_key={encoded_s3_key}"
            citations.append({"href": download_url, "text": file_title})
        elif not s3_key:
            if file_title not in seen_files:
                seen_files.add(file_title)
                citations.append({"href": None, "text": file_title})

    return citations

def format_prompt(template, **kwargs):
    """Format a template with the provided keyword arguments, escaping curly braces in context."""
    if 'context' in kwargs:
        kwargs['context'] = kwargs['context'].replace('{', '{{').replace('}', '}}')
    prompt = PromptTemplate.from_template(template)
    return prompt.format(**kwargs)

def format_prompt1(template, **kwargs):
    """Format the given template with the provided keyword arguments."""
    prompt = PromptTemplate.from_template(template)
    return prompt.format(**kwargs)

def load_prompts(file_path):
    """Load prompts from a JSON file."""
    with open(file_path, 'r') as file:
        return json.load(file)

def construct_chain(prompt_template, user_query, chat_history):
    """Construct a chain to answer questions on your data."""
    parser = StrOutputParser()
    chain = prompt_template | llm | parser
    response = chain.invoke({"chat_history": chat_history, "input": user_query})
    return response

def semantic_router(user_query):
    """
    Simple router that picks a 'route' based on known utterances.
    You can expand it with additional categories and training data.
    """
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

    routes = [general_qa, generate_study_guide, generate_notes]
    encoder = OpenAIEncoder()
    rl = RouteLayer(encoder=encoder, routes=routes)

    route_name = rl(user_query).name
    if route_name is None:
        return "general_qa"
    else:
        return route_name

def escape_curly_braces(text):
    """
    Escape curly braces in the text to prevent them from being treated as template variables.
    """
    return text.replace('{', '{{').replace('}', '}}')

def message_to_dict(message):
    """Helper to convert a HumanMessage or AIMessage to a dict."""
    if isinstance(message, HumanMessage):
        return {"role": "human", "content": message.content}
    elif isinstance(message, AIMessage):
        return {"role": "ai", "content": message.content}
    else:
        raise TypeError(f"Unexpected message type: {type(message)}")

def main():
    """Main function to handle user interactions and perform semantic search."""

    # Load your prompts from a JSON file
    prompts = load_prompts('/Users/rileydrake/Desktop/AIStudyBuddy/backend/prompts.json')

    # We expect 6 arguments:
    # 1) user_id
    # 2) class_name
    # 3) doc_id
    # 4) user_query
    # 5) chat_history JSON
    # 6) source
    if len(sys.argv) < 7:
        print("Error: Not enough arguments provided.", file=sys.stderr)
        sys.exit(1)

    user_id = sys.argv[1]
    class_name = sys.argv[2]
    doc_id = sys.argv[3]
    user_query = sys.argv[4]
    chat_history = json.loads(sys.argv[5])
    source = sys.argv[6].lower()  # 'chrome_extension' or 'main_app'

    print(f"Source: {source}", file=sys.stderr)

    # Clean up chat history to avoid curly brace parse issues
    chat_history_cleaned = [
        {"role": chat["role"], "content": escape_curly_braces(chat["content"])}
        for chat in chat_history
    ]

    # 1) Rephrase the user query for retrieval
    rephrase_prompt = PromptTemplate(
        template="""You are an assistant tasked with taking a natural language query from a user
                    and converting it into a query for a vectorstore. In the process, strip out all
                    information that is not relevant for the retrieval task and return a new, simplified
                    question for vectorstore retrieval. The new user query should capture the semantic meaning of what
                    the user is searching for in the most efficient way so that the proper documents are retrieved from the vectorstore.
                    Only return the response with no other information or descriptors.
                    user query: {input}
                    """
    )

    semantic_query = construct_chain(rephrase_prompt, user_query, chat_history_cleaned)

    # 2) Route the user's request type
    route = semantic_router(semantic_query)
    print(f"Route: {route}", file=sys.stderr)

    # 3) Create embedding of the rephrased user query
    query_vector = create_embedding(semantic_query)

    # 4) Build filters based on doc_id or class_name
    filters = {"user_id": {"$eq": user_id}}
    if doc_id != "null":
        # If docId is provided, filter specifically by docId
        filters["doc_id"] = {"$eq": doc_id}
    elif class_name and class_name != "null":
        filters["class_id"] = {"$eq": class_name}

    print(f"filter: {filters}", file=sys.stderr)

    # 5) Perform the semantic search
    search_results = perform_semantic_search(query_vector, filters)
    similarity_results = [doc for doc in search_results]
    # Filter out results below a certain threshold (0.35)
    filtered_results = [doc for doc in similarity_results if doc['score'] > 0.35]

    print(f"results: {search_results}", file=sys.stderr)
    print(f"processed results: {similarity_results}", file=sys.stderr)

    # 6) Decide which prompt to use, based on source or route
    if source == "chrome_extension":
        selected_prompt = prompts.get("chrome_extension")
        if not selected_prompt:
            print("Error: 'chrome_extension' prompt not found in prompts.json", file=sys.stderr)
            sys.exit(1)

        referencing_instruction = (
            "Whenever you use content from a given chunk in your final answer, "
            "place a bracketed reference [1], [2], [3], etc. at the end of the relevant sentence.\n\n"
        )
        enhanced_prompt = referencing_instruction + selected_prompt

    else:
        selected_prompt = prompts.get(route)
        if not selected_prompt:
            print(f"Error: Prompt for route '{route}' not found in prompts.json", file=sys.stderr)
            sys.exit(1)

        referencing_instruction = (
            "Whenever you use content from a given chunk in your final answer, "
            "place a bracketed reference [1], [2], [3], etc. at the end of the relevant sentence.\n\n"
            "Please format your answer using Markdown. Write all mathematical expressions in LaTeX using '$' for inline math and '$$' for display math."
            "Ensure that any code is enclosed in triple backticks with the appropriate language, newlines and paragraphs are clearly separated, and links or images use correct Markdown syntax. Check your formatting before submitting the answer."
        )
        enhanced_prompt = referencing_instruction + selected_prompt

    # 7) Build the final context from the filtered results
    context_list = []
    for idx, doc in enumerate(filtered_results):
        labeled_text = f"Chunk {idx+1}: {doc['text']}"
        context_list.append(labeled_text)
    context = "\n\n".join(context_list)

    formatted_prompt = format_prompt(enhanced_prompt, context=context)

    # 8) Build a ChatPromptTemplate for the final query
    prompt_template = ChatPromptTemplate.from_messages([
        ("system", formatted_prompt),
        MessagesPlaceholder(variable_name="chat_history"),
        ("user", "{input}")
    ])

    # 9) Build citations, then generate the final answer from LLM
    citation = get_file_citation(similarity_results)
    response = construct_chain(prompt_template, user_query, chat_history_cleaned)

    # 10) Build an ordered list of chunks (including _id)
    chunk_array = []
    for idx, doc in enumerate(filtered_results):
        chunk_array.append({
            "_id": str(doc["_id"]),           # MINIMAL ADDITION: add string version of the ObjectId
            "chunkNumber": idx + 1,
            "text": doc["text"],
            "pageNumber": doc.get("page_number")
        })

    print(f"context: {chunk_array}", file=sys.stderr)

    # 11) Construct final JSON output
    json_output = {
        "message": response,
        "citation": citation,
        "chats": chat_history,  # chat history if you need to use it on the front end
        "chunks": chunk_array
    }

    print("DEBUG: JSON to be returned by semantic_search.py:", json.dumps(json_output), file=sys.stderr)

    # 12) Print the JSON to stdout so the Node controller can parse it
    print(json.dumps(json_output))

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)
