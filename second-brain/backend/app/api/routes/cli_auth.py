"""
CLI Authentication Endpoints

OAuth-like flow for authenticating Claude Code CLI with Second Brain.

Flow:
1. CLI calls /initiate -> gets session_token
2. CLI opens browser to frontend /cli-auth?token=xxx
3. User logs in on web
4. Web calls /complete with user's API key
5. CLI polls /status until complete, gets API key
"""

import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.db.postgres import get_db
from app.db.redis import cache_get, cache_set, cache_delete
from app.models.db_models import User
from app.api.deps import get_current_user


router = APIRouter()

# Session expires after 10 minutes
SESSION_EXPIRY_SECONDS = 600


class InitiateResponse(BaseModel):
    """Response from initiating CLI auth."""
    session_token: str
    auth_url: str
    expires_in: int


class StatusResponse(BaseModel):
    """Response from checking auth status."""
    status: str  # "pending", "completed", "expired"
    user_email: Optional[str] = None
    api_key: Optional[str] = None


class CompleteRequest(BaseModel):
    """Request to complete CLI auth."""
    session_token: str


@router.post("/initiate", response_model=InitiateResponse)
async def initiate_cli_auth():
    """
    Initiate CLI authentication flow.

    Returns a session token that the CLI uses to:
    1. Open browser to auth URL
    2. Poll for completion
    """
    # Generate secure session token
    session_token = secrets.token_urlsafe(32)

    # Store session in Redis
    session_data = {
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await cache_set(
        f"cli_auth:{session_token}",
        session_data,
        ttl=SESSION_EXPIRY_SECONDS
    )

    # Frontend URL for authentication
    auth_url = f"http://localhost:5173/cli-auth?token={session_token}"

    return InitiateResponse(
        session_token=session_token,
        auth_url=auth_url,
        expires_in=SESSION_EXPIRY_SECONDS
    )


@router.get("/status/{session_token}", response_model=StatusResponse)
async def check_auth_status(session_token: str):
    """
    Check the status of a CLI auth session.

    CLI polls this endpoint until status is "completed" or "expired".
    """
    session_data = await cache_get(f"cli_auth:{session_token}")

    if not session_data:
        return StatusResponse(status="expired")

    if session_data.get("status") == "completed":
        # Return the API key and clear the session
        api_key = session_data.get("api_key")
        user_email = session_data.get("user_email")

        # Delete session after successful retrieval
        await cache_delete(f"cli_auth:{session_token}")

        return StatusResponse(
            status="completed",
            user_email=user_email,
            api_key=api_key
        )

    return StatusResponse(status="pending")


@router.post("/complete")
async def complete_cli_auth(
    request: CompleteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Complete CLI authentication (called by frontend after user logs in).

    Generates a personal API key for the user and stores it in the session.
    """
    session_token = request.session_token

    # Check if session exists and is pending
    session_data = await cache_get(f"cli_auth:{session_token}")

    if not session_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session expired or not found"
        )

    if session_data.get("status") != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session already completed"
        )

    # Generate personal API key for this user
    api_key = f"sb-{user.id}-{secrets.token_urlsafe(16)}"

    # Store API key in user settings (for validation later)
    user.settings = {**user.settings, "cli_api_key": api_key}
    await db.commit()

    # Update session with completed status and API key
    session_data["status"] = "completed"
    session_data["api_key"] = api_key
    session_data["user_email"] = user.email
    session_data["user_id"] = str(user.id)

    await cache_set(
        f"cli_auth:{session_token}",
        session_data,
        ttl=60  # Give CLI 60 seconds to retrieve the key
    )

    return {"message": "Authentication completed", "email": user.email}


@router.get("/validate/{api_key}")
async def validate_api_key(
    api_key: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Validate a CLI API key and return the associated user.

    Used by MCP server to authenticate requests.
    """
    # Extract user ID from API key (format: sb-{user_id}-{random})
    if not api_key.startswith("sb-"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key format"
        )

    try:
        parts = api_key.split("-")
        if len(parts) < 3:
            raise ValueError("Invalid format")
        user_id = parts[1]
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key"
        )

    # Find user and verify API key
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    # Verify API key matches
    stored_key = user.settings.get("cli_api_key")
    if stored_key != api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key"
        )

    return {
        "valid": True,
        "user_id": str(user.id),
        "email": user.email
    }
