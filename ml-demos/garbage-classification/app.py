"""
Garbage Classification Demo using FastAI
Hugging Face Spaces Gradio App
"""
import gradio as gr
from fastai.vision.all import *
import os

# Load the model
model_path = "model_2_conservative_augmentation.pkl"
learn = load_learner(model_path)

# Get class names
class_names = learn.dls.vocab

# Define prediction function
def classify_garbage(image):
    """Classify garbage image into one of 6 categories"""
    if image is None:
        return None

    # Convert PIL Image to FastAI PILImage format
    # PILImage.create() can accept a PIL.Image.Image directly
    img = PILImage.create(image)

    # Run prediction with FastAI PILImage
    pred, pred_idx, probs = learn.predict(img)

    # Create confidence dictionary
    confidences = {class_names[i]: float(probs[i]) for i in range(len(class_names))}

    return confidences

# Category descriptions for info
category_info = """
### Waste Categories
- **Cardboard**: Boxes, packaging materials
- **Glass**: Bottles, jars, containers
- **Metal**: Cans, aluminum, tin
- **Paper**: Newspapers, magazines, documents
- **Plastic**: Bottles, containers, packaging
- **Trash**: Non-recyclable waste
"""

# Example images (will be loaded from examples folder if available)
examples = [
    "examples/cardboard_example.jpg",
    "examples/glass_example.jpg",
    "examples/plastic_example.jpg",
    "examples/metal_example.jpg",
]

# Filter to only existing examples
examples = [ex for ex in examples if os.path.exists(ex)]

# Create Gradio interface (Gradio 3.x compatible)
demo = gr.Interface(
    fn=classify_garbage,
    inputs=gr.Image(type="pil", label="Upload Garbage Image"),
    outputs=gr.Label(num_top_classes=6, label="Classification Results"),
    title="Garbage Classification AI",
    description="""
    **Deep Learning Model for Waste Sorting**

    Upload an image of garbage to classify it into one of 6 categories:
    Cardboard, Glass, Metal, Paper, Plastic, or Trash.

    This model uses **ResNet34 with transfer learning**, achieving **94% accuracy**
    with **100% recall on the minority class (Trash)**.

    *Seattle University DATA 5100: Deep Learning Project by Duy Nguyen*
    """,
    article=category_info,
    examples=examples if examples else None,
    cache_examples=False,
)

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)
