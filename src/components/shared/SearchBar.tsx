import { useRef, useEffect } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
}

export function SearchBar({ value, onChange, onSubmit, onClear, placeholder = 'Songs, artists, albums…', autoFocus, id = 'search-input' }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [autoFocus]);

  return (
    <div
      role="search"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'var(--color-surface-2)',
        border: '1.5px solid var(--color-border)',
        borderRadius: 'var(--radius-full)',
        padding: '0 16px',
        height: 48,
        transition: 'border-color 200ms var(--ease-standard)',
      }}
      onFocus={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border-focus)';
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border)';
        }
      }}
    >
      {/* Search icon */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
        <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.75"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>

      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onSubmit) {
            onSubmit(value);
            inputRef.current?.blur();
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-md)',
          fontWeight: 400,
          color: 'var(--color-text-primary)',
          caretColor: 'var(--color-accent)',
          minWidth: 0,
        }}
      />

      {/* Clear button */}
      {value && (
        <button
          id="search-clear-btn"
          aria-label="Clear search"
          onClick={() => {
            onChange('');
            onClear?.();
            inputRef.current?.focus();
          }}
          style={{
            background: 'var(--color-text-muted)',
            border: 'none',
            borderRadius: '50%',
            width: 20,
            height: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            color: 'var(--color-bg)',
            padding: 0,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}
