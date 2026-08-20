// ═══════════════════════════════════════════════════════════════════
//  YouTube Music InnerTube Browse Domain Models
//  Supports FEmusic_home, FEmusic_explore, FEmusic_charts, & Mood feeds
// ═══════════════════════════════════════════════════════════════════

import type { Song, Album, Playlist, Artist } from './index';

export interface Thumbnail {
  url: string;
  width?: number;
  height?: number;
}

export interface NavigationEndpoint {
  browseId?: string;
  params?: string;
  videoId?: string;
  playlistId?: string;
}

export interface ArtistRef {
  name: string;
  id?: string;
  browseId?: string;
}

export interface AlbumRef {
  name: string;
  id?: string;
  browseId?: string;
}

export type HomeItemType = 'song' | 'video' | 'album' | 'playlist' | 'artist' | 'shorts';

export interface BaseHomeItem {
  id: string;
  title: string;
  thumbnail: string;
  thumbnails?: Thumbnail[];
  endpoint?: NavigationEndpoint;
  explicit?: boolean;
}

export interface SongItem extends BaseHomeItem {
  type: 'song' | 'video' | 'shorts';
  videoId: string;
  artist: string;
  artists?: ArtistRef[];
  album?: AlbumRef;
  duration?: number;
  durationText?: string;
  playCount?: number;
  playCountText?: string;
  rank?: number;
  isVideo?: boolean;
  isShorts?: boolean;
}

export interface AlbumItem extends BaseHomeItem {
  type: 'album';
  browseId: string;
  artist: string;
  artists?: ArtistRef[];
  year?: string;
  songCount?: number;
  songCountText?: string;
}

export interface PlaylistItem extends BaseHomeItem {
  type: 'playlist';
  browseId: string;
  playlistId?: string;
  author?: string;
  songCount?: number;
  songCountText?: string;
  description?: string;
}

export interface ArtistItem extends BaseHomeItem {
  type: 'artist';
  browseId: string;
  name: string;
  title: string;
  subscribers?: string;
  subscribersCount?: number;
}

export type HomeItem = SongItem | AlbumItem | PlaylistItem | ArtistItem;

export interface HomePageChip {
  title: string;
  params: string;
  endpoint?: {
    browseId: string;
    params: string;
  };
  isSelected?: boolean;
}

export interface HomePageSection {
  id: string;
  title: string;
  subtitle?: string;
  strapline?: string;
  badge?: string;
  items: HomeItem[];
  params?: string;
  continuation?: string;
}

export interface HomePage {
  chips: HomePageChip[];
  sections: HomePageSection[];
  continuation?: string;
}

export interface MoodOrGenreItem {
  title: string;
  params?: string;
  color?: string;
  endpoint?: NavigationEndpoint;
}

export interface ExplorePage {
  newReleaseAlbums: AlbumItem[];
  moodAndGenres: MoodOrGenreItem[];
  trendingSongs: SongItem[];
  sections: HomePageSection[];
}

export interface ChartsPage {
  topSongs: SongItem[];
  topVideos: SongItem[];
  topArtists: ArtistItem[];
  dailyHits: SongItem[];
  sections: HomePageSection[];
  countryCode?: string;
}

export interface BrowseFilterOptions {
  hideExplicit?: boolean;
  hideVideoSongs?: boolean;
  hideYoutubeShorts?: boolean;
}

// ═══════════════════════════════════════════
//  Domain Mapping & Filtering Utilities
// ═══════════════════════════════════════════

/**
 * Filter out explicit items if hideExplicit is true
 */
export function filterExplicit<T extends { explicit?: boolean }>(items: T[], hideExplicit = false): T[] {
  if (!hideExplicit) return items;
  return items.filter(item => !item.explicit);
}

/**
 * Filter out video songs if hideVideoSongs is true
 */
export function filterVideoSongs<T extends HomeItem>(items: T[], hideVideoSongs = false): T[] {
  if (!hideVideoSongs) return items;
  return items.filter(item => {
    if (item.type === 'song') {
      const s = item as SongItem;
      return !s.isVideo;
    }
    return item.type !== 'video';
  });
}

/**
 * Filter out YouTube shorts if hideYoutubeShorts is true
 */
export function filterYoutubeShorts<T extends HomeItem>(items: T[], hideYoutubeShorts = false): T[] {
  if (!hideYoutubeShorts) return items;
  return items.filter(item => {
    if (item.type === 'song') {
      const s = item as SongItem;
      return !s.isShorts && (s.duration === undefined || s.duration >= 60);
    }
    return item.type !== 'shorts';
  });
}

/**
 * Deduplicates an array using a key function, preserving first occurrence.
 * Equivalent to Kotlin's distinctBy { it.id }.
 */
export function distinctBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Applies all user-selected filters to a list of HomeItems
 */
export function applyHomeItemFilters(
  items: HomeItem[],
  options?: BrowseFilterOptions
): HomeItem[] {
  if (!options) return items;
  let result = items;
  if (options.hideExplicit) {
    result = filterExplicit(result, true);
  }
  if (options.hideVideoSongs) {
    result = filterVideoSongs(result, true);
  }
  if (options.hideYoutubeShorts) {
    result = filterYoutubeShorts(result, true);
  }
  return result;
}

/**
 * Converts a YouTube InnerTube SongItem to the application's standard Song domain model.
 */
export function songItemToSong(item: SongItem): Song {
  const videoId = item.videoId || item.id.replace(/^yt_/, '');
  const artwork = item.thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');
  const artworkLg = videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : artwork;

  return {
    id: item.id.startsWith('yt_') ? item.id : `yt_${item.id}`,
    title: item.title,
    artist: item.artist || (item.artists && item.artists[0]?.name) || 'YouTube Music',
    artistId: item.artists && item.artists[0]?.browseId ? `yt_artist_${item.artists[0].browseId}` : undefined,
    album: item.album?.name || item.title,
    albumId: item.album?.browseId ? `yt_album_${item.album.browseId}` : undefined,
    artwork,
    artworkLg,
    previewUrl: null,
    duration: item.duration || 0,
    playCount: item.playCount,
    popularity: item.playCount && item.playCount > 10_000_000 ? 95 : item.playCount && item.playCount > 1_000_000 ? 80 : 60,
    explicit: item.explicit,
    provider: 'youtube',
    isLiked: false,
    isDownloaded: false,
    genre: 'YouTube Music',
  };
}

/**
 * Converts a YouTube InnerTube AlbumItem to the application's Album domain model.
 */
export function albumItemToAlbum(item: AlbumItem): Album {
  return {
    id: item.browseId.startsWith('yt_album_') ? item.browseId : `yt_album_${item.browseId || item.id}`,
    title: item.title,
    artist: item.artist || (item.artists && item.artists[0]?.name) || 'YouTube Music',
    artistId: item.artists && item.artists[0]?.browseId ? `yt_artist_${item.artists[0].browseId}` : undefined,
    artwork: item.thumbnail,
    artworkLg: item.thumbnail,
    year: item.year ? parseInt(item.year, 10) : undefined,
    trackCount: item.songCount,
    provider: 'youtube',
  };
}

/**
 * Converts a YouTube InnerTube PlaylistItem to the application's Playlist domain model.
 */
export function playlistItemToPlaylist(item: PlaylistItem): Playlist {
  return {
    id: item.browseId.startsWith('yt_playlist_') ? item.browseId : `yt_playlist_${item.browseId || item.id}`,
    title: item.title,
    description: item.description || item.author,
    artwork: item.thumbnail,
    creator: item.author || 'YouTube Music',
    tracks: [],
    isUserCreated: false,
  };
}

/**
 * Converts a YouTube InnerTube ArtistItem to the application's Artist domain model.
 */
export function artistItemToArtist(item: ArtistItem): Artist {
  return {
    id: item.browseId.startsWith('yt_artist_') ? item.browseId : `yt_artist_${item.browseId || item.id}`,
    name: item.name,
    image: item.thumbnail,
    profileImage: item.thumbnail,
    imageLg: item.thumbnail,
    followerCount: item.subscribersCount,
    provider: 'youtube',
  };
}
