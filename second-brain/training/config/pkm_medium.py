"""
Second Brain PKM - Medium Configuration

Balanced quality and speed. Good for:
- Production use
- Medium knowledge bases (200-1000 notes)
- 16GB GPU memory

Model: ~350M parameters
Training time: 2-6 hours
"""

# Model architecture (GPT-2 medium equivalent)
block_size = 1024
vocab_size = 50257
n_layer = 24
n_head = 16
n_embd = 1024
dropout = 0.1
bias = True

# Training hyperparameters
batch_size = 4  # Reduced for memory
learning_rate = 5e-6  # Lower for larger model
max_iters = 5000
warmup_iters = 200
lr_decay_iters = 5000
min_lr = 5e-7
weight_decay = 0.1
beta1 = 0.9
beta2 = 0.95
grad_clip = 1.0

# Evaluation
eval_interval = 200
eval_iters = 20

# Checkpointing
checkpoint_interval = 1000
out_dir = "checkpoints/pkm_medium"

# Initialization (transfer learning from GPT-2 medium)
init_from = "gpt2-medium"

# Device
# device = "cuda"
compile = False
