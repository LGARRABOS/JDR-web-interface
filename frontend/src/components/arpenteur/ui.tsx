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
      className={`arp-card px-4 pt-5 pb-4 sm:px-6 sm:pt-6 sm:pb-5 ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex items-start gap-2">
            {title && <Cog size={20} className="mt-0.5 shrink-0" />}
            <div className="min-w-0">
              {title && <h3 className="arp-card-title text-[16px]">{title}</h3>}
              {subtitle && (
                <p className="text-xs text-[#b59a70] mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-1.5">{actions}</div>
          )}
        </header>
      )}
      {title && <div className="arp-rule" aria-hidden="true" />}
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
      className={`w-full arp-tube ${className}`}
      style={{ height: Math.max(height, 10), padding: 2 }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${pct}%`,
          color,
          background: `linear-gradient(180deg, color-mix(in srgb, ${color} 55%, white), ${color} 45%, color-mix(in srgb, ${color} 70%, black))`,
        }}
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
        className={`arp-card w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[92vh] flex flex-col !rounded-b-none sm:!rounded-2xl`}
      >
        <header className="flex items-center justify-between gap-3 px-5 pt-5 pb-3 border-b border-[#4a3216]">
          <h2 className="arp-card-title text-lg truncate">{title}</h2>
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
          <footer className="flex flex-wrap justify-end gap-2 px-5 py-3 border-t border-[#4a3216]">
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
    soft: 'arp-btn-iron',
    primary: 'arp-btn-brass',
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

/** Engrenage de laiton (ornement des panneaux et du cadre). */
export function Cog({
  size = 24,
  teeth = 10,
  className = '',
}: {
  size?: number;
  teeth?: number;
  className?: string;
}) {
  const r1 = 40;
  const r2 = 50;
  const pts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const st = (Math.PI * 2) / teeth;
    const a = i * st;
    const p = (ang: number, r: number) =>
      `${(Math.cos(ang) * r).toFixed(1)},${(Math.sin(ang) * r).toFixed(1)}`;
    pts.push(
      `${i ? 'L' : 'M'}${p(a, r1)}`,
      `L${p(a + st * 0.12, r2)}`,
      `L${p(a + st * 0.42, r2)}`,
      `L${p(a + st * 0.54, r1)}`
    );
  }
  const id = `cog${teeth}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="-52 -52 104 104"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={id} cx="40%" cy="35%">
          <stop offset="0" stopColor="#fbe2a4" />
          <stop offset=".55" stopColor="#c08a3a" />
          <stop offset="1" stopColor="#5a3610" />
        </radialGradient>
      </defs>
      <path
        d={`${pts.join(' ')} Z`}
        fill={`url(#${id})`}
        stroke="#2a1806"
        strokeWidth={3}
      />
      <circle
        r={26}
        fill="none"
        stroke="#2a1806"
        strokeWidth={4}
        opacity={0.6}
      />
      {[0, 60, 120].map((a) => (
        <rect
          key={a}
          x={-4}
          y={-30}
          width={8}
          height={60}
          fill="#6b4210"
          transform={`rotate(${a})`}
        />
      ))}
      <circle r={9} fill="#2a1806" />
    </svg>
  );
}
