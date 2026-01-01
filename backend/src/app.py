from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import os
from chatservice import ChatService
import re
import base64
import tempfile
from gradio_client import Client, handle_file

import time

load_dotenv()
app = Flask(__name__, static_folder='../../docs', static_url_path='/')
CORS(app)  # Initialize CORS with the Flask app

# Add specific CORS configuration for the evaluate-challenge endpoint
CORS(app, resources={r"/evaluate-challenge": {"origins": [
    "http://duyng-portfolio.com",
    "https://duyng-portfolio.com",
    "http://ucberkeley-ml-ai-capstone.com",
    "https://ucberkeley-ml-ai-capstone.com"
]}})

api_key = os.getenv("ANTHROPIC_API_KEY")
chat_service = ChatService(api_key=api_key)

# put questions and answers here
# put questions and answers here
base_qa = {
    # UC Berkeley Capstone Project Q&A (existing)
    "What was the main goal of your project?": "The main goal of the project was to identify key factors affecting the duration of hospital stays during the COVID-19 pandemic. This involved improving patient care, optimizing resource allocation, and developing targeted strategies to reduce unnecessary extended hospitalizations.",
    
    "How did you analyze the data?": "We performed a comprehensive exploratory data analysis (EDA) that included numerical and categorical feature distributions, group-wise statistics, and heatmaps. We also used machine learning models like Gradient Boosting, Random Forest, CatBoost, XGBoost, and Logistic Regression to predict patient length of stay and identify the most impactful features.",
    
    "What are the key factors that influence the length of hospital stays?": "The key factors influencing the length of hospital stays include the number of visitors with the patient, the ward type, the admission deposit, the bed grade, the availability of extra rooms in the hospital, the type of admission (e.g., emergency, trauma), the severity of illness, and specific hospital and city codes.",
    
    "What were the main insights from the cluster analysis?": "The cluster analysis revealed clear differentiation in hospital quality and patient outcomes across clusters. For example, Cluster 1 indicated premium hospitals with better facilities and higher costs, while Cluster 2 suggested budget hospitals serving lower-income areas. Visitor numbers, resource availability, and patient demographics varied significantly across clusters.",
    
    "What were the main recommendations based on the analysis?": "Key recommendations include improving resource allocation in high-demand wards, enhancing trauma and emergency care in high-demand regions, implementing specialized care for medium-stay patients, and revising financial policies around admission deposits. Additionally, enhanced follow-up care for high-risk patients could reduce readmissions and improve overall patient outcomes.",
    
    "Which machine learning model performed the best in predicting patient length of stay?": "The deep learning model with LSTM layers outperformed traditional machine learning models, achieving an overall accuracy of 80% and the highest potential savings in cost analysis. It was particularly effective in reducing false positives and false negatives, leading to significant cost savings.",
    
    "How did the length of stay correlate with the readmission rate?": "There was a general trend that higher readmission counts were associated with longer lengths of stay. This pattern was particularly evident in trauma cases and patients with severe illnesses, indicating that these patients require more intensive care and are more likely to be readmitted.",
    
    "What were the business implications of your findings?": "The findings suggest that implementing the deep learning model could lead to substantial cost savings of approximately $30 million by minimizing misclassification costs. Improved resource allocation, targeted interventions, and enhanced patient care strategies could also optimize hospital operations and improve patient outcomes.",
    
    "How can hospitals apply the insights from this project?": "Hospitals can use these insights to optimize resource allocation, reduce the length of patient stays, and lower readmission rates. By implementing the recommended strategies, hospitals can improve operational efficiency, enhance patient care quality, and achieve significant cost savings.",
    
    "What were the main challenges you faced during this project?": "The main challenges included dealing with imbalanced data, ensuring model generalization across different hospital types and regions, and accurately predicting outcomes for less common cases. Hyperparameter tuning and feature engineering were also critical to improving model performance.",
    
    # Recruiter-Focused Q&A (NEW)
    "What type of internship roles are you looking for?": "I'm seeking Summer 2026 internships in Data Science, Machine Learning Engineering, or Analytics/Strategy roles. I'm particularly interested in positions that involve production ML systems, large-scale data analysis, or strategic insights using Python and SQL.",
    
    "What are your key technical skills?": "I'm proficient in Python and SQL, with strong experience in PyTorch, TensorFlow, scikit-learn, pandas, and NumPy. I've built production ML systems, analyzed datasets with 1.88M+ records, and developed interactive dashboards using Matplotlib, Seaborn, and Plotly. I also have experience with Git/GitHub, Neo4j graph databases, and statistical analysis including A/B testing and experimental design.",
    
    "Can you describe your production ML experience?": "I built an AI chatbot serving 660K+ users for MOSAIC immigrant services, implementing Neo4j graph database architecture and achieving 90% accuracy. The system required debugging critical production issues, cross-functional collaboration with 4 engineers, and managing the full development lifecycle from design to deployment. This project was shortlisted Top 4 for SFU CS Diversity Award.",
    
    "What large-scale data analysis have you done?": "I analyzed 1.88 million flight measurements using SQL and Python to optimize operational efficiency. Through systematic ANOVA and variance decomposition, I discovered that engine performance accounted for 64% of efficiency variance. I built interactive dashboards to communicate findings and made strategic resource allocation recommendations that challenged conventional assumptions.",
    
    "What's your experience with experimental design?": "In my garbage classification project, I systematically tested 4 different approaches to class imbalance, conducting rigorous A/B testing across multiple performance dimensions. I discovered that conservative augmentation parameters outperformed aggressive approaches by 0.5% while reducing training time by 10%. This demonstrates my ability to design controlled experiments and use data to challenge assumptions.",
    
    "Do you have analytics or business strategy experience?": "Yes, through multiple projects I've demonstrated strategic thinking. In the UC Berkeley healthcare capstone, I projected $30.4M annual savings through predictive analytics. In marketing optimization, I identified optimal customer contact windows (6-8 minutes) to maximize conversion. I excel at translating complex analysis into clear business recommendations for cross-functional stakeholders.",
    
    "What machine learning frameworks do you use?": "I'm experienced with PyTorch, TensorFlow, scikit-learn, FastAI, and XGBoost. I've used PyTorch to build CNN architectures (ResNet34, ResNet50) for image classification, achieving 94% accuracy with transfer learning. I've also worked with LlamaIndex and Langchain for RAG architectures in medical documentation automation.",
    
    "Can you work with SQL and databases?": "Absolutely. I use SQL extensively for data extraction and analysis. I've processed datasets with 1.88M+ measurements, designed efficient queries for performance optimization, and worked with Neo4j graph databases to model complex entity relationships. I understand both traditional SQL databases and specialized data systems.",
    
    "What's your experience with dashboards and visualization?": "I've built interactive dashboards using Matplotlib, Seaborn, and Plotly to visualize operational efficiency trends and enable stakeholders to understand key metrics at a glance. I have exposure to Tableau and focus on creating visualizations that translate complex data into clear, actionable insights for both technical and business audiences.",
    
    "Do you have experience working cross-functionally?": "Yes, in my AI Engineer role at Blueprint, I collaborated with 4 engineers, a product lead, and domain experts to deliver a system serving 660K+ users. I've presented findings to diverse stakeholders, translated between technical and business contexts, and demonstrated strong project management in fast-paced environments.",
    
    "When are you available for internships?": "I'm available for Summer 2026 internships (May-August), and I can commit to 12-week full-time programs. I'm based in Seattle but open to hybrid or relocation opportunities for strong roles. I'm currently a first-year MS Data Science student at Seattle University, graduating in June 2027.",
    
    "What makes you stand out for data science roles?": "My economics background gives me strong causal inference skills beyond typical data science candidates. I maintain 98%+ grades demonstrating learning agility, have production experience serving 660K+ users, and excel at translating analysis into business strategy. I combine statistical rigor with practical implementation and clear communication.",
    
    "What makes you stand out for ML engineering roles?": "I've built production ML systems from research to deployment, not just academic projects. My systematic experimentation approach (testing 4 strategies, rigorous evaluation) shows strong engineering mindset. I have experience with full ML lifecycle, PyTorch/TensorFlow proficiency, and understand both model development and production deployment challenges.",
    
    "What makes you stand out for analytics roles?": "I bring a resource optimization mindset from my economics background. I've analyzed 1.88M+ measurements for operational insights, created strategic recommendations that challenged assumptions, and excel at presenting complex data clearly. My cross-functional experience shows I can work with diverse teams and translate data into business value.",
    
    "Tell me about your computational biology experience": "I built a RAG pipeline for medical documentation using LlamaIndex, automating physician workflows with 50% efficiency improvement. I also competed in Kaggle medical image classification (12th place) using PyTorch. My Neo4j experience with graph databases translates directly to biological network analysis. I understand how to bridge technical and domain-specific contexts.",
    
    "What are your strongest programming languages?": "Python and SQL are my strongest languages - I use them daily for data analysis, ML development, and database queries. I'm also proficient in R for statistical analysis and have exposure to C++ through PyTorch. I follow clean code practices, use Git/GitHub for version control, and write well-documented, maintainable code.",
    
    "Can you give an example of business impact from your work?": "In the UC Berkeley healthcare capstone, my predictive model projected $30.4M annual cost savings by reducing misclassification costs. In the garbage classification project, I positioned the model for recycling facility deployment with 60% labor cost reduction. I consistently connect technical work to measurable business outcomes.",
    
    "How do you handle ambiguity and fast-paced environments?": "In my Blueprint project, I independently prioritized tasks while managing competing deadlines in a fast-paced startup environment. I debugged critical production issues affecting 660K users by systematically identifying root causes. I maintain detail-oriented quality standards while moving quickly, and I'm comfortable with iterative problem-solving when requirements evolve.",
    
    "What's your GitHub and portfolio?": "My GitHub is github.com/dcnguyen060899 with live code for all major projects. My portfolio at duyng-portfolio.com showcases interactive demos and project details. My UC Berkeley capstone site at ucberkeley-ml-ai-capstone.com has a full case study. All code is well-documented and demonstrates both technical depth and practical applications."
}


@app.route("/")
def index():
    return send_from_directory(app.static_folder, 'index_portfolio.html')
    
@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json()
    user_message = data["message"]

    if user_message in base_qa:
        time.sleep(3)
        return jsonify({"response": base_qa[user_message]})

    response_content = chat_service.get_response(user_message)
    return jsonify({"response": response_content})

import json

@app.route("/evaluate-challenge", methods=["POST"])
def evaluate_challenge():
    try:
        data = request.get_json()
        user_solution = data.get("code", "")
        challenge_type = data.get("challenge_type", "")
        
        # Prompt asking for text format - very explicit instructions
        evaluation_prompt = f"""
        Evaluate this solution for the {challenge_type} algorithm challenge:

        ```javascript
        {user_solution}
        ```

        Check for:
        1. Correctness - Does it implement the required algorithm properly?
        2. Key concepts - Does it handle the core requirements (e.g., tracking differences in fuzzy matching)?
        3. Edge cases - Does it handle null/empty inputs and other edge cases?
        4. Code quality - Is the code well-structured and efficient?

        CRITICAL FORMATTING REQUIREMENT:
        You MUST respond with ONLY plain text in this EXACT format. Do NOT use JSON, do NOT use a dictionary structure, do NOT use markdown code blocks. Just plain text:

        Score: X/100

        Correctness: [Your detailed feedback here as plain text]

        Key Concepts: [Your detailed feedback here as plain text]

        Edge Cases: [Your detailed feedback here as plain text]

        Code Quality: [Your detailed feedback here as plain text]

        Suggestions for Improvement:
        1. [First suggestion]
        2. [Second suggestion]
        3. [Third suggestion]

        Again: PLAIN TEXT ONLY, not JSON or dict format.
        """
        
        try:
            # Get response using evaluation agent
            response_content = chat_service.get_evaluation_response(evaluation_prompt)

            # Helper function to format dict/JSON to text
            def format_evaluation_dict(eval_dict):
                formatted = f"Score: {eval_dict.get('Score', 'N/A')}\n\n"
                formatted += f"Correctness: {eval_dict.get('Correctness', '')}\n\n"
                formatted += f"Key Concepts: {eval_dict.get('Key Concepts', '')}\n\n"
                formatted += f"Edge Cases: {eval_dict.get('Edge Cases', '')}\n\n"
                formatted += f"Code Quality: {eval_dict.get('Code Quality', '')}\n\n"

                suggestions = eval_dict.get('Suggestions for Improvement', [])
                formatted += "Suggestions for Improvement:\n"
                if isinstance(suggestions, list):
                    for i, suggestion in enumerate(suggestions, 1):
                        formatted += f"{i}. {suggestion}\n"
                else:
                    formatted += str(suggestions)
                return formatted

            # Handle different response formats
            if isinstance(response_content, dict):
                # Direct dict response
                response_content = format_evaluation_dict(response_content)
            elif isinstance(response_content, str):
                # Try to parse if it's JSON string
                try:
                    import json
                    parsed = json.loads(response_content)
                    if isinstance(parsed, dict):
                        # Check if it has evaluation fields
                        if 'Score' in parsed or 'Correctness' in parsed:
                            response_content = format_evaluation_dict(parsed)
                except (json.JSONDecodeError, ValueError):
                    # Not JSON, use as is (already plain text)
                    pass

            return jsonify({"response": response_content})
            
        except Exception as e:
            print(f"Chat service error: {str(e)}")
            return jsonify({"response": f"Error evaluating solution: {str(e)}"}), 500
            
    except Exception as e:
        print(f"Error in evaluate-challenge: {str(e)}")
        return jsonify({"response": f"Error: {str(e)}"}), 500
        
@app.route("/api-check", methods=["GET"])
def api_check():
    try:
        # This is a simplified check. Consider a more specific test for API connectivity if necessary.
        response = chat_service.get_response("Hello")
        if response:
            return jsonify(
                {"status": "success", "message": "API connection is working."}
            )
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route("/classify-image", methods=["POST"])
def classify_image():
    """
    Proxy endpoint for HuggingFace Spaces Garbage Classification API
    Uses gradio_client for proper queue/WebSocket handling
    """
    try:
        data = request.get_json()
        image_data = data.get("image")  # Base64 encoded image (data:image/...;base64,...)

        if not image_data:
            return jsonify({"error": "No image provided"}), 400

        print(f"Received image data, length: {len(image_data)}")

        # Extract base64 content (remove data:image/...;base64, prefix if present)
        if "," in image_data:
            image_data = image_data.split(",")[1]

        # Decode base64 to bytes
        image_bytes = base64.b64decode(image_data)

        # Save to temporary file
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_file:
            tmp_file.write(image_bytes)
            tmp_path = tmp_file.name

        print(f"Saved temp file: {tmp_path}")

        # Use gradio_client to call the HuggingFace Space
        client = Client("dnguyen44/garbage-classification")
        result = client.predict(
            image=handle_file(tmp_path),
            api_name="/predict"
        )

        print(f"Classification result: {result}")

        # Clean up temp file
        os.unlink(tmp_path)

        # Return result in expected format
        # gradio_client returns dict directly for Label component
        return jsonify({"data": [result]})

    except Exception as e:
        print(f"Error in classify-image: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)
