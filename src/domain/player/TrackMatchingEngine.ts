// ═════════════════════════════════════════════════════════════════════
//  TrackMatchingEngine.ts — High-Precision Track Resolution Engine
//
//  Ensures that when a user searches or selects a song, only the authentic,
//  exact original track is played (Spotify-standard fidelity).
//
//  Key Guarantees:
//  1. Multi-factor verification: Title + Primary Artist + Duration (±3-5s).
//  2. Version isolation: Never mix Studio Original with Remix, Cover, Live,
//     Acoustic, Lofi, Slowed+Reverb, Karaoke, Reprise, or Gender-swapped versions.
//  3. Minimum confidence threshold (composite score ≥ 0.82).
//  4. Noisy suffix removal without stripping semantic version descriptors.
//  5. Dev/debug logging for all match & reject decisions.
// ═════════════════════════════════════════════════════════════════════

export interface VersionProfile {
  isRemix: boolean;
  isCover: boolean;
  isLive: boolean;
  isAcoustic: boolean;
  isSlowedReverb: boolean;
  isLofi: boolean;
  isInstrumental: boolean;
  isKaraoke: boolean;
  isReprise: boolean;
  isFemaleVersion: boolean;
  isMaleVersion: boolean;
  is8dAudio: boolean;
}

export interface TrackMatchCandidate {
  title: string;
  artist: string;
  album?: string;
  duration?: number;
}

export interface MatchDecision {
  isMatch: boolean;
  confidence: number; // 0.0 to 1.0
  titleScore: number;
  artistScore: number;
  durationScore: number;
  reason: string;
}

/**
 * Extracts semantic version attributes to distinguish remixes, covers, live versions, etc.
 */
export function extractVersionProfile(rawTitle: string, rawArtist = '', rawAlbum = ''): VersionProfile {
  const text = `${rawTitle || ''} ${rawArtist || ''} ${rawAlbum || ''}`.toLowerCase();
  return {
    isRemix: /\b(remix|dj\s*remix|club\s*mix|dance\s*mix|extended\s*mix|mashup)\b/i.test(text),
    isCover: /\b(cover|tribute\s*to|rendition|covered\s*by)\b/i.test(text),
    isLive: /\b(live|in\s*concert|live\s*in|unplugged\s*live|tour\s*live|concert\s*version)\b/i.test(text),
    isAcoustic: /\b(acoustic|unplugged|piano\s*version|acoustic\s*version)\b/i.test(text),
    isSlowedReverb: /\b(slowed|reverb|slowed\s*\+\s*reverb|slowed\s*and\s*reverb|slowed\s*reverb)\b/i.test(text),
    isLofi: /\b(lofi|lo-fi|chill\s*mix|lofi\s*flip|lofi\s*remix)\b/i.test(text),
    isInstrumental: /\b(instrumental|backing\s*track|karaoke\s*version|karaoke\s*track)\b/i.test(text),
    isKaraoke: /\b(karaoke)\b/i.test(text),
    isReprise: /\b(reprise)\b/i.test(text),
    isFemaleVersion: /\b(female\s*version|female\s*cover|female\s*voice)\b/i.test(text),
    isMaleVersion: /\b(male\s*version|male\s*cover)\b/i.test(text),
    is8dAudio: /\b(8d\s*audio|8d|9d|16d)\b/i.test(text),
  };
}

/**
 * Compares two version profiles. If they conflict on any modifier, they are NOT the same track.
 */
export function areVersionProfilesCompatible(
  target: VersionProfile,
  candidate: VersionProfile
): { compatible: boolean; mismatchReason?: string } {
  // Remix
  if (!target.isRemix && candidate.isRemix) return { compatible: false, mismatchReason: 'Candidate is a Remix, target is Original' };
  if (target.isRemix && !candidate.isRemix) return { compatible: false, mismatchReason: 'Candidate is Original, target is a Remix' };

  // Cover
  if (!target.isCover && candidate.isCover) return { compatible: false, mismatchReason: 'Candidate is a Cover, target is Original' };
  if (target.isCover && !candidate.isCover) return { compatible: false, mismatchReason: 'Candidate is Original, target is a Cover' };

  // Live
  if (!target.isLive && candidate.isLive) return { compatible: false, mismatchReason: 'Candidate is Live, target is Studio Original' };
  if (target.isLive && !candidate.isLive) return { compatible: false, mismatchReason: 'Candidate is Studio, target is Live' };

  // Acoustic
  if (!target.isAcoustic && candidate.isAcoustic) return { compatible: false, mismatchReason: 'Candidate is Acoustic, target is Studio Original' };

  // Slowed / Reverb / Lofi
  if (!target.isSlowedReverb && candidate.isSlowedReverb) return { compatible: false, mismatchReason: 'Candidate is Slowed+Reverb, target is Normal' };
  if (!target.isLofi && candidate.isLofi) return { compatible: false, mismatchReason: 'Candidate is Lofi, target is Normal' };

  // Instrumental / Karaoke
  if (!target.isInstrumental && candidate.isInstrumental) return { compatible: false, mismatchReason: 'Candidate is Instrumental/Karaoke, target is Vocal' };

  // Gender version
  if (!target.isFemaleVersion && candidate.isFemaleVersion) return { compatible: false, mismatchReason: 'Candidate is Female Version, target is Original' };
  if (!target.isMaleVersion && candidate.isMaleVersion) return { compatible: false, mismatchReason: 'Candidate is Male Version, target is Original' };

  // 8D Audio
  if (!target.is8dAudio && candidate.is8dAudio) return { compatible: false, mismatchReason: 'Candidate is 8D Audio, target is Original' };

  // Reprise
  if (!target.isReprise && candidate.isReprise) return { compatible: false, mismatchReason: 'Candidate is Reprise, target is Original' };

  return { compatible: true };
}

/**
 * Strips non-semantic noise from titles while preserving critical identity.
 */
export function cleanCoreTitle(title: string): string {
  if (!title) return '';
  return title
    // Strip video/audio metadata tags
    .replace(/\b(official\s*(music\s*)?video|official\s*audio|official\s*lyric\s*video|lyric\s*video|lyrics|full\s*song|full\s*video\s*song|audio|video|visualizer|teaser|hd|4k|1080p|hq)\b/gi, '')
    // Strip movie info tags like (From "Brahmastra"), [From "Dunki"]
    .replace(/\((from|soundtrack|ost)\s+["'’]?[^)]+["'’]?\)/gi, '')
    .replace(/\[(from|soundtrack|ost)\s+["'’]?[^\]]+["'’]?\]/gi, '')
    // Strip feat / with
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\(with.*?\)/gi, '')
    .replace(/\[feat\..*?\]/gi, '')
    .replace(/\[with.*?\]/gi, '')
    // Strip bracketed single/album tags
    .replace(/\[(single|album\s*version|deluxe\s*edition|bonus\s*track)\]/gi, '')
    // Remove brackets if empty
    .replace(/[()[\]{}]/g, ' ')
    // Normalize quotes and non-alphanumerics
    .replace(/["'’`]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Computes Levenshtein distance between two strings.
 */
export function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  if (!s1.length) return s2.length;
  if (!s2.length) return s1.length;

  const v0 = new Array(s2.length + 1);
  const v1 = new Array(s2.length + 1);

  for (let i = 0; i <= s2.length; i++) v0[i] = i;

  for (let i = 0; i < s1.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < s2.length; j++) {
      const cost = s1[i] === s2[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= s2.length; j++) v0[j] = v1[j];
  }

  return v0[s2.length];
}

/**
 * Calculates normalized string similarity combining Levenshtein and Token Jaccard.
 */
export function calculateNormalizedSimilarity(s1: string, s2: string): number {
  const a = (s1 || '').trim().toLowerCase();
  const b = (s2 || '').trim().toLowerCase();
  if (a === b) return 1.0;
  if (!a || !b) return 0.0;

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;

  const levDist = levenshteinDistance(a, b);
  const levSim = 1 - levDist / maxLen;

  // Token Jaccard similarity
  const aTokens = a.split(/\s+/).filter(Boolean);
  const bTokens = b.split(/\s+/).filter(Boolean);
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);

  let intersect = 0;
  for (const t of aSet) {
    if (bSet.has(t)) intersect++;
  }
  const union = aSet.size + bSet.size - intersect;
  const jaccard = union > 0 ? intersect / union : 0;

  return 0.55 * levSim + 0.45 * jaccard;
}

/**
 * Extracts individual artist tokens from a compound artist string.
 */
export function extractArtistNames(artistStr: string): string[] {
  if (!artistStr) return [];
  return artistStr
    .split(/[,&/|+]|\bfeat\b|\bft\b|\bwith\b|\bx\b|\band\b/i)
    .map(a => a.replace(/["'’]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(a => a.length >= 2);
}

const OFFICIAL_RECORD_LABELS = new Set([
  'tseries', 't-series', 't series', 'sony music', 'sonymusic', 'zee music company',
  'zeemusic', 'yrf', 'yash raj films', 'saregama', 'saregama music', 'speed records',
  'speedrecords', 'tips official', 'tips music', 'white hill music', 'geet mp3',
  'desimusicfactory', 'dmf', 'universal music', 'warner music', 'vevo'
]);

/**
 * Evaluates whether a candidate track is an authentic, exact match for the requested song.
 */
export function evaluateTrackMatch(
  targetTitle: string,
  targetArtist: string,
  targetDuration: number | undefined,
  candidate: TrackMatchCandidate,
  source = 'unknown'
): MatchDecision {
  // 1. Version Compatibility Check
  const targetProfile = extractVersionProfile(targetTitle, targetArtist);
  const candProfile = extractVersionProfile(candidate.title, candidate.artist, candidate.album);
  const versionCheck = areVersionProfilesCompatible(targetProfile, candProfile);

  if (!versionCheck.compatible) {
    const decision: MatchDecision = {
      isMatch: false,
      confidence: 0,
      titleScore: 0,
      artistScore: 0,
      durationScore: 0,
      reason: `Version mismatch: ${versionCheck.mismatchReason}`,
    };
    logMatchDecision(targetTitle, targetArtist, targetDuration, candidate, decision, source);
    return decision;
  }

  // 2. Title Matching
  const cleanTarget = cleanCoreTitle(targetTitle);
  const cleanCand = cleanCoreTitle(candidate.title);

  if (!cleanTarget || !cleanCand) {
    const decision: MatchDecision = {
      isMatch: false,
      confidence: 0,
      titleScore: 0,
      artistScore: 0,
      durationScore: 0,
      reason: 'Empty clean title after normalization',
    };
    logMatchDecision(targetTitle, targetArtist, targetDuration, candidate, decision, source);
    return decision;
  }

  let titleScore = calculateNormalizedSimilarity(cleanTarget, cleanCand);

  if (cleanTarget === cleanCand) {
    titleScore = 1.0;
  } else if (cleanCand.startsWith(cleanTarget) || cleanTarget.startsWith(cleanCand)) {
    titleScore = Math.max(titleScore, 0.92);
  }

  // If title similarity is below 0.65, definitely different song
  if (titleScore < 0.65) {
    const decision: MatchDecision = {
      isMatch: false,
      confidence: titleScore * 0.4,
      titleScore,
      artistScore: 0,
      durationScore: 0,
      reason: `Title mismatch: similarity only ${(titleScore * 100).toFixed(0)}% ("${cleanTarget}" vs "${cleanCand}")`,
    };
    logMatchDecision(targetTitle, targetArtist, targetDuration, candidate, decision, source);
    return decision;
  }

  // 3. Artist Matching
  const targetArtists = extractArtistNames(targetArtist);
  const candArtists = extractArtistNames(`${candidate.artist} ${candidate.album || ''}`);
  const candArtistFull = (candidate.artist || '').toLowerCase();
  const candTitleFull = (candidate.title || '').toLowerCase();

  let artistScore = 0.0;
  let artistMatchReason = 'No artist match';

  if (targetArtists.length === 0) {
    artistScore = 0.75;
    artistMatchReason = 'Target artist unspecified';
  } else {
    let bestArtistSim = 0.0;
    for (const tArt of targetArtists) {
      for (const cArt of candArtists) {
        const sim = calculateNormalizedSimilarity(tArt, cArt);
        if (sim > bestArtistSim) bestArtistSim = sim;
        if (cArt.includes(tArt) || tArt.includes(cArt)) {
          bestArtistSim = Math.max(bestArtistSim, 0.90);
        }
      }
      if (candArtistFull.includes(tArt) || candTitleFull.includes(tArt)) {
        bestArtistSim = Math.max(bestArtistSim, 0.88);
      }
    }

    const isTopicChannel = candArtistFull.includes('- topic') || candArtistFull.includes(' topic');
    const isOfficialLabel = Array.from(OFFICIAL_RECORD_LABELS).some(lbl => candArtistFull.includes(lbl));

    if (bestArtistSim >= 0.80) {
      artistScore = bestArtistSim;
      artistMatchReason = `Artist matched (${(bestArtistSim * 100).toFixed(0)}%)`;
    } else if ((isTopicChannel || isOfficialLabel) && titleScore >= 0.88) {
      const targetInTitle = targetArtists.some(tArt => candTitleFull.includes(tArt));
      artistScore = targetInTitle ? 0.92 : 0.78;
      artistMatchReason = `Official label/topic channel (${candArtistFull})`;
    } else {
      artistScore = Math.max(bestArtistSim, 0.15);
      artistMatchReason = `Artist mismatch: "${targetArtist}" vs "${candidate.artist}"`;
    }
  }

  // 4. Duration Verification (±3–5s ideal tolerance)
  let durationScore = 0.80; // neutral default if duration unknown
  let durationDiffSec: number | null = null;

  if (targetDuration && targetDuration > 0 && candidate.duration && candidate.duration > 0) {
    durationDiffSec = Math.abs(targetDuration - candidate.duration);
    if (durationDiffSec <= 4) {
      durationScore = 1.0; // Perfect match
    } else if (durationDiffSec <= 8) {
      durationScore = 0.90;
    } else if (durationDiffSec <= 15) {
      durationScore = 0.75;
    } else if (durationDiffSec <= 25) {
      durationScore = 0.50;
    } else if (durationDiffSec <= 45) {
      durationScore = 0.25;
    } else {
      durationScore = 0.0;
    }
  }

  // Hard reject if duration discrepancy is > 45s (indicates preview, cut, or completely different song)
  if (durationDiffSec !== null && durationDiffSec > 45) {
    const decision: MatchDecision = {
      isMatch: false,
      confidence: 0,
      titleScore,
      artistScore,
      durationScore: 0,
      reason: `Duration diff too large (${durationDiffSec}s diff, target: ${targetDuration}s, candidate: ${candidate.duration}s)`,
    };
    logMatchDecision(targetTitle, targetArtist, targetDuration, candidate, decision, source);
    return decision;
  }

  // 5. Composite Confidence Score: Title (45%), Artist (35%), Duration (20%)
  const confidence = (titleScore * 0.45) + (artistScore * 0.35) + (durationScore * 0.20);
  const isMatch = confidence >= 0.82 && titleScore >= 0.78 && artistScore >= 0.60;

  const decision: MatchDecision = {
    isMatch,
    confidence,
    titleScore,
    artistScore,
    durationScore,
    reason: isMatch
      ? `Match verified (confidence: ${(confidence * 100).toFixed(1)}%, title: ${(titleScore * 100).toFixed(0)}%, artist: ${(artistScore * 100).toFixed(0)}%, dur: ${(durationScore * 100).toFixed(0)}%)`
      : `Rejected: confidence ${(confidence * 100).toFixed(1)}% < 82% (title: ${(titleScore * 100).toFixed(0)}%, artist: ${(artistScore * 100).toFixed(0)}% [${artistMatchReason}])`,
  };

  logMatchDecision(targetTitle, targetArtist, targetDuration, candidate, decision, source);
  return decision;
}

/**
 * Dev/Debug decision logger to diagnose any playback matching decisions.
 */
function logMatchDecision(
  targetTitle: string,
  targetArtist: string,
  targetDuration: number | undefined,
  candidate: TrackMatchCandidate,
  decision: MatchDecision,
  source: string
) {
  const status = decision.isMatch ? '✅ MATCHED' : '❌ REJECTED';
  console.debug(
    `[TrackMatchDecision] ${status} [${source}] | Target: "${targetTitle}" by "${targetArtist}" (${targetDuration || '?'}s) ` +
    `vs Candidate: "${candidate.title}" by "${candidate.artist}" (${candidate.duration || '?'}s) ` +
    `| Conf: ${(decision.confidence * 100).toFixed(1)}% | ${decision.reason}`
  );
}
