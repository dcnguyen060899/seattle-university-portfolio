document.addEventListener("DOMContentLoaded", function () {
    const apiUrl = 'https://uc-berkeley-ml-ai-capstone-work-sample.onrender.com/chat'; // Replace with your actual backend API URL
    const chatbotToggle = document.getElementById("chatbot-toggle");
    const chatbotContainer = document.getElementById("chatbot-container");
    const chatOutput = document.getElementById("chatbot-messages");
    const userInput = document.getElementById("user-input");
    const sendButton = document.getElementById("send-button");
    const resizeHandle = document.getElementById("chatbot-resize-handle");
    let welcomeMessageSent = false; // Flag to track if welcome message is sent

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
        startRight = window.innerWidth - rect.right;
        startBottom = window.innerHeight - rect.bottom;

        e.preventDefault();
    });

    document.addEventListener("mousemove", function(e) {
        if (!isResizing) return;

        const deltaX = startX - e.clientX; // Reversed for left-side resize
        const deltaY = startY - e.clientY; // Reversed for top-side resize

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
    
    // Toggle chatbot visibility
    chatbotToggle.addEventListener("click", function () {
        chatbotContainer.classList.toggle("closed");
        chatbotToggle.innerHTML = chatbotContainer.classList.contains('closed') ? '&#9650;' : '&#9660;';
        if (!chatbotContainer.classList.contains("closed") && !welcomeMessageSent) {
            sendWelcomeMessage();
        }
    });

    // Send message to the chatbot
    sendButton.addEventListener("click", function () {
        const userMessage = userInput.value.trim();

        if (userMessage) {
            // Display user's message
            chatOutput.innerHTML += `<p><strong>You:</strong> ${userMessage}</p>`;
            userInput.value = ""; // Clear input field

            // Reset textarea height
            userInput.style.height = "auto";

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
                // Format bot message with proper line breaks and structure
                const botMessage = formatBotMessage(data.response);
                // Display bot's response
                chatOutput.innerHTML += `<div class="bot-message"><strong>Bot:</strong> ${botMessage}</div>`;
                chatOutput.scrollTop = chatOutput.scrollHeight; // Auto-scroll to the bottom
            })
            .catch(error => {
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

        // Convert double newlines to paragraph breaks
        formatted = formatted.replace(/\n\n/g, '</p><p>');

        // Convert single newlines to <br>
        formatted = formatted.replace(/\n/g, '<br>');

        // Wrap in paragraph tags
        formatted = '<p>' + formatted + '</p>';

        // Handle bullet points (- at start of line)
        formatted = formatted.replace(/<br>-\s/g, '<br>• ');

        return formatted;
    }
});
