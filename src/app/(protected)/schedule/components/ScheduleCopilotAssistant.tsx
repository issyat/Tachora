"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ensureIsoWeekId } from "@/lib/week";
import type { Preview } from "@/types/preview";

interface StoreOption {
  id: string;
  name: string;
}

type DiffItem = {
  type: "assign" | "create_assignment";
  assignmentId?: string;
  scheduleId?: string;
  employeeId?: string;
  day?: string;
  startTime?: string;
  endTime?: string;
  workTypeId?: string;
  minutes?: number;
};

interface PreviewPayload {
  token: string;
  diff: DiffItem[];
  diffs?: DiffItem[];
  requires_confirmation: boolean;
  summary?: string;
  warnings?: string[];
  blockers?: string[];
}

interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  preview?: PreviewPayload | null;
  citations?: string[];
  requiresConfirmation?: boolean;
  tools?: string[];
  toolCallCount?: number;
  finishReason?: string;
  model?: string;
}

interface ScheduleCopilotAssistantProps {
  stores: StoreOption[];
  currentStoreId?: string;
  isoWeek?: string | null;
  onRefresh: () => void;
  onPreviewCreated: (preview: Preview | PreviewPayload | any, visualization?: any) => Promise<void>;
}

// GLOBAL FALLBACK: Store preview in sessionStorage for page to pick up
if (typeof window !== 'undefined') {
  console.log('🌐 [ScheduleCopilotAssistant] Setting up global preview handler');
  window.__PREVIEW_HANDLER__ = (preview: any) => {
    console.log('🌐 [GLOBAL] Preview handler called, storing in sessionStorage:', preview);
    sessionStorage.setItem('__LATEST_PREVIEW__', JSON.stringify(preview));
    window.dispatchEvent(new CustomEvent('preview-created', { detail: preview }));
  };
}

declare global {
  interface Window {
    __PREVIEW_HANDLER__?: (preview: any) => void;
  }
}

export function ScheduleCopilotAssistant({
  stores,
  currentStoreId,
  isoWeek,
  onRefresh,
  onPreviewCreated,
}: ScheduleCopilotAssistantProps) {
  console.log('[ScheduleCopilotAssistant] 🎯 Component initialized with onPreviewCreated:', {
    type: typeof onPreviewCreated,
    isDefined: !!onPreviewCreated,
    value: onPreviewCreated
  });
  
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: "Hi! Ask me about availability, hours, coverage, or staffing for this schedule.",
    },
  ]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [storeId, setStoreId] = useState<string | undefined>(currentStoreId ?? stores[0]?.id);
  const [weekId, setWeekId] = useState<string>(() => ensureIsoWeekId(isoWeek ?? undefined, new Date()));
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previewCacheRef = useRef<Record<string, { token: string; diff: DiffItem[] | any[] }>>({});

  const ensureArray = (value: unknown): any[] => {
    if (Array.isArray(value)) {
      return value;
    }
    if (value === null || value === undefined) {
      return [];
    }
    return [value];
  };

  // BACKUP: If parent doesn't have callback, notify via refresh
  useEffect(() => {
    if (!onPreviewCreated) {
      console.log('🔄 [ScheduleCopilotAssistant] No callback - will trigger refresh after preview');
      const checkStorage = setInterval(() => {
        const stored = sessionStorage.getItem('__LATEST_PREVIEW__');
        if (stored) {
          console.log('🔄 [ScheduleCopilotAssistant] Preview in storage, triggering parent refresh');
          sessionStorage.removeItem('__LATEST_PREVIEW__');
          onRefresh(); // This will cause parent to reload and pick up the preview
        }
      }, 500);
      return () => clearInterval(checkStorage);
    }
  }, [onPreviewCreated, onRefresh]);

  useEffect(() => {
    if (currentStoreId) {
      setStoreId(currentStoreId);
    } else if (!storeId && stores[0]?.id) {
      setStoreId(stores[0].id);
    } else if (stores.length === 0) {
      setStoreId(undefined);
    }
  }, [currentStoreId, stores, storeId]);

  useEffect(() => {
    if (isoWeek) {
      setWeekId(ensureIsoWeekId(isoWeek, new Date()));
    }
  }, [isoWeek]);

  const storeName = useMemo(() => {
    if (!storeId) {
      return stores[0]?.name ?? "Select a store";
    }
    return stores.find((store) => store.id === storeId)?.name ?? "Unknown store";
  }, [storeId, stores]);

  const hasContext = Boolean(storeId && weekId);
  const disableSend = sending || !hasContext;

  const appendMessage = (message: AssistantMessage) => {
    setMessages((current) => [...current, message]);
  };

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) {
      return;
    }

    if (!hasContext) {
      appendMessage({
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: "Select a store and ISO week before chatting with the copilot.",
      });
      return;
    }

    appendMessage({
      id: `user-${Date.now()}`,
      role: "user",
      text,
    });
    setInput("");
    setSending(true);

    try {
      const response = await fetch("/api/copilot/advisor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          threadId,
          storeId,
          isoWeek: weekId,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to reach supervisor." }));
        appendMessage({
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: `Unable to complete request: ${error.error ?? "Unknown error."}`,
        });
        return;
      }

      const payload = (await response.json()) as {
        threadId: string;
        messageId: string;
        text?: string;
        preview?: PreviewPayload | null;
        citations?: string[];
        requires_confirmation?: boolean;
        storeId?: string | null;
        isoWeek?: string | null;
        tools?: string[];
        tool_call_count?: number;
        finish_reason?: string;
        model?: string;
      };

      setThreadId(payload.threadId);
      if (payload.storeId) {
        setStoreId(payload.storeId);
      }
      if (payload.isoWeek) {
        setWeekId(payload.isoWeek);
      }

      let displayText = typeof payload.text === "string" ? payload.text : "";
      let previewPayload = payload.preview ?? null;

      if (!displayText && previewPayload?.summary) {
        displayText = previewPayload.summary;
      }

      const trimmed = displayText.trim();
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
          const parsed = JSON.parse(trimmed) as Partial<{ text?: string; preview?: PreviewPayload | null }>;
          if (typeof parsed.text === "string" && parsed.text.trim().length > 0) {
            displayText = parsed.text;
          }
          if (!previewPayload && parsed.preview) {
            previewPayload = parsed.preview;
          }
        } catch {
          // ignore parse errors and keep original text
        }
      }

      if (!displayText && previewPayload?.summary) {
        displayText = previewPayload.summary;
      }

      const cacheToken =
        (previewPayload as any)?.token ??
        (previewPayload as any)?.id ??
        null;
      const cacheDiff = ensureArray(
        (previewPayload as any)?.diff ??
          (previewPayload as any)?.diffs ??
          [],
      );
      if (cacheToken) {
        previewCacheRef.current[payload.messageId] = {
          token: cacheToken,
          diff: cacheDiff,
        };
      }

      const previewDiffs = (() => {
        if (Array.isArray((previewPayload as any)?.diffs)) {
          return (previewPayload as any).diffs as DiffItem[];
        }
        if (Array.isArray(previewPayload?.diff)) {
          return previewPayload?.diff ?? [];
        }
        return [] as DiffItem[];
      })();

      const normalizedPreview = previewPayload
        ? { ...previewPayload, diff: previewPayload.diff ?? previewDiffs, diffs: previewDiffs }
        : null;

      const newMessage: AssistantMessage = {
        id: payload.messageId,
        role: "assistant",
        text: displayText || "Assistant responded without additional details.",
        preview: normalizedPreview,
        citations: payload.citations ?? [],
        requiresConfirmation: payload.requires_confirmation ?? normalizedPreview?.requires_confirmation ?? false,
        tools: payload.tools && payload.tools.length > 0 ? payload.tools : undefined,
        toolCallCount: payload.tool_call_count,
        finishReason: payload.finish_reason ?? undefined,
        model: payload.model ?? undefined,
      };

      appendMessage(newMessage);
      if (normalizedPreview?.token) {
        previewCacheRef.current[payload.messageId] = {
          token: normalizedPreview.token,
          diff: ensureArray(
            (normalizedPreview as any)?.diff ??
              (normalizedPreview as any)?.diffs ??
              [],
          ),
        };
      }

      // Notify parent component about preview so calendar visualization can display it
      if (normalizedPreview) {
        console.log('[ScheduleCopilotAssistant] ✅ Preview created:', {
          token: normalizedPreview.token,
          diffCount: normalizedPreview.diff?.length,
          hasCallback: !!onPreviewCreated,
        });
        
        if (onPreviewCreated) {
          console.log('[ScheduleCopilotAssistant] Calling parent callback...');
          await onPreviewCreated(normalizedPreview);
          console.log('[ScheduleCopilotAssistant] ✅ Parent callback completed');
        } else {
          console.warn('[ScheduleCopilotAssistant] ⚠️ NO CALLBACK - Storing in API');
          // FALLBACK: Post to API endpoint that will make it available
          try {
            const apiResponse = await fetch('/api/preview/by-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(normalizedPreview),
            });
            
            if (apiResponse.ok) {
              const stored = await apiResponse.json();
              console.log('✅ [ScheduleCopilotAssistant] Preview stored via API:', stored.token);
              
              // Store in sessionStorage AND global handler
              if (window.__PREVIEW_HANDLER__) {
                window.__PREVIEW_HANDLER__(normalizedPreview);
              }
              sessionStorage.setItem('__LATEST_PREVIEW__', JSON.stringify(normalizedPreview));
              window.dispatchEvent(new CustomEvent('preview-created', { detail: normalizedPreview }));
              
              // Force parent refresh after short delay
              setTimeout(() => {
                console.log('🔄 [ScheduleCopilotAssistant] Triggering refresh...');
                onRefresh();
              }, 300);
            }
          } catch (err) {
            console.error('❌ [ScheduleCopilotAssistant] API call failed:', err);
          }
        }
      }
    } catch (error) {
      appendMessage({
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: `Something went wrong: ${error instanceof Error ? error.message : "Unknown error."}`,
      });
    } finally {
      setSending(false);
    }
  };

  const applyPreview = async (message: AssistantMessage, index: number) => {
    if (!message.preview || !threadId) {
      appendMessage({
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: "No preview available to apply yet. Ask for a change first.",
      });
      return;
    }

    let previewToken = (message.preview as any)?.token ?? (message.preview as any)?.id ?? null;
    let previewDiff = ensureArray(
      (message.preview as any)?.diff ??
        (message.preview as any)?.diffs ??
        [],
    );

    if ((!previewToken || previewDiff.length === 0) && previewCacheRef.current[message.id]) {
      previewToken = previewCacheRef.current[message.id].token;
      previewDiff = ensureArray(previewCacheRef.current[message.id].diff);
    }

    if (!previewToken || previewDiff.length === 0) {
      appendMessage({
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: "Preview metadata missing (token or diff). Please ask the copilot to generate the preview again.",
      });
      return;
    }

    try {
      const response = await fetch("/api/ai/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          threadId,
          token: previewToken,
          diff: previewDiff,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to apply diff." }));
        appendMessage({
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: `Could not apply changes: ${error.error ?? "Unknown error."}`,
        });
        return;
      }

      const payload = (await response.json()) as { message?: string };
      onRefresh();
      delete previewCacheRef.current[message.id];
      setMessages((current) =>
        current.map((entry, idx) =>
          idx === index
            ? {
                ...entry,
                preview: null,
                requiresConfirmation: false,
              }
            : entry,
        ),
      );
      appendMessage({
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: payload.message ?? "Changes applied successfully.",
      });
    } catch (error) {
      appendMessage({
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: `Application failed: ${error instanceof Error ? error.message : "Unknown error."}`,
      });
    }
  };

  return (
    <aside className="flex h-full flex-col rounded-lg border bg-white">
      <header className="flex-shrink-0 border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Team Chat</h2>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
          <span>Ask anything about your store or schedule.</span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${
              hasContext ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${hasContext ? "bg-emerald-500" : "bg-slate-400"}`} />
            {hasContext ? "Context ready" : "Select store & week"}
          </span>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 min-h-0 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {messages.map((message, index) => (
          <div key={message.id} className={message.role === "user" ? "text-right" : "text-left"}>
            <div
              className={`inline-block max-w-[90%] rounded-lg px-3 py-2 ${
                message.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
              }`}
            >
              <div className="whitespace-pre-wrap">{message.text}</div>

              {message.preview && message.requiresConfirmation && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => void applyPreview(message, index)}
                    className="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-green-700"
                    disabled={Boolean(message.preview.blockers?.length)}
                  >
                    Apply Changes
                  </button>
                  <button
                    onClick={() => {
                      delete previewCacheRef.current[message.id];
                      setMessages((current) =>
                        current.map((entry, idx) =>
                          idx === index
                            ? {
                                ...entry,
                                preview: null,
                                requiresConfirmation: false,
                              }
                            : entry,
                        ),
                      );
                    }}
                    className="rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Discard
                  </button>
                </div>
              )}

              {(message.model || (message.tools && message.tools.length > 0)) && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  {message.model ? <span>Model: {message.model}</span> : null}
                  {message.tools && message.tools.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {message.tools.map((tool, toolIdx) => (
                        <span
                          key={`${message.id}-tool-${toolIdx}`}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-[2px] text-[10px] font-medium uppercase tracking-wide text-slate-700"
                        >
                          {toolIdx + 1}. {tool}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}

              {message.citations?.length ? (
                <div className="mt-2 border-t border-slate-200 pt-2 text-[11px] text-slate-500">
                  Source: {message.citations.join(", ")}
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {sending && (
          <div className="text-left">
            <div className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-slate-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
              <span className="text-xs">Working...</span>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSend();
        }}
        className="flex flex-shrink-0 gap-2 border-t px-3 py-2"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about schedules, hours, or assignments..."
          className="flex-1 rounded border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-0 disabled:bg-slate-100 disabled:text-slate-400"
          disabled={disableSend}
        />
        <button
          type="submit"
          disabled={disableSend}
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </aside>
  );
}
