/**
 * MCP Demo - UI Handler
 * Handles the MCP Tools Demo section and chatbot quick actions
 */

document.addEventListener("DOMContentLoaded", function() {
    // === MCP TOOLS DEMO SECTION ===

    const toolsContainer = document.getElementById("mcp-tools-container");
    const outputContainer = document.getElementById("mcp-output-container");
    const outputTitle = document.getElementById("mcp-output-title");
    const outputCode = document.querySelector("#mcp-output code");

    if (toolsContainer && window.MCPTools) {
        // Populate tools grid
        const tools = MCPTools.getToolList();

        tools.forEach(tool => {
            const toolCard = document.createElement("div");
            toolCard.className = "mcp-tool-card";
            toolCard.dataset.tool = tool.name;

            let inputHtml = "";
            if (tool.requiresInput) {
                inputHtml = `
                    <input type="text"
                           class="mcp-tool-input"
                           placeholder="${tool.inputPlaceholder}"
                           data-tool="${tool.name}">
                `;
            }

            toolCard.innerHTML = `
                <span class="mcp-tool-icon">${tool.icon}</span>
                <div class="mcp-tool-info">
                    <span class="mcp-tool-name">${tool.name}</span>
                    <span class="mcp-tool-desc">${tool.description}</span>
                </div>
                ${inputHtml}
                <button class="mcp-tool-run" data-tool="${tool.name}">Run</button>
            `;

            toolsContainer.appendChild(toolCard);
        });

        // Handle tool execution
        toolsContainer.addEventListener("click", function(e) {
            if (e.target.classList.contains("mcp-tool-run")) {
                const toolName = e.target.dataset.tool;
                const card = e.target.closest(".mcp-tool-card");
                const input = card.querySelector(".mcp-tool-input");
                const inputValue = input ? input.value : null;

                // Execute tool
                const result = MCPTools.executeTool(toolName, inputValue);

                // Show output
                outputTitle.textContent = `${toolName} Output`;
                outputCode.textContent = JSON.stringify(result, null, 2);
                outputContainer.style.display = "block";

                // Scroll to output
                outputContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        });

        // Handle enter key in inputs
        toolsContainer.addEventListener("keydown", function(e) {
            if (e.key === "Enter" && e.target.classList.contains("mcp-tool-input")) {
                const runBtn = e.target.closest(".mcp-tool-card").querySelector(".mcp-tool-run");
                runBtn.click();
            }
        });
    }

    // === CHATBOT QUICK ACTIONS ===

    const quickActionsContainer = document.getElementById("chatbot-quick-actions");
    const chatOutput = document.getElementById("chatbot-messages");

    if (quickActionsContainer && window.MCPTools) {
        quickActionsContainer.addEventListener("click", function(e) {
            const btn = e.target.closest(".quick-action-btn");
            if (!btn) return;

            const toolName = btn.dataset.tool;
            const result = MCPTools.executeTool(toolName);

            // Format result as a nice message
            let formattedMessage = formatToolResultForChat(toolName, result);

            // Display as bot message
            displayBotMessage(formattedMessage);
        });
    }

    // Format tool result for chat display
    function formatToolResultForChat(toolName, result) {
        let html = "";

        switch(toolName) {
            case "get_portfolio_overview":
                html = `<strong>Portfolio Overview</strong><br><br>`;
                html += `${result.summary}<br><br>`;
                html += `<strong>Seeking:</strong> ${result.seeking}<br><br>`;
                html += `<strong>Key Metrics:</strong><br>`;
                result.key_metrics.forEach(m => {
                    html += `• ${m.value} - ${m.label}<br>`;
                });
                html += `<br><strong>Top Skills:</strong> `;
                html += result.top_skills.map(s => s.name).join(", ");
                break;

            case "get_skills":
                html = `<strong>Technical Skills</strong><br><br>`;
                Object.entries(result.by_category).forEach(([cat, skills]) => {
                    const catName = cat.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
                    html += `<strong>${catName}:</strong><br>`;
                    skills.forEach(s => {
                        html += `• ${s.name} (${s.proficiency}%)<br>`;
                    });
                    html += `<br>`;
                });
                break;

            case "get_impact_metrics":
                html = `<strong>Project Impact Metrics</strong><br><br>`;
                result.metrics.forEach(m => {
                    html += `<strong>${m.metric}</strong> - ${m.label}<br>`;
                    html += `<em>${m.project}</em><br><br>`;
                });
                break;

            case "get_contact_info":
                html = `<strong>Contact Information</strong><br><br>`;
                html += `📧 Email: <a href="mailto:${result.email}">${result.email}</a><br>`;
                html += `💼 LinkedIn: <a href="${result.linkedin}" target="_blank">linkedin.com/in/duwe-ng</a><br>`;
                html += `🐙 GitHub: <a href="${result.github}" target="_blank">github.com/dcnguyen060899</a><br>`;
                html += `🌐 Portfolio: <a href="${result.portfolio}" target="_blank">duyng-portfolio.com</a><br>`;
                html += `📍 Location: ${result.location}`;
                break;

            case "get_availability":
                html = `<strong>Availability</strong><br><br>`;
                html += `${result.summary}<br><br>`;
                html += `<strong>Open to:</strong> ${result.openTo.join(", ")}<br>`;
                html += `<strong>Preferred locations:</strong> ${result.preferredLocations.join(", ")}`;
                break;

            case "get_experience":
                html = `<strong>Experience</strong><br><br>`;
                result.experience.forEach(exp => {
                    html += `<strong>${exp.role}</strong> @ ${exp.organization}<br>`;
                    html += `<em>${exp.dates} | ${exp.location}</em><br>`;
                    exp.highlights.forEach(h => {
                        html += `• ${h}<br>`;
                    });
                    html += `<br>`;
                });
                break;

            default:
                html = `<pre>${JSON.stringify(result, null, 2)}</pre>`;
        }

        return html;
    }

    // Display a bot message in the chatbot
    function displayBotMessage(htmlContent) {
        const messageDiv = document.createElement("div");
        messageDiv.className = "bot-message";
        messageDiv.innerHTML = `<span class="message-label">Assistant</span><div class="streaming-content">${htmlContent}</div>`;
        chatOutput.appendChild(messageDiv);
        chatOutput.scrollTop = chatOutput.scrollHeight;
    }
});
