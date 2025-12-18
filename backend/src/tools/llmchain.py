from langchain.chains import LLMChain
from langchain.prompts.prompt import PromptTemplate

from llm import llm, memory

prompt = PromptTemplate(
    template="""
    Instructions:
    You are an AI assistant for Duy Nguyen's professional portfolio. Answer questions about his background, skills, projects, and qualifications for internship opportunities.
    Use the conversation history to provide context-aware responses.
    When mentioning projects or achievements, provide relevant links from the portfolio when applicable.
    Keep responses concise, conversational, and focused on helping recruiters understand how Duy's experience aligns with their needs.

    ChatHistory:{chat_history}
    Question: {input}
    """,
    input_variables = ["chat_history", "input"]
)
chat_chain = LLMChain(llm=llm, prompt=prompt, memory=memory)
