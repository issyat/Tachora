/**
 * AnswerPack Assistant
 *
 * Simplified chat interface that seeds example questions from recent history.
 */

"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";

interface AnswerPackAssistantProps {
  storeId: string;
  isoWeek: string;
  storeName?: string;
}

interface ChatMessage {
  id: string;
  type: "user" | "assistant" | "error";
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

type MessageMetadata = NonNullable<ChatMessage["metadata"]>;
type RecordCounts = MessageMetadata["recordCounts"];

const FALLBACK_LIMIT = 3;

const LOCAL_FALLBACKS = [
  "Who can cover the cash wrap on Friday evening?",
  "Which shifts are unassigned this week?",
  "Who is under their weekly target hours?",
  "Which shifts still need coverage this weekend?",
];

function formatMilliseconds(value?: number) {
  if (value === undefined || value === null) return null;
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}s`;
  }
  return `${Math.round(value)}ms`;
}

function describeRecords(counts?: RecordCounts) {
  if (!counts) return null;
  const parts: string[] = [];
  if (counts.employees) parts.push(`${counts.employees} employees`);
  if (counts.assignments) parts.push(`${counts.assignments} assignments`);
  if (counts.unassigned) parts.push(`${counts.unassigned} unassigned`);
  if (counts.schedules) parts.push(`${counts.schedules} schedules`);
  return parts.length ? parts.join(" • ") : null;
}

const SECTION_KEYS = {
  answer: ["answer", "réponse", "antwoord"],
  scope: ["scope", "portée", "bereik"],
  assumptions: ["assumptions", "hypothèses", "aannames"],
  sources: ["sources"],
} as const;

interface AssistantSections {
  answer?: string;
  scope?: string;
  assumptions?: string;
  sources?: string;
  raw: string;
}

function extractAssistantSections(content: string): AssistantSections {
  const sections: Record<string, string> = {};
  const regex = /\*\*(.*?)\*\*:\s*([\s\S]*?)(?=\n\s*\*\*|$)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const title = match[1].trim().toLowerCase();
    sections[title] = match[2].trim();
  }

  const pickSection = (keys: string[]) =>
    keys.map((key) => sections[key]).find((value) => value && value.length > 0);

  return {
    answer: pickSection(SECTION_KEYS.answer),
    scope: pickSection(SECTION_KEYS.scope),
    assumptions: pickSection(SECTION_KEYS.assumptions),
    sources: pickSection(SECTION_KEYS.sources),
    raw: content,
  };
}

function renderTextBlocks(text: string, keyPrefix: string): ReactNode[] {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block, idx) => {
    const blockKey = `${keyPrefix}-${idx}`;
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const isList = lines.length > 0 && lines.every((line) => /^[-•]/.test(line));

    if (isList) {
      const items = lines.map((line) => line.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
      return (
        <ul key={blockKey} className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          {items.map((item, itemIdx) => (
            <li key={`${blockKey}-item-${itemIdx}`}>{item}</li>
          ))}
        </ul>
      );
    }

    return (
      <p key={blockKey} className="leading-relaxed text-sm text-slate-700">
        {block.replace(/\s+/g, " ")}
      </p>
    );
  });
}

export function AnswerPackAssistant({ storeId, isoWeek, storeName }: AnswerPackAssistantProps) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [includeOtherStores, setIncludeOtherStores] = useState(false);
  const [threadId, setThreadId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>(LOCAL_FALLBACKS);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSuggestions() {
      try {
        const params = new URLSearchParams();
        if (storeId) {
          params.set("storeId", storeId);
        }
        const query = params.toString();
        const endpoint = query
          ? `/api/copilot/answer-pack/suggestions?${query}`
          : "/api/copilot/answer-pack/suggestions";

        const response = await fetch(endpoint, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Failed to load suggestions (${response.status})`);
        }
        const data = await response.json();
        if (Array.isArray(data?.suggestions) && data.suggestions.length > 0) {
          setSuggestions(data.suggestions.slice(0, FALLBACK_LIMIT));
        } else {
          setSuggestions(LOCAL_FALLBACKS.slice(0, FALLBACK_LIMIT));
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.warn("Unable to load assistant suggestions", error);
          setSuggestions(LOCAL_FALLBACKS.slice(0, FALLBACK_LIMIT));
        }
      }
    }

    loadSuggestions();
    return () => controller.abort();
  }, [storeId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!question.trim() || loading) return;

    const currentQuestion = question.trim();
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: "user",
      content: currentQuestion,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuestion("");
    setLoading(true);

    try {
      const response = await fetch("/api/copilot/answer-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: currentQuestion,
          context: { storeId, isoWeek },
          includeOtherStores,
          threadId: threadId || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get answer");
      }

      const data = await response.json();

      if (data.metadata?.threadId) {
        setThreadId(data.metadata.threadId);
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        type: "assistant",
        content: data.answer,
        timestamp: new Date().toISOString(),
        metadata: data.metadata,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("AnswerPack error", error);
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        type: "error",
        content: error.message || "Something went wrong",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleExampleClick = (exampleQuestion: string) => {
    setQuestion(exampleQuestion);
    inputRef.current?.focus();
  };

  const renderMessage = (message: ChatMessage) => {
    const timestamp = (
      <span className="text-xs text-slate-400">
        {new Date(message.timestamp).toLocaleTimeString()}
      </span>
    );

    if (message.type === "user") {
      return (
        <div key={message.id} className="flex justify-end">
          <div className="max-w-[75%] rounded-2xl bg-[#04ADBF]/15 px-4 py-3 text-sm text-[#045C66] shadow-sm">
            <p className="whitespace-pre-line leading-relaxed">{message.content}</p>
            <div className="mt-2 text-right">{timestamp}</div>
          </div>
        </div>
      );
    }

    if (message.type === "assistant") {
      const metadata = message.metadata;
      const total = formatMilliseconds(metadata?.totalTime);
      const fetch = formatMilliseconds(metadata?.fetchTime);
      const llm = formatMilliseconds(metadata?.llmTime);
      const recordSummary = describeRecords(metadata?.recordCounts);

      const sections = extractAssistantSections(message.content);

      return (
        <div key={message.id} className="flex justify-start">
          <div className="max-w-[85%] space-y-3 rounded-2xl border border-[#E1F2BD]/70 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
            {sections.answer ? (
              <div className="space-y-2">
                {renderTextBlocks(sections.answer, `${message.id}-answer`)}
              </div>
            ) : (
              <p className="leading-relaxed">{message.content}</p>
            )}

            {(sections.scope || sections.assumptions || sections.sources) && (
              <details className="rounded-lg bg-slate-50/60 p-3 text-xs text-slate-600">
                <summary className="cursor-pointer font-semibold text-slate-500">View details</summary>
                <div className="mt-2 space-y-3">
                  {sections.scope && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Scope</p>
                      {renderTextBlocks(sections.scope, `${message.id}-scope`)}
                    </div>
                  )}
                  {sections.assumptions && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Assumptions</p>
                      {renderTextBlocks(sections.assumptions, `${message.id}-assumptions`)}
                    </div>
                  )}
                  {sections.sources && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Sources</p>
                      {renderTextBlocks(sections.sources, `${message.id}-sources`)}
                    </div>
                  )}
                </div>
              </details>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              {timestamp}
              {total && (
                <span className="rounded-full bg-[#E1F2BD]/80 px-2 py-0.5 text-[#045C66] font-semibold">
                  Total {total}
                </span>
              )}
              {fetch && <span className="rounded-full bg-slate-100 px-2 py-0.5">Fetch {fetch}</span>}
              {llm && <span className="rounded-full bg-slate-100 px-2 py-0.5">LLM {llm}</span>}
              {metadata?.language && (
                <span className="rounded-full border border-slate-200 px-2 py-0.5">
                  {metadata.language.toUpperCase()}
                </span>
              )}
              {recordSummary && (
                <span className="rounded-full border border-slate-200 px-2 py-0.5">
                  {recordSummary}
                </span>
              )}
            </div>
            {metadata?.sources?.length && !sections.sources ? (
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#04ADBF]">
                {metadata.sources.map((source) => (
                  <span key={source} className="rounded-full border border-[#04ADBF]/30 px-2 py-0.5">
                    {source}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    return (
      <div key={message.id} className="flex justify-start">
        <div className="max-w-[80%] rounded-2xl border border-[#FF8057]/40 bg-[#FF8057]/10 px-4 py-3 text-sm text-[#B7432F]">
          <p>{message.content}</p>
          <div className="mt-2">{timestamp}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col rounded-[28px] border border-[#04ADBF]/60 bg-white shadow-lg">
      <header className="flex items-center justify-between border-b border-[#04ADBF]/60 px-6 py-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#04ADBF]">AnswerPack Assistant</p>
          <h2 className="text-lg font-semibold text-slate-900">Schedule Copilot</h2>
          <p className="text-xs text-slate-500">
            {storeName || storeId} • Week {isoWeek}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-[#04ADBF]/10 px-2 py-1 font-semibold text-[#045C66]">AI</span>
          {threadId && (
            <span className="rounded-full border border-slate-200 px-2 py-1">Thread {threadId.slice(0, 8)}…</span>
          )}
        </div>
      </header>

      <main className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        {messages.length === 0 && !loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center text-sm text-slate-500">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Ask away</h3>
              <p className="mt-1">Try a quick question about staffing, gaps, or metrics to get started.</p>
            </div>
            <div className="flex items-center justify-center gap-2 text-slate-400">
              <span className="h-px w-12 bg-slate-200" />
              <div className="relative h-10 w-10 overflow-hidden rounded-full bg-white animate-wiggle-slow animate-logo-glow">
                <span className="pointer-events-none absolute inset-0 animate-logo-wave rounded-full bg-gradient-to-br from-[#04ADBF]/30 via-[#04ADBF]/45 to-[#0FB5C9]/25 opacity-80" />
                <span className="pointer-events-none absolute inset-0 animate-logo-wave-secondary rounded-full bg-[#04ADBF]/18 blur-lg" />
                <Image src="/logo_rounded.png" alt="AnswerPack logo" fill className="object-contain" />
              </div>
              <span className="h-px w-12 bg-slate-200" />
            </div>
            <div className="grid w-full max-w-lg gap-2 text-left">
              {suggestions.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => handleExampleClick(example)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 transition hover:border-[#04ADBF]/40 hover:bg-white"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) => renderMessage(message))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              Working on it…
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      <footer className="border-t border-[#04ADBF]/60 bg-slate-50/50 px-6 py-5">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about schedules, coverage, or staffing goals…"
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#04ADBF] focus:outline-none focus:ring-1 focus:ring-[#04ADBF]/40 disabled:bg-slate-100"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="flex items-center justify-center rounded-lg bg-[#04ADBF] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#03859a] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Send
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
}
