document.addEventListener("DOMContentLoaded", function () {
    const apiUrl = 'https://uc-berkeley-ml-ai-capstone-work-sample.onrender.com/chat'; // Replace with your actual backend API URL
    const chatbotToggle = document.getElementById("chatbot-toggle");
    const chatbotContainer = document.getElementById("chatbot-container");
    const chatbotHeader = document.getElementById("chatbot-header");
    const chatOutput = document.getElementById("chatbot-messages");
    const userInput = document.getElementById("user-input");
    const sendButton = document.getElementById("send-button");
    const resizeHandle = document.getElementById("chatbot-resize-handle");
    let welcomeMessageSent = false; // Flag to track if welcome message is sent

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
        const welcomeMessage = "Hello! I'm here to help you understand how Duy Nguyen's skills and experience align with your hiring needs. Ask me about his technical expertise, project experience, or potential contributions to your team.";
        addMessage('bot', welcomeMessage);
        welcomeMessageSent = true; // Set flag to true after message is sent
    }
    
    // Note: Toggle functionality is now handled by clicking the header (see toggleChatbot function above)

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

    // Function to show typing indicator
    function showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.id = 'typing-indicator';
        typingDiv.className = 'bot-message';
        typingDiv.innerHTML = '<strong>Bot:</strong> <span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>';
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

    // Send message to the chatbot
    sendButton.addEventListener("click", function () {
        const userMessage = userInput.value.trim();

        if (userMessage) {
            // Display user's message
            chatOutput.innerHTML += `<p><strong>You:</strong> ${userMessage}</p>`;
            userInput.value = ""; // Clear input field

            // Reset textarea height
            userInput.style.height = "auto";

            // Show typing indicator
            showTypingIndicator();

            // Send message to the backend
            fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: userMessage }),
            })
            .then(response => response.json())
            .then(data => {
                // Remove typing indicator
                removeTypingIndicator();

                // Format bot message with proper line breaks and structure
                const botMessage = formatBotMessage(data.response);
                // Display bot's response
                chatOutput.innerHTML += `<div class="bot-message"><strong>Bot:</strong> ${botMessage}</div>`;
                chatOutput.scrollTop = chatOutput.scrollHeight; // Auto-scroll to the bottom
            })
            .catch(error => {
                // Remove typing indicator
                removeTypingIndicator();

                console.error('Error:', error);
                chatOutput.innerHTML += `<p><strong>Bot:</strong> Sorry, something went wrong. Please try again later.</p>`;
            });
        }
    });

    // Allow sending message with Enter key (Shift+Enter for new line)
    userInput.addEventListener("keydown", function (e) {
        // Check if Enter key is pressed
        if (e.key === "Enter" || e.keyCode === 13) {
            // Check if Shift key is held down
            if (e.shiftKey === true) {
                // Shift+Enter: Allow new line, don't send message
                // Let the default behavior happen (insert newline)
                console.log("Shift+Enter detected - creating new line");
                return true;
            } else {
                // Just Enter: Send message, don't create new line
                console.log("Enter detected - sending message");
                e.preventDefault();
                e.stopPropagation();

                const message = userInput.value.trim();
                if (message) {
                    sendButton.click();
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
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', sender);

        if (sender === 'bot') {
            // Format bot messages properly
            messageElement.innerHTML = `<strong>Bot:</strong> ${formatBotMessage(text)}`;
        } else {
            messageElement.innerHTML = text;
        }

        chatOutput.appendChild(messageElement);
        chatOutput.scrollTop = chatOutput.scrollHeight;
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

        // Convert double newlines to paragraph breaks
        formatted = formatted.replace(/\n\n/g, '</p><p>');

        // Convert single newlines to <br>
        formatted = formatted.replace(/\n/g, '<br>');

        // Wrap in paragraph tags
        formatted = '<p>' + formatted + '</p>';

        // Handle bullet points (- at start of line)
        formatted = formatted.replace(/<br>-\s/g, '<br>• ');

        // Handle bullet points (• at start of line)
        formatted = formatted.replace(/<br>•\s/g, '<br>• ');

        return formatted;
    }
});
