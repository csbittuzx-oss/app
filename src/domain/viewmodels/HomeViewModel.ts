// =============================================================================
//  HomeViewModel - YouTube Music InnerTube Browse & Trending Data Pipeline
//
//  1 Core Browse Endpoints: home (FEmusic_home), explore (FEmusic_explore),
//    charts (FEmusic_charts)
//  2 Parallel Network Dispatching: Promise.all concurrent fetches
//  3 Dynamic Mood Chip Switching with previousHomePage memory cache
//  4 Content Cleaning & Sanitization:
//    filterExplicit / filterVideoSongs / filterYoutubeShorts / distinctBy
//  5 Reactive StateFlow Exposure consumed by React via useHomeViewModel hook
// =============================================================================

import { YouTube } from '../../data/repository/youtubeBrowseRepository';
import {
  type HomePage,
  type ExplorePage,
  type ChartsPage,
  type HomePageChip,
  type HomePageSection,
  type BrowseFilterOptions,
  type SongItem,
  filterExplicit,
  filterVideoSongs,
  filterYoutubeShorts,
  distinctBy,
  songItemToSong,
  albumItemToAlbum,
} from '../../data/models/youtubeBrowse';
import type { Song, Album } from '../../data/models';

// =============================================================================
//  5 REACTIVE STATE FLOW IMPLEMENTATION
//  TypeScript-native equivalent of Kotlin StateFlow / MutableStateFlow.
// =============================================================================

export interface StateFlow<T> {
  readonly value: T;
  subscribe(listener: (value: T) => void): () => void;
}

export class MutableStateFlow<T> implements StateFlow<T> {
  private _value: T;
  private readonly _listeners = new Set<(value: T) => void>();

  constructor(initialValue: T) {
    this._value = initialValue;
  }

  get value(): T {
    return this._value;
  }

  set value(newValue: T) {
    if (this._value === newValue && typeof newValue !== 'object') return;
    this._value = newValue;
    for (const listener of this._listeners) {
      try { listener(this._value); } catch (e) { console.error('[StateFlow]', e); }
    }
  }

  emit(newValue: T): void {
    this._value = newValue;
    for (const listener of this._listeners) {
      try { listener(this._value); } catch (e) { console.error('[StateFlow]', e); }
    }
  }

  subscribe(listener: (value: T) => void): () => void {
    this._listeners.add(listener);
    listener(this._value); // hot - deliver current value immediately
    return () => { this._listeners.delete(listener); };
  }
}

// =============================================================================
//  HOME VIEW STATE  (aggregated snapshot for legacy observer pattern)
// =============================================================================

export interface HomeViewState {
  homePage: HomePage | null;
  explorePage: ExplorePage | null;
  chartsPage: ChartsPage | null;
  selectedChip: HomePageChip | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  filterOptions: BrowseFilterOptions;
}

export type HomeStateListener = (state: HomeViewState) => void;

// =============================================================================
//  HOME VIEW MODEL
// =============================================================================

export class HomeViewModel {

  // 5 - Public StateFlow accessors -------------------------------------------
  private readonly _homePage    = new MutableStateFlow<HomePage | null>(null);
  private readonly _explorePage = new MutableStateFlow<ExplorePage | null>(null);
  private readonly _chartsPage  = new MutableStateFlow<ChartsPage | null>(null);
  private readonly _selectedChip  = new MutableStateFlow<HomePageChip | null>(null);
  private readonly _isLoading     = new MutableStateFlow<boolean>(false);
  private readonly _isRefreshing  = new MutableStateFlow<boolean>(false);
  private readonly _error         = new MutableStateFlow<string | null>(null);
  private readonly _filterOptions = new MutableStateFlow<BrowseFilterOptions>({
    hideExplicit: false,
    hideVideoSongs: false,
    hideYoutubeShorts: false,
  });

  readonly homePage:      StateFlow<HomePage | null>      = this._homePage;
  readonly explorePage:   StateFlow<ExplorePage | null>   = this._explorePage;
  readonly chartsPage:    StateFlow<ChartsPage | null>    = this._chartsPage;
  readonly selectedChip:  StateFlow<HomePageChip | null>  = this._selectedChip;
  readonly isLoading:     StateFlow<boolean>              = this._isLoading;
  readonly isRefreshing:  StateFlow<boolean>              = this._isRefreshing;
  readonly error:         StateFlow<string | null>        = this._error;
  readonly filterOptions: StateFlow<BrowseFilterOptions>  = this._filterOptions;

  // 3 - previousHomePage memory cache for instant chip deselection ------------
  private previousHomePage: HomePage | null = null;

  // Legacy aggregated listeners -----------------------------------------------
  private readonly listeners = new Set<HomeStateListener>();

  constructor(initialFilters?: Partial<BrowseFilterOptions>) {
    if (initialFilters) {
      this._filterOptions.value = { ...this._filterOptions.value, ...initialFilters };
    }
    const notifyAll = () => this._notifyLegacyListeners();
    this._homePage.subscribe(notifyAll);
    this._explorePage.subscribe(notifyAll);
    this._chartsPage.subscribe(notifyAll);
    this._selectedChip.subscribe(notifyAll);
    this._isLoading.subscribe(notifyAll);
    this._isRefreshing.subscribe(notifyAll);
    this._error.subscribe(notifyAll);
    this._filterOptions.subscribe(notifyAll);
  }

  // ---------------------------------------------------------------------------
  //  STATE OBSERVATION
  // ---------------------------------------------------------------------------

  getState(): HomeViewState {
    return {
      homePage:      this._homePage.value,
      explorePage:   this._explorePage.value,
      chartsPage:    this._chartsPage.value,
      selectedChip:  this._selectedChip.value,
      isLoading:     this._isLoading.value,
      isRefreshing:  this._isRefreshing.value,
      error:         this._error.value,
      filterOptions: this._filterOptions.value,
    };
  }

  subscribe(listener: HomeStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => { this.listeners.delete(listener); };
  }

  private _notifyLegacyListeners(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try { listener(state); } catch (e) { console.error('[HomeViewModel] Listener error:', e); }
    }
  }

  // ---------------------------------------------------------------------------
  //  2 PARALLEL NETWORK DISPATCHING
  //  Concurrent fetches via Promise.all - equivalent to Kotlin coroutineScope
  //  with launch(Dispatchers.IO) for each feed.
  // ---------------------------------------------------------------------------

  async loadAllFeeds(isRefresh = false): Promise<void> {
    if (isRefresh) {
      this._isRefreshing.emit(true);
    } else {
      this._isLoading.emit(true);
    }
    this._error.emit(null);

    const { hideExplicit: _he, hideVideoSongs: _hv, hideYoutubeShorts: _hs } = this._filterOptions.value;
    const hideExplicit = !!_he; const hideVideoSongs = !!_hv; const hideYoutubeShorts = !!_hs;
    const moodParams =
      this._selectedChip.value?.endpoint?.params ||
      this._selectedChip.value?.params ||
      undefined;

    try {
      await Promise.all([

        // 1 - Base Home Feed / Mood-Vibe Feed (FEmusic_home)
        YouTube.home(moodParams).then((result) => {
          result.onSuccess((page) => {
            const processed = this._processHomePage(page, hideExplicit, hideVideoSongs, hideYoutubeShorts);
            if (!this._selectedChip.value) {
              this.previousHomePage = processed;
            }
            this._homePage.value = processed;
          }).onFailure((err) => {
            console.warn('[HomeViewModel] Home feed error:', err.message);
          });
        }),

        // 2 - New Releases & Explore (FEmusic_explore)
        YouTube.explore().then((result) => {
          result.onSuccess((page) => {
            this._explorePage.value = {
              ...page,
              newReleaseAlbums: distinctBy(
                hideExplicit ? filterExplicit(page.newReleaseAlbums, true) : page.newReleaseAlbums,
                (it) => it.id
              ),
              trendingSongs: distinctBy(
                hideExplicit ? filterExplicit(page.trendingSongs, true) : page.trendingSongs,
                (it) => it.id
              ),
            };
          }).onFailure((err) => {
            console.warn('[HomeViewModel] Explore feed error:', err.message);
          });
        }),

        // 3 - Trending & Charts (FEmusic_charts)
        YouTube.charts('IN').then((result) => {
          result.onSuccess((page) => {
            let topSongs  = page.topSongs;
            let topVideos = page.topVideos;
            let dailyHits = page.dailyHits;

            if (hideExplicit) {
              topSongs  = filterExplicit(topSongs,  true);
              topVideos = filterExplicit(topVideos, true);
              dailyHits = filterExplicit(dailyHits, true);
            }
            if (hideVideoSongs) {
              topSongs  = filterVideoSongs(topSongs,  true) as SongItem[];
              dailyHits = filterVideoSongs(dailyHits, true) as SongItem[];
            }
            if (hideYoutubeShorts) {
              topSongs  = filterYoutubeShorts(topSongs,  true) as SongItem[];
              dailyHits = filterYoutubeShorts(dailyHits, true) as SongItem[];
            }

            this._chartsPage.value = {
              ...page,
              topSongs:  distinctBy(topSongs,  (it) => it.id),
              topVideos: distinctBy(topVideos, (it) => it.id),
              dailyHits: distinctBy(dailyHits, (it) => it.id),
            };
          }).onFailure((err) => {
            console.warn('[HomeViewModel] Charts feed error:', err.message);
          });
        }),

      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[HomeViewModel] Parallel dispatch error:', msg);
      this._error.value = msg || 'Failed to load feeds';
    } finally {
      this._isLoading.emit(false);
      this._isRefreshing.emit(false);
    }
  }

  async refresh(): Promise<void> {
    return this.loadAllFeeds(true);
  }

  // ---------------------------------------------------------------------------
  //  3 DYNAMIC MOOD CHIP SWITCHING LOGIC
  // ---------------------------------------------------------------------------

  /**
   * Toggles a mood/vibe chip (Romance, Energize, Relax, Focus, Party, etc.)
   *
   * Selecting a NEW chip:
   *   1. Saves current homePage to previousHomePage memory cache.
   *   2. Fetches YouTube.home(chip.endpoint.params) for the mood-customised feed.
   *   3. Emits filtered sections to homePage StateFlow.
   *
   * Tapping the ACTIVE chip again OR passing null (deselect):
   *   1. Clears selectedChip.
   *   2. Restores previousHomePage instantly from memory - zero network call.
   *   3. Falls back to loadAllFeeds() only if cache is empty.
   */
  async toggleChip(chip: HomePageChip | null): Promise<void> {
    const activeChip = this._selectedChip.value;

    const isDeselecting =
      !chip ||
      (activeChip !== null &&
        (activeChip.params === chip.params ||
          (chip.endpoint?.params && activeChip.endpoint?.params === chip.endpoint.params)));

    if (isDeselecting) {
      this._selectedChip.value = null;
      if (this.previousHomePage) {
        this._homePage.value = this.previousHomePage;
        return;
      }
      return this.loadAllFeeds(false);
    }

    // Switching to a new chip - cache base page first
    if (activeChip === null && this._homePage.value) {
      this.previousHomePage = this._homePage.value;
    }

    this._selectedChip.value = chip;
    this._isLoading.emit(true);
    this._error.emit(null);

    const { hideExplicit: _he, hideVideoSongs: _hv, hideYoutubeShorts: _hs } = this._filterOptions.value;
    const hideExplicit = !!_he; const hideVideoSongs = !!_hv; const hideYoutubeShorts = !!_hs;
    const targetParams = chip.endpoint?.params || chip.params;

    try {
      const result = await YouTube.home(targetParams);
      result
        .onSuccess((page) => {
          this._homePage.value = this._processHomePage(
            page, hideExplicit, hideVideoSongs, hideYoutubeShorts
          );
        })
        .onFailure((err) => {
          console.warn('[HomeViewModel] Mood feed error:', err.message);
          this._error.value = err.message || 'Failed to load mood feed';
        });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this._error.value = msg;
    } finally {
      this._isLoading.emit(false);
    }
  }

  async selectMoodChip(chip: HomePageChip): Promise<void> {
    return this.toggleChip(chip);
  }

  async clearMoodFilter(): Promise<void> {
    return this.toggleChip(null);
  }

  // ---------------------------------------------------------------------------
  //  4 CONTENT CLEANING & SANITIZATION OPTIONS
  // ---------------------------------------------------------------------------

  /**
   * Updates content filter options and immediately reloads all feeds with
   * the new settings. Invalidates the previousHomePage cache so restored
   * pages also respect the new filter preferences.
   */
  setFilterOptions(options: Partial<BrowseFilterOptions>): void {
    this._filterOptions.value = { ...this._filterOptions.value, ...options };
    this.previousHomePage = null;
    this.loadAllFeeds(false);
  }

  // ---------------------------------------------------------------------------
  //  4 INTERNAL CONTENT SANITIZATION PIPELINE
  // ---------------------------------------------------------------------------

  /**
   * Applies the full sanitization pipeline to a raw HomePage:
   *   - filterExplicit(hideExplicit)           - removes explicit tracks
   *   - filterVideoSongs(hideVideoSongs)        - removes non-music video tracks
   *   - filterYoutubeShorts(hideYoutubeShorts)  - removes short clips (< 60s)
   *   - distinctBy { it.id }                   - cross-section deduplication
   *
   * Sections that become empty after filtering are dropped entirely.
   */
  private _processHomePage(
    page: HomePage,
    hideExplicit: boolean,
    hideVideoSongs: boolean,
    hideYoutubeShorts: boolean
  ): HomePage {
    const seenIds = new Set<string>();
    const filteredSections: HomePageSection[] = [];

    for (const section of page.sections) {
      let items = section.items;

      if (hideExplicit)      items = filterExplicit(items, true);
      if (hideVideoSongs)    items = filterVideoSongs(items, true);
      if (hideYoutubeShorts) items = filterYoutubeShorts(items, true);

      // distinctBy { it.id } - cross-page deduplication
      items = items.filter((item) => {
        if (!item.id || seenIds.has(item.id)) return false;
        seenIds.add(item.id);
        return true;
      });

      if (items.length === 0) continue;
      filteredSections.push({ ...section, items });
    }

    return { ...page, sections: filteredSections };
  }

  // ---------------------------------------------------------------------------
  //  DOMAIN MODEL CONVENIENCE GETTERS
  // ---------------------------------------------------------------------------

  getTrendingSongs(): Song[] {
    const charts = this._chartsPage.value;
    if (charts?.topSongs?.length)  return charts.topSongs.map(songItemToSong);
    if (charts?.dailyHits?.length) return charts.dailyHits.map(songItemToSong);
    return [];
  }

  getNewReleaseAlbums(): Album[] {
    return this._explorePage.value?.newReleaseAlbums?.map(albumItemToAlbum) ?? [];
  }

  getTopMusicVideos(): Song[] {
    return this._chartsPage.value?.topVideos?.map(songItemToSong) ?? [];
  }

  getMoodChips(): HomePageChip[] {
    return this._homePage.value?.chips ?? [];
  }

  getHomeSections(): HomePageSection[] {
    return this._homePage.value?.sections ?? [];
  }
}

// =============================================================================
//  SINGLETON
// =============================================================================
export const homeViewModel = new HomeViewModel();

