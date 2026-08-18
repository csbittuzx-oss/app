// ─── SearchHistoryItem ────────────────────────────────────────────────────────
// Layer 4 UI component: renders a single search history row with:
//   - Clock icon 🕐
//   - Query text (truncated)
//   - Delete ✕ button (removes from localStorage)
//   - Fill ↖ button (populates the search field)

interface Props {
  query: string;
  onDelete: (query: string) => void;
  onFill: (query: string) => void;
}

export function SearchHistoryItem({ query, onDelete, onFill }: Props) {
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
      onClick={() => onFill(query)}
    >
      {/* Clock icon */}
      <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </span>

      {/* Query text */}
      <span style={{
        flex: 1,
        fontSize: "var(--text-md)",
        color: "var(--color-text-primary)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {query}
      </span>

      {/* Fill button ↖ */}
      <button
        type="button"
        aria-label={`Fill search with "${query}"`}
        onClick={(e) => { e.stopPropagation(); onFill(query); }}
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

      {/* Delete button ✕ */}
      <button
        type="button"
        aria-label={`Remove "${query}" from history`}
        onClick={(e) => { e.stopPropagation(); onDelete(query); }}
        style={{
          background: "none", border: "none", padding: 6,
          color: "var(--color-text-secondary)", cursor: "pointer", opacity: 0.5,
          display: "flex", alignItems: "center",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
