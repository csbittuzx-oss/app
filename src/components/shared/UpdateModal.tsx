import type { AppUpdateInfo } from '../../services/UpdateService';
import { CURRENT_APP_VERSION, updateService } from '../../services/UpdateService';

interface UpdateModalProps {
  updateInfo: AppUpdateInfo;
  isOpen: boolean;
  onClose: () => void;
}

export function UpdateModal({ updateInfo, isOpen, onClose }: UpdateModalProps) {
  if (!isOpen) return null;

  const isForceUpdate = updateInfo.forceUpdate ||
    updateService.compareVersions(updateInfo.minSupportedVersion, CURRENT_APP_VERSION) > 0;

  const handleUpdateClick = () => {
    updateService.downloadAndInstallUpdate(updateInfo.apkUrl);
  };

  return (
    <div
      id="update-modal-backdrop"
      data-backdrop={!isForceUpdate ? "true" : undefined}
      role="dialog"
      aria-modal="true"
      aria-label="App Update Available"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        animation: 'fadeIn 200ms ease-out',
      }}
      onClick={(e) => {
        if (!isForceUpdate && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          width: '100%',
          maxWidth: 'var(--screen-max)',
          borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
          padding: '24px 20px',
          paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
          animation: 'slideUp 250ms cubic-bezier(0, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          maxHeight: '85vh',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Top Icon & Badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--radius-lg)',
                background: 'linear-gradient(135deg, var(--color-accent) 0%, #D97706 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  Update Available
                </h3>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: isForceUpdate ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: isForceUpdate ? 'var(--color-error)' : 'var(--color-accent)',
                  }}
                >
                  {isForceUpdate ? 'Required Update' : 'New Release'}
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                v{CURRENT_APP_VERSION} ➔ <strong>v{updateInfo.version}</strong>
              </p>
            </div>
          </div>

          {!isForceUpdate && (
            <button
              type="button"
              onClick={onClose}
              className="btn-icon"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'var(--color-surface-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-primary)',
              }}
              aria-label="Dismiss Update"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Title & Headline */}
        <div style={{ background: 'var(--color-surface-2)', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
            {updateInfo.title || `Soundwave ${updateInfo.version} is now available!`}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
            Released on {updateInfo.releaseDate}
          </p>
        </div>

        {/* Changelog / Release Notes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            What's New
          </span>
          <div
            className="scroll-area"
            style={{
              maxHeight: '30vh',
              overflowY: 'auto',
              background: 'var(--color-bg)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              border: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {updateInfo.changelog && updateInfo.changelog.length > 0 ? (
              updateInfo.changelog.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: 'rgba(245, 158, 11, 0.15)',
                      color: 'var(--color-accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
                    {item}
                  </span>
                </div>
              ))
            ) : (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                Performance improvements and bug fixes.
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          {!isForceUpdate && (
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost"
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
              }}
            >
              Later
            </button>
          )}
          <button
            type="button"
            id="download-update-now-btn"
            onClick={handleUpdateClick}
            style={{
              flex: 2,
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-accent)',
              color: 'var(--color-accent-on)',
              border: 'none',
              fontWeight: 700,
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Update Now</span>
          </button>
        </div>
      </div>
    </div>
  );
}
