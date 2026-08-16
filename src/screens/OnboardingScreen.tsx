import { useState, useEffect, useRef } from 'react';
import { useApp } from '../state/AppContext';

// ─── SVG Icons ───────────────────────────────────────────────────────────────

type IconProps = { color?: string; size?: number };

const IconMusic = ({ color = 'currentColor', size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
);
const IconGlobe = ({ color = 'currentColor', size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);
const IconZap = ({ color = 'currentColor', size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);
const IconVolume = ({ color = 'currentColor', size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);
const IconRadio = ({ color = 'currentColor', size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);
const IconHeadphones = ({ color = 'currentColor', size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
  </svg>
);
const IconMic = ({ color = 'currentColor', size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);
const IconBroadcast = ({ color = 'currentColor', size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4.93 4.93a10 10 0 0 0 0 14.14" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    <path d="M7.76 7.76a6 6 0 0 0 0 8.49" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);
const IconPlayCircle = ({ color = 'currentColor', size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" />
  </svg>
);
const IconDisc = ({ color = 'currentColor', size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const IconAward = ({ color = 'currentColor', size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
  </svg>
);
const IconCheck = ({ size = 10 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// ─── Gender Icons ─────────────────────────────────────────────────────────────

const IconMale = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="10" cy="14" r="6" /><line x1="20" y1="4" x2="14.5" y2="9.5" /><polyline points="16 4 20 4 20 8" />
  </svg>
);
const IconFemale = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="6" /><line x1="12" y1="14" x2="12" y2="20" /><line x1="8" y1="17" x2="16" y2="17" />
  </svg>
);
const IconNeutral = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

// ─── Data ─────────────────────────────────────────────────────────────────────

interface MusicLanguage {
  id: string;
  label: string;
  native: string;
  Icon: React.FC<IconProps>;
  accentColor: string;
}

const MUSIC_LANGUAGES: MusicLanguage[] = [
  { id: 'Hindi',              label: 'Hindi',              native: 'हिन्दी',             Icon: IconMusic,      accentColor: '#F59E0B' },
  { id: 'International',      label: 'International',      native: 'English',            Icon: IconGlobe,      accentColor: '#3B82F6' },
  { id: 'Punjabi',            label: 'Punjabi',            native: 'ਪੰਜਾਬੀ',             Icon: IconZap,        accentColor: '#EF4444' },
  { id: 'Tamil',              label: 'Tamil',              native: 'தமிழ்',              Icon: IconVolume,     accentColor: '#A855F7' },
  { id: 'Telugu',             label: 'Telugu',             native: 'తెలుగు',             Icon: IconRadio,      accentColor: '#10B981' },
  { id: 'Malayalam',          label: 'Malayalam',          native: 'മലയാളം',             Icon: IconHeadphones, accentColor: '#14B8A6' },
  { id: 'Marathi',            label: 'Marathi',            native: 'मराठी',              Icon: IconMic,        accentColor: '#F97316' },
  { id: 'Gujarati',           label: 'Gujarati',           native: 'ગુજરાતી',            Icon: IconBroadcast,  accentColor: '#EAB308' },
  { id: 'Bengali',            label: 'Bengali',            native: 'বাংলা',              Icon: IconPlayCircle, accentColor: '#EC4899' },
  { id: 'Kannada',            label: 'Kannada',            native: 'ಕನ್ನಡ',             Icon: IconDisc,       accentColor: '#6366F1' },
  { id: 'Bhojpuri',           label: 'Bhojpuri',           native: 'भोजपुरी',            Icon: IconAward,      accentColor: '#F43F5E' },
  { id: 'Haryanvi',           label: 'Haryanvi',           native: 'हरियाणवी',           Icon: IconZap,        accentColor: '#D97706' },
  { id: 'Rajasthani',         label: 'Rajasthani',         native: 'राजस्थानी',          Icon: IconMusic,      accentColor: '#B45309' },
  { id: 'Himachali / Pahari', label: 'Himachali / Pahari', native: 'हिमाचली / पहाड़ी',   Icon: IconVolume,     accentColor: '#059669' },
  { id: 'Assamese',           label: 'Assamese',           native: 'অসমীয়া',            Icon: IconHeadphones, accentColor: '#0284C7' },
  { id: 'Odia',               label: 'Odia',               native: 'ଓଡ଼ିଆ',              Icon: IconRadio,      accentColor: '#7C3AED' },
  { id: 'Kashmiri',           label: 'Kashmiri',           native: 'کٲشُر / कश्मीरी',    Icon: IconMic,        accentColor: '#0D9488' },
  { id: 'Sindhi',             label: 'Sindhi',             native: 'سنڌي / सिन्धी',      Icon: IconGlobe,      accentColor: '#C026D3' },
  { id: 'Konkani',            label: 'Konkani',            native: 'कोंकणी',             Icon: IconMusic,      accentColor: '#2563EB' },
  { id: 'Maithili',           label: 'Maithili',           native: 'मैथिली',             Icon: IconAward,      accentColor: '#EA580C' },
  { id: 'Chhattisgarhi',      label: 'Chhattisgarhi',      native: 'छत्तीसगढ़ी',         Icon: IconDisc,       accentColor: '#CA8A04' },
  { id: 'Garhwali',           label: 'Garhwali',           native: 'गढ़वाली',            Icon: IconVolume,     accentColor: '#16A34A' },
  { id: 'Kumaoni',            label: 'Kumaoni',            native: 'कुमाऊँनी',           Icon: IconHeadphones, accentColor: '#0891B2' },
  { id: 'Manipuri',           label: 'Manipuri',           native: 'ꯃꯩꯇꯩꯂꯣꯟ',          Icon: IconPlayCircle, accentColor: '#9333EA' },
  { id: 'Nagpuri',            label: 'Nagpuri',            native: 'नागपुरी',            Icon: IconRadio,      accentColor: '#E11D48' },
  { id: 'Braj',               label: 'Braj',               native: 'ब्रजभाषा',           Icon: IconMic,        accentColor: '#4F46E5' },
  { id: 'Awadhi',             label: 'Awadhi',             native: 'अवधी',               Icon: IconMusic,      accentColor: '#DB2777' },
  { id: 'Marwari',            label: 'Marwari',            native: 'मारवाड़ी',           Icon: IconAward,      accentColor: '#D97706' },
];

const GENDER_OPTIONS = [
  { id: 'Male',              label: 'Male',              desc: 'Personalized for you',  Icon: IconMale    },
  { id: 'Female',            label: 'Female',            desc: 'Personalized for you',  Icon: IconFemale  },
  { id: 'Prefer not to say', label: 'Prefer not to say', desc: 'Standard music blend',  Icon: IconNeutral },
];

const CURATION_STEPS = [
  { label: 'Analyzing language preferences',
    Icon: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> },
  { label: 'Fetching trending chartbusters',
    Icon: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  { label: 'Connecting 320kbps HD audio',
    Icon: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg> },
  { label: 'Building your Home feed',
    Icon: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export function OnboardingScreen() {
  const { completeOnboarding } = useApp();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [gender, setGender] = useState<string>('Male');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [curationIndex, setCurationIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (step !== 4) return;
    setCurationIndex(0);
    setProgress(0);
    let pct = 0;
    const prog = setInterval(() => {
      pct = Math.min(pct + 2, 100);
      setProgress(pct);
      if (pct >= 100) clearInterval(prog);
    }, 48);
    const stepTimers = CURATION_STEPS.map((_, i) => setTimeout(() => setCurationIndex(i), i * 640));
    timerRef.current = setTimeout(() => completeOnboarding(selectedLanguages, gender), 2700);
    return () => {
      clearInterval(prog);
      stepTimers.forEach(clearTimeout);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [step]);

  const toggleLanguage = (id: string) =>
    setSelectedLanguages(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]);

  const allSelected = selectedLanguages.length === MUSIC_LANGUAGES.length;
  const toggleAll = () =>
    setSelectedLanguages(allSelected ? ['Hindi', 'International'] : MUSIC_LANGUAGES.map(l => l.id));

  const ACCENT = 'var(--color-accent)';

  return (
    <>
      {/* ── Global styles injected once ── */}
      <style>{`
        @keyframes onbFadeIn  { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes onbEq      { from { transform:scaleY(0.2) } to { transform:scaleY(1) } }
        @keyframes onbPulse   { 0%,100%{transform:scale(0.92);opacity:0.8} 50%{transform:scale(1.14);opacity:0.2} }
        @keyframes onbDot     { from { opacity:0.25;transform:scale(0.7) } to { opacity:1;transform:scale(1.3) } }
        .lang-card { transition: all 170ms cubic-bezier(0.2,0.8,0.2,1); }
        .lang-card:active { transform: scale(0.97) !important; }
      `}</style>

      {/* ── Root: full-screen fixed shell ── */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'var(--color-bg)',
        color: 'var(--color-text-primary)',
        fontFamily: 'var(--font-body)',
        display: 'flex', flexDirection: 'column',
        overflowY: step === 3 ? 'hidden' : 'auto',
      }}>

        {/* Ambient glow */}
        <div style={{
          position: 'absolute', top: '-8%', left: '50%', transform: 'translateX(-50%)',
          width: 340, height: 340, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245,158,11,0.14) 0%, transparent 70%)',
          filter: 'blur(48px)', zIndex: 0, pointerEvents: 'none',
        }} />

        {/* ── Nav Bar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          minHeight: 52,
          paddingLeft: 16, paddingRight: 16,
          paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
          paddingBottom: 8,
          position: 'relative', zIndex: 10, flexShrink: 0,
          background: 'var(--color-bg)',
        }}>
          {step > 1 && step < 4 ? (
            <button onClick={() => setStep(prev => (prev - 1) as 1|2|3)}
              aria-label="Previous step"
              style={{
                width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-text-primary)', flexShrink: 0,
              }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          ) : <div style={{ width: 36 }} />}

          {step < 4 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[1, 2, 3].map(s => (
                <div key={s} style={{
                  height: 4, width: step === s ? 26 : 9, borderRadius: 2,
                  background: step >= s ? ACCENT : 'var(--color-border)',
                  transition: 'all 280ms cubic-bezier(0.2,0.8,0.2,1)',
                }} />
              ))}
            </div>
          )}

          {step < 4 ? (
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
              {step} / 3
            </span>
          ) : <div style={{ width: 36 }} />}
        </div>

        {/* ══════════════════ STEP 1: Welcome ══════════════════════════════════ */}
        {step === 1 && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            justifyContent: 'center', alignItems: 'center',
            textAlign: 'center', padding: '16px 24px',
            position: 'relative', zIndex: 10,
            animation: 'onbFadeIn 300ms ease',
          }}>
            <div style={{
              width: 100, height: 100, borderRadius: 28,
              background: 'linear-gradient(135deg, #F59E0B, #D97706)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 20px 48px rgba(245,158,11,0.32)',
              marginBottom: 28, flexShrink: 0,
              border: '2px solid rgba(255,255,255,0.22)',
              position: 'relative', overflow: 'hidden',
            }}>
              <img src="/logo.png" alt="Soundwave" width={96} height={96}
                style={{ borderRadius: 24, objectFit: 'cover', position: 'absolute' }}
                onError={e => { (e.target as HTMLElement).style.display = 'none'; }} />
              <IconMusic color="white" size={48} />
            </div>
            <h1 style={{
              margin: '0 0 10px', fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.6rem, 5vw, 2rem)', fontWeight: 800,
              letterSpacing: '-0.025em', lineHeight: 1.2,
            }}>Welcome to Soundwave</h1>
            <p style={{ margin: '0 0 24px', fontSize: 15, color: 'var(--color-text-secondary)', maxWidth: 280, lineHeight: 1.6 }}>
              Enjoy high-quality music, completely ad-free.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 300 }}>
              {[
                { label: '320kbps HD Audio' },
                { label: 'Synced Lyrics' },
                { label: '100% Ad-Free' },
              ].map(({ label }) => (
                <span key={label} style={{
                  fontSize: 12, fontWeight: 600, padding: '6px 12px',
                  borderRadius: 999, background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)',
                }}>{label}</span>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════ STEP 2: Gender ═══════════════════════════════════ */}
        {step === 2 && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            justifyContent: 'center', padding: '16px 20px',
            animation: 'onbFadeIn 300ms ease', position: 'relative', zIndex: 10,
          }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <span style={{
                display: 'inline-block', marginBottom: 10,
                fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: ACCENT, background: 'rgba(245,158,11,0.1)', padding: '4px 12px', borderRadius: 999,
              }}>Personalize</span>
              <h2 style={{
                margin: '0 0 8px', fontFamily: 'var(--font-display)',
                fontSize: 'clamp(1.5rem, 5vw, 1.8rem)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2,
              }}>What's your gender?</h2>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                Help us personalize your music experience
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400, margin: '0 auto', width: '100%' }}>
              {GENDER_OPTIONS.map(opt => {
                const isSel = gender === opt.id;
                return (
                  <button key={opt.id} onClick={() => setGender(opt.id)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '15px 18px', borderRadius: 'var(--radius-xl)', cursor: 'pointer',
                    background: isSel ? 'rgba(245,158,11,0.1)' : 'var(--color-surface)',
                    border: isSel ? '2px solid var(--color-accent)' : '1.5px solid var(--color-border)',
                    transition: 'all 180ms ease',
                    transform: isSel ? 'scale(1.015)' : 'scale(1)',
                    boxShadow: isSel ? '0 6px 22px rgba(245,158,11,0.18)' : 'none',
                    textAlign: 'left',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 'var(--radius-md)', flexShrink: 0,
                        background: isSel ? 'rgba(245,158,11,0.15)' : 'var(--color-surface-2)',
                        border: '1px solid var(--color-border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: isSel ? ACCENT : 'var(--color-text-secondary)',
                      }}><opt.Icon /></div>
                      <div>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.3, color: isSel ? ACCENT : 'var(--color-text-primary)' }}>{opt.label}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1 }}>{opt.desc}</p>
                      </div>
                    </div>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      background: isSel ? ACCENT : 'transparent',
                      border: isSel ? 'none' : '2px solid var(--color-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 160ms ease',
                    }}>
                      {isSel && <IconCheck size={10} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════════════ STEP 3: Language Selection ════════════════════════ */}
        {step === 3 && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            minHeight: 0, position: 'relative', zIndex: 10,
            animation: 'onbFadeIn 300ms ease',
          }}>
            {/* ── Fixed header section ── */}
            <div style={{
              flexShrink: 0,
              paddingLeft: 16, paddingRight: 16,
              paddingTop: 6, paddingBottom: 8,
            }}>
              {/* Badge + title + subtitle */}
              <div style={{ textAlign: 'center', marginBottom: 10 }}>
                <span style={{
                  display: 'inline-block', marginBottom: 6,
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: ACCENT, background: 'rgba(245,158,11,0.1)', padding: '3px 10px', borderRadius: 999,
                }}>Your Taste</span>
                <h2 style={{
                  margin: '0 0 4px', fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(1.35rem, 4.5vw, 1.6rem)', fontWeight: 800,
                  letterSpacing: '-0.02em', lineHeight: 1.2,
                }}>What music do you like?</h2>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                  Select languages for your recommendations
                </p>
              </div>

              {/* Counter + Select All row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT }}>
                  {selectedLanguages.length} {selectedLanguages.length === 1 ? 'Language' : 'Languages'} Selected
                </span>
                <button onClick={toggleAll} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)',
                  textDecoration: 'underline', padding: '2px 0',
                }}>
                  {allSelected ? 'Clear All' : 'Select All'}
                </button>
              </div>
            </div>

            {/* ── Scrollable language grid ── */}
            <div style={{
              flex: 1, overflowY: 'auto', minHeight: 0,
              paddingLeft: 16, paddingRight: 16,
              /* bottom padding = button height + gap + safe-area */
              paddingBottom: 'calc(72px + 16px + env(safe-area-inset-bottom, 0px))',
              WebkitOverflowScrolling: 'touch',
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 8,
              }}>
                {MUSIC_LANGUAGES.map(lang => {
                  const isSel = selectedLanguages.includes(lang.id);
                  const accent = lang.accentColor;
                  return (
                    <button
                      key={lang.id}
                      className="lang-card"
                      onClick={() => toggleLanguage(lang.id)}
                      aria-pressed={isSel}
                      aria-label={lang.label}
                      style={{
                        /* reset */
                        all: 'unset',
                        boxSizing: 'border-box',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        textAlign: 'left',
                        WebkitTapHighlightColor: 'transparent',
                        /* card shell */
                        padding: '10px 10px 12px',
                        borderRadius: 13,
                        background: isSel ? `${accent}12` : 'var(--color-surface)',
                        border: isSel ? `2px solid ${accent}` : '1.5px solid var(--color-border)',
                        boxShadow: isSel ? `0 3px 14px ${accent}25` : '0 1px 3px rgba(0,0,0,0.06)',
                        transform: isSel ? 'scale(1.012)' : 'scale(1)',
                        transition: 'all 170ms cubic-bezier(0.2,0.8,0.2,1)',
                        gap: 0,
                      }}
                    >
                      {/* Top row: icon (left) + check (right) */}
                      <div style={{
                        display: 'flex', alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                      }}>
                        {/* Icon box */}
                        <div style={{
                          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                          background: isSel ? `${accent}1a` : 'var(--color-surface-2)',
                          border: `1px solid ${isSel ? accent + '50' : 'var(--color-border)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: isSel ? accent : 'var(--color-text-muted)',
                          transition: 'all 170ms ease',
                        }}>
                          <lang.Icon color={isSel ? accent : 'var(--color-text-muted)'} size={15} />
                        </div>

                        {/* Check indicator */}
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                          background: isSel ? accent : 'transparent',
                          border: isSel ? 'none' : '1.5px solid var(--color-border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 150ms ease',
                          marginTop: 1,
                        }}>
                          {isSel && <IconCheck size={9} />}
                        </div>
                      </div>

                      {/* Language name — English only */}
                      <p style={{
                        margin: 0, padding: 0,
                        fontSize: 13, fontWeight: 700, lineHeight: 1.35,
                        color: isSel ? accent : 'var(--color-text-primary, #111)',
                        whiteSpace: 'normal',
                      }}>
                        {lang.label}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Fixed bottom Continue button ── */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              padding: '12px 16px',
              paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
              background: 'linear-gradient(to top, var(--color-bg) 80%, transparent)',
              zIndex: 20,
            }}>
              <button
                onClick={() => setStep(4)}
                disabled={selectedLanguages.length === 0}
                style={{
                  width: '100%', height: 52,
                  borderRadius: 999,
                  background: selectedLanguages.length === 0
                    ? 'var(--color-surface-2)'
                    : 'linear-gradient(135deg, #F59E0B, #D97706)',
                  color: selectedLanguages.length === 0 ? 'var(--color-text-muted)' : '#fff',
                  border: 'none',
                  cursor: selectedLanguages.length === 0 ? 'not-allowed' : 'pointer',
                  fontSize: 15, fontWeight: 700, letterSpacing: '0.01em',
                  boxShadow: selectedLanguages.length === 0 ? 'none' : '0 8px 24px rgba(245,158,11,0.30)',
                  transition: 'all 180ms ease',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <span>Continue · {selectedLanguages.length} selected</span>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════ STEP 4: Finding Music ════════════════════════════ */}
        {step === 4 && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            justifyContent: 'center', alignItems: 'center', textAlign: 'center',
            padding: '16px 24px', position: 'relative', zIndex: 10,
            animation: 'onbFadeIn 300ms ease',
          }}>
            {/* Animated waveform */}
            <div style={{ position: 'relative', width: 160, height: 160, marginBottom: 28 }}>
              <div style={{
                position: 'absolute', inset: -8, borderRadius: '50%',
                border: '2px solid rgba(245,158,11,0.4)',
                animation: 'onbPulse 2s ease-in-out infinite',
              }} />
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(245,158,11,0.18) 0%, rgba(245,158,11,0.03) 70%)',
              }} />
              <div style={{
                position: 'absolute', inset: 20, borderRadius: '50%',
                background: 'var(--color-surface)',
                border: '1.5px solid var(--color-border)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {[22, 40, 56, 36, 50, 28, 44].map((h, i) => (
                    <div key={i} style={{
                      width: 4, height: h, borderRadius: 3,
                      background: 'linear-gradient(to top, #F59E0B, #FBBF24)',
                      animation: `onbEq ${680 + i * 60}ms ease-in-out infinite alternate`,
                      animationDelay: `${i * 100}ms`,
                    }} />
                  ))}
                </div>
              </div>
            </div>

            <h2 style={{
              margin: '0 0 8px', fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.5rem, 5vw, 1.9rem)', fontWeight: 800,
              letterSpacing: '-0.022em', lineHeight: 1.2,
            }}>Finding music for you…</h2>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--color-text-secondary)', maxWidth: 280, lineHeight: 1.6 }}>
              We're creating your personalized music experience.
            </p>

            {/* Curation checklist */}
            <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
              {CURATION_STEPS.map((item, i) => {
                const isDone = curationIndex > i;
                const isActive = curationIndex === i;
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 12, textAlign: 'left',
                    background: isActive ? 'rgba(245,158,11,0.1)' : 'var(--color-surface)',
                    border: isActive ? '1.5px solid var(--color-accent)' : '1px solid var(--color-border)',
                    opacity: isDone || isActive ? 1 : 0.4,
                    transition: 'all 240ms ease',
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      background: isDone ? 'rgba(16,185,129,0.12)' : isActive ? 'rgba(245,158,11,0.12)' : 'var(--color-surface-2)',
                      border: `1px solid ${isDone ? 'rgba(16,185,129,0.35)' : isActive ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: isDone ? '#10B981' : isActive ? ACCENT : 'var(--color-text-muted)',
                      transition: 'all 220ms ease',
                    }}>
                      {isDone ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : <item.Icon />}
                    </div>
                    <span style={{
                      flex: 1, fontSize: 13, lineHeight: 1.3,
                      fontWeight: isActive ? 700 : 500,
                      color: isDone ? 'var(--color-text-primary)' : isActive ? ACCENT : 'var(--color-text-muted)',
                      transition: 'color 220ms ease',
                    }}>{item.label}</span>
                    {isActive && (
                      <div style={{
                        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                        background: ACCENT, animation: 'onbDot 0.9s ease-in-out infinite alternate',
                      }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Progress bar */}
            <div style={{ width: '100%', maxWidth: 320, height: 5, borderRadius: 3, background: 'var(--color-surface)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${progress}%`,
                background: 'linear-gradient(90deg, #F59E0B, #FCD34D)',
                borderRadius: 3, transition: 'width 80ms linear',
              }} />
            </div>
          </div>
        )}

        {/* ── Bottom CTA for Steps 1 & 2 ── */}
        {(step === 1 || step === 2) && (
          <div style={{
            flexShrink: 0,
            padding: '12px 16px',
            paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
            position: 'relative', zIndex: 10,
            background: 'var(--color-bg)',
          }}>
            <button
              onClick={() => setStep(prev => (prev + 1) as 2|3|4)}
              style={{
                width: '100%', height: 52,
                borderRadius: 999,
                background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                color: '#fff', border: 'none', cursor: 'pointer',
                fontSize: 15, fontWeight: 700, letterSpacing: '0.01em',
                boxShadow: '0 10px 28px rgba(245,158,11,0.30)',
                transition: 'all 180ms ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <span>{step === 1 ? 'Get Started' : 'Continue'}</span>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </>
  );
}
