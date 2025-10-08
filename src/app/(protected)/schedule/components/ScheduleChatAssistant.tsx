import { FormEvent, useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function ScheduleChatAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
        body: JSON.stringify({ message: trimmed }),
      });
      if (!response.ok) {
        throw new Error('Failed to contact assistant');
      }
      const data = await response.json().catch(() => ({}));
      const reply = typeof (data as any).reply === 'string' && (data as any).reply.trim().length > 0 ? (data as any).reply : 'No response available';
      setMessages((current) => [...current, { role: 'assistant', content: reply }]);
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
    <aside className="flex h-full min-h-0 flex-col rounded-lg border bg-white">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">AI Assistant</h2>
        <p className="text-xs text-slate-500">Ask for schedule tweaks or quick summaries.</p>
      </header>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {messages.length === 0 ? (
          <p className="text-xs text-slate-500">Ask for help planning shifts or exploring options.</p>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={message.role === 'user' ? 'text-right' : 'text-left'}
            >
              <span
                className={`inline-block max-w-[90%] rounded-lg px-3 py-2 text-left ${
                  message.role === 'user'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-900'
                }`}
              >
                {message.content}
              </span>
            </div>
          ))
        )}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 border-t px-3 py-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask the assistant..."
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
