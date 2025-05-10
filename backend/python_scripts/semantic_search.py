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
from load_data import load_pdf_data
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
from logger_setup import log


# You might need this if you want to convert string IDs to ObjectId:
# from bson import ObjectId

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
            "$project": {
                "_id": 1,
                "text": 1,
                "file_name": 1,
                "title": 1,
                "author": 1,
                "page_number": 1,
                "doc_id": 1,
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
    """
    citations = []
    seen_files = set()
    s3_client = boto3.client(
        's3',
        aws_access_key_id=os.getenv('AWS_ACCESS_KEY'),
        aws_secret_access_key=os.getenv('AWS_SECRET'),
        region_name=os.getenv('AWS_REGION')
    )
    bucket_name = os.getenv('AWS_S3_BUCKET_NAME')

    for result in search_results:
        s3_key = result.get('file_name')
        file_title = result.get('file_name')
        doc_id = result.get('doc_id')

        if s3_key and s3_key not in seen_files:
            seen_files.add(s3_key)
            encoded_s3_key = quote(s3_key, safe='')
            download_url = f"{backend_url}/download?s3_key={encoded_s3_key}"
            citations.append({"href": download_url, "text": file_title, "docId": doc_id})
        elif not s3_key:
            if file_title not in seen_files:
                seen_files.add(file_title)
                citations.append({"href": None, "text": file_title, "docId": doc_id})

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


def get_last_assistant_chunk_references(chat_history):
    """
    Look for the last 'assistant' message that has a non-empty 'chunkReferences' array.
    Return that array if found, else None.
    """
    for msg in reversed(chat_history):
        if msg.get("role") == "assistant":
            chunk_refs = msg.get("chunkReferences", [])
            if chunk_refs:
                return chunk_refs
    return None


def convert_chunk_references_to_chunk_array(chunk_refs):
    """
    Convert the chunkReferences (which typically have 'chunkId', etc.)
    into the chunk array format, fetching 'text' from MongoDB for each chunk.
    Adjust field names as needed.
    """
    chunk_array = []
    for ref in chunk_refs:
        chunk_id = ref.get("chunkId")
        display_num = ref.get("displayNumber")
        page_num = ref.get("pageNumber")

        if not chunk_id:
            # Fallback if no chunkId
            chunk_array.append({
                "_id": None,
                "chunkNumber": display_num,
                "text": None,
                "pageNumber": page_num,
                "docId": None
            })
            continue

        # Optional: Convert string ID to ObjectId if needed:
        # chunk_obj_id = ObjectId(chunk_id)
        # chunk_doc = collection.find_one({"_id": chunk_obj_id})

        # If chunk_id is stored as a string directly in the DB's _id field, you can do:
        chunk_doc = collection.find_one({"_id": chunk_id})

        if chunk_doc:
            chunk_text = chunk_doc.get("text")
            chunk_doc_id = chunk_doc.get("doc_id")
            chunk_page = chunk_doc.get("page_number")  # or whichever field is correct
        else:
            chunk_text = None
            chunk_doc_id = None
            chunk_page = None

        chunk_array.append({
            "_id": str(chunk_id),
            "chunkNumber": display_num,
            "text": chunk_text,
            "pageNumber": page_num if page_num is not None else chunk_page,
            "docId": chunk_doc_id
        })

    return chunk_array


def semantic_router(user_query):
    """
    Simple router that picks a 'route' based on known utterances.
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

    follow_up = Route(
        name="follow_up",
        utterances=[
            "elaborate more on this",
            "tell me more about that",
            "expand on that",
            "what do you mean by that",
            "explain that again",
            "what was that again",
            "go on"
        ]
    )

    routes = [general_qa, generate_study_guide, generate_notes, follow_up]
    encoder = OpenAIEncoder()
    rl = RouteLayer(encoder=encoder, routes=routes)

    route_name = rl(user_query).name
    if route_name is None:
        return "general_qa"
    else:
        return route_name


def process_semantic_search(user_id, class_name, doc_id, user_query, chat_history, source):
    """
    Processes the user's query with optional semantic search.
    Returns the JSON output as a Python dict.
    """

    # 1) Determine the route BEFORE any rephrasing
    route = semantic_router(user_query)
    log.debug(f"Detected route: {route}")

    skip_search = (route == "follow_up")

    # We'll load prompts first
    prompts = load_prompts('/Users/rileydrake/Desktop/AIStudyBuddy/backend/prompts.json')
    log.debug(f"Source: {source}")

    # Clean up chat history to avoid curly brace parse issues
    chat_history_cleaned = []
    for chat in chat_history:
        cleaned_content = escape_curly_braces(chat.get("content", ""))
        new_msg = {
            "role": chat["role"],
            "content": cleaned_content
        }
        # Preserve chunkReferences if present
        if "chunkReferences" in chat:
            new_msg["chunkReferences"] = chat["chunkReferences"]
        chat_history_cleaned.append(new_msg)

    filtered_results = []
    similarity_results = []
    chunk_array = []

    # 2) If it's a follow-up, try reusing chunk references from the last assistant
    if skip_search:
        last_chunk_refs = get_last_assistant_chunk_references(chat_history_cleaned)
        if last_chunk_refs:
            log.debug("Reusing chunkReferences from last assistant message")
            # Convert them to chunk_array with DB lookup for text
            chunk_array = convert_chunk_references_to_chunk_array(last_chunk_refs)
        else:
            skip_search = False  # fallback if no old references

    semantic_query = user_query
    if not skip_search:
        # 3) Rephrase user query for retrieval
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

        # 4) Create embedding of the rephrased user query
        query_vector = create_embedding(semantic_query)

        # 5) Build filters
        filters = {"user_id": {"$eq": user_id}}
        if doc_id != "null":
            filters["doc_id"] = {"$eq": doc_id}
        elif class_name and class_name != "null":
            filters["class_id"] = {"$eq": class_name}

        log.debug(f"Filter: {filters}")

        # 6) Perform the semantic search
        search_results = perform_semantic_search(query_vector, filters)
        similarity_results = list(search_results)
        # Filter out results below a chosen threshold
        filtered_results = [doc for doc in similarity_results if doc['score'] > 0.35]

        log.debug("Vector search results", similarity_results)

        # Build a new chunk_array from the filtered results
        for idx, doc in enumerate(filtered_results):
            chunk_array.append({
                "_id": str(doc["_id"]),
                "chunkNumber": idx + 1,
                "text": doc["text"],
                "pageNumber": doc.get("page_number"),
                "docId": doc.get("doc_id")
            })

    # 7) Choose the correct prompt
    if source == "chrome_extension":
        selected_prompt = prompts.get("chrome_extension")
        if not selected_prompt:
            log.error("'chrome_extension' prompt not found in prompts.json")
            raise ValueError("Prompt 'chrome_extension' not found")
        referencing_instruction = (
            "Whenever you use content from a given chunk in your final answer, "
            "place a bracketed reference [1], [2], [3], etc. at the end of the relevant sentence.\n\n"
        )
        enhanced_prompt = referencing_instruction + selected_prompt
    else:
        selected_prompt = prompts.get(route)
        if not selected_prompt:
            log.error(f"Error: Prompt for route '{route}' not found in prompts.json")
            raise ValueError(f"Prompt for route '{route}' not found")
        referencing_instruction = (
            "Whenever you use content from a given chunk in your final answer, "
            "place a bracketed reference [1], [2], [3], etc. at the end of the relevant sentence.\n\n"
            "Please format your answer using Markdown. Write all mathematical expressions in LaTeX using '$' for inline math and '$$' for display math."
            "Ensure that any code is enclosed in triple backticks with the appropriate language, newlines and paragraphs are clearly separated, and links or images use correct Markdown syntax. Check your formatting before submitting the answer."
        )
        enhanced_prompt = referencing_instruction + selected_prompt

    # 8) Build the final context from chunk_array
    if chunk_array:
        context_list = []
        for idx, c in enumerate(chunk_array):
            labeled_text = f"Chunk {idx+1}: {c['text']}"
            context_list.append(labeled_text)
        context = "\n\n".join(context_list)
    else:
        context = ""

    formatted_prompt = format_prompt(enhanced_prompt, context=context)

    # 9) Build a ChatPromptTemplate for the final query
    prompt_template = ChatPromptTemplate.from_messages([
        ("system", formatted_prompt),
        MessagesPlaceholder(variable_name="chat_history"),
        ("user", "{input}")
    ])

    # 10) Generate citations
    citation = get_file_citation(similarity_results)
    response = construct_chain(prompt_template, user_query, chat_history_cleaned)

    # 11) Construct final output
    # Build chunkReferences for next time
    chunk_references = []
    for item in chunk_array:
        chunk_references.append({
            "chunkId": item["_id"],
            "displayNumber": item["chunkNumber"],
            "pageNumber": item.get("pageNumber")
        })

    json_output = {
        "message": response,
        "citation": citation,
        "chats": chat_history,
        "chunks": chunk_array,        # Full chunk data
        "chunkReferences": chunk_references  # For front-end or next follow-up
    }

    # 12) Store references in the final assistant message so next turn can find them
    chat_history.append({
        "role": "assistant",
        "content": response,
        "chunkReferences": chunk_references
    })

    log.debug("Outgoing JSON", json_output)
    return json_output


def main():
    """
    CLI entry point for backward compatibility.
    Expects six arguments from sys.argv:
    1) user_id
    2) class_name
    3) doc_id
    4) user_query
    5) chat_history JSON
    6) source
    """
    if len(sys.argv) < 7:
        log.error("Error: Not enough arguments provided.")
        sys.exit(1)

    user_id = sys.argv[1]
    class_name = sys.argv[2]
    doc_id = sys.argv[3]
    user_query = sys.argv[4]
    chat_history = json.loads(sys.argv[5])
    source = sys.argv[6].lower()

    try:
        result = process_semantic_search(user_id, class_name, doc_id, user_query, chat_history, source)
        log.debug(json.dumps(result))
    except Exception as e:
        log.error(f"Error: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log.error(f"Error: {str(e)}")
        sys.exit(1)
