// ═════════════════════════════════════════════════════════════════════
//  Last.fm Repository — Soundwave Music Platform
//
//  Provides cached, safe, read-only metadata & recommendation operations:
//  • Feature 1: Artist Bio & Wiki (artist.getInfo)
//  • Feature 2: Similar Songs & Similar Artists (track.getSimilar, artist.getSimilar)
//  • Feature 3: Album Backstory & Tracklist (album.getInfo)
//  • Feature 4: Global Top Charts (chart.getTopTracks, chart.getTopArtists)
//  • Feature 5: Genre & Mood Tags (tag.getTopTracks)
// ═════════════════════════════════════════════════════════════════════

import type { Artist } from '../models';
import {
  getLastfmArtist,
  getSimilarArtists,
  getSimilarTracks,
  getLastfmAlbumInfo,
  getLastfmTopArtists,
  getLastfmTopTracks,
  getLastfmTagTopTracks,
  getLastfmTrackInfo,
  getLastfmArtistTopTracks,
  type LastFmArtistInfo,
  type LastFmAlbumInfo,
  type SimilarTrack,
} from '../api/lastfmApi';

export class LastFmRepository {
  private static instance: LastFmRepository;

  private constructor() {}

  public static getInstance(): LastFmRepository {
    if (!LastFmRepository.instance) {
      LastFmRepository.instance = new LastFmRepository();
    }
    return LastFmRepository.instance;
  }

  /**
   * FEATURE 1: Fetches artist biography, global listener count, playcount, and genre tags.
   */
  async getArtistBioAndInfo(artistName: string): Promise<LastFmArtistInfo | null> {
    try {
      return await getLastfmArtist(artistName);
    } catch (e) {
      console.warn(`[LastFmRepository] getArtistBioAndInfo error for "${artistName}":`, e);
      return null;
    }
  }

  /**
   * FEATURE 2: Fetches musically and acoustically similar songs matching the seed song.
   */
  async getSimilarTracks(artist: string, trackTitle: string, limit = 10): Promise<SimilarTrack[]> {
    try {
      return await getSimilarTracks(artist, trackTitle, limit);
    } catch (e) {
      console.warn(`[LastFmRepository] getSimilarTracks error for "${trackTitle}":`, e);
      return [];
    }
  }

  /**
   * FEATURE 2 (cont): Fetches similar artists for related artist discovery.
   */
  async getSimilarArtists(artistName: string, limit = 8): Promise<Artist[]> {
    try {
      return await getSimilarArtists(artistName, limit);
    } catch (e) {
      console.warn(`[LastFmRepository] getSimilarArtists error for "${artistName}":`, e);
      return [];
    }
  }

  /**
   * FEATURE 3: Fetches album backstory/wiki summary, release date, listeners, and tracklist.
   */
  async getAlbumInfo(artist: string, albumTitle: string): Promise<LastFmAlbumInfo | null> {
    try {
      return await getLastfmAlbumInfo(artist, albumTitle);
    } catch (e) {
      console.warn(`[LastFmRepository] getAlbumInfo error for "${albumTitle}":`, e);
      return null;
    }
  }

  /**
   * FEATURE 4: Fetches real-time global top 50 tracks.
   */
  async getGlobalTopTracks(limit = 20): Promise<{ title: string; artist: string; image?: string; playcount?: number; listeners?: number }[]> {
    try {
      return await getLastfmTopTracks(limit);
    } catch (e) {
      console.warn('[LastFmRepository] getGlobalTopTracks error:', e);
      return [];
    }
  }

  /**
   * FEATURE 4 (cont): Fetches trending global artists.
   */
  async getGlobalTopArtists(limit = 20): Promise<Artist[]> {
    try {
      return await getLastfmTopArtists(limit);
    } catch (e) {
      console.warn('[LastFmRepository] getGlobalTopArtists error:', e);
      return [];
    }
  }

  /**
   * FEATURE 5: Fetches top-ranked songs for specific genre tags (e.g. 'bollywood', 'rock', 'pop', 'lofi', 'indie').
   */
  async getGenreTagTopTracks(tag: string, limit = 20): Promise<{ title: string; artist: string; image?: string; rank?: number }[]> {
    try {
      return await getLastfmTagTopTracks(tag, limit);
    } catch (e) {
      console.warn(`[LastFmRepository] getGenreTagTopTracks error for "${tag}":`, e);
      return [];
    }
  }

  /**
   * Helper: Fetches track backstory/wiki & tags.
   */
  async getTrackInfo(artist: string, track: string) {
    try {
      return await getLastfmTrackInfo(artist, track);
    } catch (e) {
      console.warn(`[LastFmRepository] getTrackInfo error for "${track}":`, e);
      return null;
    }
  }

  /**
   * Helper: Fetches top tracks for an artist.
   */
  async getArtistTopTracks(artistName: string, limit = 20) {
    try {
      return await getLastfmArtistTopTracks(artistName, limit);
    } catch (e) {
      console.warn(`[LastFmRepository] getArtistTopTracks error for "${artistName}":`, e);
      return [];
    }
  }
}

export const lastFmRepository = LastFmRepository.getInstance();
