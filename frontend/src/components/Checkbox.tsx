import * as React from 'react';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
  children?: React.ReactNode;
}

export function Checkbox({
  checked,
  onChange,
  disabled = false,
  id,
  className = '',
  'aria-label': ariaLabel,
  children,
}: CheckboxProps) {
  const generatedId = React.useId();
  const inputId = id ?? `checkbox-${generatedId}`;
  return (
    <label
      htmlFor={inputId}
      className={`inline-flex items-center gap-2 cursor-pointer select-none ${
        disabled ? 'opacity-60 cursor-not-allowed' : ''
      } ${className}`}
    >
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-label={ariaLabel}
        className="sr-only peer"
      />
      <span
        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
          checked
            ? 'bg-fantasy-accent border-fantasy-accent'
            : 'bg-fantasy-input-soft border-fantasy-border-soft'
        } ${!disabled && 'hover:border-fantasy-accent/50'}`}
        aria-hidden
      >
        {checked && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className="text-fantasy-bg"
          >
            <path
              d="M2 6L5 9L10 3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      {children}
    </label>
  );
}
