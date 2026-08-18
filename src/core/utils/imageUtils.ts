// ═══════════════════════════════════════════════════════════════════════════════
//  imageUtils.ts
//  Ultra-HD Artist & Music Artwork Image Resolution & Smart URL Rewriting Engine
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Smart High-Res URL Rewriter & Scaler
 * Upgrades YouTube Video thumbnails, YT Music Artwork, YouTube Channel Avatars,
 * Google-hosted Avatars, and JioSaavn CDNs to Ultra-HD resolution.
 *
 * @param url The raw image URL to upgrade
 * @param width Target pixel width (e.g. 544 for avatars, 1200 for banners)
 * @param height Target pixel height (e.g. 544 for avatars, 1200 for banners)
 * @returns Ultra-HD rewritten image URL
 */
export function resizeImageUrl(
  url: string | undefined | null,
  width?: number,
  height?: number
): string {
  if (!url) return '';
  if (width === undefined && height === undefined) return url;

  let targetUrl = url.trim();

  // 1. YouTube Video & Artwork Thumbnails (i.ytimg.com)
  if (targetUrl.includes('i.ytimg.com')) {
    const targetQuality = (width !== undefined && width >= 1200) ? 'maxresdefault.jpg' : 'hqdefault.jpg';
    return targetUrl.replace(
      /(default|mqdefault|hqdefault|sddefault|maxresdefault)\.jpg/,
      targetQuality
    );
  }

  // 2. Google User Content / YT Music Artwork (googleusercontent.com)
  if (targetUrl.includes('googleusercontent.com') && targetUrl.includes('=w')) {
    const baseUrl = targetUrl.split('=w')[0];
    const size = ((width ?? 0) >= 1000 || (height ?? 0) >= 1000) ? 1200 : 544;
    return `${baseUrl}=w${size}-h${size}`;
  }

  // 3. YouTube Channel & Artist Avatars (yt3.ggpht.com)
  if (targetUrl.includes('yt3.ggpht.com')) {
    const baseUrl = targetUrl.split('=')[0].split('-s')[0];
    const size = width ?? height ?? 544;
    return `${baseUrl}=s${size}`;
  }

  // 4. Google Hosted Avatars (lh*.googleusercontent.com)
  if (/https:\/\/lh\d\.googleusercontent\.com\/.*/.test(targetUrl)) {
    const size = ((width ?? 0) >= 1000 || (height ?? 0) >= 1000) ? 1200 : 544;
    return `${targetUrl.split('=')[0]}=w${size}-h${size}`;
  }

  // 5. JioSaavn CDN Artwork (c.saavncdn.com)
  if (targetUrl.includes('saavncdn.com')) {
    const targetDim = ((width ?? 0) >= 1000 || (height ?? 0) >= 1000) ? '500x500.jpg' : '500x500.jpg';
    return targetUrl.replace(/\b(50x50|150x150|250x250|500x500)\.jpg\b/, targetDim);
  }

  return targetUrl;
}

// ── Multi-Tier In-Memory & Browser Cache Pre-warming ─────────────────────────

const imageMemoryCache = new Set<string>();

/**
 * Prefetches and warms up an image into the browser's cache for instant display
 * without delay or flickering.
 */
export function prefetchImage(
  url: string | undefined | null,
  width?: number,
  height?: number
): Promise<void> {
  const resolvedUrl = resizeImageUrl(url, width, height);
  if (!resolvedUrl || imageMemoryCache.has(resolvedUrl)) return Promise.resolve();

  return new Promise((resolve) => {
    const img = new Image();
    img.src = resolvedUrl;
    img.onload = () => {
      imageMemoryCache.add(resolvedUrl);
      resolve();
    };
    img.onerror = () => resolve();
  });
}
