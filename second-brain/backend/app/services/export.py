"""
Training Data Export Service

Exports Second Brain knowledge for model training with nanoGPT/nanochat.
Converts notes, connections, and context into training-ready formats.
"""

import json
import re
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional, Literal
from uuid import UUID
from enum import Enum

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.db_models import Note, NoteTag, Tag, Entity, NoteEntity, Connection
from app.core.config import settings


class ExportFormat(str, Enum):
    """Supported export formats for training."""
    CONVERSATION = "conversation"  # ChatML-style messages
    COMPLETION = "completion"       # Prompt/completion pairs
    RAW_TEXT = "raw_text"          # Plain text corpus
    NANOCHAT_SFT = "nanochat_sft"  # nanochat SFT format


class TrainingDataExporter:
    """
    Export Second Brain knowledge for model training.

    Supports multiple formats:
    - conversation: ChatML-style for instruction tuning
    - completion: Prompt/completion for fine-tuning
    - raw_text: Plain text for pretraining
    - nanochat_sft: nanochat's SFT format
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def export_for_training(
        self,
        user_id: UUID,
        output_dir: str = "exports",
        format: ExportFormat = ExportFormat.CONVERSATION,
        include_synthetic: bool = True,
        include_connections: bool = True,
        min_content_length: int = 50,
    ) -> Dict[str, Any]:
        """
        Export user's knowledge as training data.

        Args:
            user_id: The user's ID
            output_dir: Directory to save exports
            format: Output format (conversation, completion, raw_text, nanochat_sft)
            include_synthetic: Generate synthetic Q&A pairs
            include_connections: Include connection-based training data
            min_content_length: Minimum content length to include

        Returns:
            Export statistics and file paths
        """
        # Create output directory
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        # Fetch all notes with related data
        notes = await self._fetch_notes(user_id, min_content_length)

        if not notes:
            return {"error": "No notes found for export", "count": 0}

        # Generate training data
        training_data = []

        # 1. Direct note conversions
        for note in notes:
            pairs = self._note_to_training_pairs(note, format)
            training_data.extend(pairs)

        # 2. Synthetic Q&A generation
        if include_synthetic:
            for note in notes:
                synthetic = self._generate_synthetic_qa(note, format)
                training_data.extend(synthetic)

        # 3. Connection-based training
        if include_connections:
            connections = await self._fetch_connections(user_id)
            for conn in connections:
                conn_data = self._connection_to_training(conn, format)
                if conn_data:
                    training_data.append(conn_data)

        # 4. Write to file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{user_id}_{format.value}_{timestamp}.jsonl"
        filepath = output_path / filename

        with open(filepath, "w", encoding="utf-8") as f:
            for item in training_data:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")

        # Calculate statistics
        stats = self._calculate_stats(training_data, format)

        return {
            "filepath": str(filepath),
            "format": format.value,
            "total_examples": len(training_data),
            "notes_processed": len(notes),
            "stats": stats,
        }

    async def _fetch_notes(
        self,
        user_id: UUID,
        min_length: int,
    ) -> List[Note]:
        """Fetch all notes with tags and entities."""
        result = await self.db.execute(
            select(Note)
            .where(Note.user_id == user_id)
            .options(
                selectinload(Note.note_tags).selectinload(NoteTag.tag),
                selectinload(Note.note_entities).selectinload(NoteEntity.entity),
            )
            .order_by(Note.created_at)
        )
        notes = result.scalars().all()

        # Filter by content length
        return [n for n in notes if len(n.content) >= min_length]

    async def _fetch_connections(self, user_id: UUID) -> List[Connection]:
        """Fetch all connections with related notes."""
        result = await self.db.execute(
            select(Connection)
            .where(Connection.user_id == user_id)
            .options(
                selectinload(Connection.source_note),
                selectinload(Connection.target_note),
            )
        )
        return result.scalars().all()

    def _note_to_training_pairs(
        self,
        note: Note,
        format: ExportFormat,
    ) -> List[Dict[str, Any]]:
        """Convert a note to training pairs."""
        pairs = []

        # Extract tags and entities
        tags = [nt.tag.name for nt in note.note_tags]
        entities = [ne.entity.name for ne in note.note_entities]

        # Get context
        project = note.context.get("project", "")
        source = note.source or "unknown"

        # Primary Q&A from content
        if note.context.get("question"):
            # Note already has a question
            pairs.append(self._format_pair(
                question=note.context["question"],
                answer=note.content,
                format=format,
                metadata={"source": source, "tags": tags},
            ))

        # Topic-based Q&A
        if tags:
            main_topic = tags[0]
            pairs.append(self._format_pair(
                question=f"What do you know about {main_topic}?",
                answer=note.content,
                format=format,
                metadata={"source": source, "tags": tags},
            ))

        # Explanation format
        main_concept = self._extract_main_concept(note.content)
        if main_concept:
            pairs.append(self._format_pair(
                question=f"Explain {main_concept}",
                answer=note.content,
                format=format,
                metadata={"source": source, "tags": tags},
            ))

        return pairs

    def _generate_synthetic_qa(
        self,
        note: Note,
        format: ExportFormat,
    ) -> List[Dict[str, Any]]:
        """Generate synthetic Q&A pairs from note content."""
        pairs = []
        content = note.content
        tags = [nt.tag.name for nt in note.note_tags]

        # 1. "How to" questions for procedural content
        if any(keyword in content.lower() for keyword in ["step", "first", "then", "finally", "to do"]):
            topic = self._extract_main_concept(content) or "this"
            pairs.append(self._format_pair(
                question=f"How do I {topic}?",
                answer=content,
                format=format,
            ))

        # 2. "What is" questions for definitional content
        if any(keyword in content.lower() for keyword in ["is a", "refers to", "means", "defined as"]):
            topic = self._extract_main_concept(content)
            if topic:
                pairs.append(self._format_pair(
                    question=f"What is {topic}?",
                    answer=content,
                    format=format,
                ))

        # 3. Problem-solution pairs
        if any(keyword in content.lower() for keyword in ["error", "bug", "fix", "solution", "solved", "issue"]):
            pairs.append(self._format_pair(
                question="How did you solve this problem?",
                answer=content,
                format=format,
            ))

            # More specific if we can extract error type
            error_match = re.search(r'(error|exception|issue)[:.\s]+([^.]+)', content, re.I)
            if error_match:
                error_desc = error_match.group(2).strip()[:100]
                pairs.append(self._format_pair(
                    question=f"How do I fix: {error_desc}?",
                    answer=content,
                    format=format,
                ))

        # 4. "Why" questions for reasoning content
        if any(keyword in content.lower() for keyword in ["because", "reason", "since", "therefore"]):
            topic = self._extract_main_concept(content) or "this approach"
            pairs.append(self._format_pair(
                question=f"Why {topic}?",
                answer=content,
                format=format,
            ))

        # 5. Code-related questions
        if "```" in content or any(keyword in content.lower() for keyword in ["function", "class", "import", "def ", "const ", "var "]):
            pairs.append(self._format_pair(
                question="Show me an example of this code pattern",
                answer=content,
                format=format,
            ))

        # 6. Tag-based questions
        for tag in tags[:3]:  # Limit to avoid too many
            pairs.append(self._format_pair(
                question=f"Tell me about {tag} based on your experience",
                answer=content,
                format=format,
            ))

        return pairs

    def _connection_to_training(
        self,
        connection: Connection,
        format: ExportFormat,
    ) -> Optional[Dict[str, Any]]:
        """Create training data from note connections."""
        if not connection.source_note or not connection.target_note:
            return None

        source_preview = connection.source_note.content[:200]
        target_preview = connection.target_note.content[:200]

        # Create connection-aware Q&A
        return self._format_pair(
            question=f"What's related to: {source_preview}...?",
            answer=f"This connects to: {target_preview}...\n\nThe connection strength is {connection.strength:.0%}, and they're related through {connection.connection_type} similarity.",
            format=format,
        )

    def _format_pair(
        self,
        question: str,
        answer: str,
        format: ExportFormat,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Format a Q&A pair according to the specified format."""

        if format == ExportFormat.CONVERSATION:
            return {
                "messages": [
                    {"role": "user", "content": question},
                    {"role": "assistant", "content": answer},
                ],
                **({"metadata": metadata} if metadata else {}),
            }

        elif format == ExportFormat.COMPLETION:
            return {
                "prompt": question,
                "completion": answer,
                **({"metadata": metadata} if metadata else {}),
            }

        elif format == ExportFormat.RAW_TEXT:
            return {
                "text": f"Question: {question}\n\nAnswer: {answer}",
            }

        elif format == ExportFormat.NANOCHAT_SFT:
            # nanochat uses a specific format for SFT
            return {
                "conversations": [
                    {"from": "human", "value": question},
                    {"from": "gpt", "value": answer},
                ],
            }

        return {"question": question, "answer": answer}

    def _extract_main_concept(self, content: str) -> Optional[str]:
        """Extract the main concept/topic from content."""
        # Look for common patterns

        # "X is Y" pattern
        match = re.search(r'^([A-Z][^.]{5,50})\s+(is|are|refers to|means)', content)
        if match:
            return match.group(1).strip()

        # First capitalized phrase
        match = re.search(r'([A-Z][a-z]+(?:\s+[A-Z]?[a-z]+){0,3})', content)
        if match:
            return match.group(1).strip()

        # First noun-like word after common starters
        match = re.search(r'(?:The|A|An)\s+([a-z]+(?:\s+[a-z]+)?)', content, re.I)
        if match:
            return match.group(1).strip()

        return None

    def _calculate_stats(
        self,
        training_data: List[Dict[str, Any]],
        format: ExportFormat,
    ) -> Dict[str, Any]:
        """Calculate statistics about the exported data."""
        total_chars = 0
        total_tokens_estimate = 0

        for item in training_data:
            if format == ExportFormat.CONVERSATION:
                text = " ".join(m["content"] for m in item.get("messages", []))
            elif format == ExportFormat.COMPLETION:
                text = item.get("prompt", "") + " " + item.get("completion", "")
            elif format == ExportFormat.RAW_TEXT:
                text = item.get("text", "")
            else:
                text = str(item)

            total_chars += len(text)
            # Rough token estimate: ~4 chars per token
            total_tokens_estimate += len(text) // 4

        return {
            "total_characters": total_chars,
            "estimated_tokens": total_tokens_estimate,
            "avg_example_length": total_chars // len(training_data) if training_data else 0,
        }

    async def export_for_nanogpt(
        self,
        user_id: UUID,
        output_dir: str = "exports/nanogpt",
    ) -> Dict[str, Any]:
        """
        Export in nanoGPT-ready format (tokenized binary files).

        Creates train.bin and val.bin files ready for nanoGPT training.
        """
        import numpy as np

        try:
            import tiktoken
            enc = tiktoken.get_encoding("gpt2")
        except ImportError:
            return {"error": "tiktoken not installed. Run: pip install tiktoken"}

        # First export as raw text
        export_result = await self.export_for_training(
            user_id=user_id,
            output_dir=output_dir,
            format=ExportFormat.RAW_TEXT,
            include_synthetic=True,
            include_connections=True,
        )

        if "error" in export_result:
            return export_result

        # Read the JSONL and convert to continuous text
        texts = []
        with open(export_result["filepath"], "r") as f:
            for line in f:
                item = json.loads(line)
                texts.append(item.get("text", ""))

        # Join with special token
        full_text = "<|endoftext|>".join(texts)

        # Tokenize
        tokens = enc.encode(full_text, allowed_special={"<|endoftext|>"})
        tokens_array = np.array(tokens, dtype=np.uint16)

        # Split 90/10 train/val
        n = len(tokens_array)
        split_idx = int(n * 0.9)

        train_tokens = tokens_array[:split_idx]
        val_tokens = tokens_array[split_idx:]

        # Save binary files
        output_path = Path(output_dir)
        train_path = output_path / "train.bin"
        val_path = output_path / "val.bin"

        train_tokens.tofile(train_path)
        val_tokens.tofile(val_path)

        return {
            "train_path": str(train_path),
            "val_path": str(val_path),
            "train_tokens": len(train_tokens),
            "val_tokens": len(val_tokens),
            "total_tokens": len(tokens_array),
            "vocab_size": enc.n_vocab,
        }

    async def export_for_nanochat(
        self,
        user_id: UUID,
        output_dir: str = "exports/nanochat",
    ) -> Dict[str, Any]:
        """
        Export in nanochat SFT format.

        Creates JSONL file compatible with nanochat's chat_sft.py script.
        """
        result = await self.export_for_training(
            user_id=user_id,
            output_dir=output_dir,
            format=ExportFormat.NANOCHAT_SFT,
            include_synthetic=True,
            include_connections=True,
        )

        if "error" in result:
            return result

        # Create nanochat task config
        task_config = {
            "name": "second_brain",
            "type": "customjson",
            "path": result["filepath"],
            "weight": 1.0,
        }

        config_path = Path(output_dir) / "task_config.json"
        with open(config_path, "w") as f:
            json.dump(task_config, f, indent=2)

        result["task_config"] = str(config_path)
        return result
