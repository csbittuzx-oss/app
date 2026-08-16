// ═══════════════════════════════════════════
//  Last.fm Metadata API Client
//  Requires a free API key from https://www.last.fm/api/account/create
//  Used for: artist bios, similar artists, top tracks, tags, charts
// ═══════════════════════════════════════════

import type { Artist } from '../models';
import { CONFIG } from '../../config';

const API_KEY = CONFIG.LASTFM_API_KEY;
const BASE = CONFIG.LASTFM_BASE_URL;

function buildUrl(method: string, params: Record<string, string>): string {
  const p = new URLSearchParams({
    method,
    api_key: API_KEY,
    format: 'json',
    ...params,
  });
  return `${BASE}/?${p}`;
}

export async function getLastfmArtist(artistName: string): Promise<Partial<Artist> | null> {
  if (!API_KEY) return null;
  try {
    const res = await fetch(buildUrl('artist.getInfo', { artist: artistName }));
    if (!res.ok) return null;
    const data = await res.json();
    const a = data?.artist;
    if (!a) return null;
    const image = a.image?.find((i: { size: string }) => i.size === 'extralarge')?.['#text']
      || a.image?.find((i: { size: string }) => i.size === 'large')?.['#text']
      || '';
    return {
      id: `lastfm_${a.mbid || encodeURIComponent(a.name)}`,
      name: a.name,
      image: image || CONFIG.ARTWORK_PLACEHOLDER,
      imageLg: image || CONFIG.ARTWORK_PLACEHOLDER,
      followerCount: parseInt(a.stats?.listeners || '0'),
      bio: stripHtml(a.bio?.summary || ''),
      provider: 'lastfm',
      externalUrl: a.url,
    };
  } catch {
    return null;
  }
}

export async function getSimilarArtists(artistName: string, limit = 8): Promise<Artist[]> {
  if (!API_KEY) return [];
  try {
    const res = await fetch(buildUrl('artist.getSimilar', { artist: artistName, limit: String(limit) }));
    if (!res.ok) return [];
    const data = await res.json();
    const artists: LastfmArtist[] = data?.similarartists?.artist || [];
    return artists.map((a) => {
      const image = a.image?.find((i) => i.size === 'extralarge')?.['#text']
        || a.image?.find((i) => i.size === 'large')?.['#text']
        || '';
      return {
        id: `lastfm_${encodeURIComponent(a.name)}`,
        name: a.name,
        image: image || CONFIG.ARTWORK_PLACEHOLDER,
        provider: 'lastfm' as const,
        externalUrl: a.url,
      };
    });
  } catch {
    return [];
  }
}

export async function getLastfmTopArtists(limit = 12): Promise<Artist[]> {
  if (!API_KEY) return [];
  try {
    const res = await fetch(buildUrl('chart.getTopArtists', { limit: String(limit) }));
    if (!res.ok) return [];
    const data = await res.json();
    const artists: LastfmArtist[] = data?.artists?.artist || [];
    return artists.map((a) => {
      const image = a.image?.find((i) => i.size === 'extralarge')?.['#text']
        || a.image?.find((i) => i.size === 'large')?.['#text']
        || '';
      return {
        id: `lastfm_${encodeURIComponent(a.name)}`,
        name: a.name,
        image: image || CONFIG.ARTWORK_PLACEHOLDER,
        followerCount: parseInt(a.listeners || '0'),
        provider: 'lastfm' as const,
        externalUrl: a.url,
      };
    });
  } catch {
    return [];
  }
}

export async function getLastfmTopTracks(limit = 20): Promise<{ title: string; artist: string }[]> {
  if (!API_KEY) return [];
  try {
    const res = await fetch(buildUrl('chart.getTopTracks', { limit: String(limit) }));
    if (!res.ok) return [];
    const data = await res.json();
    const tracks: LastfmTrack[] = data?.tracks?.track || [];
    return tracks.map((t) => ({
      title: t.name,
      artist: t.artist?.name || '',
    }));
  } catch {
    return [];
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim()
    .split('Read more')[0]
    .trim();
}

// ─── Last.fm API Types ────────────────────────────────────────────────────────

interface LastfmArtist {
  name: string;
  url: string;
  listeners?: string;
  image?: { '#text': string; size: string }[];
}

interface LastfmTrack {
  name: string;
  artist?: { name: string };
}
