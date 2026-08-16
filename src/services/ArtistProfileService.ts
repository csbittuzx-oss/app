// ═══════════════════════════════════════════
//  ArtistProfileService
//  Enforces pure artist profile image logic:
//  - Uses ONLY official artist portrait images for Artist cards
//  - Never falls back to song covers, album banners, or unrelated art
//  - Curated high-res portraits for top popular artists + dynamic Wikipedia resolver
//  - Generates beautiful initials avatar placeholder when photo is unavailable
// ═══════════════════════════════════════════

import { universalGet } from '../core/utils/http';

const ARTIST_CACHE_KEY = 'sw_artist_profile_cache';

// Curated verified official artist portraits
const OFFICIAL_ARTIST_PORTRAITS: Record<string, string> = {
  'arijit singh': 'https://upload.wikimedia.org/wikipedia/commons/b/b7/Arijit_Singh_performance_at_Chandigarh_2025.jpg',
  'shreya ghoshal': 'https://upload.wikimedia.org/wikipedia/commons/a/a0/Shreya_Ghoshal_Behindwoods_Gold_Icons_Awards_2023_%28cropped%29.jpg',
  'pritam': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Pritam_Live_%28cropped%29.jpg/960px-Pritam_Live_%28cropped%29.jpg',
  'a.r. rahman': 'https://upload.wikimedia.org/wikipedia/commons/1/10/AR_Rahman_at_Premier_Futsal_Press_Meet_%28cropped%29.jpg',
  'ar rahman': 'https://upload.wikimedia.org/wikipedia/commons/1/10/AR_Rahman_at_Premier_Futsal_Press_Meet_%28cropped%29.jpg',
  'a. r. rahman': 'https://upload.wikimedia.org/wikipedia/commons/1/10/AR_Rahman_at_Premier_Futsal_Press_Meet_%28cropped%29.jpg',
  'anirudh ravichander': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Anirudh_Ravichander_at_Audi_Ritz_Style_Awards_2017_%28cropped%29.jpg/960px-Anirudh_Ravichander_at_Audi_Ritz_Style_Awards_2017_%28cropped%29.jpg',
  'diljit dosanjh': 'https://upload.wikimedia.org/wikipedia/commons/e/e2/Diljit_Dosanjh.jpg',
  'sidhu moosewala': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Sidhu_Moose_Wala_in_2021.jpg/960px-Sidhu_Moose_Wala_in_2021.jpg',
  'sidhu moose wala': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Sidhu_Moose_Wala_in_2021.jpg/960px-Sidhu_Moose_Wala_in_2021.jpg',
  'karan aujla': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Karan_Aujla_in_2024.jpg/960px-Karan_Aujla_in_2024.jpg',
  'ap dhillon': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/AP_Dhillon_2022.jpg/960px-AP_Dhillon_2022.jpg',
  'badshah': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Badshah_at_Mirchi_Music_Awards_2017_%28cropped%29.jpg/960px-Badshah_at_Mirchi_Music_Awards_2017_%28cropped%29.jpg',
  'yo yo honey singh': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Yo_Yo_Honey_Singh_2024.jpg/960px-Yo_Yo_Honey_Singh_2024.jpg',
  'honey singh': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Yo_Yo_Honey_Singh_2024.jpg/960px-Yo_Yo_Honey_Singh_2024.jpg',
  'neha kakkar': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Neha_Kakkar_at_the_Filmfare_Glamour_and_Style_Awards_2019_%28cropped%29.jpg/960px-Neha_Kakkar_at_the_Filmfare_Glamour_and_Style_Awards_2019_%28cropped%29.jpg',
  'sonu nigam': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Sonu_Nigam_in_2023.jpg/960px-Sonu_Nigam_in_2023.jpg',
  'kk': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/KK_Live_in_Concert_%28cropped%29.jpg/960px-KK_Live_in_Concert_%28cropped%29.jpg',
  'atif aslam': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Atif_Aslam_in_2022.jpg/960px-Atif_Aslam_in_2022.jpg',
  'sunidhi chauhan': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Sunidhi_Chauhan_in_2023.jpg/960px-Sunidhi_Chauhan_in_2023.jpg',
  'vishal mishra': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Vishal_Mishra_in_2023.jpg/960px-Vishal_Mishra_in_2023.jpg',
  'jubin nautiyal': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Jubin_Nautiyal_in_2021.jpg/960px-Jubin_Nautiyal_in_2021.jpg',
  'b praak': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/B_Praak_in_2021.jpg/960px-B_Praak_in_2021.jpg',
  // Bhojpuri Artists
  'khesari lal yadav': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Khesari_Lal_Yadav_In_2026.webp/960px-Khesari_Lal_Yadav_In_2026.webp.png',
  'pawan singh': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Pawan_Singh_in_2026.jpg/960px-Pawan_Singh_in_2026.jpg',
  'shilpi raj': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Shilpi_Raj_singer.jpg/960px-Shilpi_Raj_singer.jpg',
  'arvind akela kallu': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Arvind_Akela_Kallu.jpg/960px-Arvind_Akela_Kallu.jpg',
  'gunjan singh': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Gunjan_Singh.jpg/960px-Gunjan_Singh.jpg',
  'pramod premi yadav': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Pramod_Premi_Yadav.jpg/960px-Pramod_Premi_Yadav.jpg',
  'neelkamal singh': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Neelkamal_Singh.jpg/960px-Neelkamal_Singh.jpg',
  'ankush raja': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Ankush_Raja.jpg/960px-Ankush_Raja.jpg',
  'priyanka singh': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Priyanka_Singh_singer.jpg/960px-Priyanka_Singh_singer.jpg',
  // International Artists
  'the weeknd': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/The_Weeknd_Portrait_by_Brian_Ziff.jpg/960px-The_Weeknd_Portrait_by_Brian_Ziff.jpg',
  'taylor swift': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Taylor_Swift_at_the_2023_MTV_Video_Music_Awards_%283%29.png/960px-Taylor_Swift_at_the_2023_MTV_Video_Music_Awards_%283%29.png',
  'billie eilish': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Billie_Eilish_at_the_2024_Golden_Globes.png/960px-Billie_Eilish_at_the_2024_Golden_Globes.png',
  'ed sheeran': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Ed_Sheeran-6886_%28cropped%29.jpg/960px-Ed_Sheeran-6886_%28cropped%29.jpg',
  'drake': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Drake_July_2016.jpg/960px-Drake_July_2016.jpg',
  'justin bieber': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Justin_Bieber_in_2015.jpg/960px-Justin_Bieber_in_2015.jpg',
  'eminem': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Eminem_-_Concert_for_Valor_in_Washington_D.C._Nov._11%2C_2014_%282%29_%28cropped%29.jpg/960px-Eminem_-_Concert_for_Valor_in_Washington_D.C._Nov._11%2C_2014_%282%29_%28cropped%29.jpg',
  'ariana grande': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Ariana_Grande_Grammys_Red_Carpet_2020.png/960px-Ariana_Grande_Grammys_Red_Carpet_2020.png',
  'dua lipa': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/DuaLipaO2020522_%28cropped%29.jpg/960px-DuaLipaO2020522_%28cropped%29.jpg',
  'post malone': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Post_Malone_at_the_2019_American_Music_Awards.png/960px-Post_Malone_at_the_2019_American_Music_Awards.png',
  'alan walker': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Alan_Walker_in_2023.jpg/960px-Alan_Walker_in_2023.jpg',
};

// In-memory cache
const memoryCache = new Map<string, string>();

// Initialize persistent cache
try {
  const raw = localStorage.getItem(ARTIST_CACHE_KEY);
  if (raw) {
    const parsed: Record<string, string> = JSON.parse(raw);
    Object.entries(parsed).forEach(([k, v]) => memoryCache.set(k, v));
  }
} catch {}

function normalizeArtistName(name: string): string {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function saveToCache(name: string, url: string) {
  const key = normalizeArtistName(name);
  memoryCache.set(key, url);
  try {
    const raw = localStorage.getItem(ARTIST_CACHE_KEY);
    const parsed: Record<string, string> = raw ? JSON.parse(raw) : {};
    parsed[key] = url;
    localStorage.setItem(ARTIST_CACHE_KEY, JSON.stringify(parsed));
  } catch {}
}

/**
 * Generates an SVG avatar with the artist's initials on a sleek gradient.
 * Never uses song cover or album art.
 */
export function getArtistAvatarPlaceholder(name: string): string {
  const cleanName = (name || 'Artist').trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  const initials = parts.length > 1
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : cleanName.slice(0, 2).toUpperCase();

  // Deterministic subtle gradient colors based on name string
  let hash = 0;
  for (let i = 0; i < cleanName.length; i++) {
    hash = cleanName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hues = [
    ['#1e293b', '#334155'], // slate
    ['#1e1b4b', '#312e81'], // indigo
    ['#172554', '#1e40af'], // blue
    ['#134e4a', '#047857'], // teal/emerald
    ['#4a044e', '#701a75'], // fuchsia
    ['#450a0a', '#991b1b'], // red/crimson
    ['#2e1065', '#581c87'], // purple
  ];
  const colorPair = hues[Math.abs(hash) % hues.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${colorPair[0]}" />
        <stop offset="100%" stop-color="${colorPair[1]}" />
      </linearGradient>
    </defs>
    <rect width="200" height="200" rx="100" fill="url(#g)" />
    <text x="100" y="118" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="72" font-weight="700" fill="#f8fafc" text-anchor="middle">${initials}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Synchronous resolver for instant UI rendering.
 */
export function getArtistProfileImageSync(name: string): string {
  const norm = normalizeArtistName(name);
  if (!norm) return getArtistAvatarPlaceholder('Artist');

  if (OFFICIAL_ARTIST_PORTRAITS[norm]) {
    return OFFICIAL_ARTIST_PORTRAITS[norm];
  }

  if (memoryCache.has(norm)) {
    return memoryCache.get(norm)!;
  }

  return getArtistAvatarPlaceholder(name);
}

/**
 * Asynchronously resolves the official artist profile image.
 * Uses curated directory -> Wikipedia Pageimages -> avatar fallback.
 * Strictly NEVER falls back to song covers or album art.
 */
export async function getArtistProfileImage(name: string): Promise<string> {
  const norm = normalizeArtistName(name);
  if (!norm) return getArtistAvatarPlaceholder('Artist');

  // 1. Check curated official portrait directory
  if (OFFICIAL_ARTIST_PORTRAITS[norm]) {
    return OFFICIAL_ARTIST_PORTRAITS[norm];
  }

  // 2. Check cache
  if (memoryCache.has(norm)) {
    return memoryCache.get(norm)!;
  }

  // 3. Dynamic lookup on Wikipedia official page images
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(name)}&prop=pageimages&format=json&pithumbsize=600&origin=*`;
    const data = await universalGet(wikiUrl);
    if (data && data.query && data.query.pages) {
      const pages = Object.values(data.query.pages) as Array<{ thumbnail?: { source?: string } }>;
      const photoUrl = pages[0]?.thumbnail?.source;
      if (photoUrl && photoUrl.startsWith('http')) {
        saveToCache(name, photoUrl);
        return photoUrl;
      }
    }
  } catch {
    // ignore
  }

  // 4. Default to elegant initials avatar
  const avatar = getArtistAvatarPlaceholder(name);
  saveToCache(name, avatar);
  return avatar;
}
