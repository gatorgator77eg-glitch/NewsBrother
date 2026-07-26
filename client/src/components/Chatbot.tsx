import { useState, useRef, useEffect } from 'react';
import { chatbotStream } from '../api';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: { name: string; args: Record<string, any> }[];
  toolResults?: { name: string; result: string }[];
  timestamp: number;
}

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-gray-900 dark:text-gray-100 mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-gray-900 dark:text-gray-100 mt-4 mb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold text-gray-900 dark:text-gray-100 mt-4 mb-1">$1</h1>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm text-gray-700 dark:text-gray-300">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm text-gray-700 dark:text-gray-300">$2</li>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs">$1</code>')
    .replace(/\n/g, '<br/>');
}

const SUGGESTIONS = [
  { label: 'Breaking News', query: 'What are the top breaking news stories right now?' },
  { label: 'Sentiment Check', query: 'What is the current sentiment toward the US economy?' },
  { label: 'Bias Comparison', query: 'How are left and right sources covering tariffs differently?' },
  { label: 'Stock Lookup', query: 'Look up AAPL and analyze its news coverage' },
  { label: 'World Overview', query: 'Give me an overview of global political sentiment' },
  { label: 'Echo Chambers', query: 'What echo chambers exist in current political coverage?' },
];

export default function Chatbot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (query?: string) => {
    const text = (query || input).trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);
    setStatus('Sending...');

    const userMsg: Message = { role: 'user', content: text, timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);

    // Build conversation history for the API
    const apiMessages = newMessages.map((m) => ({ role: m.role, content: m.content }));

    // Create a placeholder for the assistant response
    const assistantIdx = newMessages.length;
    setMessages([...newMessages, { role: 'assistant', content: '', toolCalls: [], toolResults: [], timestamp: Date.now() }]);

    try {
      await chatbotStream(apiMessages, (event, data) => {
        if (event === 'thinking') {
          setStatus(`Round ${data.round} — thinking...`);
        } else if (event === 'tool_call') {
          setStatus(`Calling ${data.name}...`);
          setMessages(prev => {
            const updated = [...prev];
            const msg = { ...updated[assistantIdx] };
            msg.toolCalls = [...(msg.toolCalls || []), { name: data.name, args: data.args || {} }];
            updated[assistantIdx] = msg;
            return updated;
          });
        } else if (event === 'tool_result') {
          setMessages(prev => {
            const updated = [...prev];
            const msg = { ...updated[assistantIdx] };
            msg.toolResults = [...(msg.toolResults || []), { name: data.name, result: data.result || '' }];
            updated[assistantIdx] = msg;
            return updated;
          });
        } else if (event === 'message') {
          setMessages(prev => {
            const updated = [...prev];
            updated[assistantIdx] = { ...updated[assistantIdx], content: data.content || '' };
            return updated;
          });
        } else if (event === 'error') {
          setMessages(prev => {
            const updated = [...prev];
            updated[assistantIdx] = {
              ...updated[assistantIdx],
              content: `Error: ${data.message || data.error || 'Unknown error'}`,
            };
            return updated;
          });
        } else if (event === 'done') {
          setStatus('');
        }
      });

      // Check if assistant message is still empty (non-streaming fallback)
      setMessages(prev => {
        const updated = [...prev];
        const msg = updated[assistantIdx];
        if (msg && !msg.content && (!msg.toolCalls || msg.toolCalls.length === 0)) {
          updated[assistantIdx] = { ...msg, content: 'Response complete. See tool calls above for data gathered.' };
        }
        return updated;
      });
    } catch (err: any) {
      setMessages(prev => {
        const updated = [...prev];
        updated[assistantIdx] = {
          role: 'assistant',
          content: `Connection error: ${err.message}. Make sure the server is running.`,
          timestamp: Date.now(),
        };
        return updated;
      });
    }

    setLoading(false);
    setStatus('');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white text-lg">
          🤖
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">MCP Chatbot</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Powered by Model Context Protocol — connects to 20+ live data tools
          </p>
        </div>
      </div>

      {/* Chat Container */}
      <div className="flex flex-col h-[60vh] bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 p-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">🤖</div>
              <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-1">
                Political Intelligence Chatbot
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
                Ask questions about news, markets, sentiment, or stocks.
                The AI will automatically use live data tools to find answers.
              </p>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => send(s.query)}
                    className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] ${m.role === 'user' ? '' : 'w-full'}`}>
                {/* Tool Calls */}
                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {m.toolCalls.map((tc, j) => (
                      <div
                        key={j}
                        className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-xs"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                        <span className="text-purple-700 dark:text-purple-300 font-mono">
                          {tc.name}
                        </span>
                        {Object.keys(tc.args).length > 0 && (
                          <span className="text-purple-500 dark:text-purple-400 truncate">
                            {Object.entries(tc.args).map(([k, v]) => `${k}=${String(v).slice(0, 30)}`).join(', ')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Tool Results (collapsed) */}
                {m.toolResults && m.toolResults.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {m.toolResults.map((tr, j) => (
                      <details key={j} className="group">
                        <summary className="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 rounded-lg text-xs cursor-pointer">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          <span className="text-green-700 dark:text-green-300 font-mono">
                            {tr.name} result
                          </span>
                          <span className="text-green-500 dark:text-green-400 ml-auto group-open:hidden">
                            click to expand
                          </span>
                        </summary>
                        <pre className="mt-1 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-xs text-gray-600 dark:text-gray-400 overflow-x-auto max-h-48 overflow-y-auto">
                          {tr.result.slice(0, 2000)}
                          {tr.result.length > 2000 && '\n... [truncated]'}
                        </pre>
                      </details>
                    ))}
                  </div>
                )}

                {/* Message Content */}
                {m.content && (
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm ${
                      m.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                    }`}
                  >
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && status && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-gray-800 rounded-2xl px-4 py-2 shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                  {status}
                </div>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-3">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Ask about news, markets, sentiment..."
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="px-5 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-40 transition-colors"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </span>
              ) : (
                'Send'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
