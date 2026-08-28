import type { Song, Playlist } from '../../data/models';
import { importSpotifyPlaylist } from '../../data/api/spotifyApi';
import { searchMusic } from '../../data/repository/musicRepository';

export interface ImportProgress {
  step: 'fetching_spotify' | 'matching_songs' | 'creating_playlist' | 'complete' | 'failed';
  currentTrackIndex: number;
  totalTracks: number;
  currentTrackTitle: string;
  matchedCount: number;
  unmatchedTracks: { title: string; artist: string }[];
  resultPlaylist?: Playlist;
  error?: string;
}

export class TVSpotifyImportEngine {
  /**
   * Normalizes titles and artist names for accurate catalog matching.
   */
  public static normalizeString(str: string): string {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/\(.*?\)/g, '') // remove parenthesized info like (feat. X)
      .replace(/\[.*?\]/g, '') // remove bracketed info like [Official Video]
      .replace(/\b(feat|ft|featuring|remastered|remaster|official audio|official video|version|edit)\b/gi, '')
      .replace(/[^a-z0-9\s]/g, '') // remove special characters
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculates similarity score (0 to 100) between two strings.
   */
  public static calculateSimilarity(s1: string, s2: string): number {
    const norm1 = this.normalizeString(s1);
    const norm2 = this.normalizeString(s2);

    if (norm1 === norm2) return 100;
    if (!norm1 || !norm2) return 0;

    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      const minLen = Math.min(norm1.length, norm2.length);
      const maxLen = Math.max(norm1.length, norm2.length);
      return Math.round((minLen / maxLen) * 90);
    }

    const words1 = new Set(norm1.split(' ').filter(Boolean));
    const words2 = new Set(norm2.split(' ').filter(Boolean));
    let common = 0;
    for (const w of words1) {
      if (words2.has(w)) common++;
    }
    const total = Math.max(words1.size, words2.size);
    return total > 0 ? Math.round((common / total) * 85) : 0;
  }

  /**
   * Matches a single Spotify track against the app's music catalog.
   */
  public static async matchTrackWithCatalog(spotifyTrack: Song): Promise<Song | null> {
    try {
      const cleanTitle = this.normalizeString(spotifyTrack.title);
      const cleanArtist = this.normalizeString(spotifyTrack.artist);
      const query = `${cleanTitle} ${cleanArtist}`.trim();

      const searchRes = await searchMusic(query, 6);
      if (!searchRes || !searchRes.songs || searchRes.songs.length === 0) {
        return null;
      }

      let bestMatch: Song | null = null;
      let highestScore = 0;

      for (const candidate of searchRes.songs) {
        const titleScore = this.calculateSimilarity(spotifyTrack.title, candidate.title);
        const artistScore = this.calculateSimilarity(spotifyTrack.artist, candidate.artist);

        // Combined score
        let totalScore = Math.round(titleScore * 0.6 + artistScore * 0.4);

        // Duration bonus/penalty if duration is available (±10s tolerance)
        if (spotifyTrack.duration > 0 && candidate.duration > 0) {
          const diff = Math.abs(spotifyTrack.duration - candidate.duration);
          if (diff <= 6) {
            totalScore += 8;
          } else if (diff > 25) {
            totalScore -= 15;
          }
        }

        if (totalScore > highestScore) {
          highestScore = totalScore;
          bestMatch = candidate;
        }
      }

      // Confidence threshold: at least 65% match required
      if (highestScore >= 65 && bestMatch) {
        return {
          ...bestMatch,
          // Preserve high-res artwork if candidate doesn't have one
          artwork: bestMatch.artwork || spotifyTrack.artwork,
          artworkLg: bestMatch.artworkLg || spotifyTrack.artworkLg || bestMatch.artwork,
        };
      }
    } catch {
      // ignore track search errors
    }

    return null;
  }

  /**
   * Imports Spotify playlist, matches tracks with app catalog, and saves to library.
   */
  public static async executeImport(
    playlistUrlOrId: string,
    onProgress: (progress: ImportProgress) => void
  ): Promise<Playlist> {
    // Step 1: Fetch Spotify Metadata
    onProgress({
      step: 'fetching_spotify',
      currentTrackIndex: 0,
      totalTracks: 0,
      currentTrackTitle: '',
      matchedCount: 0,
      unmatchedTracks: [],
    });

    let rawPlaylist: Playlist;
    try {
      rawPlaylist = await importSpotifyPlaylist(playlistUrlOrId);
    } catch (err: any) {
      const errorMsg = err?.message || 'Unable to fetch playlist from Spotify.';
      onProgress({
        step: 'failed',
        currentTrackIndex: 0,
        totalTracks: 0,
        currentTrackTitle: '',
        matchedCount: 0,
        unmatchedTracks: [],
        error: errorMsg,
      });
      throw err;
    }

    const spotifyTracks = rawPlaylist.tracks || [];
    const totalTracks = spotifyTracks.length;
    const matchedSongs: Song[] = [];
    const unmatchedTracks: { title: string; artist: string }[] = [];

    // Step 2: Match Songs Concurrently in small batches
    for (let i = 0; i < totalTracks; i++) {
      const sTrack = spotifyTracks[i];
      onProgress({
        step: 'matching_songs',
        currentTrackIndex: i + 1,
        totalTracks,
        currentTrackTitle: sTrack.title,
        matchedCount: matchedSongs.length,
        unmatchedTracks,
      });

      const matched = await this.matchTrackWithCatalog(sTrack);
      if (matched) {
        matchedSongs.push(matched);
      } else {
        unmatchedTracks.push({ title: sTrack.title, artist: sTrack.artist });
      }
    }

    // Step 3: Create and Save Playlist
    onProgress({
      step: 'creating_playlist',
      currentTrackIndex: totalTracks,
      totalTracks,
      currentTrackTitle: 'Saving to library...',
      matchedCount: matchedSongs.length,
      unmatchedTracks,
    });

    // Check existing playlists to avoid duplicate naming collisions
    let existingPlaylists: Playlist[] = [];
    try {
      const raw = localStorage.getItem('sw_playlists');
      if (raw) existingPlaylists = JSON.parse(raw);
    } catch {}

    let finalTitle = rawPlaylist.title;
    let counter = 2;
    while (existingPlaylists.some((p) => p.title.toLowerCase() === finalTitle.toLowerCase())) {
      finalTitle = `${rawPlaylist.title} (${counter})`;
      counter++;
    }

    const createdPlaylist: Playlist = {
      id: `imported_spotify_${Date.now()}`,
      title: finalTitle,
      description: `Imported Spotify playlist • ${matchedSongs.length} tracks matched`,
      artwork: rawPlaylist.artwork || (matchedSongs[0]?.artworkLg || matchedSongs[0]?.artwork),
      creator: 'Spotify Import',
      tracks: matchedSongs,
      isUserCreated: true,
      totalDuration: matchedSongs.reduce((sum, s) => sum + s.duration, 0),
    };

    // Save to localStorage
    try {
      const updated = [createdPlaylist, ...existingPlaylists];
      localStorage.setItem('sw_playlists', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('sw_playlists_updated', { detail: updated }));
    } catch {}

    // Step 4: Complete
    onProgress({
      step: 'complete',
      currentTrackIndex: totalTracks,
      totalTracks,
      currentTrackTitle: '',
      matchedCount: matchedSongs.length,
      unmatchedTracks,
      resultPlaylist: createdPlaylist,
    });

    return createdPlaylist;
  }
}
