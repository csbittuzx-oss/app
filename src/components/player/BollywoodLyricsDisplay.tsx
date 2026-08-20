// ═════════════════════════════════════════════════════════════════════
//  Bollywood Poster Style Synced Lyrics Display
//  • Authentic Vintage Bollywood Movie Poster Typography (like GHAYAL)
//  • Blood-Red Slab-Serif Display Font on Warm Cream Poster Board
//  • Word-by-Word Assemble Animation (Top/Bottom Alternating Drop-in + Snap Bounce)
//  • Playback-Synced Progressive Reveal (No future lyrics shown upfront)
// ═════════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState, useMemo } from 'react';
import type { Lyrics, Song } from '../../data/models';

interface BollywoodLyricsDisplayProps {
  lyrics: Lyrics | null;
  currentTime: number;
  activeLineIndex: number;
  onSeek: (time: number) => void;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  currentSong: Song;
}

// Pseudo-random deterministic tilt angles for authentic hand-cut letterpress look
const WORD_TILTS = [-2, 1.5, -1, 2, -1.8, 1.2, -0.8, 1.8, -1.4, 2.2];

export const BollywoodLyricsDisplay: React.FC<BollywoodLyricsDisplayProps> = ({
  lyrics,
  currentTime,
  activeLineIndex,
  onSeek,
  loading,
  error,
  onRetry,
  currentSong,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const prevLineIndexRef = useRef<number>(-1);
  const [isSeekJump, setIsSeekJump] = useState(false);
  const [lineAssembleFinished, setLineAssembleFinished] = useState(false);

  // Detect whether line change is a normal progressive step (+1) or a manual seek jump
  useEffect(() => {
    if (activeLineIndex !== prevLineIndexRef.current) {
      const step = activeLineIndex - prevLineIndexRef.current;
      const isProgressive = step === 1;
      setIsSeekJump(!isProgressive);
      setLineAssembleFinished(false);
      prevLineIndexRef.current = activeLineIndex;

      // Timer to trigger post-assemble pulse once all words settle
      if (activeLineIndex >= 0 && lyrics?.lines?.[activeLineIndex]) {
        const wordCount = lyrics.lines[activeLineIndex].text.trim().split(/\s+/).length;
        const totalDuration = wordCount * 95 + 300;
        const timer = setTimeout(() => {
          setLineAssembleFinished(true);
        }, totalDuration);
        return () => clearTimeout(timer);
      }
    }
  }, [activeLineIndex, lyrics]);

  // Smoothly center the active line inside the poster board
  useEffect(() => {
    if (activeLineRef.current && containerRef.current) {
      const container = containerRef.current;
      const activeEl = activeLineRef.current;
      const targetTop = activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2;
      container.scrollTo({
        top: Math.max(0, targetTop),
        behavior: isSeekJump ? 'auto' : 'smooth',
      });
    }
  }, [activeLineIndex, isSeekJump]);

  // Split lines into past, active, and upcoming
  const { pastLines, currentLine, hasUpcoming } = useMemo(() => {
    if (!lyrics || lyrics.lines.length === 0) {
      return { pastLines: [], currentLine: null, hasUpcoming: false };
    }

    if (!lyrics.synced) {
      // For non-synced lyrics, treat all lines as readable list
      return { pastLines: [], currentLine: null, hasUpcoming: false };
    }

    const activeIdx = activeLineIndex >= 0 ? activeLineIndex : 0;
    const startIdx = Math.max(0, activeIdx - 2);
    const past = lyrics.lines.slice(startIdx, activeIdx).map((line, idx) => ({
      line,
      originalIndex: startIdx + idx,
    }));

    const cur = activeLineIndex >= 0 && activeLineIndex < lyrics.lines.length
      ? { line: lyrics.lines[activeLineIndex], originalIndex: activeLineIndex }
      : null;

    const upcoming = activeLineIndex < lyrics.lines.length - 1;

    return { pastLines: past, currentLine: cur, hasUpcoming: upcoming };
  }, [lyrics, activeLineIndex]);

  // ── Render Loading State ──
  if (loading) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '60px 20px',
        color: '#B22222',
      }}>
        <div style={{
          width: 50,
          height: 50,
          border: '4px solid rgba(178, 34, 34, 0.2)',
          borderTopColor: '#B22222',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{
          fontFamily: "'Alfa Slab One', 'Ultra', 'Impact', serif",
          fontSize: 'var(--text-base)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#8B0000',
        }}>
          Synchronizing Bollywood Lyrics...
        </span>
      </div>
    );
  }

  // ── Render Error State ──
  if (error || !lyrics || lyrics.lines.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        textAlign: 'center',
      }}>
        <div style={{
          padding: '24px',
          background: 'linear-gradient(145deg, #FFF6E5 0%, #F5E5C4 100%)',
          borderRadius: 'var(--radius-xl)',
          border: '2px solid #D9C39E',
          boxShadow: '0 12px 36px rgba(0,0,0,0.3)',
          maxWidth: 320,
        }}>
          <div style={{
            fontFamily: "'Alfa Slab One', 'Ultra', 'Impact', serif",
            fontSize: 'var(--text-xl)',
            color: '#8B0000',
            textTransform: 'uppercase',
            marginBottom: 8,
            letterSpacing: '0.04em',
            textShadow: '1px 1px 0px #380000',
          }}>
            Lyrics Not Synchronized
          </div>
          <p style={{
            fontSize: 'var(--text-xs)',
            color: '#5C4A32',
            margin: '0 0 16px',
            lineHeight: 1.5,
          }}>
            Real-time synced lyrics for this song haven't been synchronized yet. Enjoy the music!
          </p>
          <button
            onClick={onRetry}
            style={{
              background: 'linear-gradient(180deg, #B22222 0%, #8B0000 100%)',
              color: '#FFF',
              border: '2px solid #4A0000',
              borderRadius: 'var(--radius-full)',
              padding: '10px 22px',
              fontFamily: "'Alfa Slab One', 'Ultra', 'Impact', serif",
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(139, 0, 0, 0.4)',
            }}
          >
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '40px 16px 120px',
        scrollbarWidth: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100%',
        boxSizing: 'border-box',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* ── Main Vintage Bollywood Poster Card ── */}
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'linear-gradient(155deg, #FFF8EC 0%, #F6E7CA 50%, #ECE0BC 100%)',
          borderRadius: 'var(--radius-xl, 20px)',
          border: '3px solid #D8C39E',
          boxShadow: 'inset 0 0 35px rgba(160, 110, 60, 0.18), 0 20px 50px rgba(0, 0, 0, 0.55)',
          padding: '24px 20px 28px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'relative',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* Subtle Decorative Poster Header Ribbon */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 20,
          opacity: 0.85,
        }}>
          <span style={{ color: '#8B0000', fontSize: '10px' }}>★</span>
          <span style={{
            fontFamily: "'Alfa Slab One', 'Ultra', 'Impact', serif",
            fontSize: '10px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#7A1010',
            textShadow: '0.5px 0.5px 0px #FFF',
          }}>
            SOUNDWAVE CINEMA LYRICS
          </span>
          <span style={{ color: '#8B0000', fontSize: '10px' }}>★</span>
        </div>

        {/* ── Progressive Synced Lyrics Flow ── */}
        {lyrics.synced ? (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            {/* 1. Previous / Past Lines (Fading Out Above) */}
            {pastLines.map(({ line, originalIndex }) => (
              <div
                key={`past_${originalIndex}`}
                onClick={() => line.time !== undefined && onSeek(line.time)}
                style={{
                  fontFamily: "'Alfa Slab One', 'Ultra', 'Rubik Dirt', 'Impact', serif",
                  fontSize: 'clamp(1.1rem, 3.8vw, 1.45rem)',
                  lineHeight: 1.25,
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  letterSpacing: '0.02em',
                  color: '#8B0000',
                  opacity: 0.28,
                  transform: 'scale(0.92) translate3d(0, -6px, 0)',
                  transition: 'opacity 300ms ease, transform 300ms ease',
                  cursor: 'pointer',
                  userSelect: 'none',
                  textShadow: '1px 1px 0px #380000',
                }}
              >
                {line.text}
              </div>
            ))}

            {/* 2. Current Active Line with Word-by-Word Assemble Animation */}
            {currentLine ? (
              <div
                ref={activeLineRef}
                className={lineAssembleFinished ? 'bollywood-line-active-pulse' : ''}
                style={{
                  width: '100%',
                  padding: '16px 8px',
                  background: 'rgba(255, 255, 255, 0.45)',
                  borderRadius: 'var(--radius-lg, 16px)',
                  border: '1.5px dashed rgba(139, 0, 0, 0.3)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px 10px',
                  boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.04), 0 4px 16px rgba(139, 0, 0, 0.08)',
                  margin: '4px 0',
                }}
              >
                {currentLine.line.text.trim().split(/\s+/).map((word, wordIdx) => {
                  const tilt = WORD_TILTS[wordIdx % WORD_TILTS.length];
                  const isTopDrop = wordIdx % 2 === 0;
                  const delayMs = isSeekJump ? 0 : wordIdx * 90;

                  return (
                    <span
                      key={`word_${currentLine.originalIndex}_${wordIdx}_${word}`}
                      style={{
                        display: 'inline-block',
                        fontFamily: "'Alfa Slab One', 'Ultra', 'Rubik Dirt', 'Impact', serif",
                        fontSize: 'clamp(1.75rem, 5.8vw, 2.5rem)',
                        fontWeight: 900,
                        lineHeight: 1.15,
                        textTransform: 'uppercase',
                        letterSpacing: '-0.01em',
                        color: '#9E0D0D',
                        textShadow: '2.5px 2.5px 0px #350000, -1px -1px 0px #350000, 1px -1px 0px #350000, -1px 1px 0px #350000, 0 6px 18px rgba(158, 13, 13, 0.45)',
                        animation: isSeekJump
                          ? 'none'
                          : `${isTopDrop ? 'bollywoodDropInTop' : 'bollywoodRiseInBottom'} 260ms cubic-bezier(0.34, 1.56, 0.64, 1) ${delayMs}ms both`,
                        transform: isSeekJump ? `rotate(${tilt}deg)` : undefined,
                        willChange: 'transform, opacity',
                      }}
                    >
                      {word}
                    </span>
                  );
                })}
              </div>
            ) : (
              <div style={{
                fontFamily: "'Alfa Slab One', 'Ultra', 'Impact', serif",
                fontSize: 'var(--text-lg)',
                color: '#8B0000',
                opacity: 0.5,
                textTransform: 'uppercase',
                padding: '24px 0',
              }}>
                ♪ Instrumental Break ♪
              </div>
            )}

            {/* 3. Upcoming Lyrics: Strictly hidden upfront for progressive reveal */}
            {hasUpcoming && (
              <div style={{
                display: 'flex',
                gap: 6,
                marginTop: 8,
                opacity: 0.4,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8B0000' }} />
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8B0000' }} />
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8B0000' }} />
              </div>
            )}
          </div>
        ) : (
          /* Non-synced Lyrics Full View on Poster Board */
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {lyrics.lines.map((line, idx) => (
              <p
                key={idx}
                style={{
                  margin: 0,
                  fontFamily: "'Alfa Slab One', 'Ultra', 'Rubik Dirt', 'Impact', serif",
                  fontSize: 'clamp(1.2rem, 4.2vw, 1.55rem)',
                  lineHeight: 1.3,
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  color: '#9E0D0D',
                  letterSpacing: '0.01em',
                  textShadow: '1.5px 1.5px 0px #350000, 0 4px 12px rgba(158, 13, 13, 0.3)',
                }}
              >
                {line.text}
              </p>
            ))}
          </div>
        )}

        {/* Poster Bottom Accent Label */}
        <div style={{
          marginTop: 22,
          paddingTop: 12,
          borderTop: '1px solid rgba(139, 0, 0, 0.15)',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          fontFamily: 'var(--font-body)',
          color: '#7A1010',
          fontWeight: 600,
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
            {currentSong.title}
          </span>
          <span style={{ color: '#8B0000', fontWeight: 700 }}>
            {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')}
          </span>
        </div>
      </div>
    </div>
  );
};
