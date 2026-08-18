// ─── ExploreGrid ──────────────────────────────────────────────────────────────
// 2-column mood/genre chip grid shown in the "Explore" tab when search is idle.
// Tapping a chip fires the query immediately.

interface Props {
  onChipSelect: (query: string) => void;
}

const MOODS = [
  { label: "Chill & Relax",      query: "Chill relaxing lofi acoustic songs",       gradient: "linear-gradient(135deg, #1e3a5f 0%, #2d6a9f 100%)" },
  { label: "Workout Energy",     query: "Gym workout hype energetic motivation hits", gradient: "linear-gradient(135deg, #7b1111 0%, #c0392b 100%)" },
  { label: "Late Night Drive",   query: "Late night drive synthwave lofi vibes",      gradient: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)" },
  { label: "Party Hits",         query: "Bollywood party dance club mashup hits",     gradient: "linear-gradient(135deg, #6a1fa2 0%, #b044e0 100%)" },
  { label: "Sad & Emotional",    query: "Emotional sad hindi heartbreak songs",       gradient: "linear-gradient(135deg, #2c3e50 0%, #4a6782 100%)" },
  { label: "Romantic Melodies",  query: "Romantic love songs bollywood melodies",    gradient: "linear-gradient(135deg, #7d2c4a 0%, #c0567a 100%)" },
  { label: "Trending Today",     query: "Trending top hits 2024 popular songs",       gradient: "linear-gradient(135deg, #0d4d36 0%, #27ae60 100%)" },
  { label: "Desi Hip-Hop",       query: "Desi hip hop punjabi rap 2024 latest hits",  gradient: "linear-gradient(135deg, #5c4a00 0%, #d4ac0d 100%)" },
  { label: "Indie & Alternative",query: "Indie alternative pop songs 2024",          gradient: "linear-gradient(135deg, #1b3a4b 0%, #4a8fa8 100%)" },
  { label: "Focus & Study",      query: "Lofi study beats instrumental focus music", gradient: "linear-gradient(135deg, #2d1b69 0%, #6c44cc 100%)" },
  { label: "Bollywood Classics", query: "Bollywood classic hits evergreen 90s songs",gradient: "linear-gradient(135deg, #5d2906 0%, #c0670a 100%)" },
  { label: "Instrumental",       query: "Calm acoustic guitar piano instrumental",   gradient: "linear-gradient(135deg, #1a3a2a 0%, #3d7a5a 100%)" },
];

export function ExploreGrid({ onChipSelect }: Props) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      padding: "0 16px 16px",
    }}>
      {MOODS.map((mood) => (
        <button
          key={mood.label}
          type="button"
          onClick={() => onChipSelect(mood.query)}
          style={{
            height: 64,
            borderRadius: 10,
            background: mood.gradient,
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 12px",
            textAlign: "center",
            fontFamily: "var(--font-body)",
            fontWeight: 700,
            fontSize: "var(--text-sm)",
            color: "#ffffff",
            letterSpacing: "0.01em",
            lineHeight: 1.3,
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            transition: "transform 120ms ease, opacity 120ms ease",
          }}
        >
          {mood.label}
        </button>
      ))}
    </div>
  );
}
