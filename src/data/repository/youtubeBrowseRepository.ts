// ═══════════════════════════════════════════════════════════════════
//  YouTube Music InnerTube Repository
//  Handles Base Home Feed, Mood/Vibe Feeds, Explore, & Charts Feeds
// ═══════════════════════════════════════════════════════════════════

import {
  fetchYouTubeHome,
  fetchYouTubeExplore,
  fetchYouTubeCharts,
} from '../api/youtubeBrowseApi';

import {
  type HomePage,
  type ExplorePage,
  type ChartsPage,
  type BrowseFilterOptions,
  type SongItem,
  filterExplicit,
  filterVideoSongs,
  filterYoutubeShorts,
  songItemToSong,
} from '../models/youtubeBrowse';

import type { Song } from '../models';

export class YouTubeResult<T> {
  readonly value?: T;
  readonly error?: Error;

  private constructor(value?: T, error?: Error) {
    this.value = value;
    this.error = error;
  }

  static success<T>(data: T): YouTubeResult<T> {
    return new YouTubeResult<T>(data, undefined);
  }

  static failure<T>(err: Error | unknown): YouTubeResult<T> {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    return new YouTubeResult<T>(undefined, errorObj);
  }

  get isSuccess(): boolean {
    return this.error === undefined;
  }

  get isFailure(): boolean {
    return this.error !== undefined;
  }

  getOrNull(): T | null {
    return this.value ?? null;
  }

  getOrThrow(): T {
    if (this.error) throw this.error;
    return this.value as T;
  }

  onSuccess(action: (data: T) => void): YouTubeResult<T> {
    if (this.isSuccess && this.value !== undefined) {
      action(this.value);
    }
    return this;
  }

  onFailure(action: (error: Error) => void): YouTubeResult<T> {
    if (this.isFailure && this.error !== undefined) {
      action(this.error);
    }
    return this;
  }

  map<R>(transform: (data: T) => R): YouTubeResult<R> {
    if (this.isSuccess && this.value !== undefined) {
      try {
        return YouTubeResult.success<R>(transform(this.value));
      } catch (e) {
        return YouTubeResult.failure<R>(e);
      }
    }
    return YouTubeResult.failure<R>(this.error!);
  }
}

// In-memory cache for fast repeated views
const homeCache = new Map<string, { data: HomePage; ts: number }>();
const exploreCache = new Map<string, { data: ExplorePage; ts: number }>();
const chartsCache = new Map<string, { data: ChartsPage; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class YouTubeRepository {
  /**
   * 1. Base Home Feed:
   * Endpoint: browse with browseId = "FEmusic_home"
   * Returns: List of HomePage.Section (title + items: SongItem, AlbumItem, PlaylistItem) + HomePage.Chip
   */
  async home(params?: string, options?: BrowseFilterOptions): Promise<YouTubeResult<HomePage>> {
    const cacheKey = `home_${params || 'default'}`;
    const cached = homeCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return YouTubeResult.success(this.applyHomePageFilters(cached.data, options));
    }

    try {
      const rawPage = await fetchYouTubeHome(params);
      homeCache.set(cacheKey, { data: rawPage, ts: Date.now() });
      const filteredPage = this.applyHomePageFilters(rawPage, options);
      return YouTubeResult.success(filteredPage);
    } catch (err) {
      console.error('[YouTubeRepository] Error fetching home feed:', err);
      return YouTubeResult.failure(err);
    }
  }

  /**
   * 2. Mood / Vibe Filtered Feed (Romance, Energize, Relax, Focus, Party):
   * Endpoint: browse with browseId = "FEmusic_home" and params = selectedChip.endpoint.params
   * Returns: Dynamic mood-customized song sections matching the selected vibe.
   */
  async mood(params: string, options?: BrowseFilterOptions): Promise<YouTubeResult<HomePage>> {
    return this.home(params, options);
  }

  /**
   * 3. New Releases & Explore Feed:
   * Endpoint: browse with browseId = "FEmusic_explore"
   * Returns: newReleaseAlbums containing latest global/regional album drops and single tracks.
   */
  async explore(options?: BrowseFilterOptions): Promise<YouTubeResult<ExplorePage>> {
    const cacheKey = 'explore_feed';
    const cached = exploreCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return YouTubeResult.success(this.applyExplorePageFilters(cached.data, options));
    }

    try {
      const rawPage = await fetchYouTubeExplore();
      exploreCache.set(cacheKey, { data: rawPage, ts: Date.now() });
      const filteredPage = this.applyExplorePageFilters(rawPage, options);
      return YouTubeResult.success(filteredPage);
    } catch (err) {
      console.error('[YouTubeRepository] Error fetching explore feed:', err);
      return YouTubeResult.failure(err);
    }
  }

  /**
   * 4. Trending & Charts Feed:
   * Endpoint: browse with browseId = "FEmusic_charts"
   * Returns: Top 100 trending songs, top music videos, and top daily chart hits.
   */
  async charts(countryCode = 'IN', options?: BrowseFilterOptions): Promise<YouTubeResult<ChartsPage>> {
    const cacheKey = `charts_${countryCode}`;
    const cached = chartsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return YouTubeResult.success(this.applyChartsPageFilters(cached.data, options));
    }

    try {
      const rawPage = await fetchYouTubeCharts(countryCode);
      chartsCache.set(cacheKey, { data: rawPage, ts: Date.now() });
      const filteredPage = this.applyChartsPageFilters(rawPage, options);
      return YouTubeResult.success(filteredPage);
    } catch (err) {
      console.error('[YouTubeRepository] Error fetching charts feed:', err);
      return YouTubeResult.failure(err);
    }
  }

  /**
   * Fetches trending tracks formatted as standard domain Song models for seamless playback.
   */
  async trendingSongs(limit = 30, options?: BrowseFilterOptions): Promise<Song[]> {
    const chartsRes = await this.charts('IN', options);
    const chartsPage = chartsRes.getOrNull();
    if (chartsPage && chartsPage.topSongs && chartsPage.topSongs.length > 0) {
      return chartsPage.topSongs.slice(0, limit).map(songItemToSong);
    }

    const homeRes = await this.home(undefined, options);
    const homePage = homeRes.getOrNull();
    if (homePage) {
      const songItems: SongItem[] = [];
      for (const section of homePage.sections) {
        for (const item of section.items) {
          if (item.type === 'song') songItems.push(item as SongItem);
        }
      }
      if (songItems.length > 0) {
        return songItems.slice(0, limit).map(songItemToSong);
      }
    }

    return [];
  }

  // ─── Filter Application Pipeline ───

  private applyHomePageFilters(page: HomePage, options?: BrowseFilterOptions): HomePage {
    if (!options) return page;
    const hideExplicit = !!options.hideExplicit;
    const hideVideoSongs = !!options.hideVideoSongs;
    const hideYoutubeShorts = !!options.hideYoutubeShorts;

    const filteredSections = page.sections
      .map((section) => {
        let filtered = section.items;
        if (hideExplicit) filtered = filterExplicit(filtered, true);
        if (hideVideoSongs) filtered = filterVideoSongs(filtered, true);
        if (hideYoutubeShorts) filtered = filterYoutubeShorts(filtered, true);

        if (filtered.length === 0) return null;
        return {
          ...section,
          items: filtered,
        };
      })
      .filter(Boolean) as HomePage['sections'];

    return {
      ...page,
      sections: filteredSections,
    };
  }

  private applyExplorePageFilters(page: ExplorePage, options?: BrowseFilterOptions): ExplorePage {
    if (!options) return page;
    const hideExplicit = !!options.hideExplicit;

    return {
      ...page,
      newReleaseAlbums: hideExplicit ? filterExplicit(page.newReleaseAlbums, true) : page.newReleaseAlbums,
      trendingSongs: hideExplicit ? filterExplicit(page.trendingSongs, true) : page.trendingSongs,
    };
  }

  private applyChartsPageFilters(page: ChartsPage, options?: BrowseFilterOptions): ChartsPage {
    if (!options) return page;
    const hideExplicit = !!options.hideExplicit;
    const hideVideoSongs = !!options.hideVideoSongs;
    const hideYoutubeShorts = !!options.hideYoutubeShorts;

    let topSongs = page.topSongs;
    let topVideos = page.topVideos;
    let dailyHits = page.dailyHits;

    if (hideExplicit) {
      topSongs = filterExplicit(topSongs, true);
      topVideos = filterExplicit(topVideos, true);
      dailyHits = filterExplicit(dailyHits, true);
    }

    if (hideVideoSongs) {
      topSongs = filterVideoSongs(topSongs, true) as SongItem[];
      dailyHits = filterVideoSongs(dailyHits, true) as SongItem[];
    }

    if (hideYoutubeShorts) {
      topSongs = filterYoutubeShorts(topSongs, true) as SongItem[];
      dailyHits = filterYoutubeShorts(dailyHits, true) as SongItem[];
    }

    return {
      ...page,
      topSongs,
      topVideos,
      dailyHits,
    };
  }
}

/**
 * Singleton instance of YouTubeRepository for unified access.
 */
export const YouTube = new YouTubeRepository();
