"""
Chat API Endpoints

Conversational interface with RAG and function calling.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.api.deps import get_current_user
from app.models.db_models import User
from app.models.schemas import ChatMessage, ChatResponse
from app.services.intelligence import IntelligenceService


router = APIRouter()


@router.post("", response_model=ChatResponse)
async def chat(
    message: ChatMessage,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Chat with your knowledge base.

    This endpoint uses RAG (Retrieval Augmented Generation) to:
    1. Understand your question
    2. Search your knowledge base for relevant context
    3. Generate a response grounded in YOUR knowledge
    4. Cite sources used

    The AI can also perform actions via function calling:
    - Add new notes
    - Search for specific information
    - Summarize topics
    - Find connections between ideas
    - Generate quizzes for review

    Args:
        message: Your message/question
        conversation_id: Optional ID to continue a conversation

    Returns:
        AI response with sources and any tool calls made
    """
    intelligence_service = IntelligenceService(db)
    response = await intelligence_service.chat(
        user_id=user.id,
        message=message.message,
        conversation_id=message.conversation_id,
    )
    return response
