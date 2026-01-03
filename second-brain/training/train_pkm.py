"""
Second Brain PKM - Model Training

Train your Personal Knowledge Model on your accumulated knowledge.
Uses transfer learning from pretrained GPT-2 weights for efficient training.
"""

import os
import sys
import json
import math
import time
import argparse
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, Tuple, Dict, Any

import numpy as np
import torch
import torch.nn as nn
from torch.nn import functional as F


@dataclass
class PKMConfig:
    """Configuration for Personal Knowledge Model."""
    # Model architecture
    block_size: int = 1024
    vocab_size: int = 50257  # GPT-2 vocab size
    n_layer: int = 12
    n_head: int = 12
    n_embd: int = 768
    dropout: float = 0.1
    bias: bool = True

    # Training
    batch_size: int = 8
    learning_rate: float = 1e-5
    max_iters: int = 2000
    warmup_iters: int = 100
    lr_decay_iters: int = 2000
    min_lr: float = 1e-6
    weight_decay: float = 0.1
    beta1: float = 0.9
    beta2: float = 0.95
    grad_clip: float = 1.0

    # Evaluation
    eval_interval: int = 100
    eval_iters: int = 20

    # Checkpointing
    checkpoint_interval: int = 500
    out_dir: str = "checkpoints"

    # Init
    init_from: str = "gpt2"  # 'scratch', 'gpt2', 'gpt2-medium', 'gpt2-large', 'resume'

    # Device
    device: str = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    compile: bool = False  # Use PyTorch 2.0 compile


class LayerNorm(nn.Module):
    """LayerNorm with optional bias."""

    def __init__(self, ndim: int, bias: bool = True):
        super().__init__()
        self.weight = nn.Parameter(torch.ones(ndim))
        self.bias = nn.Parameter(torch.zeros(ndim)) if bias else None

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return F.layer_norm(x, self.weight.shape, self.weight, self.bias, 1e-5)


class CausalSelfAttention(nn.Module):
    """Multi-head causal self-attention."""

    def __init__(self, config: PKMConfig):
        super().__init__()
        assert config.n_embd % config.n_head == 0

        self.c_attn = nn.Linear(config.n_embd, 3 * config.n_embd, bias=config.bias)
        self.c_proj = nn.Linear(config.n_embd, config.n_embd, bias=config.bias)
        self.attn_dropout = nn.Dropout(config.dropout)
        self.resid_dropout = nn.Dropout(config.dropout)

        self.n_head = config.n_head
        self.n_embd = config.n_embd
        self.dropout = config.dropout

        # Causal mask
        self.register_buffer(
            "bias",
            torch.tril(torch.ones(config.block_size, config.block_size))
            .view(1, 1, config.block_size, config.block_size)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        B, T, C = x.size()

        q, k, v = self.c_attn(x).split(self.n_embd, dim=2)
        k = k.view(B, T, self.n_head, C // self.n_head).transpose(1, 2)
        q = q.view(B, T, self.n_head, C // self.n_head).transpose(1, 2)
        v = v.view(B, T, self.n_head, C // self.n_head).transpose(1, 2)

        # Attention
        att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))
        att = att.masked_fill(self.bias[:, :, :T, :T] == 0, float('-inf'))
        att = F.softmax(att, dim=-1)
        att = self.attn_dropout(att)
        y = att @ v

        y = y.transpose(1, 2).contiguous().view(B, T, C)
        y = self.resid_dropout(self.c_proj(y))
        return y


class MLP(nn.Module):
    """Feed-forward network."""

    def __init__(self, config: PKMConfig):
        super().__init__()
        self.c_fc = nn.Linear(config.n_embd, 4 * config.n_embd, bias=config.bias)
        self.gelu = nn.GELU()
        self.c_proj = nn.Linear(4 * config.n_embd, config.n_embd, bias=config.bias)
        self.dropout = nn.Dropout(config.dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.c_fc(x)
        x = self.gelu(x)
        x = self.c_proj(x)
        x = self.dropout(x)
        return x


class Block(nn.Module):
    """Transformer block."""

    def __init__(self, config: PKMConfig):
        super().__init__()
        self.ln_1 = LayerNorm(config.n_embd, bias=config.bias)
        self.attn = CausalSelfAttention(config)
        self.ln_2 = LayerNorm(config.n_embd, bias=config.bias)
        self.mlp = MLP(config)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x + self.attn(self.ln_1(x))
        x = x + self.mlp(self.ln_2(x))
        return x


class PKM(nn.Module):
    """
    Personal Knowledge Model - A GPT-style model trained on your knowledge.
    """

    def __init__(self, config: PKMConfig):
        super().__init__()
        self.config = config

        self.transformer = nn.ModuleDict(dict(
            wte=nn.Embedding(config.vocab_size, config.n_embd),
            wpe=nn.Embedding(config.block_size, config.n_embd),
            drop=nn.Dropout(config.dropout),
            h=nn.ModuleList([Block(config) for _ in range(config.n_layer)]),
            ln_f=LayerNorm(config.n_embd, bias=config.bias),
        ))
        self.lm_head = nn.Linear(config.n_embd, config.vocab_size, bias=False)

        # Weight tying
        self.transformer.wte.weight = self.lm_head.weight

        # Initialize weights
        self.apply(self._init_weights)

        # Report parameters
        n_params = sum(p.numel() for p in self.parameters())
        print(f"PKM initialized with {n_params/1e6:.2f}M parameters")

    def _init_weights(self, module: nn.Module):
        if isinstance(module, nn.Linear):
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                torch.nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def forward(
        self,
        idx: torch.Tensor,
        targets: Optional[torch.Tensor] = None,
    ) -> Tuple[torch.Tensor, Optional[torch.Tensor]]:
        device = idx.device
        b, t = idx.size()
        assert t <= self.config.block_size, f"Sequence length {t} exceeds block size {self.config.block_size}"

        pos = torch.arange(0, t, dtype=torch.long, device=device)

        # Forward pass
        tok_emb = self.transformer.wte(idx)
        pos_emb = self.transformer.wpe(pos)
        x = self.transformer.drop(tok_emb + pos_emb)

        for block in self.transformer.h:
            x = block(x)

        x = self.transformer.ln_f(x)

        if targets is not None:
            logits = self.lm_head(x)
            loss = F.cross_entropy(
                logits.view(-1, logits.size(-1)),
                targets.view(-1),
                ignore_index=-1,
            )
        else:
            logits = self.lm_head(x[:, [-1], :])
            loss = None

        return logits, loss

    @classmethod
    def from_pretrained(cls, model_type: str) -> "PKM":
        """Load pretrained GPT-2 weights for transfer learning."""
        assert model_type in {"gpt2", "gpt2-medium", "gpt2-large", "gpt2-xl"}

        from transformers import GPT2LMHeadModel

        print(f"Loading pretrained {model_type} weights for transfer learning...")

        config_args = {
            "gpt2": dict(n_layer=12, n_head=12, n_embd=768),  # 124M
            "gpt2-medium": dict(n_layer=24, n_head=16, n_embd=1024),  # 350M
            "gpt2-large": dict(n_layer=36, n_head=20, n_embd=1280),  # 774M
            "gpt2-xl": dict(n_layer=48, n_head=25, n_embd=1600),  # 1558M
        }[model_type]

        config_args["vocab_size"] = 50257
        config_args["block_size"] = 1024
        config_args["bias"] = True

        config = PKMConfig(**config_args)
        model = cls(config)
        sd = model.state_dict()

        # Load HuggingFace model
        hf_model = GPT2LMHeadModel.from_pretrained(model_type)
        hf_sd = hf_model.state_dict()

        # Copy weights
        hf_keys = [k for k in hf_sd.keys() if not k.endswith(".attn.masked_bias") and not k.endswith(".attn.bias")]

        transposed = ["attn.c_attn.weight", "attn.c_proj.weight", "mlp.c_fc.weight", "mlp.c_proj.weight"]

        for k in hf_keys:
            if any(k.endswith(t) for t in transposed):
                assert hf_sd[k].shape[::-1] == sd[k].shape
                with torch.no_grad():
                    sd[k].copy_(hf_sd[k].t())
            else:
                assert hf_sd[k].shape == sd[k].shape
                with torch.no_grad():
                    sd[k].copy_(hf_sd[k])

        model.load_state_dict(sd)
        print(f"Loaded {model_type} weights successfully!")
        return model

    @torch.no_grad()
    def generate(
        self,
        idx: torch.Tensor,
        max_new_tokens: int,
        temperature: float = 1.0,
        top_k: Optional[int] = None,
    ) -> torch.Tensor:
        """Generate new tokens given a context."""
        for _ in range(max_new_tokens):
            # Crop to block size
            idx_cond = idx if idx.size(1) <= self.config.block_size else idx[:, -self.config.block_size:]

            logits, _ = self(idx_cond)
            logits = logits[:, -1, :] / temperature

            if top_k is not None:
                v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                logits[logits < v[:, [-1]]] = -float('Inf')

            probs = F.softmax(logits, dim=-1)
            idx_next = torch.multinomial(probs, num_samples=1)
            idx = torch.cat((idx, idx_next), dim=1)

        return idx


class PKMTrainer:
    """
    Trainer for Personal Knowledge Model.
    """

    def __init__(
        self,
        model: PKM,
        config: PKMConfig,
        train_data: np.ndarray,
        val_data: np.ndarray,
    ):
        self.model = model
        self.config = config
        self.train_data = train_data
        self.val_data = val_data

        self.device = config.device
        self.model.to(self.device)

        # Optimizer
        self.optimizer = self._configure_optimizer()

        # Training state
        self.iter_num = 0
        self.best_val_loss = float('inf')

    def _configure_optimizer(self) -> torch.optim.Optimizer:
        """Configure AdamW optimizer with weight decay."""
        param_dict = {pn: p for pn, p in self.model.named_parameters() if p.requires_grad}

        decay_params = [p for n, p in param_dict.items() if p.dim() >= 2]
        nodecay_params = [p for n, p in param_dict.items() if p.dim() < 2]

        optim_groups = [
            {"params": decay_params, "weight_decay": self.config.weight_decay},
            {"params": nodecay_params, "weight_decay": 0.0},
        ]

        optimizer = torch.optim.AdamW(
            optim_groups,
            lr=self.config.learning_rate,
            betas=(self.config.beta1, self.config.beta2),
        )

        return optimizer

    def _get_lr(self, iter_num: int) -> float:
        """Get learning rate with warmup and cosine decay."""
        if iter_num < self.config.warmup_iters:
            return self.config.learning_rate * iter_num / self.config.warmup_iters

        if iter_num > self.config.lr_decay_iters:
            return self.config.min_lr

        decay_ratio = (iter_num - self.config.warmup_iters) / (self.config.lr_decay_iters - self.config.warmup_iters)
        coeff = 0.5 * (1.0 + math.cos(math.pi * decay_ratio))
        return self.config.min_lr + coeff * (self.config.learning_rate - self.config.min_lr)

    def _get_batch(self, split: str) -> Tuple[torch.Tensor, torch.Tensor]:
        """Get a batch of data."""
        data = self.train_data if split == "train" else self.val_data
        ix = torch.randint(len(data) - self.config.block_size, (self.config.batch_size,))
        x = torch.stack([torch.from_numpy(data[i:i+self.config.block_size].astype(np.int64)) for i in ix])
        y = torch.stack([torch.from_numpy(data[i+1:i+1+self.config.block_size].astype(np.int64)) for i in ix])
        x, y = x.to(self.device), y.to(self.device)
        return x, y

    @torch.no_grad()
    def estimate_loss(self) -> Dict[str, float]:
        """Estimate loss on train and val sets."""
        self.model.eval()
        out = {}

        for split in ["train", "val"]:
            losses = torch.zeros(self.config.eval_iters)
            for k in range(self.config.eval_iters):
                x, y = self._get_batch(split)
                _, loss = self.model(x, y)
                losses[k] = loss.item()
            out[split] = losses.mean().item()

        self.model.train()
        return out

    def train(self):
        """Main training loop."""
        print("=" * 60)
        print("Second Brain PKM - Training Your Personal Knowledge Model")
        print("=" * 60)
        print(f"Device: {self.device}")
        print(f"Training tokens: {len(self.train_data):,}")
        print(f"Validation tokens: {len(self.val_data):,}")
        print(f"Max iterations: {self.config.max_iters}")
        print("=" * 60)

        # Create output directory
        os.makedirs(self.config.out_dir, exist_ok=True)

        t0 = time.time()
        self.model.train()

        for iter_num in range(self.config.max_iters):
            self.iter_num = iter_num

            # Update learning rate
            lr = self._get_lr(iter_num)
            for param_group in self.optimizer.param_groups:
                param_group["lr"] = lr

            # Evaluate
            if iter_num % self.config.eval_interval == 0:
                losses = self.estimate_loss()
                print(f"iter {iter_num}: train loss {losses['train']:.4f}, val loss {losses['val']:.4f}, lr {lr:.2e}")

                # Save best model
                if losses["val"] < self.best_val_loss:
                    self.best_val_loss = losses["val"]
                    self._save_checkpoint("pkm_best.pt")

            # Save checkpoint
            if iter_num > 0 and iter_num % self.config.checkpoint_interval == 0:
                self._save_checkpoint(f"pkm_iter_{iter_num}.pt")

            # Training step
            x, y = self._get_batch("train")
            _, loss = self.model(x, y)

            loss.backward()

            if self.config.grad_clip > 0:
                torch.nn.utils.clip_grad_norm_(self.model.parameters(), self.config.grad_clip)

            self.optimizer.step()
            self.optimizer.zero_grad(set_to_none=True)

        # Final save
        self._save_checkpoint("pkm_latest.pt")

        t1 = time.time()
        print("=" * 60)
        print(f"Training complete! Time: {(t1-t0)/60:.2f} minutes")
        print(f"Best validation loss: {self.best_val_loss:.4f}")
        print(f"Checkpoints saved to: {self.config.out_dir}")
        print("=" * 60)

    def _save_checkpoint(self, filename: str):
        """Save model checkpoint."""
        checkpoint = {
            "model": self.model.state_dict(),
            "optimizer": self.optimizer.state_dict(),
            "iter_num": self.iter_num,
            "best_val_loss": self.best_val_loss,
            "config": self.config,
        }
        path = os.path.join(self.config.out_dir, filename)
        torch.save(checkpoint, path)
        print(f"Saved checkpoint: {path}")


def load_config(config_path: str) -> PKMConfig:
    """Load configuration from Python file."""
    import importlib.util

    spec = importlib.util.spec_from_file_location("config", config_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    config_dict = {k: v for k, v in vars(module).items() if not k.startswith("_")}
    return PKMConfig(**config_dict)


def main():
    parser = argparse.ArgumentParser(
        description="Second Brain PKM - Train your Personal Knowledge Model",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Train with small config (fastest)
  python train_pkm.py --config config/pkm_small.py --data data/my_knowledge/

  # Train with medium config (balanced)
  python train_pkm.py --config config/pkm_medium.py --data data/my_knowledge/

  # Resume training from checkpoint
  python train_pkm.py --resume checkpoints/pkm_latest.pt --data data/my_knowledge/
        """
    )

    parser.add_argument(
        "--config", "-c",
        default="config/pkm_small.py",
        help="Path to config file (default: config/pkm_small.py)"
    )

    parser.add_argument(
        "--data", "-d",
        default="data/my_knowledge",
        help="Path to prepared data directory (default: data/my_knowledge)"
    )

    parser.add_argument(
        "--resume", "-r",
        help="Path to checkpoint to resume from"
    )

    parser.add_argument(
        "--batch-size",
        type=int,
        help="Override batch size from config"
    )

    parser.add_argument(
        "--max-iters",
        type=int,
        help="Override max iterations from config"
    )

    parser.add_argument(
        "--out-dir",
        default="checkpoints",
        help="Output directory for checkpoints (default: checkpoints)"
    )

    args = parser.parse_args()

    # Load config
    if os.path.exists(args.config):
        config = load_config(args.config)
    else:
        print(f"Config not found: {args.config}, using defaults")
        config = PKMConfig()

    # Override config with CLI args
    if args.batch_size:
        config.batch_size = args.batch_size
    if args.max_iters:
        config.max_iters = args.max_iters
    config.out_dir = args.out_dir

    # Load data
    data_dir = Path(args.data)
    train_path = data_dir / "train.bin"
    val_path = data_dir / "val.bin"

    if not train_path.exists():
        print(f"Error: Training data not found at {train_path}")
        print("Run prepare_data.py first to prepare your knowledge for training.")
        sys.exit(1)

    train_data = np.memmap(train_path, dtype=np.uint16, mode="r")
    val_data = np.memmap(val_path, dtype=np.uint16, mode="r")

    print(f"Loaded training data: {len(train_data):,} tokens")
    print(f"Loaded validation data: {len(val_data):,} tokens")

    # Initialize model
    if args.resume:
        print(f"Resuming from checkpoint: {args.resume}")
        checkpoint = torch.load(args.resume, map_location="cpu")
        config = checkpoint["config"]
        model = PKM(config)
        model.load_state_dict(checkpoint["model"])
    elif config.init_from == "scratch":
        print("Training from scratch")
        model = PKM(config)
    else:
        print(f"Transfer learning from {config.init_from}")
        model = PKM.from_pretrained(config.init_from)

    # Train
    trainer = PKMTrainer(model, config, train_data, val_data)

    if args.resume:
        trainer.optimizer.load_state_dict(checkpoint["optimizer"])
        trainer.iter_num = checkpoint["iter_num"]
        trainer.best_val_loss = checkpoint["best_val_loss"]

    trainer.train()

    print("\nYour Personal Knowledge Model is ready!")
    print(f"Best model: {config.out_dir}/pkm_best.pt")
    print("Next step: python serve_pkm.py --model checkpoints/pkm_best.pt")


if __name__ == "__main__":
    main()
