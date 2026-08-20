// ═══════════════════════════════════════════
//  App Configuration
//  Replace empty strings with your free API keys
//  — Last.fm:   https://www.last.fm/api/account/create
//  — Jamendo:   https://developer.jamendo.com/v3.0/
// ═══════════════════════════════════════════

export const CONFIG = {
  // Backend API URL (Render or Local)
  BACKEND_URL: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BACKEND_URL) || '',

  // Last.fm — free account, no credit card
  LASTFM_API_KEY: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_LASTFM_API_KEY) || 'b25b959554ed76058ac220b7b2e0a026',

  // Jamendo — free account, CC-licensed full tracks
  JAMENDO_CLIENT_ID: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_JAMENDO_CLIENT_ID) || '',

  // iTunes — no key required (30s previews)
  ITUNES_SEARCH_URL: 'https://itunes.apple.com/search',
  ITUNES_LOOKUP_URL: 'https://itunes.apple.com/lookup',

  // Last.fm base URL
  LASTFM_BASE_URL: 'https://ws.audioscrobbler.com/2.0',

  // Jamendo base URL
  JAMENDO_BASE_URL: 'https://api.jamendo.com/v3.0',

  // Lyrics.ovh — no key needed
  LYRICS_BASE_URL: 'https://api.lyrics.ovh/v1',

  // Deezer (CORS-restricted, use as fallback metadata only)
  DEEZER_BASE_URL: 'https://api.deezer.com',

  // App settings
  MAX_RECENT_ITEMS: 20,
  MAX_SEARCH_HISTORY: 10,
  DEBOUNCE_SEARCH_MS: 400,
  ARTWORK_PLACEHOLDER: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiMxQTFBMkUiLz48Y2lyY2xlIGN4PSIxMDAiIGN5PSIxMDAiIHI9IjQwIiBzdHJva2U9IiMzMzMzNTUiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIvPjxjaXJjbGUgY3g9IjEwMCIgY3k9IjEwMCIgcj0iMTIiIGZpbGw9IiMzMzMzNTUiLz48L3N2Zz4=',
} as const;
