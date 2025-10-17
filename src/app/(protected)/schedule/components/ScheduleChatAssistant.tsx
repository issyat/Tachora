import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import type { ScheduleFacts } from "@/types";
import type { Preview } from "@/types/preview";

import { serializeAssignments } from "../hooks/useScheduleFacts";
import type { Assignment } from "../types";

interface PickShiftActionOption {
  optionId: string;
  label: string;
  shiftId: string;
  employeeId?: string;
  assignmentId?: string | null;
  hoursLabel?: string;
}

interface PickShiftActionData {
  scope?: {
    employeeId?: string;
    day?: string;
    role?: string;
    snapshotVersion?: string;
  };
  options: PickShiftActionOption[];
}

interface CreateWorkTypeActionData {
  missingWorkType?: string;
  existingWorkTypes?: string[];
}

type MessageActionData = PickShiftActionData | CreateWorkTypeActionData | undefined;

interface Message {
  role: "user" | "assistant";
  content: string;
  actionRequired?: string;
  actionUrl?: string;
  actionData?: MessageActionData;
}

interface ScheduleChatAssistantProps {
  storeId?: string;
  weekId?: string | null;
  assignments?: Assignment[];
  facts?: ScheduleFacts | null;
  factsLoading?: boolean;
  onPreviewCreated?: (previewOrId: string | Preview, visualization?: unknown) => void;
  preview?: Preview | null;
  onApplyPreview?: () => void;
  onDiscardPreview?: () => void;
}

function isPickShiftActionData(data: MessageActionData): data is PickShiftActionData {
  return Boolean(
    data &&
      typeof data === "object" &&
      Array.isArray((data as PickShiftActionData).options),
  );
}

function isCreateWorkTypeActionData(data: MessageActionData): data is CreateWorkTypeActionData {
  return Boolean(data && typeof data === "object" && "missingWorkType" in data);
}

function generateThreadId(): string {
  const cryptoApi = typeof globalThis !== "undefined" ? (globalThis as { crypto?: Crypto }).crypto : undefined;
  if (cryptoApi?.randomUUID) {
    return `chat-${cryptoApi.randomUUID()}`;
  }
  return `chat-${Math.random().toString(36).slice(2, 10)}`;
}

export function ScheduleChatAssistant({
  storeId,
  weekId,
  assignments = [],
  facts,
  factsLoading,
  onPreviewCreated,
  preview,
  onApplyPreview,
  onDiscardPreview,
}: ScheduleChatAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm here to help with anything you need—ask about scheduling, availability, or anything else and I'll do my best to answer.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [threadId, setThreadId] = useState<string>(() => generateThreadId());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const key = "schedule-chat-thread";
    const stored = window.sessionStorage.getItem(key);
    if (stored) {
      if (stored !== threadId) {
        setThreadId(stored);
      }
      return;
    }
    window.sessionStorage.setItem(key, threadId);
  }, [threadId]);

  const assignmentPayload = useMemo(() => serializeAssignments(assignments), [assignments]);
  const factsReady = Boolean(facts && storeId && weekId);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendChatRequest = async (messageToSend: string, displayMessage?: string) => {
    const normalizedMessage = messageToSend.trim();
    if (!normalizedMessage || sending) {
      return;
    }

    const outgoingContent = (displayMessage ?? normalizedMessage).trim();
    setMessages((current) => [...current, { role: "user", content: outgoingContent }]);
    setSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: normalizedMessage,
          storeId,
          weekId,
          assignments: assignmentPayload,
          facts,
          threadId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to contact assistant");
      }

      const data = await response.json();
      const reply = (data.reply as string | undefined) || "No response available";

      if (data.preview && onPreviewCreated) {
        onPreviewCreated(data.preview, data.visualization);
      } else if (data.previewId && onPreviewCreated) {
        onPreviewCreated(data.previewId);
      }

      const actionMessage: Message = {
        role: "assistant",
        content: reply,
        actionRequired: data.actionRequired,
        actionUrl: data.actionUrl,
        actionData: data.actionData,
      };

      setMessages((current) => [...current, actionMessage]);
    } catch (error) {
      console.error("Assistant chat failed", error);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: "Sorry, I could not reply right now.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) {
      return;
    }

    setInput("");
    await sendChatRequest(trimmed);
  };

  const handlePickShiftOption = async (option: PickShiftActionOption) => {
    if (sending) {
      return;
    }
    await sendChatRequest(option.optionId, option.label);
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
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} className="absolute inset-0 space-y-3 overflow-y-auto px-4 py-3 text-sm">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={message.role === "user" ? "text-right" : "text-left"}>
              <div
                className={`inline-block max-w-[90%] rounded-lg px-3 py-2 text-left ${
                  message.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
                }`}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>

                {message.actionRequired === "create_work_type" && message.actionUrl && isCreateWorkTypeActionData(message.actionData) && (
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <Link
                      href={message.actionUrl}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Create Work Type
                    </Link>
                    {message.actionData.missingWorkType && (
                      <div className="mt-2 text-xs text-slate-600">
                        You&apos;ll be able to create &quot;{message.actionData.missingWorkType}&quot; in the Work Types section
                      </div>
                    )}
                  </div>
                )}

                {message.actionRequired === "pick_shift" && isPickShiftActionData(message.actionData) && (
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <div className="mb-2 text-xs font-medium text-slate-600">Pick a shift:</div>
                    <div className="flex flex-wrap gap-2">
                      {message.actionData.options.map((option) => (
                        <button
                          key={option.optionId}
                          onClick={() => handlePickShiftOption(option)}
                          disabled={sending}
                          className="rounded bg-indigo-600 px-3 py-1.5 text-left text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
                        >
                          <span className="block">{option.label}</span>
                          {option.hoursLabel && (
                            <span className="mt-0.5 block text-[10px] font-normal text-indigo-100/80">
                              {option.hoursLabel}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="text-left">
              <div className="inline-block rounded-lg bg-slate-100 px-3 py-2 text-slate-600">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
                  <span className="text-xs">Thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {preview && preview.status === "pending" && (
        <div className="flex-shrink-0 border-t border-green-200 bg-green-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-green-500" />
              <span className="text-sm font-medium text-green-900">
                Preview Active: {preview.diffs.length} change{preview.diffs.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onDiscardPreview}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Discard
              </button>
              <button
                onClick={onApplyPreview}
                className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-green-700"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-shrink-0 gap-2 border-t px-3 py-2">
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
