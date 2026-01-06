document.addEventListener("DOMContentLoaded", function () {
    const apiUrl = 'https://uc-berkeley-ml-ai-capstone-work-sample.onrender.com/chat'; // Backend API URL
    const classifyImageUrl = 'https://uc-berkeley-ml-ai-capstone-work-sample.onrender.com/classify-image'; // Backend proxy for HuggingFace

    // Second Brain RAG Pipeline API Configuration (Enhanced with Function Calling)
    // For local development: 'http://localhost:8000/api/v1/demo/rag-pipeline-enhanced'
    // Production: https://second-brain-api-hptf.onrender.com
    const ragPipelineUrl = 'https://second-brain-api-hptf.onrender.com/api/v1/demo/rag-pipeline-enhanced';

    const chatbotToggle = document.getElementById("chatbot-toggle");
    const chatbotContainer = document.getElementById("chatbot-container");
    const chatbotHeader = document.getElementById("chatbot-header");
    const chatOutput = document.getElementById("chatbot-messages");
    const userInput = document.getElementById("user-input");
    const sendButton = document.getElementById("send-button");
    const imageUploadBtn = document.getElementById("image-upload-btn");
    const imageUploadInput = document.getElementById("image-upload-input");
    const resizeHandle = document.getElementById("chatbot-resize-handle");
    const pipelineToggle = document.getElementById("pipeline-toggle");
    const pipelineInline = document.getElementById("pipeline-inline");
    const retrievedChunksPanel = document.getElementById("retrieved-chunks-panel");
    const retrievedChunksContainer = document.getElementById("retrieved-chunks");
    const pipelineTotalTime = document.getElementById("pipeline-total-time");
    const chunksCollapseBtn = document.getElementById("chunks-collapse-btn");
    const chunksPanelHeader = document.querySelector(".chunks-panel-header");

    // Tool calls panel elements
    const toolCallsPanel = document.getElementById("tool-calls-panel");
    const toolCallsList = document.getElementById("tool-calls-list");
    const toolsCollapseBtn = document.getElementById("tools-collapse-btn");
    const toolsPanelHeader = document.querySelector(".tool-calls-panel-header");

    let welcomeMessageSent = false; // Flag to track if welcome message is sent
    let pendingImage = null; // Store uploaded image for classification
    let isPipelineMode = false; // Track if RAG pipeline visualization is enabled

    // Chunks panel collapse toggle
    if (chunksPanelHeader) {
        chunksPanelHeader.addEventListener("click", function() {
            retrievedChunksPanel.classList.toggle("collapsed");
        });
    }

    // Tool calls panel collapse toggle
    if (toolsPanelHeader) {
        toolsPanelHeader.addEventListener("click", function() {
            toolCallsPanel.classList.toggle("collapsed");
        });
    }

    // Drag and click functionality for moving chatbot
    let isDragging = false;
    let hasMoved = false;
    let dragOffsetX, dragOffsetY;
    let startMouseX, startMouseY;

    chatbotHeader.addEventListener("mousedown", function(e) {
        isDragging = true;
        hasMoved = false;
        startMouseX = e.clientX;
        startMouseY = e.clientY;

        const rect = chatbotContainer.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;

        // Add dragging class to disable transitions for smooth movement
        chatbotContainer.classList.add("dragging");

        e.preventDefault();
    });

    document.addEventListener("mousemove", function(e) {
        if (!isDragging) return;

        // Check if mouse has moved more than 5 pixels (to distinguish click from drag)
        const deltaX = Math.abs(e.clientX - startMouseX);
        const deltaY = Math.abs(e.clientY - startMouseY);

        if (deltaX > 5 || deltaY > 5) {
            hasMoved = true;
            chatbotContainer.style.cursor = "move";

            let newLeft = e.clientX - dragOffsetX;
            let newTop = e.clientY - dragOffsetY;

            // Keep chatbot within viewport bounds
            const maxX = window.innerWidth - chatbotContainer.offsetWidth;
            const maxY = window.innerHeight - chatbotContainer.offsetHeight;

            newLeft = Math.max(0, Math.min(newLeft, maxX));
            newTop = Math.max(0, Math.min(newTop, maxY));

            // Convert from bottom/right positioning to top/left
            chatbotContainer.style.bottom = "auto";
            chatbotContainer.style.right = "auto";
            chatbotContainer.style.left = newLeft + "px";
            chatbotContainer.style.top = newTop + "px";
        }
    });

    document.addEventListener("mouseup", function() {
        if (isDragging) {
            isDragging = false;
            chatbotContainer.style.cursor = "";
            // Remove dragging class to re-enable transitions
            chatbotContainer.classList.remove("dragging");

            // If no significant movement, treat it as a click to toggle
            if (!hasMoved) {
                toggleChatbot();
            }
        }
    });

    // Toggle chatbot function
    function toggleChatbot() {
        chatbotContainer.classList.toggle("closed");

        if (!chatbotContainer.classList.contains("closed")) {
            if (!welcomeMessageSent) {
                sendWelcomeMessage();
            }
            // Show resize hint and header hint
            showResizeHint();
            showHeaderHint();
        }
    }

    // Resize functionality
    let isResizing = false;
    let startX, startY, startWidth, startHeight, startRight, startBottom;

    resizeHandle.addEventListener("mousedown", function(e) {
        isResizing = true;
        chatbotContainer.classList.add("resizing");
        startX = e.clientX;
        startY = e.clientY;

        const rect = chatbotContainer.getBoundingClientRect();
        startWidth = rect.width;
        startHeight = rect.height;

        e.preventDefault();
        e.stopPropagation(); // Prevent triggering drag
    });

    document.addEventListener("mousemove", function(e) {
        if (!isResizing) return;

        const deltaX = e.clientX - startX; // Normal for right-side resize
        const deltaY = e.clientY - startY; // Normal for bottom-side resize

        const newWidth = Math.min(Math.max(startWidth + deltaX, 300), 600);
        const newHeight = Math.min(Math.max(startHeight + deltaY, 300), 700);

        chatbotContainer.style.width = newWidth + "px";
        chatbotContainer.style.height = newHeight + "px";
    });

    document.addEventListener("mouseup", function() {
        if (isResizing) {
            isResizing = false;
            chatbotContainer.classList.remove("resizing");
        }
    });

    // Introduce the chatbot when the page loads
    function sendWelcomeMessage() {
        const welcomeMessage = "Hello! I'm Duy's portfolio assistant with **live access** to his GitHub, project data, and more.\n\nTry asking:\n- \"Show me Duy's GitHub activity\"\n- \"What projects use PyTorch?\"\n- \"Is Duy available for internships?\"\n\nTip: Toggle **'Show Second Brain'** to see the RAG + Function Calling architecture in action!";
        addMessage('bot', welcomeMessage);
        welcomeMessageSent = true; // Set flag to true after message is sent
    }

    // Note: Toggle functionality is now handled by clicking the header (see toggleChatbot function above)

    // ========================================
    // RAG PIPELINE TOGGLE & VISUALIZATION
    // ========================================

    // Handle pipeline toggle
    if (pipelineToggle) {
        pipelineToggle.addEventListener("change", function() {
            isPipelineMode = this.checked;
            if (isPipelineMode) {
                pipelineInline.classList.remove("hidden");
                retrievedChunksPanel.classList.remove("hidden");
                // Tool calls panel stays hidden until tools are used
                // Reset pipeline state
                resetPipelineState();
            } else {
                pipelineInline.classList.add("hidden");
                retrievedChunksPanel.classList.add("hidden");
                toolCallsPanel.classList.add("hidden");
            }
        });
    }

    // Reset pipeline state
    function resetPipelineState() {
        const steps = document.querySelectorAll('.pipeline-step-mini');
        steps.forEach(step => {
            step.classList.remove('active', 'completed', 'skipped');
        });
        pipelineTotalTime.textContent = '';
        retrievedChunksContainer.innerHTML = '<div style="color: #888; font-size: 11px; text-align: center; padding: 10px;">Ask a question to see retrieved context...</div>';
        // Reset tool calls panel
        if (toolCallsList) {
            toolCallsList.innerHTML = '<div style="color: #888; font-size: 11px; text-align: center; padding: 10px;">No tools called yet...</div>';
        }
        toolCallsPanel.classList.add("hidden");
    }

    // Call RAG Pipeline API
    async function callRagPipeline(query) {
        try {
            const response = await fetch(ragPipelineUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query, show_internals: true })
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error("RAG Pipeline error:", error);
            throw error;
        }
    }

    // Map step names to element indices
    const stepNameToIndex = {
        "Query Embedding": 0,
        "Vector Search": 1,
        "Context Assembly": 2,
        "Tools": 3,
        "LLM Generation": 4
    };

    // Animate pipeline steps (new mini format with 5 steps)
    async function animatePipelineSteps(pipelineSteps, totalDurationMs, toolsUsed) {
        const stepElements = document.querySelectorAll('.pipeline-step-mini');

        // Reset all steps
        stepElements.forEach(step => {
            step.classList.remove('active', 'completed', 'skipped');
        });

        // Animate each step based on step name
        for (let i = 0; i < pipelineSteps.length; i++) {
            const step = pipelineSteps[i];
            const stepIndex = stepNameToIndex[step.step_name];

            if (stepIndex !== undefined && stepElements[stepIndex]) {
                const stepEl = stepElements[stepIndex];

                // Check if this is the Tools step and was skipped
                if (step.step_name === "Tools" && step.data && step.data.skipped) {
                    stepEl.classList.add('skipped');
                    continue;
                }

                // Mark as active
                stepEl.classList.add('active');
                stepEl.classList.remove('completed', 'skipped');

                // Wait a bit to show the animation
                await new Promise(resolve => setTimeout(resolve, 200));

                // Mark as completed
                stepEl.classList.remove('active');
                stepEl.classList.add('completed');
            }
        }

        // Update total time
        if (pipelineTotalTime) {
            pipelineTotalTime.textContent = `${(totalDurationMs / 1000).toFixed(1)}s`;
        }
    }

    // Render tool calls in the panel
    function renderToolCalls(toolCalls) {
        if (!toolCalls || toolCalls.length === 0) {
            toolCallsPanel.classList.add("hidden");
            return;
        }

        toolCallsPanel.classList.remove("hidden");

        const toolsHtml = toolCalls.map(tool => {
            const inputStr = JSON.stringify(tool.tool_input);
            const inputPreview = inputStr.length > 50 ? inputStr.substring(0, 50) + '...' : inputStr;
            const resultKeys = Object.keys(tool.tool_result || {}).slice(0, 3).join(', ');

            return `
                <div class="tool-call-item">
                    <div class="tool-call-header">
                        <span class="tool-name">${tool.tool_name}</span>
                        <span class="tool-duration">${tool.duration_ms.toFixed(0)}ms</span>
                    </div>
                    <div class="tool-input">${inputPreview}</div>
                    <div class="tool-result-preview">Result: ${resultKeys || 'data returned'}</div>
                </div>
            `;
        }).join('');

        toolCallsList.innerHTML = toolsHtml;

        // Start collapsed by default - user can click to expand
        toolCallsPanel.classList.add("collapsed");
    }

    // Render retrieved chunks (compact format)
    function renderRetrievedChunks(chunks) {
        if (!chunks || chunks.length === 0) {
            retrievedChunksContainer.innerHTML = '<div style="color: #888; font-size: 11px; text-align: center; padding: 10px;">No relevant context found</div>';
            return;
        }

        const chunksHtml = chunks.slice(0, 2).map(chunk => {
            const scorePercent = (chunk.similarity_score * 100).toFixed(0);
            const content = chunk.content.substring(0, 100) + (chunk.content.length > 100 ? '...' : '');
            const tags = chunk.tags.slice(0, 3).map(tag => `<span class="chunk-tag">${tag}</span>`).join('');

            return `
                <div class="chunk-item">
                    <div class="chunk-score">
                        <div class="score-bar">
                            <div class="score-fill" style="width: ${scorePercent}%"></div>
                        </div>
                        <span class="score-value">${scorePercent}%</span>
                    </div>
                    <div class="chunk-content">${content}</div>
                    <div class="chunk-tags">${tags}</div>
                </div>
            `;
        }).join('');

        retrievedChunksContainer.innerHTML = chunksHtml;

        // Start collapsed by default - user can click to expand
        retrievedChunksPanel.classList.add("collapsed");
    }

    // Helper function to display user message with proper styling
    function displayUserMessage(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'user-message';
        const formattedMessage = message.replace(/\n/g, '<br>');
        messageDiv.innerHTML = `<span class="message-label">You</span><p>${formattedMessage}</p>`;
        chatOutput.appendChild(messageDiv);
        chatOutput.scrollTop = chatOutput.scrollHeight;
    }

    // Handle RAG pipeline mode message sending
    async function handleRagPipelineMessage(userMessage) {
        // Display user message
        displayUserMessage(userMessage);
        userInput.value = "";
        userInput.style.height = "auto";

        // Show pipeline is processing
        if (isPipelineMode) {
            resetPipelineState();
            // Mark first step as active
            const firstStep = document.querySelector('.pipeline-step-mini[data-step="0"]');
            if (firstStep) firstStep.classList.add('active');
        }

        showTypingIndicator();

        try {
            // Call Enhanced RAG Pipeline API with function calling
            const ragResponse = await callRagPipeline(userMessage);

            // Animate pipeline steps (including Tools step)
            if (isPipelineMode) {
                await animatePipelineSteps(ragResponse.pipeline_steps, ragResponse.total_duration_ms, ragResponse.tools_used);
                renderRetrievedChunks(ragResponse.retrieved_chunks);

                // Render tool calls if any were made
                if (ragResponse.tool_calls && ragResponse.tool_calls.length > 0) {
                    renderToolCalls(ragResponse.tool_calls);
                }
            }

            removeTypingIndicator();

            // Check if authentication is required
            const answerText = ragResponse.answer;
            if (answerText.includes('[AUTH_REQUIRED]')) {
                // Remove the tag from display and show password input
                const cleanAnswer = answerText.replace('[AUTH_REQUIRED]', '').trim();
                const botMessage = formatBotMessage(cleanAnswer);
                await streamBotMessage(botMessage);
                showPasswordInput();
            } else {
                // Display the answer normally
                const botMessage = formatBotMessage(answerText);
                await streamBotMessage(botMessage);
            }

        } catch (error) {
            removeTypingIndicator();
            console.error('RAG Pipeline error:', error);

            // Fallback to regular chat API
            const fallbackMessage = formatBotMessage(
                "The Second Brain backend is starting up. This demo showcases:\n\n" +
                "- **RAG Architecture**: Vector search + LLM generation\n" +
                "- **Function Calling**: 12 live tools for GitHub stats, skills matching, and more\n" +
                "- **Real-time Pipeline**: Watch the AI reasoning step-by-step\n\n" +
                "Trying the standard chatbot instead..."
            );
            await streamBotMessage(fallbackMessage);

            // Fall back to regular API
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: userMessage }),
                });
                const data = await response.json();
                const regularBotMessage = formatBotMessage(data.response);
                await streamBotMessage(regularBotMessage);
            } catch (fallbackError) {
                console.error('Fallback error:', fallbackError);
                const errorDiv = document.createElement('div');
                errorDiv.className = 'bot-message';
                errorDiv.innerHTML = '<span class="message-label">Assistant</span><p>Sorry, something went wrong. Please try again later.</p>';
                chatOutput.appendChild(errorDiv);
            }
        }
    }

    // Show resize hint function
    function showResizeHint() {
        const resizeHint = document.getElementById("resize-hint");
        if (resizeHint) {
            resizeHint.classList.add("show");
            // Remove the class after animation completes
            setTimeout(function() {
                resizeHint.classList.remove("show");
            }, 4000);
        }
    }

    // Show header hint function
    function showHeaderHint() {
        const headerHint = document.getElementById("header-hint");
        if (headerHint) {
            headerHint.classList.add("show");
            // Remove the class after animation completes
            setTimeout(function() {
                headerHint.classList.remove("show");
            }, 4000);
        }
    }

    // ========================================
    // ADMIN AUTHENTICATION UI
    // ========================================

    let isPasswordMode = false;

    // Show password input field for admin authentication
    function showPasswordInput() {
        if (isPasswordMode) return; // Already showing
        isPasswordMode = true;

        const inputArea = document.getElementById('chatbot-input');

        // Create password input container
        const passwordContainer = document.createElement('div');
        passwordContainer.id = 'password-input-container';
        passwordContainer.className = 'password-input-container';
        passwordContainer.innerHTML = `
            <div class="password-prompt">
                <span class="password-icon">🔐</span>
                <span class="password-label">Admin Authentication</span>
            </div>
            <div class="password-input-row">
                <input type="password" id="admin-password-input" placeholder="Enter admin password..." autocomplete="off">
                <button id="password-submit-btn" title="Submit">✓</button>
                <button id="password-cancel-btn" title="Cancel">✕</button>
            </div>
        `;

        // Insert before the regular input area
        inputArea.parentNode.insertBefore(passwordContainer, inputArea);

        // Hide regular input area
        inputArea.style.display = 'none';

        // Get new elements
        const passwordInput = document.getElementById('admin-password-input');
        const submitBtn = document.getElementById('password-submit-btn');
        const cancelBtn = document.getElementById('password-cancel-btn');

        // Focus on password input
        passwordInput.focus();

        // Submit password handler
        function submitPassword() {
            const password = passwordInput.value.trim();
            if (password) {
                // Remove password UI
                hidePasswordInput();
                // Send with ADMIN_AUTH: prefix so backend knows it's a password
                handleRagPipelineMessage('ADMIN_AUTH: ' + password);
            }
        }

        // Cancel handler
        function cancelPassword() {
            hidePasswordInput();
            // Inform user
            const cancelMsg = formatBotMessage("Authentication cancelled. Feel free to ask about other aspects of Duy's portfolio!");
            streamBotMessage(cancelMsg);
        }

        // Event listeners
        submitBtn.addEventListener('click', submitPassword);
        cancelBtn.addEventListener('click', cancelPassword);

        // Enter to submit, Escape to cancel
        passwordInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitPassword();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelPassword();
            }
        });
    }

    // Hide password input and restore normal input
    function hidePasswordInput() {
        isPasswordMode = false;

        const passwordContainer = document.getElementById('password-input-container');
        if (passwordContainer) {
            passwordContainer.remove();
        }

        const inputArea = document.getElementById('chatbot-input');
        inputArea.style.display = 'flex';

        // Focus back on regular input
        userInput.focus();
    }

    // Function to show typing indicator
    function showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.id = 'typing-indicator';
        typingDiv.className = 'bot-message';
        typingDiv.innerHTML = '<span class="message-label">Assistant</span><span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>';
        chatOutput.appendChild(typingDiv);
        chatOutput.scrollTop = chatOutput.scrollHeight;
    }

    // Function to remove typing indicator
    function removeTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    // Function to stream bot message word by word
    function streamBotMessage(formattedText) {
        return new Promise((resolve) => {
            // Create the message container
            const messageDiv = document.createElement('div');
            messageDiv.className = 'bot-message';
            messageDiv.innerHTML = '<span class="message-label">Assistant</span><div class="streaming-content"></div>';
            chatOutput.appendChild(messageDiv);

            const contentSpan = messageDiv.querySelector('.streaming-content');

            // Split the formatted HTML into chunks while preserving tags
            const parts = [];
            const regex = /(<[^>]+>|[^<]+)/g;
            let match;

            while ((match = regex.exec(formattedText)) !== null) {
                const part = match[0];
                if (part.startsWith('<')) {
                    // It's an HTML tag, add it as a whole
                    parts.push(part);
                } else {
                    // It's text, split into words
                    const words = part.split(/(\s+)/);
                    parts.push(...words);
                }
            }

            let currentIndex = 0;
            const delay = 30; // Milliseconds between words (adjust for speed)

            function displayNextPart() {
                if (currentIndex < parts.length) {
                    contentSpan.innerHTML += parts[currentIndex];
                    currentIndex++;
                    chatOutput.scrollTop = chatOutput.scrollHeight;
                    setTimeout(displayNextPart, delay);
                } else {
                    resolve();
                }
            }

            displayNextPart();
        });
    }

    // Note: Send message functionality is now handled by handleSendWithImage() at the end of this file
    // This supports both text messages and image classification

    // Allow sending message with Enter key (Shift+Enter for new line)
    userInput.addEventListener("keydown", function (e) {
        // Check if Enter key is pressed
        if (e.key === "Enter" || e.keyCode === 13) {
            // Check if Shift key is held down
            if (e.shiftKey === true) {
                // Shift+Enter: Allow new line, don't send message
                // Let the default behavior happen (insert newline)
                return true;
            } else {
                // Just Enter: Send message, don't create new line
                e.preventDefault();
                e.stopPropagation();

                const message = userInput.value.trim();
                if (message || pendingImage) {
                    handleSendWithImage();
                }
                return false;
            }
        }
    });

    // Auto-resize textarea as user types
    userInput.addEventListener("input", function() {
        this.style.height = "auto";
        this.style.height = Math.min(this.scrollHeight, 100) + "px";
    });
    
    // Add a message to the chat output
    function addMessage(sender, text) {
        if (sender === 'bot') {
            // Format and stream bot messages
            const formattedMessage = formatBotMessage(text);
            streamBotMessage(formattedMessage);
        } else {
            // User message with proper styling
            displayUserMessage(text);
        }
    }

    // Function to convert markdown-style links to clickable HTML links
    function convertMarkdownLinks(text) {
        const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s]+)\)/g;
        return text.replace(markdownLinkPattern, '<a href="$2" target="_blank">$1</a>');
    }

    // Function to format bot message with proper line breaks and structure
    function formatBotMessage(text) {
        // First convert markdown links
        let formatted = convertMarkdownLinks(text);

        // Convert **bold** to <strong>
        formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // Convert markdown headings (## Heading) to <h2>
        formatted = formatted.replace(/^## (.+)$/gm, '<h2>$1</h2>');

        // Convert markdown subheadings (### Heading) to <h3>
        formatted = formatted.replace(/^### (.+)$/gm, '<h3>$1</h3>');

        // Convert markdown bullets to styled bullets BEFORE newline conversion
        // This works with streaming since we're not using <ul><li> tags
        formatted = formatted.replace(/^- (.+)$/gm, '• $1');

        // Convert double newlines to paragraph breaks
        formatted = formatted.replace(/\n\n/g, '</p><p>');

        // Convert single newlines to <br>
        formatted = formatted.replace(/\n/g, '<br>');

        // Wrap in paragraph tags
        formatted = '<p>' + formatted + '</p>';

        // Clean up empty paragraphs
        formatted = formatted.replace(/<p><\/p>/g, '');
        formatted = formatted.replace(/<p><br>/g, '<p>');
        formatted = formatted.replace(/<br><\/p>/g, '</p>');

        return formatted;
    }

    // ========================================
    // IMAGE CLASSIFICATION FEATURE (Phase 1)
    // ========================================

    // Handle image upload button click
    if (imageUploadBtn && imageUploadInput) {
        imageUploadBtn.addEventListener("click", function() {
            imageUploadInput.click();
        });

        // Handle image selection
        imageUploadInput.addEventListener("change", function(e) {
            const file = e.target.files[0];
            if (file && file.type.startsWith('image/')) {
                pendingImage = file;
                showImagePreview(file);
                // Update placeholder to indicate image is ready
                userInput.placeholder = "Image ready! Ask 'What type of waste is this?' or send any question...";
            }
        });
    }

    // Show image preview in chat
    function showImagePreview(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const previewDiv = document.createElement('div');
            previewDiv.className = 'image-preview-container';
            previewDiv.innerHTML = `
                <div class="image-preview">
                    <img src="${e.target.result}" alt="Uploaded image">
                    <button class="remove-image-btn" title="Remove image">✕</button>
                </div>
                <p class="image-preview-text">Image ready for classification</p>
            `;

            // Add remove functionality
            const removeBtn = previewDiv.querySelector('.remove-image-btn');
            removeBtn.addEventListener('click', function() {
                pendingImage = null;
                previewDiv.remove();
                userInput.placeholder = "Ask a question...";
                imageUploadInput.value = ''; // Reset file input
            });

            // Insert preview before the input area
            const inputArea = document.getElementById('chatbot-input');
            inputArea.parentNode.insertBefore(previewDiv, inputArea);
        };
        reader.readAsDataURL(file);
    }

    // Call backend proxy for garbage classification (bypasses CORS)
    async function classifyImage(imageFile) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async function(e) {
                const base64Data = e.target.result;
                console.log("Sending image to backend proxy...");

                try {
                    const response = await fetch(classifyImageUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ image: base64Data })
                    });

                    console.log("Backend response status:", response.status);

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || `API error: ${response.status}`);
                    }

                    const result = await response.json();
                    console.log("Classification result:", result);
                    resolve(result);
                } catch (error) {
                    console.error("Classification error:", error);
                    reject(error);
                }
            };
            reader.onerror = function(error) {
                console.error("FileReader error:", error);
                reject(error);
            };
            reader.readAsDataURL(imageFile);
        });
    }

    // Format ML results as JSON context for AI
    function formatMLResultsForAI(apiResponse) {
        try {
            console.log("Raw API Response:", JSON.stringify(apiResponse)); // Debug log

            // Handle different response structures from Gradio
            let predictions = null;

            // Structure 1: { data: [{ label: confidence }] } - object format
            // Structure 2: { data: [[[ [label, confidence], ... ]]] } - nested array from Label component
            // Structure 3: { data: [{label: string, confidences: {}}] } - Label component format
            // Structure 4: Direct data array without wrapper

            const data = apiResponse.data || apiResponse;
            console.log("Data extracted:", JSON.stringify(data));

            if (Array.isArray(data) && data.length > 0) {
                const firstItem = data[0];
                console.log("First item type:", typeof firstItem, firstItem);

                // Check for Gradio Label component format: {label: "class", confidences: [...]}
                if (firstItem && typeof firstItem === 'object' && 'label' in firstItem && 'confidences' in firstItem) {
                    console.log("Detected Label component format");
                    // confidences is an array of {label, confidence} objects
                    if (Array.isArray(firstItem.confidences)) {
                        predictions = {};
                        firstItem.confidences.forEach(item => {
                            predictions[item.label] = item.confidence;
                        });
                    } else {
                        predictions = firstItem.confidences;
                    }
                }
                // Check for object with class keys: {Cardboard: 0.95, Glass: 0.02, ...}
                else if (firstItem && typeof firstItem === 'object' && !Array.isArray(firstItem)) {
                    console.log("Detected object format");
                    predictions = firstItem;
                }
                // Check for array of [label, confidence] pairs: [[["Cardboard", 0.95], ...]]
                else if (Array.isArray(firstItem)) {
                    console.log("Detected array format");
                    // Could be nested one more level
                    const innerArray = Array.isArray(firstItem[0]) && Array.isArray(firstItem[0][0])
                        ? firstItem[0]
                        : firstItem;
                    predictions = {};
                    innerArray.forEach(item => {
                        if (Array.isArray(item) && item.length >= 2) {
                            predictions[item[0]] = item[1];
                        }
                    });
                }
            }

            if (!predictions || typeof predictions !== 'object' || Object.keys(predictions).length === 0) {
                console.error("Could not parse predictions from response:", apiResponse);
                return null;
            }

            console.log("Parsed predictions:", predictions);

            // Filter out any NaN or invalid values and sort by confidence
            const validPredictions = Object.entries(predictions)
                .filter(([label, confidence]) => {
                    const conf = parseFloat(confidence);
                    const isValid = !isNaN(conf) && isFinite(conf);
                    if (!isValid) console.log(`Filtering out invalid: ${label} = ${confidence}`);
                    return isValid;
                })
                .map(([label, confidence]) => [label, parseFloat(confidence)])
                .sort((a, b) => b[1] - a[1]);

            console.log("Valid predictions:", validPredictions);

            if (validPredictions.length === 0) {
                console.error("No valid predictions found after filtering");
                return null;
            }

            const topPrediction = validPredictions[0];
            const topConfidence = topPrediction[1];

            // Handle both 0-1 range and 0-100 range
            const isPercentage = topConfidence > 1;
            const confidenceMultiplier = isPercentage ? 1 : 100;

            const mlContext = {
                task: "garbage_classification",
                model: "ResNet34 Transfer Learning (94% accuracy, 100% minority class recall)",
                project: "Seattle University DATA 5100 Deep Learning Project",
                results: {
                    top_prediction: topPrediction[0],
                    confidence: (topPrediction[1] * confidenceMultiplier).toFixed(1) + "%",
                    all_predictions: {}
                },
                categories: {
                    cardboard: "Recyclable - flatten boxes before recycling",
                    glass: "Recyclable - rinse containers, remove lids",
                    metal: "Recyclable - aluminum cans, tin cans",
                    paper: "Recyclable - newspapers, magazines, office paper",
                    plastic: "Recyclable - check recycling number (1-7)",
                    trash: "Non-recyclable - general waste bin",
                    Cardboard: "Recyclable - flatten boxes before recycling",
                    Glass: "Recyclable - rinse containers, remove lids",
                    Metal: "Recyclable - aluminum cans, tin cans",
                    Paper: "Recyclable - newspapers, magazines, office paper",
                    Plastic: "Recyclable - check recycling number (1-7)",
                    Trash: "Non-recyclable - general waste bin"
                }
            };

            // Add all predictions with percentages
            validPredictions.forEach(([label, confidence]) => {
                mlContext.results.all_predictions[label] = (confidence * confidenceMultiplier).toFixed(1) + "%";
            });

            console.log("ML Context:", mlContext); // Debug log
            return mlContext;
        } catch (error) {
            console.error("Error formatting ML results:", error);
            return null;
        }
    }

    // Create augmented prompt with ML context
    function createAugmentedPrompt(userMessage, mlContext) {
        return `[IMAGE CLASSIFICATION CONTEXT]
The user uploaded an image for garbage/waste classification. Here are the ML model results:

Model: ${mlContext.model}
Project: ${mlContext.project}

Classification Results:
- Top Prediction: ${mlContext.results.top_prediction} (${mlContext.results.confidence} confidence)
- All Predictions: ${JSON.stringify(mlContext.results.all_predictions)}

Disposal Information for ${mlContext.results.top_prediction}: ${mlContext.categories[mlContext.results.top_prediction.toLowerCase()] || "Check local guidelines"}

[USER MESSAGE]
${userMessage || "What type of waste is this?"}

[INSTRUCTIONS]
Please interpret these ML classification results in a friendly, conversational way. Include:
1. The classification result with confidence level
2. Brief disposal/recycling guidance
3. Mention this demonstrates Duy's Deep Learning project using ResNet34 transfer learning
Keep the response concise but informative.`;
    }

    // Display uploaded image in chat as user message (combined with text)
    function displayImageInChat(imageDataUrl, userMessage) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'user-message with-image';

        let messageHTML = `<span class="message-label">You</span>
            <div class="chat-image-container">
                <img src="${imageDataUrl}" alt="Uploaded for classification" class="chat-uploaded-image">
            </div>`;

        // Add text message if provided
        if (userMessage && userMessage.trim()) {
            const formattedMessage = userMessage.replace(/\n/g, '<br>');
            messageHTML += `<p class="image-message-text">${formattedMessage}</p>`;
        }

        messageDiv.innerHTML = messageHTML;
        chatOutput.appendChild(messageDiv);
        chatOutput.scrollTop = chatOutput.scrollHeight;
    }

    // Modified send message handler to support image classification
    async function handleSendWithImage() {
        const userMessage = userInput.value.trim();

        if (!pendingImage && !userMessage) return;

        // If there's a pending image, process it
        if (pendingImage) {
            // Read image for display
            const reader = new FileReader();
            reader.onload = async function(e) {
                const imageDataUrl = e.target.result;

                // Display user's image and message together (single "You:" output)
                displayImageInChat(imageDataUrl, userMessage);

                userInput.value = "";
                userInput.style.height = "auto";
                userInput.placeholder = "Ask a question...";

                // Remove image preview
                const previewContainer = document.querySelector('.image-preview-container');
                if (previewContainer) previewContainer.remove();

                // Show typing indicator
                showTypingIndicator();

                try {
                    // Step 1: Call HuggingFace API for classification
                    const apiResponse = await classifyImage(pendingImage);

                    // Step 2: Format results as JSON context
                    const mlContext = formatMLResultsForAI(apiResponse);

                    if (!mlContext) {
                        throw new Error("Failed to format ML results");
                    }

                    // Step 3: Create augmented prompt
                    const augmentedPrompt = createAugmentedPrompt(userMessage, mlContext);

                    // Step 4: Send to AI chatbot backend
                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ message: augmentedPrompt }),
                    });

                    const data = await response.json();

                    // Remove typing indicator
                    removeTypingIndicator();

                    // Format and stream bot's response
                    const botMessage = formatBotMessage(data.response);
                    await streamBotMessage(botMessage);

                } catch (error) {
                    removeTypingIndicator();
                    console.error('Classification error:', error);

                    // Fallback error message
                    const errorMessage = formatBotMessage(
                        "I encountered an issue classifying your image. This could be due to:\n" +
                        "- The image format not being supported\n" +
                        "- The HuggingFace Spaces API being temporarily unavailable\n\n" +
                        "You can try the live demo directly at: [Garbage Classification Demo](https://huggingface.co/spaces/dnguyen44/garbage-classification)\n\n" +
                        "Or ask me anything else about Duy's projects and experience!"
                    );
                    await streamBotMessage(errorMessage);
                }

                // Clear pending image
                pendingImage = null;
                imageUploadInput.value = '';
            };
            reader.readAsDataURL(pendingImage);
        } else {
            // No image, just send text message
            // Check if pipeline mode is enabled
            if (isPipelineMode) {
                // Use RAG Pipeline API
                handleRagPipelineMessage(userMessage);
            } else {
                // Original behavior - regular chatbot API
                displayUserMessage(userMessage);
                userInput.value = "";
                userInput.style.height = "auto";

                showTypingIndicator();

                fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ message: userMessage }),
                })
                .then(response => response.json())
                .then(data => {
                    removeTypingIndicator();
                    const botMessage = formatBotMessage(data.response);
                    streamBotMessage(botMessage);
                })
                .catch(error => {
                    removeTypingIndicator();
                    console.error('Error:', error);
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'bot-message';
                    errorDiv.innerHTML = '<span class="message-label">Assistant</span><p>Sorry, something went wrong. Please try again later.</p>';
                    chatOutput.appendChild(errorDiv);
                });
            }
        }
    }

    // Override send button to use new handler
    sendButton.removeEventListener("click", sendButton.onclick);
    sendButton.addEventListener("click", handleSendWithImage);
});
