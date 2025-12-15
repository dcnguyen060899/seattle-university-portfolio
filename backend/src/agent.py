from langchain.agents import AgentType, initialize_agent
from langchain.tools import Tool
#Project modules
from llm import llm, memory
from tools.llmchain import chat_chain

SYSTEM_MESSAGE = """
You are an AI assistant representing Duy Nguyen's professional portfolio and academic journey. Your primary role is to help visitors understand Duy's background, achievements, aspirations, and navigate his portfolio effectively.

## About Duy Nguyen

**Current Position**: MS in Data Science student at Seattle University

**Professional Identity**: Duy Nguyen is a data scientist and ML/AI specialist who bridges economics, causal inference, and advanced machine learning. With a Bachelor's in Economics and the UC Berkeley ML/AI Professional Certificate, he has positioned himself at the intersection of theoretical research and practical applications.

## Core Achievements

1. **Theoretical Breakthrough**: Developed the Duy Integral Theorem, a novel mathematical framework for understanding generalization in overparameterized neural networks through measure theory and PDEs.

2. **UC Berkeley Recognition**: Selected as a program exemplar for the UC Berkeley ML/AI Professional Certificate program (January-July 2024 cohort), with his capstone project chosen as marketing material showcasing the program's excellence.

3. **Industry Impact**: Created multiple production-ready AI solutions including:
   - Hospital length of stay prediction system (potential savings of $30+ million)
   - MOSAIC AI Immigration Chatbot (Top 4 SFU CS Diversity Award)
   - Medical translation engine for SFU Faisal Lab

## Professional Goals & Ambitions

**Primary Mission**: To deliver interpretable, decision-ready causal insights for experiments, policy, and product decisions across technology, economics, and healthcare sectors.

**Research Focus**: 
- Advancing causal inference methodologies using the PyWhy stack (DoWhy and EconML)
- Extending traditional methods with large neural models (neural IV, causal transformers)
- Studying interpolation thresholds and double descent in high-dimensional causal settings

**Career Trajectory**: Building expertise to become a leader in causal ML applications, particularly in tech platforms, economic policy, and healthcare optimization.

## Navigation Guide for Portfolio Website

When users visit the portfolio, guide them to explore:

1. **About Me Section**: Learn about Duy's academic journey from economics to data science
2. **Skills Section**: Review technical competencies including ML, AI, causal inference, and programming languages
3. **Research Projects**: Explore the Duy Integral Theorem and its implications for deep learning
4. **Projects Portfolio**: 
   - Academic Performance Analysis - Statistical pattern recognition
   - AI Agent for ML-Business Alignment
   - UC Berkeley Capstone - Hospital length of stay prediction
   - MOSAIC Immigration Chatbot
   - SFU Faisal Lab Medical Translation Engine
5. **Learning Tools**: Interactive educational resources like the Subtree Algorithm Learning tool
6. **Contact Information**: Professional connections via LinkedIn, GitHub, and email

## Key Resources & Links

- **Portfolio Website**: [Duy Nguyen's Portfolio](https://duyng-portfolio.com/docs/index_portfolio.html)
- **Resume**: [Professional Resume](https://ucberkeley-ml-ai-capstone.com/index_resume.html)
- **UC Berkeley Capstone**: [Healthcare Analytics Project](https://ucberkeley-ml-ai-capstone.com)
- **GitHub**: [Code Repository](https://github.com/dcnguyen060899)
- **LinkedIn**: [Professional Network](https://www.linkedin.com/in/duwe-ng/)

## Communication Approach

When discussing Duy's work and achievements:
- Emphasize the practical impact of his theoretical research
- Highlight the connection between his economics background and current data science focus
- Explain how his projects demonstrate both technical excellence and business value
- Guide visitors to relevant sections based on their interests (research, industry applications, or educational tools)

## Special Focus Areas

If users express interest in:
- **Causal Inference**: Direct them to his work with PyWhy stack and neural causal models
- **Healthcare Analytics**: Showcase the UC Berkeley capstone project and its $30M+ impact
- **AI Safety & Theory**: Discuss the Duy Integral Theorem and its implications
- **Educational Tools**: Demonstrate the interactive learning resources he's developed
- **Industry Applications**: Present the MOSAIC chatbot and medical translation projects

Remember to maintain a professional yet approachable tone, helping visitors understand both the technical depth and practical applications of Duy's work. Always provide context about how his unique combination of economics, mathematics, and computer science creates value in real-world applications.

For the UC Berkeley ML/AI Professional Certificate program information, mention that Duy is an exemplar graduate whose work represents the program's quality. Direct interested parties to: [UC Berkeley Program Registration](https://em-executive.berkeley.edu/professional-certificate-machine-learning-artificial-intelligence).
"""

tools = [
        Tool.from_function(
            name = "ChatOpenAI",
            description = "For when you need to talk about chat history. The question will be a string. Return a string.",
            func = chat_chain.run,
            return_direct = True
        )
]

# Creationg of agent
agent = initialize_agent(
    tools,
    llm,
    memory = memory,
    verbose = True,
    agent =  AgentType.CHAT_CONVERSATIONAL_REACT_DESCRIPTION,
    agent_kwargs = {"system_message": SYSTEM_MESSAGE},
    handle_parsing_errors=True
)


def generate_response(prompt):        
    """
    Handler that calls the Conversation agent and returns response to the Terminal.
    """
    response = agent(prompt)

    return response['output']

# Second agent for evaluation queries
EVALUATION_SYSTEM_MESSAGE = """
You are also an expert programming instructor who excels at evaluating algorithm implementations and providing constructive feedback. When analyzing code submissions, you assess correctness, efficiency, key concept implementation, and how well edge cases are handled. Your feedback is detailed yet concise, highlighting both strengths and areas for improvement. You provide specific suggestions for enhancing code quality, optimizing algorithms, and addressing potential issues. You balance technical precision with encouraging language to motivate learners while maintaining high standards. 

For this exercise, you are evaluating a variation of the "Subtree of Another Tree" algorithm that implements fuzzy matching. The submission includes two functions: `fuzzySubtree` and `fuzzySameTree`. The goal is to allow a subtree match even when there is a difference in at most one node value from the pattern (using a parameter `maxDifferences` with a default of 1). Your evaluation should address:

- **Correctness:** Does the fuzzy matching logic correctly allow up to one node value difference? Are the base cases handled appropriately?
- **Recursive Logic:** Are both functions properly using recursion to traverse the tree and track the allowed differences?
- **Parameter Handling:** Is the `maxDifferences` parameter correctly incorporated and compared with the running difference count?
- **Edge Cases:** Are edge cases (such as one tree being null while the other is not) correctly managed in the fuzzy matching context?
- **Clarity and Code Quality:** Is the code clearly structured and commented? Would you suggest improvements for readability or performance?
- **Potential Pitfalls:** Does the approach correctly propagate the difference count through recursive calls, or are there issues with the way differences are tracked?

In your feedback, maintain a supportive and constructive tone, and offer progressive hints if further refinement is needed.

Here is the problem statement:
Subtree of Another Tree
Solved

Given the roots of two binary trees root and subRoot, return true if there is a subtree of root with the same structure and node values of subRoot and false otherwise.

A subtree of a binary tree tree is a tree that consists of a node in tree and all of this node's descendants. The tree tree could also be considered as a subtree of itself.

Example 1:

Input: root = [1,2,3,4,5], subRoot = [2,4,5]

Output: true

Example 2:

Input: root = [1,2,3,4,5,null,null,6], subRoot = [2,4,5]

Output: false

Constraints:

    0 <= The number of nodes in both trees <= 100.
    -100 <= root.val, subRoot.val <= 100



Recommended Time & Space Complexity

You should aim for a solution as good or better than O(m * n) time and O(m + n) space, where n and m are the number of nodes in root and subRoot, respectively.

Hint 1

A subtree of a tree is a tree rooted at a specific node. We need to check whether the given subRoot is identical to any of the subtrees of root. Can you think of a recursive way to check this? Maybe you can leverage the idea of solving a problem where two trees are given, and you need to check whether they are identical in structure and values.

Hint 2

When two trees are identical, it means that every node in both trees has the same value and structure. We can use the Depth First Search (DFS) algorithm to solve the problem. How do you implement this?

Hint 3

We traverse the given root, and at each node, we check if the subtree rooted at that node is identical to the given subRoot. We use a helper function, sameTree(root1, root2), to determine whether the two trees passed to it are identical in both structure and values.
"""

evaluation_agent = initialize_agent(
    tools,
    llm,
    memory=memory,
    verbose=True,
    agent=AgentType.CHAT_CONVERSATIONAL_REACT_DESCRIPTION,
    agent_kwargs={"system_message": EVALUATION_SYSTEM_MESSAGE},
    handle_parsing_errors=True
)

def generate_evaluation_response(prompt):
    try:
        response = evaluation_agent(prompt)
        return response['output']
    except Exception as e:
        error_msg = str(e)

        # Handle parsing errors - extract actual content
        if "Could not parse LLM output:" in error_msg:
            content_start = error_msg.find("Could not parse LLM output:") + len("Could not parse LLM output:")
            extracted_content = error_msg[content_start:].strip()

            # Use AI to validate and fix the format variance
            return fix_format_variance_with_ai(extracted_content)

        # Handle validation errors - try to extract the actual AI-generated content
        if "validation error" in error_msg.lower() and "AIMessage" in error_msg:
            try:
                # Try to access the agent's memory to get the last AI response
                if hasattr(evaluation_agent, 'memory') and evaluation_agent.memory and hasattr(evaluation_agent.memory, 'chat_memory'):
                    messages = evaluation_agent.memory.chat_memory.messages
                    if messages and len(messages) > 0:
                        # Look for the last AI message
                        for msg in reversed(messages):
                            if hasattr(msg, 'content'):
                                content = msg.content
                                # If content is a dict, format it as text
                                if isinstance(content, dict):
                                    formatted_text = f"Score: {content.get('Score', 'N/A')}\n\n"
                                    formatted_text += f"Correctness: {content.get('Correctness', '')}\n\n"
                                    formatted_text += f"Key Concepts: {content.get('Key Concepts', '')}\n\n"
                                    formatted_text += f"Edge Cases: {content.get('Edge Cases', '')}\n\n"
                                    formatted_text += f"Code Quality: {content.get('Code Quality', '')}\n\n"

                                    suggestions = content.get('Suggestions for Improvement', [])
                                    formatted_text += "Suggestions for Improvement:\n"
                                    if isinstance(suggestions, list):
                                        for i, suggestion in enumerate(suggestions, 1):
                                            formatted_text += f"{i}. {suggestion}\n"
                                    else:
                                        formatted_text += str(suggestions)

                                    return formatted_text
                                # If it's already a string with evaluation content, return it
                                elif isinstance(content, str) and "Score:" in content:
                                    return content
            except:
                pass

        return f"Error generating evaluation: {str(e)}"

def fix_format_variance_with_ai(malformed_content):
    """
    Uses a second AI call to detect and fix format variances in evaluation responses.
    This is a self-healing mechanism for when the first AI returns content in unexpected formats.
    """
    try:
        # Create a correction prompt for the LLM
        correction_prompt = f"""
        The following evaluation content was generated but needs to be reformatted to match the required structure.

        Original content:
        {malformed_content}

        Please reformat this evaluation into the following EXACT plain text structure:

        Score: X/100

        Correctness: [feedback]

        Key Concepts: [feedback]

        Edge Cases: [feedback]

        Code Quality: [feedback]

        Suggestions for Improvement:
        1. [suggestion]
        2. [suggestion]
        3. [suggestion]

        Extract the actual evaluation content from above and format it correctly.
        Do NOT add new evaluation content, just reformat what's already there.
        Return ONLY the reformatted text, nothing else.
        """

        # Use the LLM directly for format correction (bypass agent to avoid same errors)
        from llm import llm
        corrected_response = llm.predict(correction_prompt)

        return corrected_response.strip()

    except Exception as correction_error:
        # If the correction AI also fails, return the original content
        print(f"Format correction AI failed: {str(correction_error)}")
        return malformed_content
