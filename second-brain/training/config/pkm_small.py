"""
Second Brain PKM - Small Configuration

Fastest training option. Good for:
- Initial experiments
- Small knowledge bases (< 200 notes)
- Quick iteration
- Limited GPU memory (8GB)

Model: ~124M parameters
Training time: 30 min - 2 hours
"""

# Model architecture (GPT-2 small equivalent)
block_size = 1024
vocab_size = 50257
n_layer = 12
n_head = 12
n_embd = 768
dropout = 0.1
bias = True

# Training hyperparameters
batch_size = 8
learning_rate = 1e-5
max_iters = 2000
warmup_iters = 100
lr_decay_iters = 2000
min_lr = 1e-6
weight_decay = 0.1
beta1 = 0.9
beta2 = 0.95
grad_clip = 1.0

# Evaluation
eval_interval = 100
eval_iters = 20

# Checkpointing
checkpoint_interval = 500
out_dir = "checkpoints/pkm_small"

# Initialization (transfer learning from GPT-2)
init_from = "gpt2"

# Device (auto-detected, but can override)
# device = "cuda"  # or "mps" for Mac, "cpu" for CPU only
compile = False  # Set True for PyTorch 2.0+ speedup
