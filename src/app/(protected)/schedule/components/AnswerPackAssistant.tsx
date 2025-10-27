/**
 * AnswerPack Assistant Component
 * 
 * Chat-style Q&A interface that uses single data fetch + LLM reasoning.
 */

"use client";

import { useState, useRef, useEffect } from "react";

interface AnswerPackAssistantProps {
  storeId: string;
  isoWeek: string;
  storeName?: string;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'error';
  content: string;
  timestamp: string;
  metadata?: {
    fetchTime: number;
    llmTime: number;
    totalTime: number;
    payloadSize: number;
    recordCounts: {
      employees: number;
      schedules: number;
      assignments: number;
      unassigned: number;
    };
    sources: string[];
    fetchedAt: string;
    language?: string;
    threadId?: string;
    disambiguation?: boolean;
  };
}

export function AnswerPackAssistant({ storeId, isoWeek, storeName }: AnswerPackAssistantProps) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [includeOtherStores, setIncludeOtherStores] = useState(false);
  const [threadId, setThreadId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!question.trim() || loading) return;
    
    const currentQuestion = question.trim();
    const userMessageId = `user-${Date.now()}`;
    
    // Add user message immediately
    const userMessage: ChatMessage = {
      id: userMessageId,
      type: 'user',
      content: currentQuestion,
      timestamp: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setQuestion("");
    setLoading(true);
    
    try {
      const res = await fetch("/api/copilot/answer-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: currentQuestion,
          context: {
            storeId,
            isoWeek,
          },
          includeOtherStores,
          threadId: threadId || undefined,
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to get answer");
      }
      
      const data = await res.json();
      
      // Update thread ID if provided
      if (data.metadata?.threadId) {
        setThreadId(data.metadata.threadId);
      }
      
      // Add assistant response
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        type: 'assistant',
        content: data.answer,
        timestamp: new Date().toISOString(),
        metadata: data.metadata,
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
    } catch (err: any) {
      console.error("Error:", err);
      
      // Add error message
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: err.message || "Something went wrong",
        timestamp: new Date().toISOString(),
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleExampleClick = (exampleQuestion: string) => {
    setQuestion(exampleQuestion);
  };

  const renderMessage = (message: ChatMessage) => {
    switch (message.type) {
      case 'user':
        return (
          <div className="flex justify-end mb-4">
            <div className="max-w-[80%] bg-blue-600 text-white rounded-lg px-4 py-2">
              <div className="text-sm">{message.content}</div>
              <div className="text-xs opacity-75 mt-1">
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        );
      
      case 'assistant':
        return (
          <div className="flex justify-start mb-4">
            <div className="max-w-[85%] bg-gray-100 rounded-lg px-4 py-3">
              <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                {message.content}
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                {message.metadata && (
                  <span>
                    {message.metadata.language?.toUpperCase()} • {message.metadata.totalTime}ms
                  </span>
                )}
              </div>
              {message.metadata && (
                <details className="mt-2 text-xs text-gray-500">
                  <summary className="cursor-pointer hover:text-gray-700">Stats</summary>
                  <div className="mt-1 space-y-1">
                    <div>Fetch: {message.metadata.fetchTime}ms, LLM: {message.metadata.llmTime}ms</div>
                    <div>Data: {(message.metadata.payloadSize / 1024).toFixed(1)}KB</div>
                    <div>Records: {message.metadata.recordCounts.employees} employees, {message.metadata.recordCounts.assignments} assignments</div>
                  </div>
                </details>
              )}
            </div>
          </div>
        );
      
      case 'error':
        return (
          <div className="flex justify-start mb-4">
            <div className="max-w-[80%] bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              <div className="text-sm text-red-800">{message.content}</div>
              <div className="text-xs text-red-600 mt-1">
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Schedule Assistant</h3>
          <p className="text-sm text-gray-500">
            {storeName || storeId} • Week {isoWeek}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
            AI
          </span>
          {threadId && (
            <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded">
              Thread: {threadId.substring(0, 8)}...
            </span>
          )}
        </div>
      </div>

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.959 8.959 0 01-4.906-1.471L3 21l2.471-5.094A8.959 8.959 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
                </svg>
              </div>
              <h4 className="text-lg font-medium text-gray-900 mb-2">Welcome to Schedule Assistant</h4>
              <p className="text-sm text-gray-500 mb-4">Ask me anything about your schedule, employees, or shifts.</p>
            </div>
            
            {/* Example Questions */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 mb-2">Try asking:</p>
              {[
                "Who can work Cashier on Friday?",
                "Show unassigned shifts this week",
                "Who is under their weekly target?",
                "Qui peut travailler vendredi?",
              ].map((example) => (
                <button
                  key={example}
                  onClick={() => handleExampleClick(example)}
                  className="block w-full px-3 py-2 text-xs bg-gray-50 hover:bg-gray-100 text-gray-700 rounded transition-colors"
                  type="button"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {messages.map((message) => renderMessage(message))}
        
        {loading && (
          <div className="flex justify-start mb-4">
            <div className="bg-gray-100 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                <span className="text-sm text-gray-600">Thinking...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 p-4">
        {/* Settings */}
        <div className="mb-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={includeOtherStores}
              onChange={(e) => setIncludeOtherStores(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Include other stores
          </label>
        </div>
        
        {/* Message Input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about schedules, employees, availability..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
