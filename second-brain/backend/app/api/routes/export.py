"""
Export API Endpoints

Export knowledge for model training.
"""

from typing import Optional
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.db.postgres import get_db
from app.api.deps import get_current_user
from app.models.db_models import User
from app.services.export import TrainingDataExporter, ExportFormat


router = APIRouter()


class ExportRequest(BaseModel):
    """Request schema for export."""
    format: ExportFormat = ExportFormat.CONVERSATION
    include_synthetic: bool = True
    include_connections: bool = True
    min_content_length: int = 50


class ExportResponse(BaseModel):
    """Response schema for export."""
    filepath: str
    format: str
    total_examples: int
    notes_processed: int
    stats: dict


@router.post("/training-data", response_model=ExportResponse)
async def export_training_data(
    request: ExportRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Export knowledge as training data for model fine-tuning.

    Formats:
    - conversation: ChatML-style messages (for instruction tuning)
    - completion: Prompt/completion pairs
    - raw_text: Plain text corpus (for pretraining)
    - nanochat_sft: nanochat's SFT format

    The export includes:
    - Direct Q&A from notes
    - Synthetic Q&A generated from content patterns
    - Connection-based training data
    """
    exporter = TrainingDataExporter(db)

    result = await exporter.export_for_training(
        user_id=user.id,
        format=request.format,
        include_synthetic=request.include_synthetic,
        include_connections=request.include_connections,
        min_content_length=request.min_content_length,
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return ExportResponse(**result)


@router.post("/pkm-base")
async def export_for_pkm_base(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Export for PKM base model training.

    Creates tokenized binary files (train.bin, val.bin) ready for
    Personal Knowledge Model training.

    Usage after export:
    ```bash
    brain pkm prepare --input exports/knowledge.jsonl
    brain pkm train --config small
    ```
    """
    exporter = TrainingDataExporter(db)

    result = await exporter.export_for_nanogpt(user_id=user.id)

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


@router.post("/pkm-sft")
async def export_for_pkm_sft(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Export for PKM supervised fine-tuning (SFT).

    Creates JSONL file and task config optimized for
    instruction-following training.

    Usage after export:
    ```bash
    brain pkm prepare --input exports/knowledge.jsonl --mode sft
    brain pkm train --config small
    ```
    """
    exporter = TrainingDataExporter(db)

    result = await exporter.export_for_nanochat(user_id=user.id)

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


@router.get("/download/{filename}")
async def download_export(
    filename: str,
    user: User = Depends(get_current_user),
):
    """
    Download an exported file.

    Security: Only allows downloading files that belong to the user
    (filename must contain user ID).
    """
    import os
    from pathlib import Path

    # Security check: filename must contain user ID
    if str(user.id) not in filename:
        raise HTTPException(status_code=403, detail="Access denied")

    # Check in various export directories
    for export_dir in ["exports", "exports/nanogpt", "exports/nanochat"]:
        filepath = Path(export_dir) / filename
        if filepath.exists():
            return FileResponse(
                path=str(filepath),
                filename=filename,
                media_type="application/octet-stream",
            )

    raise HTTPException(status_code=404, detail="File not found")
