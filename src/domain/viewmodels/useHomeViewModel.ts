// =============================================================================
//  useHomeViewModel - React hook bridging HomeViewModel StateFlows to React state
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { homeViewModel, type StateFlow } from './HomeViewModel';
import type {
  HomePage,
  ExplorePage,
  ChartsPage,
  HomePageChip,
  BrowseFilterOptions,
} from '../../data/models/youtubeBrowse';
import type { Song, Album } from '../../data/models';

// =============================================================================
//  useStateFlow - Subscribes a single StateFlow to React component state
// =============================================================================

function useStateFlow<T>(flow: StateFlow<T>): T {
  const [value, setValue] = useState<T>(flow.value);
  useEffect(() => {
    const unsub = flow.subscribe((v) => setValue(v));
    return unsub;
  }, [flow]);
  return value;
}

// =============================================================================
//  useHomeViewModel
// =============================================================================

export interface UseHomeViewModelReturn {
  // 5 - Reactive StateFlows
  homePage:      HomePage | null;
  explorePage:   ExplorePage | null;
  chartsPage:    ChartsPage | null;
  selectedChip:  HomePageChip | null;
  isLoading:     boolean;
  isRefreshing:  boolean;
  error:         string | null;
  filterOptions: BrowseFilterOptions;

  // Actions
  loadAllFeeds:    (isRefresh?: boolean) => Promise<void>;
  refresh:         () => Promise<void>;
  toggleChip:      (chip: HomePageChip | null) => Promise<void>;
  selectMoodChip:  (chip: HomePageChip) => Promise<void>;
  clearMoodFilter: () => Promise<void>;
  setFilterOptions:(opts: Partial<BrowseFilterOptions>) => void;

  // Domain model getters
  getTrendingSongs:    () => Song[];
  getNewReleaseAlbums: () => Album[];
  getTopMusicVideos:   () => Song[];
  getMoodChips:        () => HomePageChip[];
  getHomeSections:     () => HomePage['sections'];
}

export function useHomeViewModel(): UseHomeViewModelReturn {
  const homePage      = useStateFlow(homeViewModel.homePage);
  const explorePage   = useStateFlow(homeViewModel.explorePage);
  const chartsPage    = useStateFlow(homeViewModel.chartsPage);
  const selectedChip  = useStateFlow(homeViewModel.selectedChip);
  const isLoading     = useStateFlow(homeViewModel.isLoading);
  const isRefreshing  = useStateFlow(homeViewModel.isRefreshing);
  const error         = useStateFlow(homeViewModel.error);
  const filterOptions = useStateFlow(homeViewModel.filterOptions);

  const loadAllFeeds    = useCallback((isRefresh = false) => homeViewModel.loadAllFeeds(isRefresh), []);
  const refresh         = useCallback(() => homeViewModel.refresh(), []);
  const toggleChip      = useCallback((chip: HomePageChip | null) => homeViewModel.toggleChip(chip), []);
  const selectMoodChip  = useCallback((chip: HomePageChip) => homeViewModel.selectMoodChip(chip), []);
  const clearMoodFilter = useCallback(() => homeViewModel.clearMoodFilter(), []);
  const setFilterOptions = useCallback((opts: Partial<BrowseFilterOptions>) => homeViewModel.setFilterOptions(opts), []);

  const getTrendingSongs    = useCallback(() => homeViewModel.getTrendingSongs(),    [chartsPage]);
  const getNewReleaseAlbums = useCallback(() => homeViewModel.getNewReleaseAlbums(), [explorePage]);
  const getTopMusicVideos   = useCallback(() => homeViewModel.getTopMusicVideos(),   [chartsPage]);
  const getMoodChips        = useCallback(() => homeViewModel.getMoodChips(),        [homePage]);
  const getHomeSections     = useCallback(() => homeViewModel.getHomeSections(),     [homePage]);

  return {
    homePage,
    explorePage,
    chartsPage,
    selectedChip,
    isLoading,
    isRefreshing,
    error,
    filterOptions,
    loadAllFeeds,
    refresh,
    toggleChip,
    selectMoodChip,
    clearMoodFilter,
    setFilterOptions,
    getTrendingSongs,
    getNewReleaseAlbums,
    getTopMusicVideos,
    getMoodChips,
    getHomeSections,
  };
}

// =============================================================================
//  useHomeViewModelAutoLoad
//  Convenience hook: auto-loads feeds on mount and listens for online events.
// =============================================================================

export function useHomeViewModelAutoLoad(
  initialFilters?: Partial<BrowseFilterOptions>
): UseHomeViewModelReturn {
  const vm = useHomeViewModel();
  const initialFiltersRef = useRef(initialFilters);
  const hasLoaded = useRef(false);

  useEffect(() => {
    if (initialFiltersRef.current) {
      homeViewModel.setFilterOptions(initialFiltersRef.current);
    }
    if (!hasLoaded.current) {
      hasLoaded.current = true;
      homeViewModel.loadAllFeeds(false);
    }
    const handleOnlineRestored = () => homeViewModel.refresh();
    window.addEventListener('sw_online_restored', handleOnlineRestored);
    return () => {
      window.removeEventListener('sw_online_restored', handleOnlineRestored);
    };
  }, []);

  return vm;
}

