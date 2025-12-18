// State variables
let currentStep = 0;
let playing = false;
let selectedNodes = [];
let codeProgress = 0;
let currentMode = 'learn'; // 'learn', 'practice', 'challenge'
let challengeSubmitted = false;
let playInterval;

// Maximum number of steps
const MAX_STEPS = 11;

// DOM Elements
const modeButtons = {
    learn: document.getElementById('learn-mode'),
    practice: document.getElementById('practice-mode'),
    challenge: document.getElementById('challenge-mode')
};

const mainTreeNodes = document.querySelectorAll('#main-tree-svg .node');
const subtreeNodes = document.querySelectorAll('#subtree-svg .node');
const stepExplanation = document.getElementById('step-explanation');
const progressBar = document.getElementById('progress-bar');
const hintBox = document.getElementById('hint-box');
const hintText = document.getElementById('hint-text');
const feedbackMessage = document.getElementById('feedback-message');
const feedbackText = document.getElementById('feedback-text');
const codeSection = document.getElementById('code-section');
const codeEditor = document.getElementById('code-editor');
const codeProgressLevel = document.getElementById('code-progress-level');
const codeProgressBar = document.getElementById('code-progress-bar');
const challengeSection = document.getElementById('challenge-section');
const challengeEditor = document.getElementById('challenge-editor');
const challengeFeedback = document.getElementById('challenge-feedback');
const challengeFeedbackText = document.getElementById('challenge-feedback-text');
const solutionSection = document.getElementById('solution-section');

// Control buttons
const resetBtn = document.getElementById('reset-btn');
const prevBtn = document.getElementById('prev-btn');
const playBtn = document.getElementById('play-btn');
const nextBtn = document.getElementById('next-btn');
const endBtn = document.getElementById('end-btn');
const hintBtn = document.getElementById('hint-btn');
const codeToggleBtn = document.getElementById('code-toggle-btn');

// Code template buttons
const templateBtn = document.getElementById('template-btn');
const level1Btn = document.getElementById('level1-btn');
const level2Btn = document.getElementById('level2-btn');
const completeBtn = document.getElementById('complete-btn');
const resetCodeBtn = document.getElementById('reset-code-btn');
const checkCodeBtn = document.getElementById('check-code-btn');

// Challenge buttons
const clearChallengeBtn = document.getElementById('clear-challenge-btn');
const submitChallengeBtn = document.getElementById('submit-challenge-btn');

// Step explanations
const stepExplanations = [
    "Step 1: Start with isSubtree(root, subRoot) where root is node 1 and subRoot is node 2. We check if the entire trees are identical.",
    "Step 2: In isSameTree(node1, subRoot), we compare values: 1 ≠ 2. Since values don't match, isSameTree returns false.",
    "Step 3: We continue by calling isSubtree(root.left, subRoot) where root.left is node 2. This checks if the subtree rooted at node 2 matches the subRoot.",
    "Step 4: In isSameTree(node2, subRoot), values match (2 = 2). We continue comparing children.",
    "Step 5: When comparing children, we find that node 4 in the main tree has child node 6, but node 4 in subRoot doesn't have children. This causes isSameTree to return false.",
    "Step 6: Continue recursive calls with isSubtree(node4, subRoot). Node 4 ≠ 2, so this returns false.",
    "Step 7: Next, check isSubtree(node5, subRoot). Node 5 ≠ 2, and node 5 has no children, so this returns false.",
    "Step 8: Check isSubtree(node3, subRoot). Node 3 ≠ 2, and its children are null, so this returns false.",
    "Step 9: After checking all possible subtrees, the algorithm returns false overall because no match was found.",
    "Step 10: Reviewing: The subtree must match exactly in both structure and values. While the subtree at node 2 had matching values, the structure was different due to node 6.",
    "Step 11: The algorithm works by recursively checking each node in the main tree as a potential root of the subtree pattern.",
    "Step 12: The key insight is handling the separate concerns: isSameTree checks if two trees are identical, while isSubtree handles the search through the main tree."
];

// Hints for each step
const hints = [
    "We start by comparing the root of the main tree with the root of the subtree.",
    "Since the values don't match (1 ≠ 2), we need to search in the subtrees.",
    "We first check the left subtree, which has node 2 as its root.",
    "The values match (2 = 2), so we need to compare their children.",
    "We compare the left children of both node 2s. There's a structural mismatch.",
    "Since the current subtree doesn't match, we continue our search with node 4.",
    "We then check if the subtree rooted at node 5 matches.",
    "Finally, we check the right subtree of the original root, node 3.",
    "After checking all possibilities, we return false as no match was found.",
    "Remember that for a subtree match, both structure and values must match exactly.",
    "Keep track of the recursive calls to understand the algorithm's flow.",
    "Try implementing the algorithm step by step, handling base cases first."
];

// Node highlighting maps for each step
const stepHighlightMap = {
    0: ['node1'],
    1: ['node1', 'subRoot'],
    2: ['node2'],
    3: ['node2', 'subRoot'],
    4: ['node4Main', 'node4Sub'],
    5: ['node6'],
    6: ['node5Main'],
    7: ['node3'],
    8: [],
    9: ['node2', 'node4Main', 'node6'],
    10: ['node1', 'node2', 'node4Main', 'node5Main', 'node3'],
    11: []
};

// Code templates
const codeTemplates = [
    // Level 0: Function signature
    `function isSubtree(root, subRoot) {
  // Your code here
}

function isSameTree(p, q) {
  // Your code here
}`,
    // Level 1: Base cases
    `function isSubtree(root, subRoot) {
  if (!subRoot) return true;
  if (!root) return false;
  
  // Your code here
}

function isSameTree(p, q) {
  if (!p && !q) return true;
  if (!p || !q) return false;
  
  // Your code here
}`,
    // Level 2: Value comparison
    `function isSubtree(root, subRoot) {
  if (!subRoot) return true;
  if (!root) return false;
  
  // Check if current trees match
  // Your code here
  
  // Recursive search
  // Your code here
}

function isSameTree(p, q) {
  if (!p && !q) return true;
  if (!p || !q) return false;
  
  // Value comparison
  if (p.val !== q.val) return false;
  
  // Your code here
}`,
    // Level 3: Complete code
    `function isSubtree(root, subRoot) {
  if (!subRoot) return true;
  if (!root) return false;
  
  // Check if current trees match
  if (isSameTree(root, subRoot)) return true;
  
  // Recursive search in left and right subtrees
  return isSubtree(root.left, subRoot) || 
         isSubtree(root.right, subRoot);
}

function isSameTree(p, q) {
  if (!p && !q) return true;
  if (!p || !q) return false;
  
  // Value comparison
  if (p.val !== q.val) return false;
  
  // Check both subtrees recursively
  return isSameTree(p.left, q.left) && 
         isSameTree(p.right, q.right);
}`
];

// Initialize
function init() {
    // Set initial code template
    codeEditor.value = codeTemplates[0];
    
    // Attach event listeners
    attachEventListeners();
    
    // Update UI based on initial state
    updateUI();
}

// Attach event listeners
function attachEventListeners() {
    // Mode buttons
    modeButtons.learn.addEventListener('click', () => setMode('learn'));
    modeButtons.practice.addEventListener('click', () => setMode('practice'));
    modeButtons.challenge.addEventListener('click', () => setMode('challenge'));
    
    // Node click handlers
    mainTreeNodes.forEach(node => {
        node.addEventListener('click', () => handleNodeClick(node.getAttribute('data-node-id')));
    });
    
    subtreeNodes.forEach(node => {
        node.addEventListener('click', () => handleNodeClick(node.getAttribute('data-node-id')));
    });
    
    // Control buttons
    resetBtn.addEventListener('click', resetAnimation);
    prevBtn.addEventListener('click', prevStep);
    playBtn.addEventListener('click', togglePlay);
    nextBtn.addEventListener('click', nextStep);
    endBtn.addEventListener('click', endAnimation);
    hintBtn.addEventListener('click', toggleHint);
    codeToggleBtn.addEventListener('click', toggleCodeView);
    
    // Code template buttons
    templateBtn.addEventListener('click', () => loadCodeTemplate(0));
    level1Btn.addEventListener('click', () => loadCodeTemplate(1));
    level2Btn.addEventListener('click', () => loadCodeTemplate(2));
    completeBtn.addEventListener('click', () => loadCodeTemplate(3));
    resetCodeBtn.addEventListener('click', resetCode);
    checkCodeBtn.addEventListener('click', checkCode);
    
    // Challenge buttons
    clearChallengeBtn.addEventListener('click', clearChallenge);
    submitChallengeBtn.addEventListener('click', submitChallenge);
}

// Set active mode
function setMode(mode) {
    currentMode = mode;
    
    // Update mode buttons
    Object.keys(modeButtons).forEach(key => {
        modeButtons[key].classList.toggle('active', key === mode);
    });
    
    // Update UI for the selected mode
    if (mode === 'learn') {
        codeSection.classList.add('hidden');
        challengeSection.classList.add('hidden');
        resetAnimation();
    } else if (mode === 'practice') {
        codeSection.classList.add('hidden');
        challengeSection.classList.add('hidden');
        resetAnimation();
        clearSelectedNodes();
        showFeedback("Click on nodes to select which ones should be compared at this step.", 3000);
    } else if (mode === 'challenge') {
        codeSection.classList.add('hidden');
        challengeSection.classList.remove('hidden');
        resetAnimation();
    }
}

function isStepComplete() {
    // Get the correct nodes for the current step (or empty array if none)
    const correctNodes = stepHighlightMap[currentStep] || [];
    // Check if every required node is in the selectedNodes array
    // and that no extra nodes are selected.
    return correctNodes.length > 0 &&
           correctNodes.every(id => selectedNodes.includes(id)) &&
           selectedNodes.length === correctNodes.length;
}

function handleNodeClick(nodeId) {
    if (currentMode !== 'practice') return;
    
    const node = document.getElementById(nodeId);
    
    // If the node is already selected, toggle it off
    if (selectedNodes.includes(nodeId)) {
        selectedNodes = selectedNodes.filter(id => id !== nodeId);
        node.classList.remove('selected');
    } else {
        // Add the node to the selection and add green class
        selectedNodes.push(nodeId);
        node.classList.add('selected');
        
        // Get the correct nodes for the current step
        const correctNodes = stepHighlightMap[currentStep] || [];
        
        // Check if the clicked node is correct
        if (correctNodes.includes(nodeId)) {
            // Provide dynamic feedback on how many are left to select
            const selectedCorrectCount = selectedNodes.filter(id => correctNodes.includes(id)).length;
            const remaining = correctNodes.length - selectedCorrectCount;
            
            if (remaining > 0) {
                showFeedback(`Correct! ${remaining} more node${remaining > 1 ? 's' : ''} left to select.`, 2000);
            } else {
                showFeedback("All correct nodes selected!", 2000);
            }
        } else {
            // Provide feedback for a wrong selection
            showFeedback("Not quite. Think about which nodes we need to compare at this step.", 2000);
            // Automatically remove the wrong selection after a short delay
            setTimeout(() => {
                selectedNodes = selectedNodes.filter(id => id !== nodeId);
                node.classList.remove('selected');
            }, 1000);
        }
    }
    
    // After each click, check if the step is complete (all correct nodes selected)
    if (isStepComplete()) {
        showFeedback("All correct nodes selected! Moving to the next step.", 1000);
        setTimeout(() => {
            clearSelectedNodes();  // Remove the green selections from all nodes
            nextStep();            // Automatically move to the next step
        }, 1000);
    }
}

// Helper to check if the step is complete
function isStepComplete() {
    const correctNodes = stepHighlightMap[currentStep] || [];
    // The step is complete if:
    // 1. There is at least one correct node required, and
    // 2. Every required node is selected, and
    // 3. No extra nodes are selected.
    return correctNodes.length > 0 &&
           correctNodes.every(id => selectedNodes.includes(id)) &&
           selectedNodes.length === correctNodes.length;
}


// Check if selected node is correct for current step
function checkNodeSelection(nodeId) {
    const correctNodes = stepHighlightMap[currentStep] || [];
    if (correctNodes.includes(nodeId)) {
        // Count how many correct nodes are selected so far
        const selectedCorrectCount = selectedNodes.filter(id => correctNodes.includes(id)).length;
        const totalRequired = correctNodes.length;
        const remaining = totalRequired - selectedCorrectCount;
        
        if (remaining > 0) {
            showFeedback(`Correct! ${remaining} more node${remaining > 1 ? 's' : ''} left to select.`, 2000);
        } else {
            showFeedback("All correct nodes selected!", 2000);
        }
    } else {
        showFeedback("Not quite. Think about which nodes we need to compare at this step.", 2000);
    }
}


// Clear selected nodes
function clearSelectedNodes() {
    selectedNodes = [];
    mainTreeNodes.forEach(node => node.classList.remove('selected'));
    subtreeNodes.forEach(node => node.classList.remove('selected'));
}

// Navigation functions
function resetAnimation() {
    stopPlaying();
    currentStep = 0;
    updateUI();
}

function prevStep() {
    stopPlaying();
    if (currentStep > 0) {
        currentStep--;
        updateUI();
    }
}

function nextStep() {
    stopPlaying();
    if (currentStep < MAX_STEPS) {
        currentStep++;
        updateUI();
    } else {
        showFeedback("You've reached the end of the animation!", 2000);
    }
}

function endAnimation() {
    stopPlaying();
    currentStep = MAX_STEPS;
    updateUI();
}

function togglePlay() {
    if (playing) {
        stopPlaying();
    } else {
        startPlaying();
    }
}

function startPlaying() {
    playing = true;
    playBtn.innerHTML = '<i class="fas fa-pause"></i>';
    playBtn.classList.add('pause');
    
    playInterval = setInterval(() => {
        if (currentStep < MAX_STEPS) {
            currentStep++;
            updateUI();
        } else {
            stopPlaying();
        }
    }, 3000);
}

function stopPlaying() {
    playing = false;
    clearInterval(playInterval);
    playBtn.innerHTML = '<i class="fas fa-play"></i>';
    playBtn.classList.remove('pause');
}

function toggleHint() {
    hintBox.classList.toggle('hidden');
}

function toggleCodeView() {
    codeSection.classList.toggle('hidden');
    codeToggleBtn.classList.toggle('active');
}

// Code template functions
function loadCodeTemplate(level) {
    codeEditor.value = codeTemplates[level];
    codeProgress = level;
    updateCodeProgress();
    showFeedback(`Code template for level ${level} loaded. Try to understand what each part does.`, 3000);
}

function resetCode() {
    codeEditor.value = codeTemplates[0];
    codeProgress = 0;
    updateCodeProgress();
}

function checkCode() {
    const userCode = codeEditor.value;
    
    // Required patterns for each level
    const requiredPatterns = [
        // Level 1
        [
            "if (!subRoot) return true",
            "if (!root) return false",
            "if (!p && !q) return true",
            "if (!p || !q) return false"
        ],
        // Level 2
        [
            "if (p.val !== q.val)",
            "isSameTree(root, subRoot)"
        ],
        // Level 3
        [
            "isSubtree(root.left, subRoot)",
            "isSubtree(root.right, subRoot)",
            "isSameTree(p.left, q.left)",
            "isSameTree(p.right, q.right)"
        ]
    ];
    
    let newProgressLevel = 0;
    
    // Check each level's patterns
    for (let level = 0; level < requiredPatterns.length; level++) {
        const allPatternsFound = requiredPatterns[level].every(pattern => 
            userCode.includes(pattern)
        );
        
        if (allPatternsFound) {
            newProgressLevel = level + 1;
        } else {
            break;
        }
    }
    
    if (newProgressLevel > codeProgress) {
        codeProgress = newProgressLevel;
        updateCodeProgress();
        showFeedback(`Great job! You've completed level ${newProgressLevel} of the code implementation.`, 3000);
    } else if (newProgressLevel < codeProgress) {
        showFeedback(`You're missing some key elements from your previous solution.`, 3000);
    } else {
        showFeedback(`Your code meets the requirements for level ${newProgressLevel}. Keep going!`, 3000);
    }
}

function updateCodeProgress() {
    codeProgressLevel.textContent = codeProgress;
    codeProgressBar.style.width = `${(codeProgress / 3) * 100}%`;
}

// Challenge functions
function clearChallenge() {
    challengeEditor.value = '';
    challengeFeedback.classList.add('hidden');
    solutionSection.classList.add('hidden');
    challengeSubmitted = false;
}

function submitChallenge() {
    const userSolution = challengeEditor.value;
    challengeSubmitted = true;
    
    // Show thinking animation
    const thinkingAnimation = document.getElementById('thinking-animation');
    
    // Hide previous feedback and show thinking animation
    challengeFeedback.classList.remove('hidden');
    challengeFeedbackText.innerHTML = '';
    thinkingAnimation.classList.remove('hidden');
    solutionSection.classList.add('hidden');
    
    // API endpoint - check if on production domains
    const isProduction = window.location.hostname === 'ucberkeley-ml-ai-capstone.com' ||
                         window.location.hostname === 'duyng-portfolio.com' ||
                         window.location.hostname === 'www.duyng-portfolio.com';
    const apiUrl = isProduction
        ? 'https://uc-berkeley-ml-ai-capstone-work-sample.onrender.com/evaluate-challenge'
        : '/evaluate-challenge';
    
    fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            code: userSolution,
            challenge_type: 'fuzzySubtree'
        }),
    })
    .then(response => response.json())
    .then(data => {
        // Hide thinking animation
        thinkingAnimation.classList.add('hidden');
        
        let responseText = data.response || '';
        
        // Create a container for formatted feedback
        const formattedFeedback = document.createElement('div');
        formattedFeedback.className = 'formatted-feedback';
        
        // Format the text with nice styling
        const formattedHtml = formatEvaluationText(responseText);
        formattedFeedback.innerHTML = formattedHtml;
        
        // Replace content
        challengeFeedbackText.innerHTML = '';
        challengeFeedbackText.appendChild(formattedFeedback);
        
        // Show solution section
        solutionSection.classList.remove('hidden');
    })
    .catch(error => {
        console.error('Error:', error);
        thinkingAnimation.classList.add('hidden');
        challengeFeedbackText.textContent = 'Error evaluating solution. Please try again.';
    });
}

// Helper function to format evaluation text
function formatEvaluationText(text) {
    // Create a container for evaluation content
    let formattedHtml = '<div class="evaluation-content">';
    
    // Extract score
    const scoreRegex = /Score:\s*(\d+)\/100/;
    const scoreMatch = text.match(scoreRegex);
    if (scoreMatch) {
        formattedHtml += `<h3 class="evaluation-score">Score: ${scoreMatch[1]}/100</h3>`;
        // Remove score from text to avoid duplication
        text = text.replace(scoreRegex, '');
    }
    
    // Define sections to look for
    const sectionTitles = [
        "Correctness:",
        "Key Concepts:",
        "Edge Cases:",
        "Code Quality:",
        "Suggestions for Improvement:"
    ];
    
    // Split the text by section headers
    let remainingText = text;
    sectionTitles.forEach((sectionTitle, index) => {
        if (remainingText.includes(sectionTitle)) {
            // Get position of this section
            const sectionStart = remainingText.indexOf(sectionTitle);
            
            // Find start of next section (if any)
            let sectionEnd = remainingText.length;
            for (let i = index + 1; i < sectionTitles.length; i++) {
                const nextSectionPos = remainingText.indexOf(sectionTitles[i]);
                if (nextSectionPos > -1) {
                    sectionEnd = nextSectionPos;
                    break;
                }
            }
            
            // Extract section content
            const sectionText = remainingText.substring(sectionStart, sectionEnd).trim();
            const contentText = sectionText.replace(sectionTitle, '').trim();
            
            // Add section header
            formattedHtml += `<h3 class="evaluation-section">${sectionTitle}</h3>`;
            
            // Handle suggestions section differently
            if (sectionTitle === "Suggestions for Improvement:") {
                // Check if there are numbered items
                const lines = contentText.split('\n');
                const numberedItems = lines.filter(line => /^\d+\./.test(line.trim()));
                
                if (numberedItems.length > 0) {
                    // It's a list
                    formattedHtml += '<ul>';
                    numberedItems.forEach(item => {
                        // Extract content without the number
                        const itemContent = item.replace(/^\d+\.\s*/, '').trim();
                        formattedHtml += `<li>${itemContent}</li>`;
                    });
                    formattedHtml += '</ul>';
                } else {
                    // Regular paragraph
                    formattedHtml += `<p>${contentText}</p>`;
                }
            } else {
                // Regular paragraph
                formattedHtml += `<p>${contentText}</p>`;
            }
            
            // Update remaining text
            remainingText = remainingText.substring(sectionEnd);
        }
    });
    
    formattedHtml += '</div>';
    return formattedHtml;
}

// Helper function to format the feedback nicely
function formatFeedback(data) {
    console.log("Data received in formatFeedback:", data);
    
    // Create container
    const feedbackContainer = document.createElement('div');
    feedbackContainer.className = 'formatted-feedback';
    
    try {
        // Handle special case where data is a string from LangChain that contains JSON
        if (typeof data === 'string' && data.includes('action_input')) {
            try {
                // This handles LangChain output format
                const parsedData = JSON.parse(data);
                if (parsedData.action_input) {
                    // The actual feedback is in action_input as a string
                    const feedbackData = JSON.parse(parsedData.action_input);
                    // Now process the inner data
                    return formatFeedback(feedbackData);
                }
            } catch (e) {
                console.error("Error parsing LangChain string:", e);
                // Continue with the string as-is
            }
        }
        
        // Case 1: If data has score and feedback properties (your current format)
        if (data.score !== undefined && data.feedback) {
            // Display overall score
            const scoreHeader = document.createElement('h3');
            scoreHeader.textContent = `🎯 Overall Score: ${data.score}/100`;
            feedbackContainer.appendChild(scoreHeader);
            
            // Display each feedback category
            if (typeof data.feedback === 'object') {
                const categoryMapping = {
                    'correctness': 'Correctness',
                    'keyConcepts': 'Key Concepts', 
                    'edgeCases': 'Edge Cases',
                    'codeQuality': 'Code Quality'
                };
                
                Object.entries(data.feedback).forEach(([key, value]) => {
                    const displayTitle = categoryMapping[key] || key;
                    
                    const categoryHeader = document.createElement('h4');
                    categoryHeader.textContent = `✅ ${displayTitle}:`;
                    feedbackContainer.appendChild(categoryHeader);
                    
                    const feedbackText = document.createElement('p');
                    feedbackText.textContent = value;
                    feedbackContainer.appendChild(feedbackText);
                });
            }
        }
        // Case 2: Plain text or markdown response
        else if (typeof data === 'string') {
            const feedbackText = document.createElement('div');
            feedbackText.innerHTML = renderMarkdown(data);
            feedbackContainer.appendChild(feedbackText);
        }
        // Case 3: Other structured data (fallback)
        else {
            // Default handling for other structures
            Object.entries(data).forEach(([key, value]) => {
                if (key !== 'suggestions' && key !== 'Suggestions') {
                    const header = document.createElement('h4');
                    header.textContent = `${key}:`;
                    feedbackContainer.appendChild(header);
                    
                    const content = document.createElement('p');
                    content.textContent = typeof value === 'object' ? JSON.stringify(value) : value;
                    feedbackContainer.appendChild(content);
                }
            });
            
            // Handle suggestions separately
            const suggestions = data.suggestions || data.Suggestions;
            if (suggestions) {
                const suggestionsHeader = document.createElement('h4');
                suggestionsHeader.textContent = `💡 Improvement Suggestions:`;
                feedbackContainer.appendChild(suggestionsHeader);
                
                const list = document.createElement('ul');
                if (Array.isArray(suggestions)) {
                    suggestions.forEach(suggestion => {
                        const item = document.createElement('li');
                        item.textContent = suggestion;
                        list.appendChild(item);
                    });
                } else {
                    const item = document.createElement('li');
                    item.textContent = suggestions;
                    list.appendChild(item);
                }
                feedbackContainer.appendChild(list);
            }
        }
    } catch (error) {
        console.error("Error in formatFeedback:", error);
        const errorMsg = document.createElement('p');
        errorMsg.textContent = "Error formatting feedback. Please try again.";
        feedbackContainer.appendChild(errorMsg);
    }
    
    // Update the UI
    challengeFeedbackText.innerHTML = '';
    challengeFeedbackText.appendChild(feedbackContainer);
    solutionSection.classList.remove('hidden');
}

// Helper function to render basic markdown
function renderMarkdown(text) {
    if (!text) return '';
    
    // Convert headers (###)
    text = text.replace(/###\s+(.*?)(?=\n|$)/g, '<h3>$1</h3>');
    
    // Convert bold (**text**)
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Convert italic (*text*)
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Convert line breaks
    text = text.replace(/\n/g, '<br>');
    
    return text;
}

// Utility functions
function showFeedback(message, duration = 0) {
    feedbackMessage.classList.remove('hidden');
    feedbackText.textContent = message;
    
    if (duration > 0) {
        setTimeout(() => {
            feedbackMessage.classList.add('hidden');
        }, duration);
    }
}

// Update UI based on current state
function updateUI() {
    // Update explanation
    stepExplanation.textContent = stepExplanations[currentStep] || "End of explanation";
    
    // Update hint
    hintText.textContent = hints[currentStep] || "";
    
    // Update progress bar
    progressBar.style.width = `${(currentStep / MAX_STEPS) * 100}%`;
    
    // Update node highlighting
    updateNodeHighlighting();
}

// Update node highlighting based on current step
function updateNodeHighlighting() {
    // Remove all highlights
    mainTreeNodes.forEach(node => node.classList.remove('highlighted'));
    subtreeNodes.forEach(node => node.classList.remove('highlighted'));
    
    // Add highlights for current step
    if (currentMode === 'learn' && stepHighlightMap[currentStep]) {
        stepHighlightMap[currentStep].forEach(nodeId => {
            const node = document.getElementById(nodeId);
            if (node) {
                node.classList.add('highlighted');
            }
        });
    }
}

// Add this function to your script.js file
function setupCodeEditor() {
    // Get all code editor textareas
    const codeEditors = [
        document.getElementById('code-editor'),
        document.getElementById('challenge-editor')
    ];
    
    codeEditors.forEach(editor => {
        if (!editor) return;
        
        // Handle tab key presses for indentation
        editor.addEventListener('keydown', function(e) {
            if (e.key === 'Tab') {
                e.preventDefault(); // Prevent moving to next element
                
                // Get cursor position
                const start = this.selectionStart;
                const end = this.selectionEnd;
                
                // Insert 4 spaces at cursor position
                this.value = this.value.substring(0, start) + 
                            "    " + 
                            this.value.substring(end);
                
                // Move cursor after the inserted spaces
                this.selectionStart = this.selectionEnd = start + 4;
            }
        });
        
        // Add autoindent on Enter key
        editor.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                
                const start = this.selectionStart;
                const end = this.selectionEnd;
                
                // Get current line before cursor
                const currentLine = this.value.substring(0, start).split('\n').pop();
                
                // Calculate indentation of current line
                let indent = '';
                for (let i = 0; i < currentLine.length; i++) {
                    if (currentLine[i] === ' ' || currentLine[i] === '\t') {
                        indent += currentLine[i];
                    } else {
                        break;
                    }
                }
                
                // Add extra indent if line ends with {
                if (currentLine.trim().endsWith('{')) {
                    indent += '    ';
                }
                
                // Insert newline and indentation
                this.value = this.value.substring(0, start) + 
                            "\n" + indent + 
                            this.value.substring(end);
                
                // Move cursor after the inserted indentation
                this.selectionStart = this.selectionEnd = start + 1 + indent.length;
            }
        });
    });
}

// Call this function after the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Your existing init function
    init();
    
    // Setup code editors
    setupCodeEditor();
});

// // Initialize on page load
// document.addEventListener('DOMContentLoaded', init);

// Add this at the end of your JavaScript file, outside any function
document.addEventListener('click', function(event) {
    // Check if the clicked element is the toggle-hints button
    if (event.target.id === 'toggle-hints' || 
        (event.target.parentElement && event.target.parentElement.id === 'toggle-hints')) {
        
        const hintsContainer = document.getElementById('hints-container');
        if (hintsContainer) {
            const isHidden = hintsContainer.classList.contains('hidden');
            hintsContainer.classList.toggle('hidden');
            
            // Update button text
            const button = document.getElementById('toggle-hints');
            if (button) {
                button.textContent = isHidden ? 'Hide Hints' : 'Show Hints';
            }
        }
    }
});
