from langchain_anthropic import ChatAnthropic
# from langchain_openai.embeddings import OpenAIEmbeddings  # Not currently used
from langchain.chains.conversation.memory import ConversationBufferMemory
import os
from dotenv import load_dotenv

#Load variables usinig dotenv
load_dotenv()

# LLM
llm = ChatAnthropic(
    anthropic_api_key=os.getenv("ANTHROPIC_API_KEY") or "",
    model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5"),
    max_tokens=4096,  # long-form answers (cover letters); the app boots without a key
    model_kwargs={"thinking": {"type": "disabled"}},   # Sonnet 5 thinks by default; the extra thinking block breaks the ReAct parser in langchain-anthropic 0.1.11
)

# Embeddings for Vector Search Index (commented out - not currently used)
# embeddings = OpenAIEmbeddings(
#     openai_api_key = os.getenv("OPENAI_API_KEY"),
# )

#Memory that uses all conversation 
memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True)
# evaluation_memory removed: the evaluation backend lives in evaluation/ and uses the anthropic SDK directly