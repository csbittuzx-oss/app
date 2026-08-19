// ═══════════════════════════════════════════════════════════════════
//  YouTube Music InnerTube Browse API
//  Handles FEmusic_home, FEmusic_explore, FEmusic_charts, & Mood feeds
// ═══════════════════════════════════════════════════════════════════

import { universalPost } from '../../core/utils/http';
import { resizeImageUrl } from '../../core/utils/imageUtils';
import type {
  HomePage,
  HomePageSection,
  HomePageChip,
  ExplorePage,
  ChartsPage,
  HomeItem,
  SongItem,
  AlbumItem,
  PlaylistItem,
  ArtistItem,
  MoodOrGenreItem,
  Thumbnail,
} from '../models/youtubeBrowse';

const YTM_BROWSE_ENDPOINT = 'https://music.youtube.com/youtubei/v1/browse?prettyPrint=false';

function parseDurationString(durStr?: string): number {
  if (!durStr) return 0;
  const parts = durStr.split(':').map(p => parseInt(p, 10));
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function parseViewCount(str?: string): number | undefined {
  if (!str) return undefined;
  const match = str.match(/([\d.,]+)\s*([KkMmBb])?\s*(?:views?|plays?)/i);
  if (!match) return undefined;
  let num = parseFloat(match[1].replace(/,/g, ''));
  const unit = (match[2] || '').toUpperCase();
  if (unit === 'K') num *= 1_000;
  else if (unit === 'M') num *= 1_000_000;
  else if (unit === 'B') num *= 1_000_000_000;
  return Math.round(num);
}

function extractThumbnails(thumbObj: any): { url: string; list: Thumbnail[] } {
  const thumbs: any[] =
    thumbObj?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    thumbObj?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails ||
    thumbObj?.thumbnails ||
    [];

  const list: Thumbnail[] = thumbs.map((t: any) => ({
    url: t.url,
    width: t.width,
    height: t.height,
  }));

  const bestUrl = thumbs.slice(-1)[0]?.url || '';
  return {
    url: resizeImageUrl(bestUrl, 544, 544),
    list,
  };
}

/**
 * Parses a musicTwoRowItemRenderer into a typed HomeItem (Song, Album, Playlist, or Artist).
 */
function parseTwoRowItem(r: any): HomeItem | null {
  if (!r) return null;
  try {
    const title = r.title?.runs?.[0]?.text || '';
    if (!title) return null;

    const subtitleRuns = r.subtitle?.runs || [];
    const subtitleText = subtitleRuns.map((x: any) => x.text).join('');
    const { url: thumbnail, list: thumbnails } = extractThumbnails(r.thumbnailRenderer);

    const navEndpoint =
      r.navigationEndpoint ||
      r.title?.runs?.[0]?.navigationEndpoint ||
      r.thumbnailRenderer?.musicThumbnailRenderer?.navigationEndpoint;

    const watchEndpoint =
      navEndpoint?.watchEndpoint ||
      r.onTap?.watchEndpoint ||
      r.thumbnailOverlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint;

    const browseEndpoint = navEndpoint?.browseEndpoint;
    const browseId: string = browseEndpoint?.browseId || '';
    const pageType: string = browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType || '';

    const isExplicit = r.subtitleBadges?.some((b: any) => b.musicInlineBadgeRenderer?.icon?.iconType === 'MUSIC_EXPLICIT_BADGE');

    // 1. Artist Item
    if (pageType === 'MUSIC_PAGE_TYPE_ARTIST' || browseId.startsWith('UC') || browseId.startsWith('FEmusic_library_privately_owned_artist')) {
      const artistItem: ArtistItem = {
        type: 'artist',
        id: browseId || title,
        title,
        browseId,
        name: title,
        thumbnail,
        thumbnails,
        subscribers: subtitleText,
        subscribersCount: parseViewCount(subtitleText),
        endpoint: { browseId },
        explicit: isExplicit,
      };
      return artistItem;
    }

    // 2. Album Item
    if (pageType === 'MUSIC_PAGE_TYPE_ALBUM' || browseId.startsWith('MPREb_') || subtitleRuns.some((x: any) => x.text === 'Album' || x.text === 'EP' || x.text === 'Single')) {
      const artistName = subtitleRuns[2]?.text || subtitleRuns[0]?.text || 'YouTube Music';
      const year = subtitleRuns[subtitleRuns.length - 1]?.text || '';
      const albumItem: AlbumItem = {
        type: 'album',
        id: browseId || title,
        browseId,
        title,
        artist: artistName,
        artists: [{ name: artistName, browseId: subtitleRuns[2]?.navigationEndpoint?.browseEndpoint?.browseId }],
        year,
        thumbnail,
        thumbnails,
        endpoint: { browseId },
        explicit: isExplicit,
      };
      return albumItem;
    }

    // 3. Playlist Item
    if (pageType === 'MUSIC_PAGE_TYPE_PLAYLIST' || browseId.startsWith('VLPL') || browseId.startsWith('RDAMVM') || subtitleRuns.some((x: any) => x.text === 'Playlist')) {
      const author = subtitleRuns[2]?.text || subtitleRuns[0]?.text || 'YouTube Music';
      const playlistItem: PlaylistItem = {
        type: 'playlist',
        id: browseId || title,
        browseId,
        playlistId: browseId.replace(/^VL/, ''),
        title,
        author,
        thumbnail,
        thumbnails,
        songCountText: subtitleRuns[subtitleRuns.length - 1]?.text,
        description: subtitleText,
        endpoint: { browseId },
        explicit: isExplicit,
      };
      return playlistItem;
    }

    // 4. Song / Video Item (Has watchEndpoint)
    const videoId = watchEndpoint?.videoId || '';
    const artistName = subtitleRuns[2]?.text || subtitleRuns[0]?.text || 'YouTube Music';
    const isVideo = subtitleRuns.some((x: any) => x.text?.toLowerCase().includes('video')) || !!watchEndpoint;
    const views = parseViewCount(subtitleText);

    const songItem: SongItem = {
      type: 'song',
      id: videoId || title,
      videoId,
      title,
      artist: artistName,
      artists: [{ name: artistName, browseId: subtitleRuns[2]?.navigationEndpoint?.browseEndpoint?.browseId }],
      thumbnail: thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
      thumbnails,
      playCount: views,
      playCountText: subtitleText,
      isVideo,
      endpoint: { videoId },
      explicit: isExplicit,
    };
    return songItem;
  } catch (e) {
    console.warn('Error parsing twoRowItem:', e);
    return null;
  }
}

/**
 * Parses a musicResponsiveListItemRenderer (table rows, trending rows, charts) into a typed HomeItem.
 */
function parseResponsiveListItem(r: any, index = 0): HomeItem | null {
  if (!r) return null;
  try {
    const flexColumns = r.flexColumns || [];
    const col0 = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
    const title = col0[0]?.text || '';
    if (!title) return null;

    const col1 = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
    const subtitleText = col1.map((x: any) => x.text).join('');
    const typeRun = col1[0]?.text || '';

    const { url: thumbnail, list: thumbnails } = extractThumbnails(r.thumbnail);

    const playBtn = r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer;
    const watchEndpoint =
      playBtn?.playNavigationEndpoint?.watchEndpoint ||
      r.doubleTapCommand?.watchEndpoint ||
      col0[0]?.navigationEndpoint?.watchEndpoint;

    const navEndpoint = col0[0]?.navigationEndpoint;
    const browseId = navEndpoint?.browseEndpoint?.browseId || '';

    const isExplicit = r.badges?.some((b: any) => b.musicInlineBadgeRenderer?.icon?.iconType === 'MUSIC_EXPLICIT_BADGE');
    const customIndex = r.customIndexColumn?.musicCustomIndexColumnRenderer?.text?.runs?.[0]?.text;
    const rank = customIndex ? parseInt(customIndex, 10) : index + 1;

    if (typeRun === 'Artist' || browseId.startsWith('UC')) {
      const artistItem: ArtistItem = {
        type: 'artist',
        id: browseId || title,
        title,
        browseId,
        name: title,
        thumbnail,
        thumbnails,
        subscribers: subtitleText,
        subscribersCount: parseViewCount(subtitleText),
        explicit: isExplicit,
      };
      return artistItem;
    }

    if (typeRun === 'Album' || typeRun === 'EP' || typeRun === 'Single' || browseId.startsWith('MPREb_')) {
      const artistName = col1[2]?.text || col1[0]?.text || 'YouTube Music';
      const albumItem: AlbumItem = {
        type: 'album',
        id: browseId || title,
        browseId,
        title,
        artist: artistName,
        thumbnail,
        thumbnails,
        explicit: isExplicit,
      };
      return albumItem;
    }

    // Song Item
    const videoId = watchEndpoint?.videoId || '';
    const artistName = col1[2]?.text || col1[0]?.text || 'YouTube Music';
    const albumName = col1[4]?.text || '';
    const durStr = col1[col1.length - 1]?.text || '';
    const views = parseViewCount(subtitleText);

    const songItem: SongItem = {
      type: 'song',
      id: videoId || title,
      videoId,
      title,
      artist: artistName,
      artists: [{ name: artistName, browseId: col1[2]?.navigationEndpoint?.browseEndpoint?.browseId }],
      album: albumName ? { name: albumName } : undefined,
      duration: parseDurationString(durStr),
      durationText: durStr,
      thumbnail: thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
      thumbnails,
      playCount: views,
      playCountText: subtitleText,
      rank,
      endpoint: { videoId },
      explicit: isExplicit,
    };
    return songItem;
  } catch (e) {
    console.warn('Error parsing responsiveListItem:', e);
    return null;
  }
}

/**
 * Parses shelf contents (musicCarouselShelfRenderer or musicShelfRenderer).
 */
function parseShelfSection(s: any, index: number): HomePageSection | null {
  const shelf = s.musicCarouselShelfRenderer || s.musicShelfRenderer || s.musicImmersiveCarouselShelfRenderer;
  if (!shelf) return null;

  const header = shelf.header?.musicCarouselShelfBasicHeaderRenderer || shelf.header?.musicHeaderRenderer;
  const title =
    header?.title?.runs?.[0]?.text ||
    shelf.title?.runs?.[0]?.text ||
    '';

  const strapline =
    header?.strapline?.runs?.[0]?.text ||
    header?.subtitle?.runs?.[0]?.text ||
    '';

  const rawItems = shelf.contents || [];
  const items: HomeItem[] = [];

  rawItems.forEach((rawItem: any, itemIdx: number) => {
    if (rawItem.musicTwoRowItemRenderer) {
      const parsed = parseTwoRowItem(rawItem.musicTwoRowItemRenderer);
      if (parsed) items.push(parsed);
    } else if (rawItem.musicResponsiveListItemRenderer) {
      const parsed = parseResponsiveListItem(rawItem.musicResponsiveListItemRenderer, itemIdx);
      if (parsed) items.push(parsed);
    }
  });

  if (items.length === 0 && !title) return null;

  return {
    id: `sec_${index}_${title.replace(/\s+/g, '_').toLowerCase()}`,
    title: title || 'Featured',
    subtitle: strapline || undefined,
    strapline: strapline || undefined,
    items,
  };
}

/**
 * 1️⃣ BASE HOME FEED & MOOD/VIBE FILTERED FEED
 * Queries browseId = "FEmusic_home" (optionally with mood/vibe params).
 */
export async function fetchYouTubeHome(
  params?: string,
  hl = 'en',
  gl = 'IN'
): Promise<HomePage> {
  const body: any = {
    context: {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion: '1.20240101.01.00',
        hl,
        gl,
      },
    },
    browseId: 'FEmusic_home',
  };

  if (params) {
    body.params = params;
  }

  const d = await universalPost(YTM_BROWSE_ENDPOINT, body);

  const sectionList =
    d.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer ||
    d.contents?.sectionListRenderer;

  // Extract Chips (Moods / Vibes: Romance, Energize, Relax, Focus, Party, etc.)
  const rawChips = sectionList?.header?.chipCloudRenderer?.chips || [];
  const chips: HomePageChip[] = rawChips
    .map((c: any) => {
      const r = c.chipCloudChipRenderer;
      if (!r) return null;
      const chipTitle = r.text?.runs?.[0]?.text || '';
      const chipParams = r.navigationEndpoint?.browseEndpoint?.params || '';
      const isSelected = r.isSelected === true;
      if (!chipTitle) return null;
      return {
        title: chipTitle,
        params: chipParams,
        endpoint: {
          browseId: 'FEmusic_home',
          params: chipParams,
        },
        isSelected,
      };
    })
    .filter(Boolean) as HomePageChip[];

  // Extract Sections
  const rawSections = sectionList?.contents || [];
  const sections: HomePageSection[] = [];

  rawSections.forEach((s: any, idx: number) => {
    const sec = parseShelfSection(s, idx);
    if (sec && sec.items.length > 0) {
      sections.push(sec);
    }
  });

  return {
    chips,
    sections,
  };
}

/**
 * 3️⃣ NEW RELEASES & EXPLORE FEED
 * Queries browseId = "FEmusic_explore".
 */
export async function fetchYouTubeExplore(
  hl = 'en',
  gl = 'IN'
): Promise<ExplorePage> {
  const body = {
    context: {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion: '1.20240101.01.00',
        hl,
        gl,
      },
    },
    browseId: 'FEmusic_explore',
  };

  const d = await universalPost(YTM_BROWSE_ENDPOINT, body);
  const sectionList =
    d.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ||
    [];

  const sections: HomePageSection[] = [];
  const newReleaseAlbums: AlbumItem[] = [];
  const moodAndGenres: MoodOrGenreItem[] = [];
  const trendingSongs: SongItem[] = [];

  sectionList.forEach((s: any, idx: number) => {
    const sec = parseShelfSection(s, idx);
    if (sec) {
      sections.push(sec);

      const titleLower = sec.title.toLowerCase();
      if (titleLower.includes('new') || titleLower.includes('album') || titleLower.includes('release')) {
        sec.items.forEach(item => {
          if (item.type === 'album') newReleaseAlbums.push(item as AlbumItem);
        });
      } else if (titleLower.includes('trend')) {
        sec.items.forEach(item => {
          if (item.type === 'song') trendingSongs.push(item as SongItem);
        });
      }
    }

    // Moods & Genres grid
    const grid = s.gridRenderer || s.musicNavigationButtonRenderer;
    if (grid?.items) {
      grid.items.forEach((gi: any) => {
        const btn = gi.musicNavigationButtonRenderer;
        if (btn) {
          const btnTitle = btn.buttonText?.runs?.[0]?.text || '';
          const btnParams = btn.clickCommand?.browseEndpoint?.params || '';
          if (btnTitle) {
            moodAndGenres.push({
              title: btnTitle,
              params: btnParams,
              color: btn.solid?.leftStripeColor ? `#${btn.solid.leftStripeColor.toString(16)}` : undefined,
              endpoint: {
                browseId: btn.clickCommand?.browseEndpoint?.browseId,
                params: btnParams,
              },
            });
          }
        }
      });
    }
  });

  return {
    newReleaseAlbums,
    moodAndGenres,
    trendingSongs,
    sections,
  };
}

/**
 * 4️⃣ TRENDING & CHARTS FEED
 * Queries browseId = "FEmusic_charts".
 */
export async function fetchYouTubeCharts(
  countryCode = 'IN',
  hl = 'en',
  gl = countryCode
): Promise<ChartsPage> {
  const body = {
    context: {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion: '1.20240101.01.00',
        hl,
        gl,
      },
    },
    browseId: 'FEmusic_charts',
  };

  const d = await universalPost(YTM_BROWSE_ENDPOINT, body);
  const sectionList =
    d.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ||
    [];

  const sections: HomePageSection[] = [];
  const topSongs: SongItem[] = [];
  const topVideos: SongItem[] = [];
  const topArtists: ArtistItem[] = [];
  const dailyHits: SongItem[] = [];

  sectionList.forEach((s: any, idx: number) => {
    const sec = parseShelfSection(s, idx);
    if (sec) {
      sections.push(sec);
      const titleLower = sec.title.toLowerCase();

      sec.items.forEach(item => {
        if (item.type === 'song') {
          if (titleLower.includes('video')) {
            topVideos.push(item as SongItem);
          } else {
            topSongs.push(item as SongItem);
          }
          dailyHits.push(item as SongItem);
        } else if (item.type === 'artist') {
          topArtists.push(item as ArtistItem);
        }
      });
    }
  });

  return {
    topSongs,
    topVideos,
    topArtists,
    dailyHits,
    sections,
    countryCode,
  };
}
