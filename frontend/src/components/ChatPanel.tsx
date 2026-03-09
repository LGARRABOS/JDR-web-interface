import { useEffect, useRef, useState } from 'react';

interface Message {
  id: number;
  userId: number;
  role: string;
  content: string;
  displayName?: string;
}

interface ChatPanelProps {
  messages: Message[];
  onSend: (content: string) => void;
}

export function ChatPanel({ messages, onSend }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSend(input.trim());
      setInput('');
    }
  };

  return (
    <div className="rounded-lg bg-slate-800/80 flex flex-col h-64">
      <h3 className="font-semibold p-2 border-b border-slate-700">Chat</h3>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {messages.map((m) => (
          <div key={m.id} className="text-sm">
            <span className="text-amber-400 font-medium">
              {m.displayName ?? `User ${m.userId}`}
            </span>
            <span className="text-slate-500 ml-1">({m.role})</span>
            <span className="ml-2">{m.content}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={handleSubmit}
        className="p-2 border-t border-slate-700 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message..."
          className="flex-1 rounded bg-slate-700 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 text-sm"
        >
          Envoyer
        </button>
      </form>
    </div>
  );
}
