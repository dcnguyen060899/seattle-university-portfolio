"""
Second Brain PKM - Large Configuration

Maximum quality. Good for:
- Large knowledge bases (1000+ notes)
- Deep domain expertise
- Best possible results
- 24GB+ GPU memory

Model: ~774M parameters
Training time: 6-24 hours
"""

# Model architecture (GPT-2 large equivalent)
block_size = 1024
vocab_size = 50257
n_layer = 36
n_head = 20
n_embd = 1280
dropout = 0.1
bias = True

# Training hyperparameters
batch_size = 2  # Very small for memory
learning_rate = 2e-6  # Very low for large model
max_iters = 10000
warmup_iters = 500
lr_decay_iters = 10000
min_lr = 2e-7
weight_decay = 0.1
beta1 = 0.9
beta2 = 0.95
grad_clip = 1.0

# Gradient accumulation to simulate larger batch
gradient_accumulation_steps = 8  # Effective batch = 2 * 8 = 16

# Evaluation
eval_interval = 500
eval_iters = 20

# Checkpointing
checkpoint_interval = 2000
out_dir = "checkpoints/pkm_large"

# Initialization (transfer learning from GPT-2 large)
init_from = "gpt2-large"

# Device
# device = "cuda"
compile = True  # Recommended for large models
