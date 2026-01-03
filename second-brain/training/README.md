# Second Brain - Personal Knowledge Model Training

Train your own AI model on YOUR accumulated knowledge.

## Overview

The Second Brain PKM (Personal Knowledge Model) system allows you to:
1. Export your captured knowledge as training data
2. Train a personalized language model on your expertise
3. Serve your model locally for private, cost-free inference

```
training/
├── README.md                    # This file
├── prepare_data.py              # Prepare knowledge for training
├── train_pkm.py                 # Train your personal model
├── serve_pkm.py                 # Serve your trained model
├── config/
│   ├── pkm_small.py            # Small model config (fastest)
│   ├── pkm_medium.py           # Medium model config (balanced)
│   └── pkm_large.py            # Large model config (best quality)
└── utils/
    └── tokenizer.py            # Tokenization utilities
```

## Quick Start

### 1. Export Your Knowledge

```bash
# Using the CLI
brain export --format training

# Or using the API
curl -X POST http://localhost:8000/api/v1/export/training-data \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. Prepare for Training

```bash
python prepare_data.py \
  --input exports/your_export.jsonl \
  --output data/my_knowledge/
```

### 3. Train Your Personal Model

```bash
# Quick training (30 min - 2 hours)
python train_pkm.py --config config/pkm_small.py

# Better quality (2-6 hours)
python train_pkm.py --config config/pkm_medium.py
```

### 4. Serve Your Model

```bash
python serve_pkm.py --model checkpoints/pkm_latest.pt
```

## Training Tiers

| Tier | Model Size | Training Time | Hardware | Best For |
|------|------------|---------------|----------|----------|
| **Quick** | 124M params | 30 min - 2 hr | 8GB GPU | Experiments, small knowledge bases |
| **Standard** | 350M params | 2-6 hours | 16GB GPU | Production use, medium knowledge bases |
| **Advanced** | 774M params | 6-24 hours | 24GB+ GPU | Maximum quality, large knowledge bases |

## How It Works

### The Training Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PERSONAL KNOWLEDGE MODEL PIPELINE                         │
│                                                                              │
│  1. KNOWLEDGE EXPORT                                                         │
│     ├── Your notes, problem-solving journeys, insights                      │
│     ├── Converted to Q&A training pairs                                     │
│     ├── Synthetic questions generated automatically                          │
│     └── Connections become relational training data                         │
│                                                                              │
│  2. DATA PREPARATION                                                         │
│     ├── Text tokenization (GPT-2 compatible)                                │
│     ├── Train/validation split (90/10)                                      │
│     ├── Quality filtering and deduplication                                 │
│     └── Format optimization for training                                    │
│                                                                              │
│  3. MODEL TRAINING                                                           │
│     ├── Start from pretrained weights (transfer learning)                   │
│     ├── Fine-tune on YOUR knowledge                                         │
│     ├── Optimize for your domain vocabulary                                 │
│     └── Save checkpoints for later use                                      │
│                                                                              │
│  4. DEPLOYMENT                                                               │
│     ├── Local inference server                                              │
│     ├── ChatGPT-like web interface                                          │
│     ├── API endpoint for integration                                        │
│     └── Hybrid mode with cloud fallback                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### What Makes Your PKM Special

| Generic AI | Your Personal Knowledge Model |
|------------|-------------------------------|
| Knows everything generically | Knows YOUR domain deeply |
| Costs per API call | Free after training |
| Data goes to cloud | 100% private and local |
| Same for everyone | Trained on YOUR patterns |
| Forgets context | Remembers YOUR solutions |

## Configuration Options

### pkm_small.py (Fastest)
```python
model_size = "124M"
learning_rate = 1e-5
batch_size = 8
max_iterations = 2000
```

### pkm_medium.py (Balanced)
```python
model_size = "350M"
learning_rate = 5e-6
batch_size = 4
max_iterations = 5000
```

### pkm_large.py (Best Quality)
```python
model_size = "774M"
learning_rate = 2e-6
batch_size = 2
max_iterations = 10000
```

## Training Data Guidelines

### Quality Over Quantity

Your model learns from YOUR knowledge. Better input = better output.

**Good training data:**
- Clear problem descriptions with solutions
- Step-by-step explanations
- Code with context and reasoning
- "Why" not just "what"

**Example of good note:**
```
Problem: CORS error when calling HuggingFace API from browser

Root Cause: Browsers block cross-origin requests for security.
The HuggingFace Spaces API doesn't set CORS headers.

Solution: Backend proxy pattern
- Server makes the API call (no CORS restrictions server-to-server)
- Frontend calls your backend
- Backend proxies to HuggingFace

Code pattern:
@app.route('/classify', methods=['POST'])
def classify():
    response = requests.post(HF_API_URL, json=request.json)
    return jsonify(response.json())

Key learning: When browser can't call API directly, proxy through backend.
```

### Recommended Knowledge Base Size

| Notes | Training Examples | Model Quality |
|-------|-------------------|---------------|
| 50-100 | ~500 | Basic recall |
| 100-500 | ~2,000 | Good coverage |
| 500-2000 | ~10,000 | Strong expertise |
| 2000+ | ~50,000+ | Deep domain expert |

## Hybrid Inference

Combine your local PKM with cloud APIs for best of both worlds:

```python
from second_brain.inference import HybridPKM

pkm = HybridPKM(
    local_model="checkpoints/pkm_latest.pt",
    cloud_fallback="claude",  # or "openai"
    confidence_threshold=0.7,
)

# Uses local model (you know this!)
response = pkm.ask("How do I handle CORS errors?")

# Falls back to cloud (not in your knowledge)
response = pkm.ask("What's the capital of Mongolia?")
```

## Continuous Learning

As your knowledge grows, so should your model:

```bash
# Monthly re-training workflow
brain export --since "30 days ago" --output exports/monthly.jsonl
python prepare_data.py --input exports/monthly.jsonl --append
python train_pkm.py --resume checkpoints/pkm_latest.pt --iterations 1000
```

## Cost Analysis

### Training Costs

| Provider | GPU | Cost/Hour | PKM Small | PKM Medium |
|----------|-----|-----------|-----------|------------|
| Your PC | RTX 3080 | $0 | 1-2 hours | 4-6 hours |
| Lambda | A10G | $0.75 | ~$1.50 | ~$5 |
| RunPod | A100 | $2 | ~$1 | ~$4 |

### Inference Costs

| Method | Cost per 1000 queries |
|--------|----------------------|
| Claude API | $3-15 |
| OpenAI API | $2-10 |
| Your PKM (local) | $0 |

**Break-even**: ~500-1000 queries pays for training cost

## Troubleshooting

### Out of Memory
```bash
# Reduce batch size
python train_pkm.py --batch_size 2 --gradient_accumulation 8
```

### Loss Not Decreasing
- Check data quality (duplicates? empty examples?)
- Lower learning rate
- Increase training iterations

### Model Outputs Gibberish
- More training iterations needed
- Check tokenization is correct
- Verify training data format

## Next Steps

After training your first PKM:

1. **Evaluate** on held-out questions
2. **Deploy** locally or to your server
3. **Integrate** with Second Brain for hybrid inference
4. **Iterate** as you capture more knowledge
5. **Share** with your team (if appropriate)

---

*Your knowledge, your model, your control.*
