import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import type { ScheduleFacts } from "@/types";

import { serializeAssignments } from "../hooks/useScheduleFacts";
import type { Assignment } from "../types";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ScheduleChatAssistantProps {
  storeId?: string;
  weekId?: string | null;
  assignments?: Assignment[];
  facts?: ScheduleFacts | null;
  factsLoading?: boolean;
}

export function ScheduleChatAssistant({ storeId, weekId, assignments = [], facts, factsLoading }: ScheduleChatAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! I'm here to help with anything you need—ask about scheduling, availability, or anything else and I'll do my best to answer.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const assignmentPayload = useMemo(() => serializeAssignments(assignments), [assignments]);
  const factsReady = Boolean(facts && storeId && weekId);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setInput("");
    setSending(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: trimmed,
          storeId,
          weekId,
          assignments: assignmentPayload,
          facts,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to contact assistant');
      }
      
      const data = await response.json();
      const reply = data.reply || 'No response available';
      
      setMessages((current) => [...current, { 
        role: 'assistant', 
        content: reply,
      }]);
    } catch (error) {
      console.error('Assistant chat failed', error);
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: 'Sorry, I could not reply right now.' },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className="flex h-full flex-col rounded-lg border bg-white">
      <header className="flex-shrink-0 border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Team Chat</h2>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
          <span>Ask anything about your store or schedule.</span>
          {factsLoading ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-slate-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
              Updating facts…
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${
                factsReady ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${factsReady ? "bg-emerald-500" : "bg-slate-400"}`} />
              {factsReady ? "Snapshot ready" : "Snapshot missing"}
            </span>
          )}
        </div>
      </header>
      <div className="relative flex-1 min-h-0">
        <div 
          ref={scrollRef} 
          className="absolute inset-0 space-y-3 overflow-y-auto px-4 py-3 text-sm"
        >
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={message.role === 'user' ? 'text-right' : 'text-left'}
          >
            <div
              className={`inline-block max-w-[90%] rounded-lg px-3 py-2 text-left ${
                message.role === 'user'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-900'
              }`}
            >
              <div className="whitespace-pre-wrap">{message.content}</div>
              
            </div>
          </div>
        ))}
        
        {sending && (
          <div className="text-left">
            <div className="inline-block rounded-lg bg-slate-100 px-3 py-2 text-slate-600">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-slate-400"></div>
                <span className="text-xs">Thinking...</span>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
      <form onSubmit={handleSubmit} className="flex-shrink-0 flex gap-2 border-t px-3 py-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Type your message..."
          className="flex-1 rounded border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-0"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          Send
        </button>
      </form>
    </aside>
  );
}
