"""
Second Brain PKM - Model Serving

Serve your Personal Knowledge Model for inference.
Provides both CLI and web API interfaces.
"""

import os
import sys
import json
import argparse
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass

import torch
import torch.nn.functional as F

# Import PKM model (assumes train_pkm.py is in same directory)
from train_pkm import PKM, PKMConfig


@dataclass
class GenerationConfig:
    """Configuration for text generation."""
    max_tokens: int = 256
    temperature: float = 0.8
    top_k: int = 50
    top_p: float = 0.9
    repetition_penalty: float = 1.1
    stop_tokens: List[str] = None

    def __post_init__(self):
        if self.stop_tokens is None:
            self.stop_tokens = ["User:", "<|endoftext|>"]


class PKMServer:
    """
    Server for Personal Knowledge Model inference.

    Provides:
    - Interactive CLI chat
    - REST API server
    - Hybrid mode with cloud fallback
    """

    def __init__(
        self,
        model_path: str,
        tokenizer_name: str = "gpt2",
        device: Optional[str] = None,
    ):
        """
        Initialize the PKM server.

        Args:
            model_path: Path to trained PKM checkpoint
            tokenizer_name: Tokenizer to use (default: gpt2)
            device: Device to run on (auto-detected if None)
        """
        self.model_path = model_path
        self.tokenizer_name = tokenizer_name

        # Auto-detect device
        if device is None:
            if torch.cuda.is_available():
                self.device = "cuda"
            elif torch.backends.mps.is_available():
                self.device = "mps"
            else:
                self.device = "cpu"
        else:
            self.device = device

        # Load tokenizer
        self._init_tokenizer()

        # Load model
        self._load_model()

        print(f"PKM Server initialized on {self.device}")

    def _init_tokenizer(self):
        """Initialize the tokenizer."""
        try:
            import tiktoken
            self.enc = tiktoken.get_encoding(self.tokenizer_name)
            print(f"Loaded {self.tokenizer_name} tokenizer")
        except ImportError:
            raise ImportError(
                "tiktoken is required for PKM serving.\n"
                "Install with: pip install tiktoken"
            )

    def _load_model(self):
        """Load the trained PKM model."""
        print(f"Loading model from: {self.model_path}")

        checkpoint = torch.load(self.model_path, map_location="cpu")

        if isinstance(checkpoint, dict):
            # Full checkpoint with config
            if "config" in checkpoint:
                config = checkpoint["config"]
                self.model = PKM(config)
                self.model.load_state_dict(checkpoint["model"])
            else:
                # Just state dict
                config = PKMConfig()
                self.model = PKM(config)
                self.model.load_state_dict(checkpoint)
        else:
            raise ValueError("Invalid checkpoint format")

        self.model.to(self.device)
        self.model.eval()
        print(f"Model loaded successfully ({sum(p.numel() for p in self.model.parameters())/1e6:.1f}M parameters)")

    def encode(self, text: str) -> List[int]:
        """Encode text to tokens."""
        return self.enc.encode(text, allowed_special={"<|endoftext|>"})

    def decode(self, tokens: List[int]) -> str:
        """Decode tokens to text."""
        return self.enc.decode(tokens)

    @torch.no_grad()
    def generate(
        self,
        prompt: str,
        config: Optional[GenerationConfig] = None,
    ) -> str:
        """
        Generate a response given a prompt.

        Args:
            prompt: Input prompt
            config: Generation configuration

        Returns:
            Generated text
        """
        if config is None:
            config = GenerationConfig()

        # Encode prompt
        tokens = self.encode(prompt)
        x = torch.tensor([tokens], dtype=torch.long, device=self.device)

        # Generate
        for _ in range(config.max_tokens):
            # Crop to block size
            x_cond = x if x.size(1) <= self.model.config.block_size else x[:, -self.model.config.block_size:]

            # Forward pass
            logits, _ = self.model(x_cond)
            logits = logits[:, -1, :]

            # Apply temperature
            logits = logits / config.temperature

            # Apply repetition penalty
            if config.repetition_penalty != 1.0:
                for prev_token in set(x[0].tolist()):
                    logits[0, prev_token] /= config.repetition_penalty

            # Top-k filtering
            if config.top_k > 0:
                v, _ = torch.topk(logits, min(config.top_k, logits.size(-1)))
                logits[logits < v[:, [-1]]] = float('-inf')

            # Top-p (nucleus) filtering
            if config.top_p < 1.0:
                sorted_logits, sorted_indices = torch.sort(logits, descending=True)
                cumulative_probs = torch.cumsum(F.softmax(sorted_logits, dim=-1), dim=-1)

                sorted_indices_to_remove = cumulative_probs > config.top_p
                sorted_indices_to_remove[..., 1:] = sorted_indices_to_remove[..., :-1].clone()
                sorted_indices_to_remove[..., 0] = 0

                indices_to_remove = sorted_indices_to_remove.scatter(1, sorted_indices, sorted_indices_to_remove)
                logits[indices_to_remove] = float('-inf')

            # Sample
            probs = F.softmax(logits, dim=-1)
            next_token = torch.multinomial(probs, num_samples=1)
            x = torch.cat([x, next_token], dim=1)

            # Check for stop tokens
            generated = self.decode(x[0].tolist())
            for stop in config.stop_tokens:
                if stop in generated[len(prompt):]:
                    # Remove stop token and return
                    end_idx = generated.find(stop, len(prompt))
                    return generated[len(prompt):end_idx].strip()

        # Return generated text (without prompt)
        return self.decode(x[0].tolist())[len(prompt):].strip()

    def chat(
        self,
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        config: Optional[GenerationConfig] = None,
    ) -> str:
        """
        Chat with your PKM.

        Args:
            user_message: User's input message
            conversation_history: Previous messages in the conversation
            config: Generation configuration

        Returns:
            Assistant's response
        """
        # Build prompt
        prompt_parts = []

        if conversation_history:
            for msg in conversation_history[-4:]:  # Keep last 4 turns
                role = msg.get("role", "user")
                content = msg.get("content", "")
                if role == "user":
                    prompt_parts.append(f"User: {content}")
                else:
                    prompt_parts.append(f"Assistant: {content}")

        prompt_parts.append(f"User: {user_message}")
        prompt_parts.append("Assistant:")

        prompt = "\n\n".join(prompt_parts) + " "

        # Generate response
        response = self.generate(prompt, config)
        return response

    def run_cli(self):
        """Run interactive CLI chat."""
        print("=" * 60)
        print("Second Brain PKM - Chat with Your Knowledge")
        print("=" * 60)
        print("Type 'quit' or 'exit' to end the conversation")
        print("Type 'clear' to clear conversation history")
        print("=" * 60)

        conversation_history = []
        config = GenerationConfig()

        while True:
            try:
                user_input = input("\nYou: ").strip()

                if not user_input:
                    continue

                if user_input.lower() in ["quit", "exit"]:
                    print("\nGoodbye! Your knowledge awaits next time.")
                    break

                if user_input.lower() == "clear":
                    conversation_history = []
                    print("Conversation cleared.")
                    continue

                # Generate response
                response = self.chat(user_input, conversation_history, config)

                print(f"\nPKM: {response}")

                # Update history
                conversation_history.append({"role": "user", "content": user_input})
                conversation_history.append({"role": "assistant", "content": response})

            except KeyboardInterrupt:
                print("\n\nGoodbye!")
                break
            except Exception as e:
                print(f"\nError: {e}")

    def run_server(self, host: str = "0.0.0.0", port: int = 8080):
        """Run REST API server."""
        try:
            from fastapi import FastAPI, HTTPException
            from fastapi.middleware.cors import CORSMiddleware
            from pydantic import BaseModel
            import uvicorn
        except ImportError:
            print("FastAPI and uvicorn are required for server mode.")
            print("Install with: pip install fastapi uvicorn")
            sys.exit(1)

        app = FastAPI(
            title="Second Brain PKM API",
            description="Personal Knowledge Model inference API",
            version="1.0.0",
        )

        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["*"],
            allow_headers=["*"],
        )

        class GenerateRequest(BaseModel):
            prompt: str
            max_tokens: int = 256
            temperature: float = 0.8
            top_k: int = 50
            top_p: float = 0.9

        class ChatRequest(BaseModel):
            message: str
            history: Optional[List[Dict[str, str]]] = None
            max_tokens: int = 256
            temperature: float = 0.8

        class GenerateResponse(BaseModel):
            text: str
            tokens_generated: int

        class ChatResponse(BaseModel):
            response: str

        @app.get("/health")
        def health():
            return {"status": "healthy", "model": self.model_path}

        @app.post("/generate", response_model=GenerateResponse)
        def generate(request: GenerateRequest):
            config = GenerationConfig(
                max_tokens=request.max_tokens,
                temperature=request.temperature,
                top_k=request.top_k,
                top_p=request.top_p,
            )
            text = self.generate(request.prompt, config)
            tokens = len(self.encode(text))
            return GenerateResponse(text=text, tokens_generated=tokens)

        @app.post("/chat", response_model=ChatResponse)
        def chat(request: ChatRequest):
            config = GenerationConfig(
                max_tokens=request.max_tokens,
                temperature=request.temperature,
            )
            response = self.chat(request.message, request.history, config)
            return ChatResponse(response=response)

        print(f"\nStarting PKM server on http://{host}:{port}")
        print(f"API docs available at http://{host}:{port}/docs")
        uvicorn.run(app, host=host, port=port)


class HybridPKM:
    """
    Hybrid inference: Local PKM + Cloud fallback.

    Uses your local PKM for domain knowledge, falls back to
    cloud APIs (Claude, OpenAI) for general knowledge.
    """

    def __init__(
        self,
        local_model: str,
        cloud_fallback: str = "claude",
        confidence_threshold: float = 0.7,
    ):
        """
        Initialize hybrid PKM.

        Args:
            local_model: Path to local PKM checkpoint
            cloud_fallback: Cloud API to use ("claude" or "openai")
            confidence_threshold: Confidence threshold for local vs cloud
        """
        self.pkm = PKMServer(local_model)
        self.cloud_fallback = cloud_fallback
        self.confidence_threshold = confidence_threshold

        # Initialize cloud client
        self._init_cloud()

    def _init_cloud(self):
        """Initialize cloud API client."""
        if self.cloud_fallback == "claude":
            try:
                import anthropic
                self.cloud_client = anthropic.Anthropic()
            except ImportError:
                print("Warning: anthropic not installed, cloud fallback disabled")
                self.cloud_client = None
        elif self.cloud_fallback == "openai":
            try:
                import openai
                self.cloud_client = openai.OpenAI()
            except ImportError:
                print("Warning: openai not installed, cloud fallback disabled")
                self.cloud_client = None

    def _estimate_confidence(self, prompt: str, response: str) -> float:
        """
        Estimate confidence in local response.

        Heuristics:
        - Length of response
        - Presence of uncertainty markers
        - Relevance to known topics
        """
        # Very basic heuristics - in production you'd want something smarter
        confidence = 0.5

        # Longer responses generally indicate more knowledge
        if len(response) > 100:
            confidence += 0.2
        if len(response) > 300:
            confidence += 0.1

        # Uncertainty markers reduce confidence
        uncertainty = ["i'm not sure", "i don't know", "maybe", "perhaps", "unclear"]
        for marker in uncertainty:
            if marker in response.lower():
                confidence -= 0.2

        # Very short or generic responses reduce confidence
        if len(response) < 20:
            confidence -= 0.3

        return max(0.0, min(1.0, confidence))

    def ask(
        self,
        question: str,
        force_local: bool = False,
        force_cloud: bool = False,
    ) -> Dict[str, Any]:
        """
        Ask a question with intelligent routing.

        Args:
            question: Your question
            force_local: Force use of local model
            force_cloud: Force use of cloud API

        Returns:
            Response with metadata about source
        """
        # Try local first
        local_response = self.pkm.chat(question)
        local_confidence = self._estimate_confidence(question, local_response)

        if force_local or (local_confidence >= self.confidence_threshold and not force_cloud):
            return {
                "response": local_response,
                "source": "local_pkm",
                "confidence": local_confidence,
            }

        # Fall back to cloud
        if self.cloud_client and not force_local:
            cloud_response = self._cloud_query(question)
            return {
                "response": cloud_response,
                "source": f"cloud_{self.cloud_fallback}",
                "confidence": 1.0,
                "local_response": local_response,
                "local_confidence": local_confidence,
            }

        # No cloud available, return local anyway
        return {
            "response": local_response,
            "source": "local_pkm",
            "confidence": local_confidence,
            "note": "Cloud fallback unavailable",
        }

    def _cloud_query(self, question: str) -> str:
        """Query cloud API."""
        if self.cloud_fallback == "claude":
            response = self.cloud_client.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=1024,
                messages=[{"role": "user", "content": question}],
            )
            return response.content[0].text

        elif self.cloud_fallback == "openai":
            response = self.cloud_client.chat.completions.create(
                model="gpt-3.5-turbo",
                max_tokens=1024,
                messages=[{"role": "user", "content": question}],
            )
            return response.choices[0].message.content

        return ""


def main():
    parser = argparse.ArgumentParser(
        description="Second Brain PKM - Serve your Personal Knowledge Model",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Interactive CLI chat
  python serve_pkm.py --model checkpoints/pkm_best.pt

  # Run REST API server
  python serve_pkm.py --model checkpoints/pkm_best.pt --server --port 8080

  # Hybrid mode with Claude fallback
  python serve_pkm.py --model checkpoints/pkm_best.pt --hybrid --cloud claude
        """
    )

    parser.add_argument(
        "--model", "-m",
        required=True,
        help="Path to trained PKM checkpoint"
    )

    parser.add_argument(
        "--server", "-s",
        action="store_true",
        help="Run as REST API server"
    )

    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Server host (default: 0.0.0.0)"
    )

    parser.add_argument(
        "--port",
        type=int,
        default=8080,
        help="Server port (default: 8080)"
    )

    parser.add_argument(
        "--device",
        choices=["cuda", "mps", "cpu"],
        help="Device to run on (default: auto-detect)"
    )

    parser.add_argument(
        "--hybrid",
        action="store_true",
        help="Enable hybrid mode with cloud fallback"
    )

    parser.add_argument(
        "--cloud",
        choices=["claude", "openai"],
        default="claude",
        help="Cloud API for hybrid mode (default: claude)"
    )

    args = parser.parse_args()

    if not os.path.exists(args.model):
        print(f"Error: Model not found at {args.model}")
        print("Train a model first with: python train_pkm.py")
        sys.exit(1)

    if args.hybrid:
        print("Starting Hybrid PKM (local + cloud fallback)...")
        hybrid = HybridPKM(
            local_model=args.model,
            cloud_fallback=args.cloud,
        )

        # Simple CLI for hybrid mode
        print("\nHybrid PKM ready. Type 'quit' to exit.")
        while True:
            try:
                question = input("\nYou: ").strip()
                if question.lower() in ["quit", "exit"]:
                    break

                result = hybrid.ask(question)
                print(f"\nPKM ({result['source']}, confidence: {result.get('confidence', 0):.0%}):")
                print(result["response"])

            except KeyboardInterrupt:
                break
    else:
        server = PKMServer(args.model, device=args.device)

        if args.server:
            server.run_server(host=args.host, port=args.port)
        else:
            server.run_cli()


if __name__ == "__main__":
    main()
