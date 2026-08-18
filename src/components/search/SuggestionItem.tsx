// ─── SuggestionItem ───────────────────────────────────────────────────────────
// Layer 1 UI: renders a single live autocomplete suggestion with:
//   - Search icon 🔍
//   - Suggestion text
//   - Fill ↖ button

interface Props {
  suggestion: string;
  onSelect: (suggestion: string) => void;
  onFill: (suggestion: string) => void;
}

export function SuggestionItem({ suggestion, onSelect, onFill }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 16px",
        background: "var(--color-surface)",
        cursor: "pointer",
        transition: "background 120ms ease",
      }}
      onClick={() => onSelect(suggestion)}
    >
      {/* Search icon */}
      <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>

      {/* Suggestion text */}
      <span style={{
        flex: 1,
        fontSize: "var(--text-md)",
        color: "var(--color-text-primary)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {suggestion}
      </span>

      {/* Fill button ↖ */}
      <button
        type="button"
        aria-label={`Fill with "${suggestion}"`}
        onClick={(e) => { e.stopPropagation(); onFill(suggestion); }}
        style={{
          background: "none", border: "none", padding: 6,
          color: "var(--color-text-secondary)", cursor: "pointer", opacity: 0.6,
          display: "flex", alignItems: "center",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 10 4 15 9 20" />
          <path d="M20 4v7a4 4 0 0 1-4 4H4" />
        </svg>
      </button>
    </div>
  );
}
