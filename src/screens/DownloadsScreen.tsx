import { useApp } from '../state/AppContext';
import { usePlayer } from '../state/PlayerContext';
import { SongCard } from '../components/cards/SongCard';
import { EmptyState } from '../components/shared/ErrorState';

const DownloadIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export function DownloadsScreen() {
  const { state, toggleDownload } = useApp();
  const { playSong: _playSong } = usePlayer();
  const downloads = state.downloads;

  // Calculate pseudo "storage" usage (each track ~ 5MB for 30s preview)
  const storageMB = downloads.length * 5;
  const maxMB = 500;
  const storagePercent = Math.min((storageMB / maxMB) * 100, 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header style={{ padding: '20px 20px 12px', flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', color: 'var(--color-text-primary)' }}>
          Downloads
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          Listen offline
        </p>
      </header>

      <div className="scroll-area" style={{ flex: 1, padding: '0 20px', paddingBottom: 'var(--content-bottom-pad)' }}>

        {downloads.length === 0 ? (
          <EmptyState
            icon={<DownloadIcon />}
            title="No downloads yet"
            subtitle="Save songs to listen without an internet connection. Tap the heart + download on any track."
          />
        ) : (
          <>
            {/* Storage indicator */}
            <div style={{
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 16px',
              marginBottom: 20,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Storage Used
                </span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                  {storageMB} MB / {maxMB} MB
                </span>
              </div>
              <div style={{ height: 4, background: 'var(--color-surface-2)', borderRadius: 2 }}>
                <div style={{
                  height: '100%',
                  width: `${storagePercent}%`,
                  background: storagePercent > 80 ? 'var(--color-error)' : 'var(--color-accent)',
                  borderRadius: 2,
                  transition: 'width 400ms var(--ease-standard)',
                }} />
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                {downloads.length} {downloads.length === 1 ? 'track' : 'tracks'} saved
              </p>
            </div>

            {/* Download list */}
            <div>
              {downloads.map((song, i) => (
                <div key={song.id} style={{ position: 'relative' }}>
                  <SongCard song={song} queue={downloads} index={i} />
                  {/* Remove download button */}
                  <button
                    id={`remove-download-${song.id}`}
                    aria-label={`Remove ${song.title} from downloads`}
                    onClick={() => toggleDownload(song)}
                    style={{
                      position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--color-error)', padding: 8,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {/* Legal note */}
            <div style={{
              margin: '20px 0',
              padding: '12px 16px',
              background: 'var(--color-secondary-dim)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
            }}>
              <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                Downloads are stored locally on this device. Only tracks from providers that explicitly permit offline listening are saved here. iTunes previews are for promotional use only.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
