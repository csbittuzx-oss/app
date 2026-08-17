import { createContext, useContext, useReducer, useEffect, useState, useRef, type ReactNode } from 'react';
import type { Song, Artist, Playlist, AppConfig, Screen } from '../data/models';
import { userProfileTracker } from '../domain/recommendation/UserProfileTracker';
import { aiTasteProfileEngine } from '../domain/ai/AITasteProfileEngine';

// ─── LocalStorage helpers ───────────────────────────────────────────────────

function lsGet<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded or private mode
  }
}

// ─── State ───────────────────────────────────────────────────────────────────

export interface AppState {
  theme: 'dark' | 'light';
  favorites: Song[];
  favoriteArtists: Artist[];
  recentlyPlayed: Song[];
  searchRecentlyPlayed: Song[];
  searchHistory: string[];
  userPlaylists: Playlist[];
  downloads: Song[];
  config: AppConfig;
  onboardingCompleted: boolean;
  userGender: string;
  musicLanguages: string[];
}

const defaultConfig: AppConfig = {
  lastfmApiKey: '',
  jamendoClientId: '',
  audioQuality: 'high',
  autoUpdate: true,
};

const initialState: AppState = {
  theme: lsGet<'dark' | 'light'>('sw_theme', 'light'),
  favorites: lsGet<Song[]>('sw_favorites', []),
  favoriteArtists: lsGet<Artist[]>('sw_fav_artists', []),
  recentlyPlayed: lsGet<Song[]>('sw_recently_played', []),
  searchRecentlyPlayed: lsGet<Song[]>('sw_search_recently_played', []),
  searchHistory: lsGet<string[]>('sw_search_history', []),
  userPlaylists: lsGet<Playlist[]>('sw_playlists', []),
  downloads: lsGet<Song[]>('sw_downloads', []),
  config: lsGet<AppConfig>('sw_config', defaultConfig),
  onboardingCompleted: lsGet<boolean>('sw_onboarding_done', false),
  userGender: lsGet<string>('sw_user_gender', ''),
  musicLanguages: lsGet<string[]>('sw_music_languages', ['Hindi', 'International', 'Punjabi']),
};

// ─── Actions ──────────────────────────────────────────────────────────────────

type AppAction =
  | { type: 'SET_THEME'; payload: 'dark' | 'light' }
  | { type: 'RESET_APP' }
  | { type: 'COMPLETE_ONBOARDING'; payload: { gender?: string; languages: string[] } }
  | { type: 'SET_MUSIC_LANGUAGES'; payload: string[] }
  | { type: 'RESET_ONBOARDING' }
  | { type: 'TOGGLE_FAVORITE'; payload: Song }
  | { type: 'TOGGLE_FAVORITE_ARTIST'; payload: Artist }
  | { type: 'ADD_RECENTLY_PLAYED'; payload: Song }
  | { type: 'REMOVE_RECENTLY_PLAYED'; payload: string }
  | { type: 'CLEAR_RECENTLY_PLAYED' }
  | { type: 'ADD_SEARCH_RECENT_PLAYED'; payload: Song }
  | { type: 'REMOVE_SEARCH_RECENT_PLAYED'; payload: string }
  | { type: 'CLEAR_SEARCH_RECENT_PLAYED' }
  | { type: 'ADD_SEARCH_HISTORY'; payload: string }
  | { type: 'REMOVE_SEARCH_HISTORY'; payload: string }
  | { type: 'CLEAR_SEARCH_HISTORY' }
  | { type: 'ADD_DOWNLOAD'; payload: Song }
  | { type: 'REMOVE_DOWNLOAD'; payload: string }
  | { type: 'CREATE_PLAYLIST'; payload: { title: string; description?: string } }
  | { type: 'IMPORT_PLAYLIST'; payload: Playlist }
  | { type: 'UPDATE_PLAYLIST_TITLE'; payload: { playlistId: string; title: string } }
  | { type: 'UPDATE_PLAYLIST_TRACKS'; payload: { playlistId: string; tracks: Song[] } }
  | { type: 'TOGGLE_PIN_PLAYLIST'; payload: string }
  | { type: 'ADD_TO_PLAYLIST'; payload: { playlistId: string; song: Song } }
  | { type: 'REMOVE_FROM_PLAYLIST'; payload: { playlistId: string; songId: string } }
  | { type: 'DELETE_PLAYLIST'; payload: string }
  | { type: 'SET_CONFIG'; payload: Partial<AppConfig> };

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_THEME': {
      lsSet('sw_theme', action.payload);
      return { ...state, theme: action.payload };
    }
    case 'COMPLETE_ONBOARDING': {
      const gender = action.payload.gender || '';
      const languages = action.payload.languages.length > 0 ? action.payload.languages : ['Hindi', 'International'];
      lsSet('sw_onboarding_done', true);
      lsSet('sw_user_gender', gender);
      lsSet('sw_music_languages', languages);
      try {
        localStorage.removeItem('sw_home_sections_cache');
        localStorage.removeItem('sw_curated_shelves_cache');
      } catch {}
      return {
        ...state,
        onboardingCompleted: true,
        userGender: gender,
        musicLanguages: languages,
      };
    }
    case 'SET_MUSIC_LANGUAGES': {
      lsSet('sw_music_languages', action.payload);
      try {
        localStorage.removeItem('sw_home_sections_cache');
        localStorage.removeItem('sw_curated_shelves_cache');
      } catch {}
      return { ...state, musicLanguages: action.payload };
    }
    case 'RESET_ONBOARDING': {
      lsSet('sw_onboarding_done', false);
      return { ...state, onboardingCompleted: false };
    }
    case 'RESET_APP': {
      try {
        localStorage.clear();
      } catch {}
      return {
        theme: 'light',
        favorites: [],
        favoriteArtists: [],
        recentlyPlayed: [],
        searchRecentlyPlayed: [],
        searchHistory: [],
        userPlaylists: [],
        downloads: [],
        config: defaultConfig,
        onboardingCompleted: false,
        userGender: '',
        musicLanguages: ['Hindi', 'International', 'Punjabi'],
      };
    }
    case 'TOGGLE_FAVORITE': {
      const song = action.payload;
      const exists = state.favorites.some((f) => f.id === song.id);
      const favorites = exists
        ? state.favorites.filter((f) => f.id !== song.id)
        : [{ ...song, isLiked: true }, ...state.favorites];
      lsSet('sw_favorites', favorites);
      return { ...state, favorites };
    }
    case 'TOGGLE_FAVORITE_ARTIST': {
      const artist = action.payload;
      const exists = state.favoriteArtists.some((a) => a.id === artist.id);
      const favoriteArtists = exists
        ? state.favoriteArtists.filter((a) => a.id !== artist.id)
        : [artist, ...state.favoriteArtists];
      lsSet('sw_fav_artists', favoriteArtists);
      return { ...state, favoriteArtists };
    }
    case 'ADD_RECENTLY_PLAYED': {
      const filtered = state.recentlyPlayed.filter((s) => s.id !== action.payload.id);
      const recentlyPlayed = [action.payload, ...filtered].slice(0, 50);
      lsSet('sw_recently_played', recentlyPlayed);
      return { ...state, recentlyPlayed };
    }
    case 'REMOVE_RECENTLY_PLAYED': {
      const recentlyPlayed = state.recentlyPlayed.filter((s) => s.id !== action.payload);
      lsSet('sw_recently_played', recentlyPlayed);
      return { ...state, recentlyPlayed };
    }
    case 'CLEAR_RECENTLY_PLAYED': {
      lsSet('sw_recently_played', []);
      return { ...state, recentlyPlayed: [] };
    }
    case 'ADD_SEARCH_RECENT_PLAYED': {
      const filtered = state.searchRecentlyPlayed.filter((s) => s.id !== action.payload.id);
      const searchRecentlyPlayed = [action.payload, ...filtered].slice(0, 30);
      lsSet('sw_search_recently_played', searchRecentlyPlayed);
      return { ...state, searchRecentlyPlayed };
    }
    case 'REMOVE_SEARCH_RECENT_PLAYED': {
      const searchRecentlyPlayed = state.searchRecentlyPlayed.filter((s) => s.id !== action.payload);
      lsSet('sw_search_recently_played', searchRecentlyPlayed);
      return { ...state, searchRecentlyPlayed };
    }
    case 'CLEAR_SEARCH_RECENT_PLAYED': {
      lsSet('sw_search_recently_played', []);
      return { ...state, searchRecentlyPlayed: [] };
    }
    case 'ADD_SEARCH_HISTORY': {
      if (!action.payload.trim()) return state;
      try {
        userProfileTracker.recordSearch(action.payload);
        aiTasteProfileEngine.recordSearch(action.payload);
      } catch {}
      const filtered = state.searchHistory.filter((s) => s !== action.payload);
      const searchHistory = [action.payload, ...filtered].slice(0, 30);
      lsSet('sw_search_history', searchHistory);
      return { ...state, searchHistory };
    }
    case 'REMOVE_SEARCH_HISTORY': {
      const searchHistory = state.searchHistory.filter((s) => s !== action.payload);
      lsSet('sw_search_history', searchHistory);
      return { ...state, searchHistory };
    }
    case 'CLEAR_SEARCH_HISTORY': {
      lsSet('sw_search_history', []);
      return { ...state, searchHistory: [] };
    }
    case 'ADD_DOWNLOAD': {
      const exists = state.downloads.some((d) => d.id === action.payload.id);
      if (exists) return state;
      const downloads = [{ ...action.payload, isDownloaded: true }, ...state.downloads];
      lsSet('sw_downloads', downloads);
      return { ...state, downloads };
    }
    case 'REMOVE_DOWNLOAD': {
      const downloads = state.downloads.filter((d) => d.id !== action.payload);
      lsSet('sw_downloads', downloads);
      return { ...state, downloads };
    }
    case 'CREATE_PLAYLIST': {
      const playlist: Playlist = {
        id: generateId(),
        title: action.payload.title,
        description: action.payload.description,
        artwork: '',
        creator: 'You',
        tracks: [],
        isUserCreated: true,
        totalDuration: 0,
      };
      const userPlaylists = [playlist, ...state.userPlaylists];
      lsSet('sw_playlists', userPlaylists);
      return { ...state, userPlaylists };
    }
    case 'IMPORT_PLAYLIST': {
      const filtered = state.userPlaylists.filter((p) => p.id !== action.payload.id);
      const userPlaylists = [action.payload, ...filtered];
      lsSet('sw_playlists', userPlaylists);
      return { ...state, userPlaylists };
    }
    case 'UPDATE_PLAYLIST_TITLE': {
      const userPlaylists = state.userPlaylists.map((p) => {
        if (p.id !== action.payload.playlistId) return p;
        return { ...p, title: action.payload.title.trim() || p.title };
      });
      lsSet('sw_playlists', userPlaylists);
      return { ...state, userPlaylists };
    }
    case 'UPDATE_PLAYLIST_TRACKS': {
      const userPlaylists = state.userPlaylists.map((p) => {
        if (p.id !== action.payload.playlistId) return p;
        return {
          ...p,
          tracks: action.payload.tracks,
          totalDuration: action.payload.tracks.reduce((sum, s) => sum + s.duration, 0),
        };
      });
      lsSet('sw_playlists', userPlaylists);
      return { ...state, userPlaylists };
    }
    case 'TOGGLE_PIN_PLAYLIST': {
      const userPlaylists = state.userPlaylists.map((p) => {
        if (p.id !== action.payload) return p;
        return { ...p, isPinned: !p.isPinned };
      });
      lsSet('sw_playlists', userPlaylists);
      return { ...state, userPlaylists };
    }
    case 'ADD_TO_PLAYLIST': {
      const userPlaylists = state.userPlaylists.map((p) => {
        if (p.id !== action.payload.playlistId) return p;
        const tracks = [...p.tracks, action.payload.song];
        return {
          ...p,
          tracks,
          totalDuration: tracks.reduce((sum, s) => sum + s.duration, 0),
          artwork: p.artwork || action.payload.song.artwork,
        };
      });
      lsSet('sw_playlists', userPlaylists);
      return { ...state, userPlaylists };
    }
    case 'REMOVE_FROM_PLAYLIST': {
      const userPlaylists = state.userPlaylists.map((p) => {
        if (p.id !== action.payload.playlistId) return p;
        const tracks = p.tracks.filter((s) => s.id !== action.payload.songId);
        return { ...p, tracks, totalDuration: tracks.reduce((sum, s) => sum + s.duration, 0) };
      });
      lsSet('sw_playlists', userPlaylists);
      return { ...state, userPlaylists };
    }
    case 'DELETE_PLAYLIST': {
      const userPlaylists = state.userPlaylists.filter((p) => p.id !== action.payload);
      lsSet('sw_playlists', userPlaylists);
      return { ...state, userPlaylists };
    }
    case 'SET_CONFIG': {
      const config = { ...state.config, ...action.payload };
      lsSet('sw_config', config);
      return { ...state, config };
    }
    default:
      return state;
  }
}

function generateId(): string {
  return 'pl_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
}

// ─── Context ─────────────────────────────────────────────────────────────────

export interface NavState {
  screen: Screen;
  params?: Record<string, unknown>;
}

export interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  nav: {
    nav: NavState;
    history: NavState[];
    navigate: (screen: Screen, params?: Record<string, unknown>) => void;
    goBack: () => boolean;
  };
  isFavorite: (songId: string) => boolean;
  toggleFavorite: (song: Song) => void;
  isFavoriteArtist: (artistId: string) => boolean;
  toggleFavoriteArtist: (artist: Artist) => void;
  addRecentlyPlayed: (song: Song) => void;
  removeRecentlyPlayed: (songId: string) => void;
  clearRecentlyPlayed: () => void;
  addSearchRecentPlayed: (song: Song) => void;
  removeSearchRecentPlayed: (songId: string) => void;
  clearSearchRecentPlayed: () => void;
  addSearchHistory: (query: string) => void;
  removeSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;
  updatePlaylistTitle: (playlistId: string, title: string) => void;
  updatePlaylistTracks: (playlistId: string, tracks: Song[]) => void;
  addToPlaylist: (playlistId: string, song: Song) => void;
  removeFromPlaylist: (playlistId: string, songId: string) => void;
  togglePinPlaylist: (playlistId: string) => void;
  deletePlaylist: (playlistId: string) => void;
  resetApp: () => void;
  toggleDownload: (song: Song) => void;
  completeOnboarding: (languages: string[], gender?: string) => void;
  setMusicLanguages: (languages: string[]) => void;
  resetOnboarding: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [history, setHistory] = useState<NavState[]>([{ screen: 'home' }]);
  const historyRef = useRef<NavState[]>([{ screen: 'home' }]);

  const currentNav = history[history.length - 1] || { screen: 'home' };

  const navigate = (screen: Screen, params?: Record<string, unknown>) => {
    const last = historyRef.current[historyRef.current.length - 1];
    if (last && last.screen === screen && JSON.stringify(last.params || {}) === JSON.stringify(params || {})) {
      return;
    }
    const next = [...historyRef.current, { screen, params }];
    historyRef.current = next;
    setHistory(next);
  };

  const goBack = (): boolean => {
    if (historyRef.current.length > 1) {
      const next = historyRef.current.slice(0, -1);
      historyRef.current = next;
      setHistory(next);
      return true;
    }
    return false;
  };

  const isFavorite = (songId: string) => state.favorites.some((f) => f.id === songId);
  const toggleFavorite = (song: Song) => {
    const isCurrentlyFav = state.favorites.some((f) => f.id === song.id);
    aiTasteProfileEngine.recordSongLiked(song, !isCurrentlyFav);
    dispatch({ type: 'TOGGLE_FAVORITE', payload: song });
  };
  const isFavoriteArtist = (artistId: string) => state.favoriteArtists.some((a) => a.id === artistId);
  const toggleFavoriteArtist = (artist: Artist) => dispatch({ type: 'TOGGLE_FAVORITE_ARTIST', payload: artist });
  const addRecentlyPlayed = (song: Song) => dispatch({ type: 'ADD_RECENTLY_PLAYED', payload: song });
  const removeRecentlyPlayed = (songId: string) => dispatch({ type: 'REMOVE_RECENTLY_PLAYED', payload: songId });
  const clearRecentlyPlayed = () => dispatch({ type: 'CLEAR_RECENTLY_PLAYED' });
  const addSearchRecentPlayed = (song: Song) => dispatch({ type: 'ADD_SEARCH_RECENT_PLAYED', payload: song });
  const removeSearchRecentPlayed = (songId: string) => dispatch({ type: 'REMOVE_SEARCH_RECENT_PLAYED', payload: songId });
  const clearSearchRecentPlayed = () => dispatch({ type: 'CLEAR_SEARCH_RECENT_PLAYED' });
  const addSearchHistory = (query: string) => dispatch({ type: 'ADD_SEARCH_HISTORY', payload: query });
  const removeSearchHistory = (query: string) => dispatch({ type: 'REMOVE_SEARCH_HISTORY', payload: query });
  const clearSearchHistory = () => dispatch({ type: 'CLEAR_SEARCH_HISTORY' });
  const updatePlaylistTitle = (playlistId: string, title: string) => dispatch({ type: 'UPDATE_PLAYLIST_TITLE', payload: { playlistId, title } });
  const updatePlaylistTracks = (playlistId: string, tracks: Song[]) => dispatch({ type: 'UPDATE_PLAYLIST_TRACKS', payload: { playlistId, tracks } });
  const addToPlaylist = (playlistId: string, song: Song) => dispatch({ type: 'ADD_TO_PLAYLIST', payload: { playlistId, song } });
  const removeFromPlaylist = (playlistId: string, songId: string) => dispatch({ type: 'REMOVE_FROM_PLAYLIST', payload: { playlistId, songId } });
  const togglePinPlaylist = (playlistId: string) => dispatch({ type: 'TOGGLE_PIN_PLAYLIST', payload: playlistId });
  const deletePlaylist = (playlistId: string) => dispatch({ type: 'DELETE_PLAYLIST', payload: playlistId });
  const resetApp = () => dispatch({ type: 'RESET_APP' });
  const completeOnboarding = (languages: string[], gender?: string) => dispatch({ type: 'COMPLETE_ONBOARDING', payload: { languages, gender } });
  const setMusicLanguages = (languages: string[]) => dispatch({ type: 'SET_MUSIC_LANGUAGES', payload: languages });
  const resetOnboarding = () => dispatch({ type: 'RESET_ONBOARDING' });
  const toggleDownload = (song: Song) => {
    const isDownloaded = state.downloads.some((d) => d.id === song.id);
    if (isDownloaded) {
      dispatch({ type: 'REMOVE_DOWNLOAD', payload: song.id });
    } else {
      dispatch({ type: 'ADD_DOWNLOAD', payload: song });
    }
  };

  // Apply theme class to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', state.theme);
  }, [state.theme]);

  const value: AppContextValue = {
    state,
    dispatch,
    nav: {
      nav: currentNav,
      history,
      navigate,
      goBack,
    },
    isFavorite,
    toggleFavorite,
    isFavoriteArtist,
    toggleFavoriteArtist,
    addRecentlyPlayed,
    removeRecentlyPlayed,
    clearRecentlyPlayed,
    addSearchRecentPlayed,
    removeSearchRecentPlayed,
    clearSearchRecentPlayed,
    addSearchHistory,
    removeSearchHistory,
    clearSearchHistory,
    updatePlaylistTitle,
    updatePlaylistTracks,
    addToPlaylist,
    removeFromPlaylist,
    togglePinPlaylist,
    deletePlaylist,
    resetApp,
    toggleDownload,
    completeOnboarding,
    setMusicLanguages,
    resetOnboarding,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
