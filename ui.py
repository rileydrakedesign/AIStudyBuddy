import streamlit as st
from semantic_search import handle_question, load_prompts, format_prompt
from langchain_openai import ChatOpenAI

# Initialize LLM
llm = ChatOpenAI(model="gpt-3.5-turbo-0125", temperature=0.5)

def main():
    st.title("Chat Interface")

    query = st.text_input("Enter your query here:")

    if st.button("Chat"):
        if query:
            context = handle_question(query, is_essay_grade=False)
            prompts = load_prompts('prompts.json')
            selected_prompt = prompts["question_answering"]
            formatted_prompt = format_prompt(selected_prompt, text=query, context=context)
            response = llm.invoke(formatted_prompt)
            st.write(response)

if __name__ == '__main__':
    main()
