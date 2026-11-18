import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ArpenteurDoc, Section } from '../../arpenteur/types';
import { Close } from '../tabletop/icons';

// Petits éléments d'interface communs aux panneaux de l'arpenteur.

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-fantasy-border-soft bg-fantasy-surface/80 p-4 sm:p-5 ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            {title && (
              <h3 className="font-heading text-[15px] tracking-wide text-fantasy-text">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-fantasy-muted mt-0.5">{subtitle}</p>
            )}
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-1.5">{actions}</div>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  disabled = false,
  step = 1,
  label,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  step?: number;
  label?: string;
  suffix?: ReactNode;
}) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)));
  return (
    <div
      className="inline-flex items-center gap-1"
      role="group"
      aria-label={label}
    >
      {!disabled && (
        <button
          type="button"
          onClick={() => set(value - step)}
          disabled={value <= min}
          className="arp-step"
          aria-label={`Diminuer ${label ?? ''}`}
        >
          −
        </button>
      )}
      <span className="min-w-[2.2rem] text-center tabular-nums font-semibold">
        {value}
        {suffix}
      </span>
      {!disabled && (
        <button
          type="button"
          onClick={() => set(value + step)}
          disabled={value >= max}
          className="arp-step"
          aria-label={`Augmenter ${label ?? ''}`}
        >
          +
        </button>
      )}
    </div>
  );
}

export function Meter({
  value,
  max,
  color = 'rgb(var(--c-accent))',
  height = 8,
  className = '',
}: {
  value: number;
  max: number;
  color?: string;
  height?: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      className={`w-full rounded-full bg-black/35 overflow-hidden ${className}`}
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

/** Couleur d'une jauge selon le remplissage (rouge → ambre → vert). */
export function healthColor(ratio: number): string {
  if (ratio <= 0.3) return '#d9573f';
  if (ratio <= 0.6) return '#e3a53b';
  return '#78b86a';
}

export function Pips({
  value,
  max,
  color,
  size = 8,
}: {
  value: number;
  max: number;
  color: string;
  size?: number;
}) {
  return (
    <span className="inline-flex gap-[3px]" aria-label={`${value} sur ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className="rounded-full"
          style={{
            width: size,
            height: size,
            background: i < value ? color : 'rgba(0,0,0,.35)',
            boxShadow: i < value ? `0 0 6px ${color}66` : undefined,
          }}
        />
      ))}
    </span>
  );
}

/** Champ texte validé à la sortie (ou Entrée) : une requête par modification, pas par touche. */
export function TextField({
  label,
  value,
  onCommit,
  disabled = false,
  multiline = false,
  placeholder,
  className = '',
}: {
  label?: string;
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  const commit = () => {
    focused.current = false;
    if (draft !== value) onCommit(draft);
  };
  const common = {
    value: draft,
    disabled,
    placeholder,
    onFocus: () => (focused.current = true),
    onBlur: commit,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    className: `arp-input ${multiline ? 'min-h-[72px] py-2 resize-y' : ''}`,
  };
  return (
    <label
      className={`flex flex-col gap-1 text-xs text-fantasy-muted ${className}`}
    >
      {label}
      {multiline ? (
        <textarea {...common} rows={3} />
      ) : (
        <input
          {...common}
          type="text"
          onKeyDown={(e) =>
            e.key === 'Enter' && (e.target as HTMLInputElement).blur()
          }
        />
      )}
    </label>
  );
}

export function NumberField({
  label,
  value,
  onCommit,
  disabled = false,
  min,
  max,
  step = 1,
  className = '',
}: {
  label?: string;
  value: number;
  onCommit: (v: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    let v = parseFloat(draft.replace(',', '.'));
    if (Number.isNaN(v)) v = value;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    setDraft(String(v));
    if (v !== value) onCommit(v);
  };
  return (
    <label
      className={`flex flex-col gap-1 text-xs text-fantasy-muted ${className}`}
    >
      {label}
      <input
        type="number"
        inputMode="decimal"
        value={draft}
        step={step}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) =>
          e.key === 'Enter' && (e.target as HTMLInputElement).blur()
        }
        className="arp-input tabular-nums"
      />
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className = '',
}: {
  label?: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={`flex flex-col gap-1 text-xs text-fantasy-muted ${className}`}
    >
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="arp-input"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id} className="bg-fantasy-surface">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const COLOR_PRESETS = [
  '#e8dcc0',
  '#f3efe6',
  '#c8e0d0',
  '#2b2b36',
  '#9b2c2c',
  '#c9a227',
  '#2f6b4f',
  '#1f3b6b',
  '#5b2a6e',
  '#111111',
  '#b8692e',
  '#6b4f2a',
];

export function ColorPicker({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-xs text-fantasy-muted">
      {label}
      <div className="flex flex-wrap items-center gap-1.5">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            disabled={disabled}
            onClick={() => onChange(c)}
            aria-label={`Couleur ${c}`}
            className={`w-6 h-6 rounded-full border-2 transition-transform ${value.toLowerCase() === c ? 'border-fantasy-accent scale-110' : 'border-black/40 hover:scale-105'}`}
            style={{ background: c }}
          />
        ))}
        <label
          className="relative w-6 h-6 rounded-full border-2 border-dashed border-fantasy-muted overflow-hidden cursor-pointer"
          title="Autre couleur"
        >
          <input
            type="color"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
          <span
            className="absolute inset-1 rounded-full"
            style={{ background: value }}
          />
        </label>
      </div>
    </div>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/65 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-fantasy-border-soft bg-fantasy-surface shadow-2xl`}
      >
        <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-fantasy-border-soft">
          <h2 className="font-heading text-lg text-fantasy-text truncate">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn !w-9 !h-9"
            aria-label="Fermer"
          >
            <Close size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 px-5 py-3 border-t border-fantasy-border-soft">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

/** Qui peut modifier une section (affiché quand on ne le peut pas). */
export function whoCanEdit(doc: ArpenteurDoc, section: Section): string {
  const p = doc.permissions[section];
  const posts = p?.posts ?? [];
  const parts = ['le MJ', ...posts.map((x) => x.toLowerCase())];
  let s =
    parts.length > 1
      ? `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`
      : parts[0];
  if (p?.fallback.length)
    s += ` (relève : ${p.fallback.map((x) => x.toLowerCase()).join(', ')})`;
  return s;
}

export function ReadOnlyHint({
  doc,
  section,
}: {
  doc: ArpenteurDoc;
  section: Section;
}) {
  return (
    <p className="text-xs text-fantasy-muted italic">
      Lecture seule : modifiable par {whoCanEdit(doc, section)}.
    </p>
  );
}

export function Btn({
  children,
  onClick,
  variant = 'soft',
  disabled = false,
  title,
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'soft' | 'primary' | 'danger' | 'ghost';
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const styles = {
    soft: 'bg-fantasy-input-soft hover:bg-fantasy-input-hover text-fantasy-text-soft border border-fantasy-border-soft',
    primary:
      'bg-fantasy-accent hover:bg-fantasy-accent-hover text-fantasy-bg font-bold',
    danger: 'bg-fantasy-danger/90 hover:bg-fantasy-danger text-white',
    ghost: 'hover:bg-fantasy-input-soft text-fantasy-text-soft',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-sm transition-colors disabled:opacity-40 disabled:pointer-events-none ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/** Champ contrôlé (formulaires en brouillon : fiche, objet, repère…). */
export function LiveField({
  label,
  value,
  onChange,
  multiline = false,
  placeholder,
  className = '',
  type = 'text',
  list,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  type?: 'text' | 'number';
  list?: string;
}) {
  return (
    <label
      className={`flex flex-col gap-1 text-xs text-fantasy-muted ${className}`}
    >
      {label}
      {multiline ? (
        <textarea
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="arp-input min-h-[72px] py-2 resize-y"
        />
      ) : (
        <input
          type={type}
          list={list}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="arp-input"
          inputMode={type === 'number' ? 'decimal' : undefined}
        />
      )}
    </label>
  );
}
