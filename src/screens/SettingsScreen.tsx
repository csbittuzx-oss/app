import { useState, useEffect } from 'react';
import { useApp } from '../state/AppContext';
import { usePlayer } from '../state/PlayerContext';
import { aiTasteProfileEngine } from '../domain/ai/AITasteProfileEngine';
import { updateService, type AppUpdateInfo, CURRENT_APP_VERSION } from '../services/UpdateService';
import { UpdateModal } from '../components/shared/UpdateModal';
import { dolbyAudioService } from '../services/DolbyAudioService';
import type { AudioQuality } from '../data/models';

export function SettingsScreen() {
  const { state, dispatch, setMusicLanguages, resetOnboarding } = useApp();
  const { setAudioQuality, state: playerState, toggleAutoPlay } = usePlayer();
  const [showLangModal, setShowLangModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateModalInfo, setUpdateModalInfo] = useState<AppUpdateInfo | null>(null);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(state.musicLanguages || ['Hindi', 'International']);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDolbySupported, setIsDolbySupported] = useState(false);

  useEffect(() => {
    dolbyAudioService.checkSupport().then((supported) => {
      setIsDolbySupported(supported);
    });
  }, []);

  const isDark = state.theme === 'dark';
  const audioQuality: AudioQuality = state.config.audioQuality || 'high';
  const autoUpdate = state.config.autoUpdate ?? true;

  const ALL_LANGUAGES = [
    'Hindi', 'International', 'Punjabi', 'Tamil', 'Telugu',
    'Malayalam', 'Marathi', 'Gujarati', 'Bengali', 'Kannada', 'Bhojpuri',
    'Haryanvi', 'Rajasthani', 'Himachali / Pahari', 'Assamese', 'Odia',
    'Kashmiri', 'Sindhi', 'Konkani', 'Maithili', 'Chhattisgarhi',
    'Garhwali', 'Kumaoni', 'Manipuri', 'Nagpuri', 'Braj', 'Awadhi', 'Marwari',
  ];

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleSaveLanguages = () => {
    if (selectedLangs.length === 0) {
      showToast('Please select at least 1 language');
      return;
    }
    setMusicLanguages(selectedLangs);
    setShowLangModal(false);
    showToast('Music recommendation preferences updated');
  };

  const handleQualityChange = (q: AudioQuality) => {
    dispatch({ type: 'SET_CONFIG', payload: { audioQuality: q } });
    setAudioQuality(q);
    const label = q === 'dolby' ? 'Dolby Audio (Hardware Dolby Atmos)' : q === 'high' ? 'High (320 kbps Studio HD)' : q === 'medium' ? 'Medium (192 kbps)' : 'Low (96 kbps Data Saver)';
    showToast(`Audio quality switched to ${label}`);
  };

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    try {
      const res = await updateService.checkForUpdates(true);
      if (res.hasUpdate && res.latestUpdate) {
        setUpdateModalInfo(res.latestUpdate);
      } else {
        showToast(`You are on the latest version of Soundwave (v${CURRENT_APP_VERSION})`);
      }
    } catch {
      showToast('Could not check for updates. Please try again later.');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleAutoUpdateToggle = () => {
    const next = !autoUpdate;
    dispatch({ type: 'SET_CONFIG', payload: { autoUpdate: next } });
    showToast(next ? 'Automatic update checks enabled' : 'Automatic update checks disabled');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Settings Bottom Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: playerState.currentSong
            ? 'calc(64px + 56px + env(safe-area-inset-bottom, 0px) + 16px)'
            : 'calc(56px + env(safe-area-inset-bottom, 0px) + 16px)',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 800,
          background: '#1A1D2B',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          color: '#F3F4F6',
          padding: '10px 20px',
          borderRadius: 'var(--radius-full)',
          fontSize: 'var(--text-sm)',
          fontWeight: 600,
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)',
          animation: 'slideUp 200ms cubic-bezier(0, 0, 0.2, 1)',
          textAlign: 'center',
          maxWidth: '85%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          pointerEvents: 'none',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent)' }} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Content */}
      <div className="scroll-area" style={{ flex: 1, paddingBottom: 'var(--content-bottom-pad)' }}>
        {/* Header */}
        <header style={{ padding: '24px 20px 16px' }}>
          <h1 style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-2xl)',
            color: 'var(--color-text-primary)',
          }}>
            Settings
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            App Preferences, Audio Quality & Tools
          </p>
        </header>

        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── 1. Appearance / Dark Theme ── */}
          <section aria-label="Appearance">
            <h2 style={{
              margin: '0 0 10px',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              Appearance
            </h2>
            <div style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-surface-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-accent)',
                  flexShrink: 0,
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--color-text-primary)' }}>
                    Dark Theme
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                    {isDark ? 'Dark OLED mode enabled' : 'Light mode enabled (Default)'}
                  </p>
                </div>
              </div>
              <ToggleSwitch
                id="theme-switch-toggle"
                checked={isDark}
                onChange={() => dispatch({ type: 'SET_THEME', payload: isDark ? 'light' : 'dark' })}
                label="Switch Dark Theme"
              />
            </div>
          </section>

          {/* ── 2. Audio Quality ── */}
          <section aria-label="Audio Quality">
            <h2 style={{
              margin: '0 0 10px',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              Audio Quality
            </h2>
            <div style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
            }}>
              {[
                ...(isDolbySupported ? [{
                  id: 'dolby' as AudioQuality,
                  title: 'Dolby Audio',
                  bitrate: 'Dolby Atmos',
                  desc: 'Hardware-accelerated Dolby Atmos spatial surround sound',
                }] : []),
                { id: 'high' as AudioQuality, title: 'High Quality', bitrate: '320 kbps', desc: 'Best sound quality & crystal clear audio (Recommended)' },
                { id: 'medium' as AudioQuality, title: 'Medium Quality', bitrate: '192 kbps', desc: 'Balanced streaming with moderate data usage' },
                { id: 'low' as AudioQuality, title: 'Low Quality', bitrate: '96 kbps', desc: 'Data saver mode for slower connections' },
              ].map((item, index, arr) => {
                const isSelected = audioQuality === item.id;
                return (
                  <div
                    key={item.id}
                    id={`audio-quality-option-${item.id}`}
                    onClick={() => handleQualityChange(item.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handleQualityChange(item.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 16px',
                      cursor: 'pointer',
                      borderBottom: index < arr.length - 1 ? '1px solid var(--color-border)' : 'none',
                      background: isSelected ? 'var(--color-accent-dim)' : 'transparent',
                      transition: 'background 150ms ease',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 'var(--text-md)', color: isSelected ? 'var(--color-accent)' : 'var(--color-text-primary)' }}>
                          {item.title}
                        </p>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: isSelected ? 'var(--color-accent)' : 'var(--color-surface-2)',
                          color: isSelected ? 'var(--color-accent-on)' : 'var(--color-text-muted)',
                        }}>
                          {item.bitrate}
                        </span>
                      </div>
                      <p style={{ margin: '3px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        {item.desc}
                      </p>
                    </div>

                    {/* Radio Checkmark */}
                    <div style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      border: '2px solid ' + (isSelected ? 'var(--color-accent)' : 'var(--color-text-muted)'),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {isSelected && (
                        <div style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          background: 'var(--color-accent)',
                        }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── 3. Smart AutoPlay & Playback ── */}
          <section aria-label="Playback & Recommendations">
            <h2 style={{
              margin: '0 0 10px',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              Smart Playback
            </h2>
            <div style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-surface-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-accent)',
                  flexShrink: 0,
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--color-text-primary)' }}>
                    Smart AutoPlay
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                    Auto-play personalized recommendations when queue finishes
                  </p>
                </div>
              </div>
              <ToggleSwitch
                id="smart-autoplay-toggle"
                label="Smart AutoPlay"
                checked={playerState.autoPlay}
                onChange={() => {
                  toggleAutoPlay();
                  showToast(playerState.autoPlay ? 'Smart AutoPlay disabled' : 'Smart AutoPlay enabled');
                }}
              />
            </div>
          </section>

          {/* ── 4. Updates ── */}
          <section aria-label="Updates">
            <h2 style={{
              margin: '0 0 10px',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              Updates & Releases
            </h2>
            <div style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-surface-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-success)',
                    flexShrink: 0,
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                    </svg>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--color-text-primary)' }}>
                      Automatically Update
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                      Check and alert for new releases on startup
                    </p>
                  </div>
                </div>
                <ToggleSwitch
                  id="auto-update-toggle"
                  checked={autoUpdate}
                  onChange={handleAutoUpdateToggle}
                  label="Automatically Update"
                />
              </div>

              {/* Manual Check for Updates Button */}
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Check for Updates
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Installed: <strong style={{ color: 'var(--color-accent)' }}>v{CURRENT_APP_VERSION}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCheckForUpdates}
                  disabled={isCheckingUpdate}
                  style={{
                    background: 'var(--color-accent)',
                    color: 'var(--color-accent-on)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 16px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    cursor: isCheckingUpdate ? 'default' : 'pointer',
                    opacity: isCheckingUpdate ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {isCheckingUpdate ? (
                    <span>Checking...</span>
                  ) : (
                    <span>Check Now</span>
                  )}
                </button>
              </div>
            </div>
          </section>

          {/* ── 4. Music Recommendations & Languages ── */}
          <section aria-label="Music Recommendations">
            <h2 style={{
              margin: '0 0 10px',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              Personalization
            </h2>
            <div style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-surface-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-accent)',
                    flexShrink: 0,
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18V5l12-2v13" />
                      <circle cx="6" cy="18" r="3" />
                      <circle cx="18" cy="16" r="3" />
                    </svg>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--color-text-primary)' }}>
                      Music Languages
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                      {state.musicLanguages?.join(', ') || 'Hindi, International'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLangs(state.musicLanguages || ['Hindi', 'International']);
                    setShowLangModal(true);
                  }}
                  style={{
                    background: 'var(--color-accent-dim)',
                    color: 'var(--color-accent)',
                    border: '1px solid var(--color-accent)',
                    borderRadius: 'var(--radius-md)',
                    padding: '6px 12px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Change
                </button>
              </div>

              {/* Reset AI Personalization & Taste Profile */}
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Reset Personalization Profile
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    Wipe learned taste affinities, skips, and discovery history
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    aiTasteProfileEngine.resetPersonalizationProfile();
                    showToast('Personalization and taste profile reset');
                  }}
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#EF4444',
                    borderRadius: 'var(--radius-md)',
                    padding: '6px 12px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Reset
                </button>
              </div>

              {/* Re-run Onboarding */}
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  Re-take first-time setup
                </span>
                <button
                  type="button"
                  onClick={() => {
                    resetOnboarding();
                    showToast('Restarting onboarding setup...');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-muted)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                  }}
                >
                  Reset Onboarding
                </button>
              </div>
            </div>
          </section>

          {/* ── 5. About ── */}
          <section aria-label="About">
            <h2 style={{
              margin: '0 0 10px',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              About
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* App Info Card */}
              <div style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: '20px 16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: 12,
              }}>
                <img
                  src="/logo.png"
                  alt="Soundwave Logo"
                  width={60}
                  height={60}
                  style={{ borderRadius: 'var(--radius-lg)', objectFit: 'cover', border: '1px solid var(--color-border)' }}
                />
                <div>
                  <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--color-text-primary)' }}>
                    Soundwave
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                      Version 1.2.1
                    </span>
                    <span style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      background: 'rgba(245, 158, 11, 0.15)',
                      color: 'var(--color-accent)',
                      letterSpacing: '0.02em',
                    }}>
                      Beta Version
                    </span>
                  </div>
                </div>
                <div style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: '#10B981',
                  background: 'rgba(16, 185, 129, 0.12)',
                  padding: '5px 14px',
                  borderRadius: 'var(--radius-full)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 6px rgba(16, 185, 129, 0.6)' }} />
                  <span>All Systems Operational</span>
                </div>
              </div>

              {/* Developer Card */}
              <div style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 38,
                    height: 38,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-surface-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-accent)',
                    flexShrink: 0,
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--color-text-primary)' }}>
                      Developed by Pandit Bittu
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                      Lead Developer & Architect
                    </p>
                  </div>
                </div>
                <a
                  href="https://instagram.com/panditbittu.x"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'rgba(225, 48, 108, 0.1)',
                    color: '#E1306C',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    textDecoration: 'none',
                    border: '1px solid rgba(225, 48, 108, 0.25)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                  </svg>
                  <span>@panditbittu.x</span>
                </a>
              </div>

              {/* Legal Card (Privacy Policy & Terms & Conditions) */}
              <div style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
              }}>
                {/* Privacy Policy */}
                <button
                  type="button"
                  id="btn-open-privacy-policy"
                  onClick={() => setShowPrivacyModal(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '14px 16px',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid var(--color-border)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-surface-2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--color-accent)',
                      flexShrink: 0,
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      </svg>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--color-text-primary)' }}>
                        Privacy Policy
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        Your Privacy Matters • Zero tracking policy
                      </p>
                    </div>
                  </div>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>

                {/* Terms & Conditions */}
                <button
                  type="button"
                  id="btn-open-terms-conditions"
                  onClick={() => setShowTermsModal(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '14px 16px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-surface-2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--color-accent)',
                      flexShrink: 0,
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10 9 9 9 8 9"/>
                      </svg>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--color-text-primary)' }}>
                        Terms & Conditions
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        Usage guidelines & third-party terms
                      </p>
                    </div>
                  </div>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </div>
          </section>
        </div>

        <div style={{ height: 24 }} />
      </div>

      {/* Music Languages Modal */}
      {showLangModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            animation: 'fadeIn 200ms ease-out',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowLangModal(false); }}
        >
          <div style={{
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
            maxHeight: '80vh',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  Music Languages
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  Select languages for personalized recommendations
                </p>
              </div>
              <button
                onClick={() => setShowLangModal(false)}
                className="btn-icon"
                style={{ padding: 6 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Language Selection Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, overflowY: 'auto', maxHeight: '42vh', padding: '4px 0' }}>
              {ALL_LANGUAGES.map((lang) => {
                const isSelected = selectedLangs.includes(lang);
                return (
                  <div
                    key={lang}
                    onClick={() => {
                      setSelectedLangs((prev) =>
                        prev.includes(lang)
                          ? prev.filter((l) => l !== lang)
                          : [...prev, lang]
                      );
                    }}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-md)',
                      background: isSelected ? 'rgba(245, 158, 11, 0.12)' : 'var(--color-surface-2)',
                      border: isSelected ? '1.5px solid var(--color-accent)' : '1px solid var(--color-border)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontWeight: 600,
                      fontSize: 'var(--text-sm)',
                      color: isSelected ? 'var(--color-accent)' : 'var(--color-text-primary)',
                    }}
                  >
                    <span>{lang}</span>
                    <div style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: isSelected ? 'var(--color-accent)' : 'transparent',
                      border: isSelected ? 'none' : '1.5px solid var(--color-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#FFFFFF',
                    }}>
                      {isSelected && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setShowLangModal(false)}
                className="btn btn-ghost"
                style={{ flex: 1, padding: '12px', borderRadius: 'var(--radius-md)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveLanguages}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-accent)',
                  color: 'var(--color-accent-on)',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                }}
              >
                Save Preferences ({selectedLangs.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Privacy Policy Modal ── */}
      {showPrivacyModal && (
        <div
          id="legal-modal-backdrop"
          data-backdrop="true"
          role="dialog"
          aria-modal="true"
          aria-label="Privacy Policy"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            animation: 'fadeIn 200ms ease-out',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowPrivacyModal(false); }}
        >
          <div style={{
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
            boxShadow: '0 -10px 40px rgba(0,0,0,0.4)',
          }}>
            {/* Header with Close button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--color-accent-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-accent)',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </div>
                <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  Privacy Policy
                </h3>
              </div>
              <button
                type="button"
                id="close-privacy-modal-btn"
                onClick={() => setShowPrivacyModal(false)}
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
                aria-label="Close Privacy Policy"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="scroll-area" style={{ overflowY: 'auto', maxHeight: '65vh', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--color-surface-2)', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <h4 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--color-accent)' }}>
                  Your Privacy Matters
                </h4>
                <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  Soundwave is designed with privacy in mind. We do not collect, sell, or share your personal data.
                </p>
              </div>

              <div>
                <h5 style={{ margin: '0 0 4px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  What we collect
                </h5>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  Soundwave does not intentionally collect personal information from your device.
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  Your playlists, liked songs, search history, playback history, preferences, and saved settings are stored locally on your device.
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  Your local music data remains on your device.
                </p>
              </div>

              <div>
                <h5 style={{ margin: '0 0 4px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  Your Data
                </h5>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  Your personal music preferences and app data are kept on your device and are not sold or shared by Soundwave.
                </p>
              </div>

              <div>
                <h5 style={{ margin: '0 0 4px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  Third-Party Services
                </h5>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  Soundwave may use third-party music services/APIs to provide music and related functionality. Those services may have their own privacy policies and data practices.
                </p>
              </div>

              <div>
                <h5 style={{ margin: '0 0 4px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  Security
                </h5>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  We take reasonable measures to protect the information stored by the app. However, no software can guarantee absolute security.
                </p>
              </div>

              <div>
                <h5 style={{ margin: '0 0 4px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  Changes
                </h5>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  This Privacy Policy may be updated when Soundwave adds or changes features. Any updated version will be available inside the app.
                </p>
              </div>

              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
                <h5 style={{ margin: '0 0 4px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  Contact
                </h5>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  Developer: <strong>Pandit Bittu</strong><br/>
                  Instagram: <strong>@panditbittu.x</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Terms & Conditions Modal ── */}
      {showTermsModal && (
        <div
          id="legal-modal-backdrop"
          data-backdrop="true"
          role="dialog"
          aria-modal="true"
          aria-label="Terms & Conditions"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            animation: 'fadeIn 200ms ease-out',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowTermsModal(false); }}
        >
          <div style={{
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
            boxShadow: '0 -10px 40px rgba(0,0,0,0.4)',
          }}>
            {/* Header with Close button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--color-accent-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-accent)',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  Terms & Conditions
                </h3>
              </div>
              <button
                type="button"
                id="close-terms-modal-btn"
                onClick={() => setShowTermsModal(false)}
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
                aria-label="Close Terms & Conditions"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="scroll-area" style={{ overflowY: 'auto', maxHeight: '65vh', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--color-surface-2)', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <h4 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--color-accent)' }}>
                  Welcome to Soundwave
                </h4>
                <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  By using Soundwave, you agree to these Terms & Conditions.
                </p>
              </div>

              <div>
                <h5 style={{ margin: '0 0 4px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  1. Use of the App
                </h5>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  Soundwave is provided for personal and lawful music listening. You must not use the app for unlawful activities or attempt to disrupt, exploit, or bypass its security.
                </p>
              </div>

              <div>
                <h5 style={{ margin: '0 0 4px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  2. Music & Content
                </h5>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  Music and related content may be provided through third-party services. Soundwave does not claim ownership of third-party music, artwork, artist names, or other copyrighted content.
                </p>
              </div>

              <div>
                <h5 style={{ margin: '0 0 4px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  3. Third-Party Services
                </h5>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  Soundwave may rely on third-party APIs and services. Their availability, content, and policies may change without notice.
                </p>
              </div>

              <div>
                <h5 style={{ margin: '0 0 4px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  4. User Data
                </h5>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  Soundwave is designed to keep your app preferences and local music-related data on your device. We do not sell or intentionally share your personal data.
                </p>
              </div>

              <div>
                <h5 style={{ margin: '0 0 4px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  5. Availability
                </h5>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  Features, music availability, streaming quality, and third-party services may change or become temporarily unavailable.
                </p>
              </div>

              <div>
                <h5 style={{ margin: '0 0 4px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  6. Prohibited Use
                </h5>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  You must not reverse engineer, abuse, modify, exploit, or attempt to gain unauthorized access to Soundwave or its services.
                </p>
              </div>

              <div>
                <h5 style={{ margin: '0 0 4px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  7. Changes to These Terms
                </h5>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  These Terms may be updated as Soundwave develops. Continued use of the app after an update means you accept the updated Terms.
                </p>
              </div>

              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
                <h5 style={{ margin: '0 0 4px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  8. Contact
                </h5>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  Developer: <strong>Pandit Bittu</strong><br/>
                  Instagram: <strong>@panditbittu.x</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {updateModalInfo && (
        <UpdateModal
          updateInfo={updateModalInfo}
          isOpen={Boolean(updateModalInfo)}
          onClose={() => setUpdateModalInfo(null)}
        />
      )}
    </div>
  );
}

function ToggleSwitch({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      style={{
        width: 50,
        height: 28,
        borderRadius: 14,
        background: checked ? 'var(--color-accent)' : 'var(--color-surface-2)',
        border: '2px solid ' + (checked ? 'var(--color-accent)' : 'var(--color-border)'),
        cursor: 'pointer',
        padding: 0,
        position: 'relative',
        transition: 'background 200ms var(--ease-standard), border-color 200ms var(--ease-standard)',
        flexShrink: 0,
      }}
    >
      <div style={{
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: '#fff',
        position: 'absolute',
        top: 2,
        left: checked ? 24 : 2,
        transition: 'left 200ms var(--ease-spring)',
        boxShadow: 'var(--shadow-sm)',
      }} />
    </button>
  );
}
