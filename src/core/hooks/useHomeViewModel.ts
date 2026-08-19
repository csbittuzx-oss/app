// ═══════════════════════════════════════════════════════════════════
//  useHomeViewModel Hook — Exposes YouTube InnerTube Home Feeds & Trending Data
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo } from 'react';
import { homeViewModel, type HomeViewState } from '../../domain/viewmodels/HomeViewModel';
import type { HomePageChip, BrowseFilterOptions } from '../../data/models/youtubeBrowse';

export function useHomeViewModel(initialFilters?: BrowseFilterOptions) {
  const [state, setState] = useState<HomeViewState>(() => homeViewModel.getState());

  useEffect(() => {
    if (initialFilters) {
      homeViewModel.setFilterOptions(initialFilters);
    }
    const unsubscribe = homeViewModel.subscribe((newState) => {
      setState(newState);
    });
    // Trigger initial parallel load if empty
    if (!homeViewModel.getState().homePage && !homeViewModel.getState().isLoading) {
      homeViewModel.loadAllFeeds();
    }
    return unsubscribe;
  }, []);

  const refresh = useCallback(() => {
    return homeViewModel.refresh();
  }, []);

  const selectMoodChip = useCallback((chip: HomePageChip) => {
    return homeViewModel.selectMoodChip(chip);
  }, []);

  const clearMoodFilter = useCallback(() => {
    return homeViewModel.clearMoodFilter();
  }, []);

  const setFilterOptions = useCallback((opts: Partial<BrowseFilterOptions>) => {
    homeViewModel.setFilterOptions(opts);
  }, []);

  const trendingSongs = useMemo(() => homeViewModel.getTrendingSongs(), [state.chartsPage]);
  const newReleaseAlbums = useMemo(() => homeViewModel.getNewReleaseAlbums(), [state.explorePage]);
  const topMusicVideos = useMemo(() => homeViewModel.getTopMusicVideos(), [state.chartsPage]);
  const moodChips = useMemo(() => homeViewModel.getMoodChips(), [state.homePage]);
  const homeSections = useMemo(() => homeViewModel.getHomeSections(), [state.homePage]);

  return {
    ...state,
    trendingSongs,
    newReleaseAlbums,
    topMusicVideos,
    moodChips,
    homeSections,
    refresh,
    selectMoodChip,
    clearMoodFilter,
    setFilterOptions,
  };
}
