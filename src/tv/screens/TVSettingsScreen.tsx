import { useState, useEffect } from 'react';
import type { AudioQuality } from '../../data/models';
import { usePlayer } from '../../state/PlayerContext';
import { clearOfflineBackupCache } from '../../services/OfflineBackupService';
import { showToast } from '../../core/utils/toast';

export function TVSettingsScreen() {
  const { setAudioQuality } = usePlayer();
  const [quality, setQualityState] = useState<AudioQuality>('high');
  const [cacheCleared, setCacheCleared] = useState(false);

  useEffect(() => {
    try {
      const cfg = localStorage.getItem('sw_config');
      if (cfg) {
        const parsed = JSON.parse(cfg);
        if (parsed.audioQuality) setQualityState(parsed.audioQuality);
      }
    } catch {}
  }, []);

  const handleSelectQuality = (q: AudioQuality) => {
    setQualityState(q);
    setAudioQuality(q);
    try {
      const cfg = JSON.parse(localStorage.getItem('sw_config') || '{}');
      cfg.audioQuality = q;
      localStorage.setItem('sw_config', JSON.stringify(cfg));
    } catch {}
    showToast(`Audio quality set to ${q.toUpperCase()}`, 'success', 2000);
  };

  const handleClearCache = async () => {
    await clearOfflineBackupCache();
    setCacheCleared(true);
    showToast('Offline cache cleared successfully', 'success', 2000);
  };

  const qualityOptions: { id: AudioQuality; title: string; desc: string }[] = [
    { id: 'dolby', title: 'Dolby Audio / Atmos', desc: 'Spatial studio surround sound processing on supported devices' },
    { id: 'high', title: 'Extreme HD (320 kbps)', desc: 'Full studio master bitrate with maximum dynamic range' },
    { id: 'medium', title: 'High Quality (160 kbps)', desc: 'Balanced HD streaming quality' },
    { id: 'low', title: 'Data Saver (96 kbps)', desc: 'Fastest loading on weak networks' },
  ];

  return (
    <div
      style={{
        flex: 1,
        height: '100vh',
        overflowY: 'auto',
        padding: '36px 48px 120px 48px',
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
        maxWidth: '840px',
      }}
    >
      <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
        Android TV Settings
      </h1>

      {/* ── Audio Quality Section ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
          Streaming Audio Quality
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }} data-tv-section="settings-quality">
          {qualityOptions.map((opt) => (
            <button
              key={opt.id}
              id={`tv-setting-quality-${opt.id}`}
              data-tv-focus="true"
              data-tv-section="settings-quality"
              tabIndex={0}
              onClick={() => handleSelectQuality(opt.id)}
              className={`tv-focusable ${quality === opt.id ? 'tv-focused' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                background: quality === opt.id ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                border: quality === opt.id ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                color: '#FFFFFF',
                textAlign: 'left',
              }}
            >
              <div>
                <span style={{ fontSize: '16px', fontWeight: 700, display: 'block' }}>{opt.title}</span>
                <span style={{ fontSize: '13px', color: '#A1A1AA' }}>{opt.desc}</span>
              </div>
              {quality === opt.id && (
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'var(--tv-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Storage & Cache Section ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
          Storage & Offline Cache
        </h2>
        <button
          id="tv-setting-clear-cache"
          data-tv-focus="true"
          data-tv-section="settings-storage"
          tabIndex={0}
          onClick={handleClearCache}
          className="tv-focusable"
          style={{
            padding: '16px 20px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '14px',
            color: '#F87171',
            fontSize: '15px',
            fontWeight: 700,
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{cacheCleared ? 'Cache Cleared' : 'Clear Offline Cached Music'}</span>
          <span style={{ fontSize: '13px', opacity: 0.8 }}>Free local TV storage space</span>
        </button>
      </div>

      {/* ── App Info ── */}
      <div style={{ color: '#71717A', fontSize: '13px', padding: '12px 0' }}>
        Soundwave for Android TV • Version 1.3.0 • Continuous Background Audio Playback
      </div>
    </div>
  );
}
