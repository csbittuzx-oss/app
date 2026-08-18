// ═══════════════════════════════════════════════════════════════
//  Dynamic Artwork Color Extractor
//  Extracts dominant, vibrant colors from album artwork and builds
//  rich, dark, elegant gradient backgrounds with smooth transitions.
// ═══════════════════════════════════════════════════════════════

export interface ExtractedArtworkTheme {
  primary: [number, number, number]; // [r, g, b]
  secondary: [number, number, number];
  gradient: string;
  ambientGlow: string;
  accentGlow: string;
}

const colorCache = new Map<string, ExtractedArtworkTheme>();

export const DEFAULT_DARK_ARTWORK_THEME: ExtractedArtworkTheme = {
  primary: [245, 158, 11],
  secondary: [30, 30, 35],
  gradient: 'linear-gradient(180deg, #18181c 0%, #0e0e11 50%, #08080a 100%)',
  ambientGlow: 'radial-gradient(circle at 50% 32%, rgba(245, 158, 11, 0.14) 0%, rgba(245, 158, 11, 0.03) 50%, transparent 75%)',
  accentGlow: 'rgba(245, 158, 11, 0.25)',
};

/**
 * Converts RGB to HSL for color vibrancy scoring
 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return [h, s, l];
}

/**
 * Extracts dominant vibrant color from an image URL using offscreen canvas.
 */
export async function extractArtworkTheme(imageUrl?: string | null): Promise<ExtractedArtworkTheme> {
  if (!imageUrl || typeof window === 'undefined') {
    return DEFAULT_DARK_ARTWORK_THEME;
  }

  if (colorCache.has(imageUrl)) {
    return colorCache.get(imageUrl)!;
  }

  return new Promise<ExtractedArtworkTheme>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(DEFAULT_DARK_ARTWORK_THEME);
          return;
        }

        const size = 32;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);

        const imgData = ctx.getImageData(0, 0, size, size).data;
        const colorBuckets = new Map<string, { r: number; g: number; b: number; count: number; score: number }>();

        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];

          if (a < 128) continue; // skip transparent

          const [, s, l] = rgbToHsl(r, g, b);

          // Filter out near-black or blown-out white
          if (l < 0.12 || l > 0.90) continue;

          // Vibrancy score: prioritize rich, colorful tones
          const vibrancyScore = s * 2.5 + (1 - Math.abs(l - 0.45)) * 1.5;

          // Quantize color bucket to group similar shades
          const bucketKey = `${Math.round(r / 16) * 16},${Math.round(g / 16) * 16},${Math.round(b / 16) * 16}`;
          const existing = colorBuckets.get(bucketKey);
          if (existing) {
            existing.count += 1;
            existing.score += vibrancyScore;
          } else {
            colorBuckets.set(bucketKey, { r, g, b, count: 1, score: vibrancyScore });
          }
        }

        const sorted = Array.from(colorBuckets.values()).sort((a, b) => (b.score * b.count) - (a.score * a.count));

        let dominant = sorted[0];
        let secondary = sorted[1] || sorted[0];

        if (!dominant) {
          // If all pixels were extreme (e.g. pure black & white artwork), pick sample from center
          const centerIdx = (16 * size + 16) * 4;
          dominant = {
            r: imgData[centerIdx] || 45,
            g: imgData[centerIdx + 1] || 45,
            b: imgData[centerIdx + 2] || 50,
            count: 1,
            score: 1,
          };
          secondary = dominant;
        }

        const { r, g, b } = dominant;
        const { r: r2, g: g2, b: b2 } = secondary;

        // Formulate elegant, dark atmosphere gradient stops (never overly bright)
        const darkR1 = Math.round(r * 0.36);
        const darkG1 = Math.round(g * 0.36);
        const darkB1 = Math.round(b * 0.36);

        const darkR2 = Math.round(r2 * 0.16);
        const darkG2 = Math.round(g2 * 0.16);
        const darkB2 = Math.round(b2 * 0.16);

        const theme: ExtractedArtworkTheme = {
          primary: [r, g, b],
          secondary: [r2, g2, b2],
          gradient: `linear-gradient(180deg, rgb(${darkR1}, ${darkG1}, ${darkB1}) 0%, rgb(${darkR2}, ${darkG2}, ${darkB2}) 50%, #070709 100%)`,
          ambientGlow: `radial-gradient(circle at 50% 32%, rgba(${r}, ${g}, ${b}, 0.34) 0%, rgba(${r2}, ${g2}, ${b2}, 0.12) 48%, transparent 76%)`,
          accentGlow: `rgba(${r}, ${g}, ${b}, 0.35)`,
        };

        colorCache.set(imageUrl, theme);
        resolve(theme);
      } catch {
        resolve(DEFAULT_DARK_ARTWORK_THEME);
      }
    };

    img.onerror = () => {
      resolve(DEFAULT_DARK_ARTWORK_THEME);
    };

    // Trigger load
    img.src = imageUrl;
  });
}
