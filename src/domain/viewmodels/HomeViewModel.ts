// ═══════════════════════════════════════════════════════════════════
//  HomeViewModel — YouTube Music InnerTube Browse & Trending Pipeline
//  Implements Parallel Network Dispatching & Mood/Filter Pipeline
// ═══════════════════════════════════════════════════════════════════

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
  songItemToSong,
  albumItemToAlbum,
} from '../../data/models/youtubeBrowse';
import type { Song, Album } from '../../data/models';

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

export class HomeViewModel {
  private state: HomeViewState = {
    homePage: null,
    explorePage: null,
    chartsPage: null,
    selectedChip: null,
    isLoading: false,
    isRefreshing: false,
    error: null,
    filterOptions: {
      hideExplicit: false,
      hideVideoSongs: false,
      hideYoutubeShorts: false,
    },
  };

  private listeners = new Set<HomeStateListener>();

  constructor(initialFilters?: BrowseFilterOptions) {
    if (initialFilters) {
      this.state.filterOptions = { ...this.state.filterOptions, ...initialFilters };
    }
  }

  // ─── State Observers ───

  getState(): HomeViewState {
    return { ...this.state };
  }

  subscribe(listener: HomeStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const currentState = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(currentState);
      } catch (e) {
        console.error('[HomeViewModel] Listener error:', e);
      }
    }
  }

  private updateState(partial: Partial<HomeViewState>) {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  2️⃣ PARALLEL NETWORK DISPATCHING (HomeViewModel / Repository)
  //  Loads all feeds concurrently in parallel on launch / refresh
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Dispatches parallel concurrent network requests for:
   * 1. YouTube.home()
   * 2. YouTube.explore()
   * 3. YouTube.charts()
   */
  async loadAllFeeds(isRefresh = false): Promise<void> {
    if (isRefresh) {
      this.updateState({ isRefreshing: true, error: null });
    } else {
      this.updateState({ isLoading: true, error: null });
    }

    const { hideExplicit, hideVideoSongs, hideYoutubeShorts } = this.state.filterOptions;
    const moodParams = this.state.selectedChip?.params;

    try {
      // Parallel concurrent execution: coroutineScope / Promise.all
      await Promise.all([
        // 1. Home / Mood feed
        YouTube.home(moodParams).then((result) => {
          result.onSuccess((page) => {
            const filteredSections = page.sections
              .map((section) => {
                let items = section.items;
                if (hideExplicit) items = filterExplicit(items, true);
                if (hideVideoSongs) items = filterVideoSongs(items, true);
                if (hideYoutubeShorts) items = filterYoutubeShorts(items, true);

                if (items.length === 0) return null;
                return {
                  ...section,
                  items,
                };
              })
              .filter(Boolean) as HomePageSection[];

            this.updateState({
              homePage: {
                ...page,
                sections: filteredSections,
              },
            });
          });
        }),

        // 2. Explore / New Releases feed
        YouTube.explore().then((result) => {
          result.onSuccess((page) => {
            this.updateState({
              explorePage: {
                ...page,
                newReleaseAlbums: hideExplicit
                  ? filterExplicit(page.newReleaseAlbums, true)
                  : page.newReleaseAlbums,
                trendingSongs: hideExplicit
                  ? filterExplicit(page.trendingSongs, true)
                  : page.trendingSongs,
              },
            });
          });
        }),

        // 3. Charts / Trending feed
        YouTube.charts('IN').then((result) => {
          result.onSuccess((page) => {
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

            this.updateState({
              chartsPage: {
                ...page,
                topSongs,
                topVideos,
                dailyHits,
              },
            });
          });
        }),
      ]);
    } catch (err: any) {
      console.error('[HomeViewModel] Parallel dispatch failed:', err);
      this.updateState({ error: err?.message || 'Failed to load feeds' });
    } finally {
      this.updateState({ isLoading: false, isRefreshing: false });
    }
  }

  /**
   * Refreshes all feeds concurrently.
   */
  async refresh(): Promise<void> {
    return this.loadAllFeeds(true);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Mood / Vibe Filter Dispatcher
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Selects a Mood / Vibe Chip (Romance, Energize, Relax, Focus, Party, etc.)
   * and loads the corresponding dynamic mood-customized song sections.
   */
  async selectMoodChip(chip: HomePageChip): Promise<void> {
    const isSame = this.state.selectedChip?.params === chip.params;
    const newSelected = isSame ? null : chip;

    this.updateState({
      selectedChip: newSelected,
      isLoading: true,
      error: null,
    });

    const { hideExplicit, hideVideoSongs, hideYoutubeShorts } = this.state.filterOptions;
    const targetParams = newSelected?.params;

    try {
      const result = await YouTube.home(targetParams);
      result.onSuccess((page) => {
        const filteredSections = page.sections
          .map((section) => {
            let items = section.items;
            if (hideExplicit) items = filterExplicit(items, true);
            if (hideVideoSongs) items = filterVideoSongs(items, true);
            if (hideYoutubeShorts) items = filterYoutubeShorts(items, true);

            if (items.length === 0) return null;
            return {
              ...section,
              items,
            };
          })
          .filter(Boolean) as HomePageSection[];

        this.updateState({
          homePage: {
            ...page,
            sections: filteredSections,
          },
        });
      });
    } catch (err: any) {
      this.updateState({ error: err?.message || 'Failed to load mood feed' });
    } finally {
      this.updateState({ isLoading: false });
    }
  }

  /**
   * Clears active mood filter and restores default home feed.
   */
  async clearMoodFilter(): Promise<void> {
    if (!this.state.selectedChip) return;
    this.updateState({ selectedChip: null });
    return this.loadAllFeeds();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Filter Options
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Updates filter options and triggers immediate re-filtering / reloading.
   */
  setFilterOptions(options: Partial<BrowseFilterOptions>): void {
    this.updateState({
      filterOptions: {
        ...this.state.filterOptions,
        ...options,
      },
    });
    this.loadAllFeeds();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Exposed Data Convenience Getters (Domain Models)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Returns Top Trending & Daily Chart hits as standard playable Song[] models.
   */
  getTrendingSongs(): Song[] {
    if (this.state.chartsPage?.topSongs && this.state.chartsPage.topSongs.length > 0) {
      return this.state.chartsPage.topSongs.map(songItemToSong);
    }
    if (this.state.chartsPage?.dailyHits && this.state.chartsPage.dailyHits.length > 0) {
      return this.state.chartsPage.dailyHits.map(songItemToSong);
    }
    return [];
  }

  /**
   * Returns New Releases as standard Album[] models.
   */
  getNewReleaseAlbums(): Album[] {
    if (this.state.explorePage?.newReleaseAlbums) {
      return this.state.explorePage.newReleaseAlbums.map(albumItemToAlbum);
    }
    return [];
  }

  /**
   * Returns Top Music Videos as standard playable Song[] models.
   */
  getTopMusicVideos(): Song[] {
    if (this.state.chartsPage?.topVideos) {
      return this.state.chartsPage.topVideos.map(songItemToSong);
    }
    return [];
  }

  /**
   * Returns Available Mood / Vibe Chips.
   */
  getMoodChips(): HomePageChip[] {
    return this.state.homePage?.chips || [];
  }

  /**
   * Returns Home Sections.
   */
  getHomeSections(): HomePageSection[] {
    return this.state.homePage?.sections || [];
  }
}

/**
 * Singleton ViewModel instance.
 */
export const homeViewModel = new HomeViewModel();
