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
    <div className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft flex flex-col h-64">
      <h3 className="font-semibold font-heading p-2 border-b border-fantasy-border-soft text-fantasy-text-soft">
        Chat
      </h3>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {messages.map((m) => (
          <div key={m.id} className="text-sm">
            <span className="text-fantasy-accent-hover font-medium">
              {m.displayName ?? `User ${m.userId}`}
            </span>
            <span className="text-fantasy-muted-soft ml-1">({m.role})</span>
            <span className="ml-2 text-fantasy-text-soft">{m.content}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={handleSubmit}
        className="p-2 border-t border-fantasy-border-soft flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message..."
          className="flex-1 rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-fantasy-bg text-sm"
        >
          Envoyer
        </button>
      </form>
    </div>
  );
}
