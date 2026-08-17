// ═══════════════════════════════════════════
//  Soundwave — Core Domain Models
// ═══════════════════════════════════════════

export interface Song {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId?: string;
  artwork: string;         // URL to album artwork
  artworkLg?: string;     // high-res artwork
  previewUrl: string | null; // 30s preview or full track URL
  duration: number;       // seconds
  trackNumber?: number;
  genre?: string;
  language?: string;
  year?: number;
  playCount?: number;
  popularity?: number;
  explicit?: boolean;
  provider: MusicProvider;
  externalUrl?: string;   // link to original source
  isLiked?: boolean;
  isDownloaded?: boolean;
}

export interface Artist {
  id: string;
  name: string;
  profileImage?: string;  // Dedicated official artist profile photo
  image: string;         // Alias to profileImage for backward compatibility
  imageLg?: string;
  genre?: string;
  bio?: string;
  followerCount?: number;
  isVerified?: boolean;
  provider: MusicProvider;
  externalUrl?: string;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  artwork: string;
  artworkLg?: string;
  year?: number;
  genre?: string;
  trackCount?: number;
  tracks?: Song[];
  provider: MusicProvider;
  externalUrl?: string;
}

export interface Playlist {
  id: string;
  title: string;
  description?: string;
  artwork: string;
  creator: string;
  tracks: Song[];
  isUserCreated: boolean;
  totalDuration?: number;
  isPinned?: boolean;
}

export interface Genre {
  id: string;
  name: string;
  color: string;
  image?: string;
}

export interface Lyrics {
  songId: string;
  lines: LyricsLine[];
  synced: boolean;
  source?: string;
}

export interface LyricsLine {
  time?: number;          // seconds, for synced lyrics
  timestamp_ms?: number;  // milliseconds, for high-precision karaoke sync
  text: string;
}

export interface TrackCanvas {
  songId: string;
  canvasUrl: string;      // Looping MP4 video URL
  type: 'video' | 'animated_image';
  source: 'spotify_canvas' | 'apple_motion' | 'echo_canvas';
}

export interface RecognitionResult {
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  releaseDate?: string;
  genres?: string[];
  song?: Song;
}

export interface ScrobbleConfig {
  listenbrainzEnabled: boolean;
  listenbrainzToken: string;
  lastfmEnabled: boolean;
  lastfmApiKey: string;
  lastfmSessionKey: string;
}

export interface SearchResult {
  songs: Song[];
  artists: Artist[];
  albums: Album[];
  query: string;
  total: number;
}

export type MusicProvider = 'itunes' | 'jamendo' | 'lastfm' | 'saavn' | 'youtube' | 'local';

export type RepeatMode = 'off' | 'one' | 'all';

export interface PlayerState {
  currentSong: Song | null;
  queue: Song[];
  queueIndex: number;
  isPlaying: boolean;
  progress: number;       // 0–1
  currentTime: number;    // seconds
  duration: number;       // seconds
  volume: number;         // 0–1
  isMuted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  isLoading: boolean;
  error: string | null;
  showFullPlayer: boolean;
  showQueue: boolean;
  showLyrics: boolean;
  autoPlay: boolean;
  ridingMode?: boolean;
  canvasEnabled?: boolean;
}

export type AudioQuality = 'high' | 'medium' | 'low';

export interface AppState {
  theme: 'dark' | 'light';
  favorites: Song[];
  favoriteArtists: Artist[];
  recentlyPlayed: Song[];
  searchHistory: string[];
  userPlaylists: Playlist[];
  downloads: Song[];
  config: AppConfig;
}

export interface AppConfig {
  lastfmApiKey: string;
  lastfmSessionKey?: string;
  listenbrainzToken?: string;
  jamendoClientId: string;
  audioQuality?: AudioQuality;
  autoPlay?: boolean;
  autoUpdate?: boolean;
  canvasBackdropEnabled?: boolean;
  listenbrainzEnabled?: boolean;
  lastfmEnabled?: boolean;
}

export type Screen =
  | 'home'
  | 'search'
  | 'library'
  | 'downloads'
  | 'profile'
  | 'settings'
  | 'artist'
  | 'album'
  | 'playlist'
  | 'queue'
  | 'lyrics';

export interface NavigationState {
  screen: Screen;
  params?: Record<string, string | number>;
}
