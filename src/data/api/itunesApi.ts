// ═══════════════════════════════════════════
//  iTunes Search API Client
//  No auth required. Provides 30s preview URLs.
//  Terms: previews are for promotional purposes only.
// ═══════════════════════════════════════════

import type { Song, Artist, Album } from '../models';
import { CONFIG } from '../../config';

const ARTWORK_SIZE = 600;

function artwork(url: string, size = ARTWORK_SIZE): string {
  if (!url) return CONFIG.ARTWORK_PLACEHOLDER;
  return url.replace('100x100bb', `${size}x${size}bb`);
}

function mapTrack(item: ItunesTrack): Song {
  return {
    id: `itunes_${item.trackId}`,
    title: item.trackName || 'Unknown Track',
    artist: item.artistName || 'Unknown Artist',
    artistId: `itunes_artist_${item.artistId}`,
    album: item.collectionName || 'Unknown Album',
    albumId: `itunes_album_${item.collectionId}`,
    artwork: artwork(item.artworkUrl100),
    artworkLg: artwork(item.artworkUrl100, 600),
    previewUrl: item.previewUrl || null,
    duration: Math.round((item.trackTimeMillis || 0) / 1000),
    trackNumber: item.trackNumber,
    genre: item.primaryGenreName,
    year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : undefined,
    provider: 'itunes',
    externalUrl: item.trackViewUrl,
  };
}

function mapAlbum(item: ItunesAlbum): Album {
  return {
    id: `itunes_album_${item.collectionId}`,
    title: item.collectionName || 'Unknown Album',
    artist: item.artistName || 'Unknown Artist',
    artistId: `itunes_artist_${item.artistId}`,
    artwork: artwork(item.artworkUrl100),
    artworkLg: artwork(item.artworkUrl100, 600),
    year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : undefined,
    genre: item.primaryGenreName,
    trackCount: item.trackCount,
    provider: 'itunes',
    externalUrl: item.collectionViewUrl,
  };
}

function mapArtist(item: ItunesArtist): Artist {
  return {
    id: `itunes_artist_${item.artistId}`,
    name: item.artistName || 'Unknown Artist',
    image: CONFIG.ARTWORK_PLACEHOLDER,
    genre: item.primaryGenreName,
    provider: 'itunes',
    externalUrl: item.artistLinkUrl,
  };
}

export async function searchItunes(query: string, limit = 25): Promise<{
  songs: Song[];
  artists: Artist[];
  albums: Album[];
}> {
  const params = new URLSearchParams({
    term: query,
    media: 'music',
    limit: String(Math.min(limit * 3, 100)),
    country: 'US',
  });

  const res = await fetch(`${CONFIG.ITUNES_SEARCH_URL}?${params}`);
  if (!res.ok) throw new Error(`iTunes search failed: ${res.status}`);

  const data: ItunesSearchResponse = await res.json();
  const results = data.results || [];

  const songs: Song[] = results
    .filter((r) => r.wrapperType === 'track' && r.kind === 'song' && r.previewUrl)
    .slice(0, limit)
    .map(mapTrack as (item: ItunesResult) => Song);

  const albumMap = new Map<number, Album>();
  results
    .filter((r) => r.wrapperType === 'collection' || (r.wrapperType === 'track' && r.collectionId))
    .forEach((r) => {
      const albumId = (r as ItunesAlbum).collectionId || (r as ItunesTrack).collectionId;
      if (albumId && !albumMap.has(albumId)) {
        albumMap.set(albumId, mapAlbum(r as ItunesAlbum));
      }
    });

  const artistMap = new Map<number, Artist>();
  results
    .filter((r) => r.wrapperType === 'artist')
    .forEach((r) => {
      const a = r as ItunesArtist;
      if (!artistMap.has(a.artistId)) {
        artistMap.set(a.artistId, mapArtist(a));
      }
    });

  return {
    songs,
    artists: Array.from(artistMap.values()).slice(0, limit),
    albums: Array.from(albumMap.values()).slice(0, limit),
  };
}

export async function getItunesAlbumTracks(collectionId: string): Promise<Song[]> {
  const id = collectionId.replace('itunes_album_', '');
  const params = new URLSearchParams({ id, entity: 'song' });
  const res = await fetch(`${CONFIG.ITUNES_LOOKUP_URL}?${params}`);
  if (!res.ok) throw new Error(`iTunes lookup failed: ${res.status}`);
  const data: ItunesSearchResponse = await res.json();
  return (data.results || [])
    .filter((r) => r.wrapperType === 'track' && (r as ItunesTrack).previewUrl)
    .map(mapTrack as (item: ItunesResult) => Song);
}

export async function getItunesTopCharts(genre = 'all', limit = 20): Promise<Song[]> {
  const genreId = ITUNES_GENRE_IDS[genre] || '';
  const url = `https://itunes.apple.com/us/rss/topsongs/limit=${limit}${genreId ? `/genre=${genreId}` : ''}/json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const entries: ItunesFeedEntry[] = data?.feed?.entry || [];
  return entries.map((e) => ({
    id: `itunes_${e['id']['attributes']['im:id']}`,
    title: e['im:name']['label'] || '',
    artist: e['im:artist']['label'] || '',
    album: e['im:collection']?.['im:name']?.['label'] || '',
    artwork: e['im:image']?.[2]?.['label'] || CONFIG.ARTWORK_PLACEHOLDER,
    artworkLg: e['im:image']?.[2]?.['label'] || CONFIG.ARTWORK_PLACEHOLDER,
    previewUrl: null,
    duration: 0,
    genre: e['category']?.['attributes']?.['label'],
    provider: 'itunes' as const,
    externalUrl: e['link']?.['attributes']?.['href'],
  }));
}

export async function searchItunesArtist(artistName: string): Promise<Song[]> {
  const params = new URLSearchParams({
    term: artistName,
    media: 'music',
    entity: 'song',
    limit: '20',
    country: 'US',
  });
  const res = await fetch(`${CONFIG.ITUNES_SEARCH_URL}?${params}`);
  if (!res.ok) return [];
  const data: ItunesSearchResponse = await res.json();
  return (data.results || [])
    .filter((r) => r.wrapperType === 'track' && (r as ItunesTrack).previewUrl)
    .map(mapTrack as (item: ItunesResult) => Song);
}

const ITUNES_GENRE_IDS: Record<string, number> = {
  pop: 14,
  rock: 21,
  hiphop: 18,
  electronic: 7,
  jazz: 11,
  classical: 5,
  country: 6,
  rnb: 15,
};

// ─── iTunes API Types ─────────────────────────────────────────────────────────

interface ItunesSearchResponse {
  resultCount: number;
  results: ItunesResult[];
}

type ItunesResult = ItunesTrack | ItunesAlbum | ItunesArtist;

interface ItunesTrack {
  wrapperType: 'track';
  kind: string;
  trackId: number;
  artistId: number;
  collectionId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
  previewUrl?: string;
  trackTimeMillis: number;
  trackNumber: number;
  primaryGenreName: string;
  releaseDate: string;
  trackViewUrl: string;
  collectionViewUrl: string;
}

interface ItunesAlbum {
  wrapperType: 'collection';
  collectionType: string;
  collectionId: number;
  artistId: number;
  collectionName: string;
  artistName: string;
  artworkUrl100: string;
  primaryGenreName: string;
  releaseDate: string;
  trackCount: number;
  collectionViewUrl: string;
}

interface ItunesArtist {
  wrapperType: 'artist';
  artistType: string;
  artistId: number;
  artistName: string;
  primaryGenreName: string;
  artistLinkUrl: string;
}

interface ItunesFeedEntry {
  'im:name': { label: string };
  'im:artist': { label: string };
  'im:collection'?: { 'im:name': { label: string } };
  'im:image'?: { label: string }[];
  'category'?: { attributes?: { label: string } };
  'link'?: { attributes?: { href: string } };
  'id': { label: string; attributes: { 'im:id': string } };
}
