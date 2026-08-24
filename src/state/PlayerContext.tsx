import React, { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import type { Song, RepeatMode, PlayerState, AudioQuality } from '../data/models';
import { audioPlayer } from '../domain/player/AudioPlayer';
import type { AudioPlayerEvent } from '../domain/player/AudioPlayer';

import { CONTINUE_LISTENING_KEY } from '../domain/player/AudioPlayer';

// ─── Initial State ────────────────────────────────────────────────────────────

function getInitialPlayerState(): PlayerState {
  const defaultState: PlayerState = {
    currentSong: null,
    queue: [],
    queueIndex: 0,
    isPlaying: false,
    progress: 0,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    shuffle: false,
    repeat: 'off',
    isLoading: false,
    error: null,
    showFullPlayer: false,
    showQueue: false,
    showLyrics: false,
    autoPlay: true,
    ridingMode: audioPlayer.ridingMode,
  };

  try {
    const raw = localStorage.getItem(CONTINUE_LISTENING_KEY);
    if (raw) {
      const session = JSON.parse(raw);
      if (session && session.song) {
        return {
          ...defaultState,
          currentSong: session.song,
          queue: session.queue && session.queue.length > 0 ? session.queue : [session.song],
          queueIndex: session.queueIndex !== undefined ? session.queueIndex : 0,
          currentTime: session.playbackPosition || 0,
          duration: session.duration || session.song.duration || 0,
          progress: session.progress || (session.duration > 0 ? (session.playbackPosition / session.duration) : 0),
          isPlaying: false,
          error: null,
        };
      }
    }
  } catch {}

  return defaultState;
}

const initialState: PlayerState = getInitialPlayerState();

// ─── Actions ──────────────────────────────────────────────────────────────────

type PlayerAction =
  | { type: 'SET_PLAYING'; payload: boolean }
  | { type: 'SET_SONG'; payload: Song | null }
  | { type: 'SET_PROGRESS'; payload: { currentTime: number; duration: number; progress: number } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_QUEUE'; payload: { queue: Song[]; queueIndex: number } }
  | { type: 'SET_SHUFFLE'; payload: boolean }
  | { type: 'SET_REPEAT'; payload: RepeatMode }
  | { type: 'SET_VOLUME'; payload: number }
  | { type: 'SET_MUTED'; payload: boolean }
  | { type: 'SET_AUTOPLAY'; payload: boolean }
  | { type: 'SET_RIDING_MODE'; payload: boolean }
  | { type: 'SHOW_FULL_PLAYER'; payload: boolean }
  | { type: 'SHOW_QUEUE'; payload: boolean }
  | { type: 'SHOW_LYRICS'; payload: boolean };

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'SET_PLAYING':    return { ...state, isPlaying: action.payload, error: action.payload ? null : state.error };
    case 'SET_SONG':       return { ...state, currentSong: action.payload, error: null };
    case 'SET_PROGRESS':   return { ...state, ...action.payload, error: state.error && state.isPlaying ? null : state.error };
    case 'SET_LOADING':    return { ...state, isLoading: action.payload };
    case 'SET_ERROR':      return { ...state, error: action.payload, isLoading: false };
    case 'SET_QUEUE':      return { ...state, queue: action.payload.queue, queueIndex: action.payload.queueIndex };
    case 'SET_SHUFFLE':    return { ...state, shuffle: action.payload };
    case 'SET_REPEAT':     return { ...state, repeat: action.payload };
    case 'SET_VOLUME':     return { ...state, volume: action.payload };
    case 'SET_MUTED':      return { ...state, isMuted: action.payload };
    case 'SET_AUTOPLAY':   return { ...state, autoPlay: action.payload };
    case 'SET_RIDING_MODE': return { ...state, ridingMode: action.payload };
    case 'SHOW_FULL_PLAYER': return { ...state, showFullPlayer: action.payload };
    case 'SHOW_QUEUE':     return { ...state, showQueue: action.payload };
    case 'SHOW_LYRICS':    return { ...state, showLyrics: action.payload };
    default:               return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface PlayerContextValue {
  state: PlayerState;
  playSong: (song: Song, queue?: Song[], startIndex?: number) => void;
  togglePlay: () => void;
  next: () => void;
  previous: (force?: boolean) => void;
  seek: (progress: number) => void;
  seekToTime: (seconds: number) => void;
  setVolume: (v: number) => void;
  setAudioQuality: (q: AudioQuality) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleAutoPlay: () => void;
  setAutoPlay: (enabled: boolean) => void;
  toggleRidingMode: () => void;
  setRidingMode: (enabled: boolean) => void;
  addToQueue: (song: Song) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  reorderQueue: (from: number, to: number) => void;
  openFullPlayer: () => void;
  closeFullPlayer: () => void;
  openQueue: () => void;
  closeQueue: () => void;
  openLyrics: () => void;
  closeLyrics: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(playerReducer, initialState);

  // Subscribe to audio player events
  useEffect(() => {
    const unsubscribe = audioPlayer.subscribe((event: AudioPlayerEvent) => {
      switch (event.type) {
        case 'play':
          dispatch({ type: 'SET_PLAYING', payload: true });
          dispatch({ type: 'SET_LOADING', payload: false });
          break;
        case 'pause':
          dispatch({ type: 'SET_PLAYING', payload: false });
          dispatch({ type: 'SET_LOADING', payload: false });
          break;
        case 'ended':
          dispatch({ type: 'SET_PLAYING', payload: false });
          break;
        case 'timeupdate':
          dispatch({
            type: 'SET_PROGRESS',
            payload: { currentTime: event.currentTime, duration: event.duration, progress: event.progress },
          });
          break;
        case 'loading':
          dispatch({ type: 'SET_LOADING', payload: event.isLoading });
          break;
        case 'error':
          dispatch({ type: 'SET_ERROR', payload: event.error });
          break;
        case 'songchange':
          dispatch({ type: 'SET_SONG', payload: event.song });
          break;
        case 'queuechange':
          dispatch({
            type: 'SET_QUEUE',
            payload: { queue: [...audioPlayer.queue], queueIndex: audioPlayer.queueIndex },
          });
          break;
        case 'autoplaychange':
          dispatch({ type: 'SET_AUTOPLAY', payload: event.autoPlay });
          break;
        case 'automixchange':
          // Automix buffer updated in AudioPlayer
          break;
        case 'ridingmodechange':
          dispatch({ type: 'SET_RIDING_MODE', payload: event.ridingMode });
          break;
      }
    });
    return unsubscribe;
  }, []);

  const playSong = useCallback((song: Song, queue?: Song[], startIndex?: number) => {
    const targetQueue = queue && queue.length > 0 ? queue : [song];
    const initialIndex = startIndex !== undefined && startIndex >= 0 && startIndex < targetQueue.length
      ? startIndex
      : targetQueue.findIndex(s => s.id === song.id);
    const validIndex = initialIndex !== -1 ? initialIndex : 0;

    dispatch({ type: 'SET_ERROR', payload: null });
    audioPlayer.play(song, targetQueue, validIndex);
    dispatch({ type: 'SET_SONG', payload: song });
    dispatch({ type: 'SET_QUEUE', payload: { queue: targetQueue, queueIndex: validIndex } });
    dispatch({ type: 'SET_PROGRESS', payload: { currentTime: 0, duration: song.duration || 0, progress: 0 } });
  }, []);

  const togglePlay = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
    audioPlayer.togglePlay();
  }, []);
  const next = useCallback(() => audioPlayer.next(), []);
  const previous = useCallback((force = false) => audioPlayer.previous(force), []);
  const seek = useCallback((p: number) => audioPlayer.seek(p), []);
  const seekToTime = useCallback((seconds: number) => audioPlayer.seekToTime(seconds), []);

  const setVolume = useCallback((v: number) => {
    audioPlayer.volume = v;
    dispatch({ type: 'SET_VOLUME', payload: v });
  }, []);

  const setAudioQuality = useCallback((q: AudioQuality) => {
    audioPlayer.setAudioQuality(q);
  }, []);

  const toggleMute = useCallback(() => {
    const newMuted = !state.isMuted;
    dispatch({ type: 'SET_MUTED', payload: newMuted });
  }, [state.isMuted]);

  const toggleShuffle = useCallback(() => {
    const newShuffle = !state.shuffle;
    audioPlayer.shuffle = newShuffle;
    dispatch({ type: 'SET_SHUFFLE', payload: newShuffle });
    dispatch({ type: 'SET_QUEUE', payload: { queue: [...audioPlayer.queue], queueIndex: audioPlayer.queueIndex } });
  }, [state.shuffle]);

  const toggleRepeat = useCallback(() => {
    const modes: RepeatMode[] = ['off', 'all', 'one'];
    const nextMode = modes[(modes.indexOf(state.repeat) + 1) % modes.length];
    audioPlayer.repeat = nextMode;
    dispatch({ type: 'SET_REPEAT', payload: nextMode });
  }, [state.repeat]);

  const toggleAutoPlay = useCallback(() => {
    const nextVal = !audioPlayer.autoPlay;
    audioPlayer.autoPlay = nextVal;
    dispatch({ type: 'SET_AUTOPLAY', payload: nextVal });
    try {
      const cfg = JSON.parse(localStorage.getItem('sw_config') || '{}');
      cfg.autoPlay = nextVal;
      localStorage.setItem('sw_config', JSON.stringify(cfg));
    } catch {}
  }, []);

  const setAutoPlay = useCallback((enabled: boolean) => {
    audioPlayer.autoPlay = enabled;
    dispatch({ type: 'SET_AUTOPLAY', payload: enabled });
    try {
      const cfg = JSON.parse(localStorage.getItem('sw_config') || '{}');
      cfg.autoPlay = enabled;
      localStorage.setItem('sw_config', JSON.stringify(cfg));
    } catch {}
  }, []);

  const toggleRidingMode = useCallback(() => {
    const nextVal = audioPlayer.toggleRidingMode();
    dispatch({ type: 'SET_RIDING_MODE', payload: nextVal });
  }, []);

  const setRidingMode = useCallback((enabled: boolean) => {
    audioPlayer.ridingMode = enabled;
    dispatch({ type: 'SET_RIDING_MODE', payload: enabled });
  }, []);

  const addToQueue = useCallback((song: Song) => audioPlayer.addToQueue(song), []);
  const removeFromQueue = useCallback((i: number) => audioPlayer.removeFromQueue(i), []);
  const clearQueue = useCallback(() => audioPlayer.clearQueue(), []);
  const reorderQueue = useCallback((from: number, to: number) => audioPlayer.reorderQueue(from, to), []);

  const openFullPlayer  = useCallback(() => dispatch({ type: 'SHOW_FULL_PLAYER', payload: true }), []);
  const closeFullPlayer = useCallback(() => dispatch({ type: 'SHOW_FULL_PLAYER', payload: false }), []);
  const openQueue       = useCallback(() => dispatch({ type: 'SHOW_QUEUE', payload: true }), []);
  const closeQueue      = useCallback(() => dispatch({ type: 'SHOW_QUEUE', payload: false }), []);
  const openLyrics      = useCallback(() => dispatch({ type: 'SHOW_LYRICS', payload: true }), []);
  const closeLyrics     = useCallback(() => dispatch({ type: 'SHOW_LYRICS', payload: false }), []);

  return (
    <PlayerContext.Provider value={{
      state, playSong, togglePlay, next, previous, seek, seekToTime,
      setVolume, setAudioQuality, toggleMute, toggleShuffle, toggleRepeat,
      toggleAutoPlay, setAutoPlay,
      toggleRidingMode, setRidingMode,
      addToQueue, removeFromQueue, clearQueue, reorderQueue,
      openFullPlayer, closeFullPlayer, openQueue, closeQueue, openLyrics, closeLyrics,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
