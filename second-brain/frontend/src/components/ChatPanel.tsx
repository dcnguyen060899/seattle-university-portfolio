import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User, Sparkles, FileText } from 'lucide-react';
import { api } from '../api/client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ content: string; note_id: string }>;
  tools?: string[];
}

export default function ChatPanel() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await api.chat({
        message: userMessage,
        conversation_id: conversationId || undefined,
      });

      setConversationId(response.conversation_id);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: response.response,
          sources: response.sources_used,
          tools: response.tool_calls,
        },
      ]);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${error.response?.data?.detail || 'Failed to get response'}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setConversationId(null);
  };

  return (
    <div className="animate-fadeIn h-[calc(100vh-12rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chat with Your Brain</h1>
          <p className="text-gray-600 mt-1">
            Ask questions and get answers from your knowledge base
          </p>
        </div>
        {messages.length > 0 && (
          <button onClick={handleNewChat} className="btn-secondary text-sm">
            New Chat
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 card overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-violet-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900">
                Chat with your Second Brain
              </h3>
              <p className="text-gray-600 mt-2 max-w-md">
                Ask questions about your captured knowledge. The AI will search your notes
                and provide answers based on what you've learned.
              </p>
              <div className="mt-6 space-y-2">
                <p className="text-sm text-gray-500">Try asking:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    'What do I know about CORS?',
                    'How did I solve that API error?',
                    'Summarize my Python learnings',
                  ].map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(suggestion)}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700
                                rounded-full text-sm transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-3 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-violet-600" />
                    </div>
                  )}

                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-violet-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>

                    {/* Sources used */}
                    {message.sources && message.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          Sources used:
                        </p>
                        <div className="space-y-1">
                          {message.sources.slice(0, 3).map((source, i) => (
                            <p key={i} className="text-xs text-gray-600 truncate">
                              {source.content.slice(0, 100)}...
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tools called */}
                    {message.tools && message.tools.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {message.tools.map((tool, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 bg-violet-50 text-violet-600
                                     rounded text-xs font-mono"
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {message.role === 'user' && (
                    <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-gray-600" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
                    <Bot className="w-4 h-4 text-violet-600" />
                  </div>
                  <div className="bg-gray-100 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2 text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-gray-200 p-4">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="input flex-1"
              placeholder="Ask your Second Brain anything..."
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="btn-primary px-4"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
