"""
Second Brain PKM - Data Preparation

Prepares exported knowledge for Personal Knowledge Model training.
Converts JSONL exports into tokenized binary format for efficient training.
"""

import os
import json
import argparse
from pathlib import Path
from typing import List, Dict, Any, Optional
import numpy as np

# Token constants for PKM
PKM_SPECIAL_TOKENS = {
    "pad": "<|pad|>",
    "eos": "<|endoftext|>",
    "bos": "<|startoftext|>",
    "user": "<|user|>",
    "assistant": "<|assistant|>",
    "system": "<|system|>",
    "knowledge": "<|knowledge|>",
}


class PKMDataPreparer:
    """
    Prepare Second Brain knowledge exports for PKM training.

    Handles multiple input formats:
    - conversation: ChatML-style messages
    - completion: Prompt/completion pairs
    - raw_text: Plain text corpus
    - nanochat_sft: SFT conversation format
    """

    def __init__(self, tokenizer_name: str = "gpt2"):
        """
        Initialize the data preparer.

        Args:
            tokenizer_name: Name of the tokenizer to use (default: gpt2)
        """
        self.tokenizer_name = tokenizer_name
        self._init_tokenizer()

    def _init_tokenizer(self):
        """Initialize the tokenizer."""
        try:
            import tiktoken
            self.enc = tiktoken.get_encoding(self.tokenizer_name)
            self.vocab_size = self.enc.n_vocab
            print(f"Initialized {self.tokenizer_name} tokenizer (vocab size: {self.vocab_size})")
        except ImportError:
            raise ImportError(
                "tiktoken is required for PKM data preparation.\n"
                "Install with: pip install tiktoken"
            )

    def prepare(
        self,
        input_path: str,
        output_dir: str,
        val_split: float = 0.1,
        max_seq_length: int = 1024,
        format: str = "auto",
    ) -> Dict[str, Any]:
        """
        Prepare knowledge data for PKM training.

        Args:
            input_path: Path to JSONL export file
            output_dir: Directory to save prepared data
            val_split: Fraction of data for validation (default: 0.1)
            max_seq_length: Maximum sequence length (default: 1024)
            format: Input format (auto-detected if 'auto')

        Returns:
            Statistics about the prepared data
        """
        input_path = Path(input_path)
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        print(f"Loading knowledge from: {input_path}")

        # Load and detect format
        data = self._load_jsonl(input_path)
        if not data:
            return {"error": "No data found in input file"}

        detected_format = self._detect_format(data[0]) if format == "auto" else format
        print(f"Detected format: {detected_format}")

        # Convert to training sequences
        print("Converting knowledge to training sequences...")
        sequences = self._convert_to_sequences(data, detected_format, max_seq_length)

        if not sequences:
            return {"error": "No valid sequences generated"}

        # Tokenize all sequences
        print("Tokenizing sequences...")
        all_tokens = []
        for seq in sequences:
            tokens = self.enc.encode(seq, allowed_special={"<|endoftext|>"})
            all_tokens.extend(tokens)
            all_tokens.append(self.enc.encode("<|endoftext|>", allowed_special={"<|endoftext|>"})[0])

        # Convert to numpy array
        tokens_array = np.array(all_tokens, dtype=np.uint16)

        # Split train/val
        n = len(tokens_array)
        split_idx = int(n * (1 - val_split))

        train_tokens = tokens_array[:split_idx]
        val_tokens = tokens_array[split_idx:]

        # Save binary files
        train_path = output_dir / "train.bin"
        val_path = output_dir / "val.bin"

        train_tokens.tofile(train_path)
        val_tokens.tofile(val_path)

        # Save metadata
        metadata = {
            "vocab_size": self.vocab_size,
            "train_tokens": len(train_tokens),
            "val_tokens": len(val_tokens),
            "total_tokens": n,
            "total_sequences": len(sequences),
            "max_seq_length": max_seq_length,
            "format": detected_format,
            "tokenizer": self.tokenizer_name,
        }

        metadata_path = output_dir / "meta.json"
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)

        print(f"\nPKM Data Preparation Complete!")
        print(f"  Train tokens: {len(train_tokens):,}")
        print(f"  Val tokens: {len(val_tokens):,}")
        print(f"  Total sequences: {len(sequences):,}")
        print(f"  Output directory: {output_dir}")

        return metadata

    def _load_jsonl(self, path: Path) -> List[Dict[str, Any]]:
        """Load JSONL file."""
        data = []
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    data.append(json.loads(line))
        return data

    def _detect_format(self, sample: Dict[str, Any]) -> str:
        """Auto-detect the input format from a sample."""
        if "messages" in sample:
            return "conversation"
        elif "conversations" in sample:
            return "nanochat_sft"
        elif "prompt" in sample and "completion" in sample:
            return "completion"
        elif "text" in sample:
            return "raw_text"
        else:
            return "unknown"

    def _convert_to_sequences(
        self,
        data: List[Dict[str, Any]],
        format: str,
        max_seq_length: int,
    ) -> List[str]:
        """Convert data items to training sequences."""
        sequences = []

        for item in data:
            if format == "conversation":
                seq = self._format_conversation(item)
            elif format == "nanochat_sft":
                seq = self._format_nanochat_sft(item)
            elif format == "completion":
                seq = self._format_completion(item)
            elif format == "raw_text":
                seq = item.get("text", "")
            else:
                continue

            if seq and len(seq) > 10:  # Skip very short sequences
                sequences.append(seq)

        return sequences

    def _format_conversation(self, item: Dict[str, Any]) -> str:
        """Format ChatML-style conversation."""
        messages = item.get("messages", [])
        parts = []

        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            if role == "user":
                parts.append(f"User: {content}")
            elif role == "assistant":
                parts.append(f"Assistant: {content}")
            elif role == "system":
                parts.append(f"System: {content}")

        return "\n\n".join(parts)

    def _format_nanochat_sft(self, item: Dict[str, Any]) -> str:
        """Format nanochat SFT conversation."""
        conversations = item.get("conversations", [])
        parts = []

        for conv in conversations:
            role = conv.get("from", "human")
            content = conv.get("value", "")

            if role == "human":
                parts.append(f"User: {content}")
            elif role == "gpt":
                parts.append(f"Assistant: {content}")

        return "\n\n".join(parts)

    def _format_completion(self, item: Dict[str, Any]) -> str:
        """Format prompt/completion pair."""
        prompt = item.get("prompt", "")
        completion = item.get("completion", "")
        return f"User: {prompt}\n\nAssistant: {completion}"

    def prepare_for_chat_sft(
        self,
        input_path: str,
        output_dir: str,
        val_split: float = 0.1,
    ) -> Dict[str, Any]:
        """
        Prepare data specifically for chat/instruction fine-tuning.

        This creates a format optimized for teaching the model
        to respond to questions based on your knowledge.
        """
        input_path = Path(input_path)
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        data = self._load_jsonl(input_path)
        if not data:
            return {"error": "No data found"}

        # Convert all to SFT format
        sft_data = []
        for item in data:
            format = self._detect_format(item)

            if format == "conversation":
                messages = item.get("messages", [])
                if len(messages) >= 2:
                    sft_data.append({
                        "conversations": [
                            {"from": "human", "value": messages[0].get("content", "")},
                            {"from": "gpt", "value": messages[1].get("content", "")},
                        ]
                    })
            elif format == "nanochat_sft":
                sft_data.append(item)
            elif format == "completion":
                sft_data.append({
                    "conversations": [
                        {"from": "human", "value": item.get("prompt", "")},
                        {"from": "gpt", "value": item.get("completion", "")},
                    ]
                })

        # Split train/val
        n = len(sft_data)
        split_idx = int(n * (1 - val_split))

        train_data = sft_data[:split_idx]
        val_data = sft_data[split_idx:]

        # Save JSONL files
        train_path = output_dir / "train.jsonl"
        val_path = output_dir / "val.jsonl"

        with open(train_path, "w", encoding="utf-8") as f:
            for item in train_data:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")

        with open(val_path, "w", encoding="utf-8") as f:
            for item in val_data:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")

        # Save task config for Second Brain PKM
        task_config = {
            "name": "second_brain_pkm",
            "type": "customjson",
            "train_path": str(train_path),
            "val_path": str(val_path),
            "weight": 1.0,
        }

        config_path = output_dir / "pkm_task_config.json"
        with open(config_path, "w") as f:
            json.dump(task_config, f, indent=2)

        print(f"\nPKM Chat SFT Data Prepared!")
        print(f"  Train examples: {len(train_data):,}")
        print(f"  Val examples: {len(val_data):,}")
        print(f"  Task config: {config_path}")

        return {
            "train_path": str(train_path),
            "val_path": str(val_path),
            "config_path": str(config_path),
            "train_examples": len(train_data),
            "val_examples": len(val_data),
        }


def main():
    parser = argparse.ArgumentParser(
        description="Second Brain PKM - Prepare your knowledge for training",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Prepare for base model training
  python prepare_data.py --input exports/knowledge.jsonl --output data/my_knowledge/

  # Prepare for chat/instruction fine-tuning
  python prepare_data.py --input exports/knowledge.jsonl --output data/my_knowledge/ --mode sft

  # Custom validation split and sequence length
  python prepare_data.py --input exports/knowledge.jsonl --output data/my_knowledge/ --val-split 0.15 --max-seq-length 2048
        """
    )

    parser.add_argument(
        "--input", "-i",
        required=True,
        help="Path to exported knowledge JSONL file"
    )

    parser.add_argument(
        "--output", "-o",
        required=True,
        help="Output directory for prepared data"
    )

    parser.add_argument(
        "--mode",
        choices=["base", "sft"],
        default="base",
        help="Preparation mode: 'base' for pretraining, 'sft' for chat fine-tuning (default: base)"
    )

    parser.add_argument(
        "--val-split",
        type=float,
        default=0.1,
        help="Fraction of data for validation (default: 0.1)"
    )

    parser.add_argument(
        "--max-seq-length",
        type=int,
        default=1024,
        help="Maximum sequence length (default: 1024)"
    )

    parser.add_argument(
        "--format",
        choices=["auto", "conversation", "completion", "raw_text", "nanochat_sft"],
        default="auto",
        help="Input format (default: auto-detect)"
    )

    parser.add_argument(
        "--tokenizer",
        default="gpt2",
        help="Tokenizer to use (default: gpt2)"
    )

    args = parser.parse_args()

    print("=" * 60)
    print("Second Brain PKM - Data Preparation")
    print("=" * 60)
    print(f"Input: {args.input}")
    print(f"Output: {args.output}")
    print(f"Mode: {args.mode}")
    print("=" * 60)

    preparer = PKMDataPreparer(tokenizer_name=args.tokenizer)

    if args.mode == "sft":
        result = preparer.prepare_for_chat_sft(
            input_path=args.input,
            output_dir=args.output,
            val_split=args.val_split,
        )
    else:
        result = preparer.prepare(
            input_path=args.input,
            output_dir=args.output,
            val_split=args.val_split,
            max_seq_length=args.max_seq_length,
            format=args.format,
        )

    if "error" in result:
        print(f"\nError: {result['error']}")
        exit(1)

    print("\nYour knowledge is ready for training!")
    print("Next step: python train_pkm.py --config config/pkm_small.py")


if __name__ == "__main__":
    main()
