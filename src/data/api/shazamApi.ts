// ═══════════════════════════════════════════
//  ShazamKit & Audio Recognition API
//  Recognizes songs from ambient audio recordings and audio fingerprints
// ═══════════════════════════════════════════

import type { Song, RecognitionResult } from '../models';
import { universalPost } from '../../core/utils/http';
import { searchJioSaavn } from './saavnApi';
import { searchYouTubeMusic } from './youtubeMusicApi';

/**
 * Recognizes a song from raw audio base64 or audio waveform snippet.
 */
export async function recognizeAudioSnippet(
  audioBase64: string,
  sampleRate = 44100
): Promise<RecognitionResult | null> {
  if (!audioBase64) return null;

  // 1. Try Free Shazam Search / Detection API
  try {
    const res = await fetch('https://amp.shazam.com/discovery/v5/en/US/android/-/tag', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Shazam/13.0 (Android; en_US)',
      },
      body: JSON.stringify({
        geolocation: { latitude: 0, longitude: 0 },
        sample: {
          buffer: audioBase64.slice(0, 100000),
          samplerate: sampleRate,
        },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const match = data?.track || data?.matches?.[0];
      if (match) {
        const title = match.title || match.heading?.title || '';
        const artist = match.subtitle || match.heading?.subtitle || '';
        const artwork = match.images?.coverart || match.images?.background || match.share?.image || '';
        
        if (title && artist) {
          const song = await mapRecognizedToSong(title, artist, artwork);
          return {
            title,
            artist,
            album: match.sections?.[0]?.metadata?.find((m: any) => m.title === 'Album')?.text,
            artwork,
            genres: match.genres?.primary ? [match.genres.primary] : [],
            song,
          };
        }
      }
    }
  } catch {}

  // 2. Secondary identification fallback using Paxsenix/Audd recognition endpoint
  try {
    const auddUrl = 'https://api.paxsenix.biz.id/tools/shazam';
    const auddData = await universalPost(auddUrl, {
      audio: audioBase64,
    });

    if (auddData?.status === 'success' && auddData?.result) {
      const { title, artist, album, artwork } = auddData.result;
      if (title && artist) {
        const song = await mapRecognizedToSong(title, artist, artwork);
        return {
          title,
          artist,
          album,
          artwork,
          song,
        };
      }
    }
  } catch {}

  return null;
}

/**
 * Maps recognized title and artist into our unified playable Song model.
 */
async function mapRecognizedToSong(
  title: string,
  artist: string,
  artwork?: string
): Promise<Song> {
  // Try JioSaavn search for direct stream URL
  try {
    const saavnRes = await searchJioSaavn(`${title} ${artist}`, 1);
    if (saavnRes.songs && saavnRes.songs.length > 0) {
      return saavnRes.songs[0];
    }
  } catch {}

  // Fallback to YouTube Music search
  try {
    const ytRes = await searchYouTubeMusic(`${title} ${artist}`, 1);
    if (ytRes.songs && ytRes.songs.length > 0) {
      return ytRes.songs[0];
    }
  } catch {}

  // Default construct
  return {
    id: `shazam_${Date.now()}_${encodeURIComponent(title)}`,
    title,
    artist,
    album: title,
    artwork: artwork || '',
    artworkLg: artwork || '',
    previewUrl: null,
    duration: 180,
    provider: 'saavn',
    isLiked: false,
    isDownloaded: false,
    genre: 'Recognized Track',
  };
}
