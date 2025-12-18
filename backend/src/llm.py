from langchain_anthropic import ChatAnthropic
# from langchain_openai.embeddings import OpenAIEmbeddings  # Not currently used
from langchain.chains.conversation.memory import ConversationBufferMemory
import os
from dotenv import load_dotenv

#Load variables usinig dotenv
load_dotenv()

# LLM
llm = ChatAnthropic(
    anthropic_api_key = os.getenv("ANTHROPIC_API_KEY"),
    model = os.getenv("ANTHROPIC_MODEL"),
)

# Embeddings for Vector Search Index (commented out - not currently used)
# embeddings = OpenAIEmbeddings(
#     openai_api_key = os.getenv("OPENAI_API_KEY"),
# )

#Memory that uses all conversation 
memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True)
