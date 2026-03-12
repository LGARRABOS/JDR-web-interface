import { useState, useCallback } from 'react';

interface CopyableCodeProps {
  code: string;
  className?: string;
  label?: string;
}

export function CopyableCode({
  code,
  className = '',
  label,
}: CopyableCodeProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback pour navigateurs anciens
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  return (
    <span className={`flex items-center gap-2 ${className}`}>
      {label && <span>{label}</span>}
      <button
        type="button"
        onClick={handleClick}
        className="px-2 py-0.5 rounded bg-fantasy-surface font-mono font-bold text-fantasy-accent-hover hover:bg-fantasy-input-soft cursor-pointer transition-colors"
        title="Cliquer pour copier"
      >
        {code}
      </button>
      {copied && (
        <span className="text-xs text-fantasy-accent animate-pulse">
          Copié !
        </span>
      )}
    </span>
  );
}
