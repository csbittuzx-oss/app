import type { Playlist, Song } from '../models';
import { universalGetText, universalGet } from '../../core/utils/http';
import { CONFIG } from '../../config';

export function extractSpotifyPlaylistId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  
  // Handles:
  // https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=...
  // https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M
  // spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
  // 37i9dQZF1DXcBWIGoYBM5M
  const urlMatch = trimmed.match(/playlist\/([a-zA-Z0-9]+)/);
  if (urlMatch && urlMatch[1]) return urlMatch[1];

  const uriMatch = trimmed.match(/spotify:playlist:([a-zA-Z0-9]+)/);
  if (uriMatch && uriMatch[1]) return uriMatch[1];

  const rawMatch = trimmed.match(/^[a-zA-Z0-9]{15,30}$/);
  if (rawMatch) return rawMatch[0];

  return null;
}

/**
 * Fetches the exact individual album/song cover artwork for a specific Spotify track.
 */
export async function fetchSpotifyTrackArtwork(trackId: string): Promise<string | null> {
  if (!trackId || trackId.startsWith('track_')) return null;
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`;
    const data = await universalGet(oembedUrl);
    if (data && data.thumbnail_url) {
      // Upgrade from 300px to 640px high-definition image
      return data.thumbnail_url
        .replace('ab67616d00001e02', 'ab67616d0000b273')
        .replace('http://', 'https://');
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Fallback to search JioSaavn for specific track artwork if Spotify oEmbed is unavailable.
 */
export async function fetchTrackFallbackArtwork(title: string, artist: string): Promise<string | null> {
  try {
    const cleanTitle = title.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
    const query = `${cleanTitle} ${artist}`.trim();
    const autoUrl = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&query=${encodeURIComponent(query)}&_format=json&_marker=0&ctx=web6dot0`;
    const data = await universalGet(autoUrl);
    const songImg = data?.songs?.data?.[0]?.image;
    if (songImg) {
      return songImg
        .replace('50x50.jpg', '500x500.jpg')
        .replace('150x150.jpg', '500x500.jpg')
        .replace('http://', 'https://');
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Enriches a list of tracks so every track has its own distinct song/album artwork.
 */
export async function enrichSpotifyTracksArtwork(
  tracks: Song[],
  playlistFallbackArt?: string
): Promise<Song[]> {
  const batchSize = 12;
  const enriched = [...tracks];

  for (let i = 0; i < enriched.length; i += batchSize) {
    const batch = enriched.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (track, relIdx) => {
        const globalIdx = i + relIdx;
        const rawTrackId = track.id.replace('spotify_', '');

        // 1. Try fetching exact Spotify track artwork via oEmbed
        let distinctArt = await fetchSpotifyTrackArtwork(rawTrackId);

        // 2. If Spotify oEmbed didn't return, search JioSaavn for track art
        if (!distinctArt) {
          distinctArt = await fetchTrackFallbackArtwork(track.title, track.artist);
        }

        // 3. If found distinct art, assign it to the track
        if (distinctArt) {
          enriched[globalIdx] = {
            ...track,
            artwork: distinctArt,
            artworkLg: distinctArt,
          };
        } else if (playlistFallbackArt && !track.artwork) {
          enriched[globalIdx] = {
            ...track,
            artwork: playlistFallbackArt,
            artworkLg: playlistFallbackArt,
          };
        }
      })
    );
  }

  return enriched;
}

/**
 * Imports a real Spotify playlist directly by parsing Spotify's official embed metadata.
 * Fetches the real individual song artwork for each track in the playlist.
 */
export async function importSpotifyPlaylist(urlOrId: string): Promise<Playlist> {
  const playlistId = extractSpotifyPlaylistId(urlOrId);
  if (!playlistId) {
    throw new Error('Invalid Spotify playlist link. Please enter a valid open.spotify.com/playlist/... link.');
  }

  // 1. Fetch Spotify oEmbed for fallback metadata
  let oembedTitle = '';
  let oembedArtwork = '';
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=https://open.spotify.com/playlist/${playlistId}`;
    const oembedData = await universalGet(oembedUrl);
    if (oembedData && oembedData.title) {
      oembedTitle = oembedData.title;
      oembedArtwork = oembedData.thumbnail_url || '';
    }
  } catch {
    // optional oEmbed fallback
  }

  // 2. Fetch Embed HTML using universalGetText (never throws JSON syntax errors)
  const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
  let html = '';

  try {
    html = await universalGetText(embedUrl);
  } catch (err: any) {
    throw new Error(`Failed to load playlist from Spotify: ${err?.message || 'Network error'}`);
  }

  let entity: any = null;

  // Try extracting __NEXT_DATA__
  const idx = html.indexOf('__NEXT_DATA__');
  if (idx !== -1) {
    try {
      const start = html.indexOf('>', idx) + 1;
      const end = html.indexOf('</script>', start);
      const jsonStr = html.substring(start, end);
      const data = JSON.parse(jsonStr);
      entity = data.props?.pageProps?.state?.data?.entity || data.props?.pageProps?.entity;
    } catch {
      // ignore JSON parse error in embed
    }
  }

  // If no entity found, check for initial-data script
  if (!entity) {
    const initialIdx = html.indexOf('id="initial-data"');
    if (initialIdx !== -1) {
      try {
        const start = html.indexOf('>', initialIdx) + 1;
        const end = html.indexOf('</script>', start);
        const jsonStr = html.substring(start, end);
        const data = JSON.parse(jsonStr);
        entity = data?.entity || data?.data?.entity;
      } catch {
        // ignore
      }
    }
  }

  if (!entity || !Array.isArray(entity.trackList) || entity.trackList.length === 0) {
    // If entity.trackList is empty, check if we have oembed metadata or error
    if (oembedTitle) {
      throw new Error(`Found playlist "${oembedTitle}", but its tracks are private or unavailable on Spotify embed.`);
    }
    throw new Error('This Spotify playlist is either private, empty, or the link is invalid.');
  }

  const title = entity.name || oembedTitle || 'Imported Spotify Playlist';
  const description = entity.description || `Imported Spotify playlist with ${entity.trackList.length} tracks`;
  const playlistArtwork = entity.coverArt?.sources?.[0]?.url
    || entity.coverArt?.sources?.[1]?.url
    || oembedArtwork
    || CONFIG.ARTWORK_PLACEHOLDER;

  const rawTracks: Song[] = entity.trackList.map((t: any, index: number) => {
    const rawTrackId = t.uri ? t.uri.replace('spotify:track:', '') : `track_${index}`;
    const durationSeconds = Math.round((t.duration || 0) / 1000);
    const audioFallback = t.audioPreview?.url || null;

    return {
      id: `spotify_${rawTrackId}`,
      title: t.title || 'Untitled Track',
      artist: t.subtitle || 'Unknown Artist',
      album: title,
      artwork: '', // will be populated with track's real distinct artwork below
      artworkLg: '',
      duration: durationSeconds,
      previewUrl: audioFallback,
      provider: 'saavn' as const,
      isLiked: false,
      isDownloaded: false,
    };
  });

  // Fetch true individual song artwork for every track concurrently
  const enrichedTracks = await enrichSpotifyTracksArtwork(rawTracks, playlistArtwork);

  const importedPlaylist: Playlist = {
    id: `spotify_pl_${playlistId}_${Date.now()}`,
    title,
    description,
    artwork: playlistArtwork,
    creator: 'Spotify Import',
    tracks: enrichedTracks,
    isUserCreated: true,
    totalDuration: enrichedTracks.reduce((sum, s) => sum + s.duration, 0),
  };

  return importedPlaylist;
}
