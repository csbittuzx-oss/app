// ═══════════════════════════════════════════
//  Jamendo API Client
//  Requires free client_id from https://developer.jamendo.com/v3.0/
//  Provides full Creative Commons licensed tracks (legal to stream/download)
// ═══════════════════════════════════════════

import type { Song, Artist, Album } from '../models';
import { CONFIG } from '../../config';

const CLIENT_ID = CONFIG.JAMENDO_CLIENT_ID;
const BASE = CONFIG.JAMENDO_BASE_URL;

function buildUrl(endpoint: string, params: Record<string, string | number>): string {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    format: 'json',
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  return `${BASE}/${endpoint}/?${p}`;
}

function mapJamendoTrack(t: JamendoTrack): Song {
  return {
    id: `jamendo_${t.id}`,
    title: t.name,
    artist: t.artist_name || 'Unknown Artist',
    artistId: `jamendo_artist_${t.artist_id}`,
    album: t.album_name || 'Unknown Album',
    albumId: `jamendo_album_${t.album_id}`,
    artwork: t.album_image || t.image || CONFIG.ARTWORK_PLACEHOLDER,
    artworkLg: t.album_image || t.image || CONFIG.ARTWORK_PLACEHOLDER,
    previewUrl: t.audio || null,  // Full CC-licensed track URL
    duration: t.duration || 0,
    genre: t.tags?.[0],
    provider: 'jamendo',
    externalUrl: t.shareurl,
  };
}

function mapJamendoArtist(a: JamendoArtist): Artist {
  return {
    id: `jamendo_artist_${a.id}`,
    name: a.name,
    image: a.image || CONFIG.ARTWORK_PLACEHOLDER,
    imageLg: a.image || CONFIG.ARTWORK_PLACEHOLDER,
    provider: 'jamendo',
    externalUrl: a.shareurl,
  };
}

function mapJamendoAlbum(a: JamendoAlbum): Album {
  return {
    id: `jamendo_album_${a.id}`,
    title: a.name,
    artist: a.artist_name || 'Unknown Artist',
    artwork: a.image || CONFIG.ARTWORK_PLACEHOLDER,
    artworkLg: a.image || CONFIG.ARTWORK_PLACEHOLDER,
    year: a.releasedate ? new Date(a.releasedate).getFullYear() : undefined,
    trackCount: a.tracks,
    provider: 'jamendo',
    externalUrl: a.shareurl,
  };
}

export async function searchJamendo(query: string, limit = 20): Promise<{
  songs: Song[];
  artists: Artist[];
  albums: Album[];
}> {
  if (!CLIENT_ID) return { songs: [], artists: [], albums: [] };
  try {
    const [tracksRes, artistsRes, albumsRes] = await Promise.all([
      fetch(buildUrl('tracks', { search: query, limit, audioformat: 'mp32', include: 'musicinfo' })),
      fetch(buildUrl('artists', { namesearch: query, limit: String(Math.min(limit, 10)) })),
      fetch(buildUrl('albums', { namesearch: query, limit: String(Math.min(limit, 10)) })),
    ]);

    const tracks: JamendoTrack[] = tracksRes.ok ? (await tracksRes.json()).results || [] : [];
    const artists: JamendoArtist[] = artistsRes.ok ? (await artistsRes.json()).results || [] : [];
    const albums: JamendoAlbum[] = albumsRes.ok ? (await albumsRes.json()).results || [] : [];

    return {
      songs: tracks.map(mapJamendoTrack),
      artists: artists.map(mapJamendoArtist),
      albums: albums.map(mapJamendoAlbum),
    };
  } catch {
    return { songs: [], artists: [], albums: [] };
  }
}

export async function getJamendoFeatured(limit = 20): Promise<Song[]> {
  if (!CLIENT_ID) return [];
  try {
    const res = await fetch(buildUrl('tracks', {
      limit,
      audioformat: 'mp32',
      orderby: 'popularity_total',
      include: 'musicinfo',
    }));
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map(mapJamendoTrack);
  } catch {
    return [];
  }
}

export async function getJamendoNewReleases(limit = 20): Promise<Song[]> {
  if (!CLIENT_ID) return [];
  try {
    const res = await fetch(buildUrl('tracks', {
      limit,
      audioformat: 'mp32',
      orderby: 'releasedate_desc',
      include: 'musicinfo',
    }));
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map(mapJamendoTrack);
  } catch {
    return [];
  }
}

export async function getJamendoByGenre(tag: string, limit = 20): Promise<Song[]> {
  if (!CLIENT_ID) return [];
  try {
    const res = await fetch(buildUrl('tracks', {
      tags: tag,
      limit,
      audioformat: 'mp32',
      orderby: 'popularity_total',
    }));
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map(mapJamendoTrack);
  } catch {
    return [];
  }
}

export async function getJamendoAlbumTracks(albumId: string): Promise<Song[]> {
  if (!CLIENT_ID) return [];
  const id = albumId.replace('jamendo_album_', '');
  try {
    const res = await fetch(buildUrl('albums/tracks', {
      id,
      audioformat: 'mp32',
    }));
    if (!res.ok) return [];
    const data = await res.json();
    const album = data.results?.[0];
    if (!album) return [];
    return (album.tracks || []).map((t: JamendoTrack) => ({
      ...mapJamendoTrack(t),
      album: album.name,
      albumId: `jamendo_album_${album.id}`,
      artwork: album.image || t.image || CONFIG.ARTWORK_PLACEHOLDER,
      artworkLg: album.image || t.image || CONFIG.ARTWORK_PLACEHOLDER,
    }));
  } catch {
    return [];
  }
}

// ─── Jamendo API Types ────────────────────────────────────────────────────────

interface JamendoTrack {
  id: string;
  name: string;
  duration: number;
  artist_id: string;
  artist_name: string;
  album_id: string;
  album_name: string;
  album_image: string;
  image: string;
  audio: string;
  audiodownload: string;
  shareurl: string;
  tags?: string[];
}

interface JamendoArtist {
  id: string;
  name: string;
  image: string;
  shareurl: string;
}

interface JamendoAlbum {
  id: string;
  name: string;
  artist_name: string;
  image: string;
  releasedate: string;
  tracks: number;
  shareurl: string;
}
