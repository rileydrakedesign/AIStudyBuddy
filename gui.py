import streamlit as st
from streamlit_extras.add_vertical_space import add_vertical_space

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

if __name__ == '__main__':
    main()