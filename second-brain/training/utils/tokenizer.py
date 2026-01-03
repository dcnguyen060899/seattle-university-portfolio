"""
Second Brain PKM - Tokenization Utilities

Provides tokenization tools for the Personal Knowledge Model.
"""

from typing import List, Optional, Dict, Any
import json


class PKMTokenizer:
    """
    Tokenizer wrapper for PKM training and inference.

    Supports GPT-2 compatible tokenization with special tokens
    for structured knowledge representation.
    """

    # PKM special tokens
    SPECIAL_TOKENS = {
        "pad": "<|pad|>",
        "eos": "<|endoftext|>",
        "bos": "<|startoftext|>",
        "user": "<|user|>",
        "assistant": "<|assistant|>",
        "system": "<|system|>",
        "knowledge": "<|knowledge|>",
        "question": "<|question|>",
        "answer": "<|answer|>",
        "context": "<|context|>",
    }

    def __init__(self, tokenizer_name: str = "gpt2"):
        """
        Initialize tokenizer.

        Args:
            tokenizer_name: Base tokenizer to use (default: gpt2)
        """
        self.tokenizer_name = tokenizer_name
        self._load_tokenizer()

    def _load_tokenizer(self):
        """Load the underlying tokenizer."""
        try:
            import tiktoken
            self.enc = tiktoken.get_encoding(self.tokenizer_name)
            self.vocab_size = self.enc.n_vocab
        except ImportError:
            raise ImportError(
                "tiktoken is required for PKM tokenization.\n"
                "Install with: pip install tiktoken"
            )

    def encode(
        self,
        text: str,
        add_special_tokens: bool = True,
        max_length: Optional[int] = None,
    ) -> List[int]:
        """
        Encode text to token IDs.

        Args:
            text: Input text
            add_special_tokens: Whether to allow special tokens
            max_length: Maximum sequence length (truncate if exceeded)

        Returns:
            List of token IDs
        """
        allowed_special = {"<|endoftext|>"} if add_special_tokens else set()
        tokens = self.enc.encode(text, allowed_special=allowed_special)

        if max_length and len(tokens) > max_length:
            tokens = tokens[:max_length]

        return tokens

    def decode(self, tokens: List[int]) -> str:
        """
        Decode token IDs to text.

        Args:
            tokens: List of token IDs

        Returns:
            Decoded text
        """
        return self.enc.decode(tokens)

    def encode_conversation(
        self,
        messages: List[Dict[str, str]],
        max_length: Optional[int] = None,
    ) -> List[int]:
        """
        Encode a conversation to tokens.

        Args:
            messages: List of {"role": "user"|"assistant", "content": "..."}
            max_length: Maximum sequence length

        Returns:
            List of token IDs
        """
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

        text = "\n\n".join(parts)
        return self.encode(text, max_length=max_length)

    def count_tokens(self, text: str) -> int:
        """
        Count tokens in text.

        Args:
            text: Input text

        Returns:
            Number of tokens
        """
        return len(self.encode(text))

    def truncate_to_tokens(self, text: str, max_tokens: int) -> str:
        """
        Truncate text to a maximum number of tokens.

        Args:
            text: Input text
            max_tokens: Maximum number of tokens

        Returns:
            Truncated text
        """
        tokens = self.encode(text)
        if len(tokens) <= max_tokens:
            return text
        return self.decode(tokens[:max_tokens])


def get_tokenizer(name: str = "gpt2") -> PKMTokenizer:
    """
    Get a tokenizer instance.

    Args:
        name: Tokenizer name

    Returns:
        PKMTokenizer instance
    """
    return PKMTokenizer(name)


def count_tokens_in_file(filepath: str, tokenizer_name: str = "gpt2") -> Dict[str, Any]:
    """
    Count tokens in a JSONL file.

    Args:
        filepath: Path to JSONL file
        tokenizer_name: Tokenizer to use

    Returns:
        Token statistics
    """
    tokenizer = PKMTokenizer(tokenizer_name)
    total_tokens = 0
    num_examples = 0

    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            data = json.loads(line)

            # Handle different formats
            if "text" in data:
                text = data["text"]
            elif "messages" in data:
                text = " ".join(m.get("content", "") for m in data["messages"])
            elif "conversations" in data:
                text = " ".join(c.get("value", "") for c in data["conversations"])
            elif "prompt" in data and "completion" in data:
                text = data["prompt"] + " " + data["completion"]
            else:
                text = str(data)

            total_tokens += tokenizer.count_tokens(text)
            num_examples += 1

    return {
        "total_tokens": total_tokens,
        "num_examples": num_examples,
        "avg_tokens_per_example": total_tokens // num_examples if num_examples else 0,
        "estimated_training_time_small": f"{total_tokens / 1_000_000 * 30:.0f} minutes",
        "estimated_training_time_medium": f"{total_tokens / 1_000_000 * 120:.0f} minutes",
    }


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        filepath = sys.argv[1]
        print(f"Analyzing: {filepath}")
        stats = count_tokens_in_file(filepath)
        for key, value in stats.items():
            print(f"  {key}: {value}")
    else:
        # Demo
        tokenizer = PKMTokenizer()
        text = "Hello, this is a test of the PKM tokenizer."
        tokens = tokenizer.encode(text)
        print(f"Text: {text}")
        print(f"Tokens: {tokens}")
        print(f"Count: {len(tokens)}")
        print(f"Decoded: {tokenizer.decode(tokens)}")
