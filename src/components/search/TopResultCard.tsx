// ─── TopResultCard ────────────────────────────────────────────────────────────
// Renders the Google ML "Top Result" / musicCardShelfRenderer card:
//   - Large 64x64 artwork
//   - Song title (bold)
//   - Artist + type badge
//   - Play button (primary color)
//   - More options ⋮ button

import { CONFIG } from "../../config";
import type { Song } from "../../data/models";
import { resizeImageUrl } from "../../core/utils/imageUtils";

interface Props {
  song: Song;
  label?: string;
  onPlay: (song: Song) => void;
  onMore: (song: Song) => void;
}

export function TopResultCard({ song, label = "Top Result", onPlay, onMore }: Props) {
  const artwork = resizeImageUrl(song.artworkLg || song.artwork, 544, 544) || CONFIG.ARTWORK_PLACEHOLDER;

  return (
    <div style={{
      margin: "0 16px 8px",
      borderRadius: "var(--radius-xl)",
      overflow: "hidden",
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
    }}>
      {/* Header */}
      <div style={{ padding: "12px 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--color-accent)" style={{ flexShrink: 0 }}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--color-accent)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {label}
        </span>
      </div>

      {/* Content */}
      <div style={{ display: "flex", alignItems: "center", padding: "12px 16px 14px", gap: 14 }}>
        {/* Artwork */}
        <div style={{ width: 64, height: 64, borderRadius: "var(--radius-md)", overflow: "hidden", flexShrink: 0 }}>
          <img
            src={artwork}
            alt={song.title}
            width={64}
            height={64}
            loading="eager"
            onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
            style={{ objectFit: "cover", width: "100%", height: "100%" }}
          />
        </div>

        {/* Meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontWeight: 700,
            fontSize: "var(--text-lg)",
            color: "var(--color-text-primary)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            lineHeight: 1.3,
          }}>
            {song.title}
          </p>
          <p style={{
            margin: "4px 0 0",
            fontSize: "var(--text-sm)",
            color: "var(--color-text-secondary)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            Song • {song.artist}
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {/* Play button */}
          <button
            type="button"
            aria-label={`Play ${song.title}`}
            onClick={() => onPlay(song)}
            style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "var(--color-accent)",
              border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
              transition: "transform 120ms ease, opacity 120ms ease",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-accent-on)">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </button>

          {/* More options ⋮ */}
          <button
            type="button"
            aria-label="More options"
            onClick={(e) => { e.stopPropagation(); onMore(song); }}
            style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "none", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--color-text-secondary)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
