document.addEventListener("DOMContentLoaded", function () {
    const apiUrl = 'https://uc-berkeley-ml-ai-capstone-work-sample.onrender.com/chat'; // Replace with your actual backend API URL
    const chatbotToggle = document.getElementById("chatbot-toggle");
    const chatbotContainer = document.getElementById("chatbot-container");
    const chatOutput = document.getElementById("chatbot-messages");
    const userInput = document.getElementById("user-input");
    const sendButton = document.getElementById("send-button");
    let welcomeMessageSent = false; // Flag to track if welcome message is sent

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
        if (e.key === "Enter") {
            if (e.shiftKey) {
                // Shift+Enter: allow default behavior to create new line
                // Do nothing, let the default behavior happen
                return;
            } else {
                // Just Enter: prevent default and send message
                e.preventDefault();
                e.stopPropagation();
                sendButton.click();
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
