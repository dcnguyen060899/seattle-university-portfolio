"""
Authentication API Endpoints

User registration, login, and token management.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field, EmailStr

from app.db.postgres import get_db
from app.api.deps import get_current_user
from app.models.db_models import User
from app.models.schemas import UserResponse
from app.core.security import (
    get_password_hash,
    verify_password,
    create_token_pair,
    create_access_token,
    decode_token,
    TokenPair,
)


router = APIRouter()


# === Request/Response Schemas ===


class RegisterRequest(BaseModel):
    """Schema for user registration."""
    email: EmailStr = Field(..., description="User's email address")
    password: str = Field(..., min_length=8, description="Password (min 8 characters)")
    name: Optional[str] = Field(None, description="User's display name")


class LoginRequest(BaseModel):
    """Schema for login request."""
    email: EmailStr = Field(..., description="User's email address")
    password: str = Field(..., description="User's password")


class TokenResponse(BaseModel):
    """Schema for token response."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="Access token expiry in seconds")


class RefreshRequest(BaseModel):
    """Schema for token refresh request."""
    refresh_token: str = Field(..., description="Refresh token")


class AuthResponse(BaseModel):
    """Schema for auth response with user info."""
    user: UserResponse
    tokens: TokenResponse


# === Endpoints ===


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new user account.

    Creates a new user and returns authentication tokens.

    Args:
        request: Registration details (email, password, optional name)

    Returns:
        User info and authentication tokens

    Raises:
        400: If email is already registered
    """
    # Check if email already exists
    result = await db.execute(
        select(User).where(User.email == request.email.lower())
    )
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Create new user
    user = User(
        email=request.email.lower(),
        hashed_password=get_password_hash(request.password),
        settings={"name": request.name} if request.name else {},
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Generate tokens
    tokens = create_token_pair(str(user.id), user.email)

    return AuthResponse(
        user=UserResponse(
            id=user.id,
            email=user.email,
            created_at=user.created_at,
            subscription_tier=user.subscription_tier,
        ),
        tokens=TokenResponse(
            access_token=tokens.access_token,
            refresh_token=tokens.refresh_token,
            token_type="bearer",
            expires_in=30 * 60,  # 30 minutes in seconds
        ),
    )


@router.post("/login", response_model=AuthResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Login with email and password.

    Authenticates user and returns new tokens.

    Args:
        request: Login credentials

    Returns:
        User info and authentication tokens

    Raises:
        401: If credentials are invalid
    """
    # Find user by email
    result = await db.execute(
        select(User).where(User.email == request.email.lower())
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Verify password
    if not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    # Generate tokens
    tokens = create_token_pair(str(user.id), user.email)

    return AuthResponse(
        user=UserResponse(
            id=user.id,
            email=user.email,
            created_at=user.created_at,
            subscription_tier=user.subscription_tier,
        ),
        tokens=TokenResponse(
            access_token=tokens.access_token,
            refresh_token=tokens.refresh_token,
            token_type="bearer",
            expires_in=30 * 60,
        ),
    )


@router.post("/login/form", response_model=TokenResponse)
async def login_form(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """
    Login using OAuth2 password flow (form data).

    This endpoint is compatible with OAuth2 clients and Swagger UI.

    Args:
        form_data: Username (email) and password from form

    Returns:
        Authentication tokens
    """
    # Find user by email (username field contains email)
    result = await db.execute(
        select(User).where(User.email == form_data.username.lower())
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    tokens = create_token_pair(str(user.id), user.email)

    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        token_type="bearer",
        expires_in=30 * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Refresh access token using refresh token.

    Args:
        request: Refresh token

    Returns:
        New access and refresh tokens

    Raises:
        401: If refresh token is invalid or expired
    """
    # Decode refresh token
    token_data = decode_token(request.refresh_token)

    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    # Verify user still exists and is active
    result = await db.execute(
        select(User).where(User.id == token_data.user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    # Generate new tokens
    tokens = create_token_pair(str(user.id), user.email)

    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        token_type="bearer",
        expires_in=30 * 60,
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    user: User = Depends(get_current_user),
):
    """
    Get current user information.

    Requires authentication.

    Returns:
        Current user's profile information
    """
    return UserResponse(
        id=user.id,
        email=user.email,
        created_at=user.created_at,
        subscription_tier=user.subscription_tier,
    )


@router.post("/logout")
async def logout(
    user: User = Depends(get_current_user),
):
    """
    Logout current user.

    In a stateless JWT system, logout is handled client-side by
    discarding the tokens. This endpoint can be used to:
    - Invalidate refresh tokens (if using a token blacklist)
    - Clear server-side session data
    - Log the logout event

    Returns:
        Success message
    """
    # In a more complete implementation, we could:
    # 1. Add the refresh token to a blacklist in Redis
    # 2. Clear any server-side session data
    # For now, just acknowledge the logout

    return {"message": "Successfully logged out"}
