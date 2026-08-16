// ═══════════════════════════════════════════
//  UpdateService — In-App Update Engine via Firebase Backend
//  Checks for latest app releases, changelogs, critical security patches,
//  and presents smooth update prompts to Soundwave users.
// ═══════════════════════════════════════════

export interface AppUpdateInfo {
  version: string;
  buildNumber: number;
  title: string;
  apkUrl: string;
  forceUpdate: boolean;
  minSupportedVersion: string;
  changelog: string[];
  releaseDate: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  forceUpdate: boolean;
  currentVersion: string;
  latestUpdate: AppUpdateInfo | null;
}

// Current App Version installed on device
export const CURRENT_APP_VERSION = '1.2.0';
export const CURRENT_BUILD_NUMBER = 20260816;

const FIREBASE_RTDB_URL = 'https://soundwaves-b520c-default-rtdb.asia-southeast1.firebasedatabase.app';
const UPDATE_CACHE_KEY = 'sw_latest_update_info';
const LAST_CHECK_KEY = 'sw_last_update_check_time';

class UpdateService {
  private cachedUpdate: AppUpdateInfo | null = null;
  private isChecking = false;

  constructor() {
    try {
      const saved = localStorage.getItem(UPDATE_CACHE_KEY);
      if (saved) {
        this.cachedUpdate = JSON.parse(saved);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Compares semantic version strings (e.g., "1.3.0" vs "1.2.0")
   * Returns:
   *  1 if v1 > v2 (Newer version available)
   * -1 if v1 < v2
   *  0 if identical
   */
  public compareVersions(v1: string, v2: string): number {
    const p1 = (v1 || '0').split('.').map((x) => parseInt(x, 10) || 0);
    const p2 = (v2 || '0').split('.').map((x) => parseInt(x, 10) || 0);
    const len = Math.max(p1.length, p2.length);

    for (let i = 0; i < len; i++) {
      const n1 = p1[i] || 0;
      const n2 = p2[i] || 0;
      if (n1 > n2) return 1;
      if (n1 < n2) return -1;
    }
    return 0;
  }

  /**
   * Fetches latest update metadata from Firebase Realtime Database
   */
  public async checkForUpdates(force = false): Promise<UpdateCheckResult> {
    const now = Date.now();
    const lastCheck = parseInt(localStorage.getItem(LAST_CHECK_KEY) || '0', 10);

    // Throttle checks to once every 15 minutes unless forced manually by user
    if (!force && now - lastCheck < 15 * 60 * 1000 && this.cachedUpdate) {
      const hasUpdate = this.compareVersions(this.cachedUpdate.version, CURRENT_APP_VERSION) > 0;
      const isForced = this.cachedUpdate.forceUpdate ||
        this.compareVersions(this.cachedUpdate.minSupportedVersion || '1.0.0', CURRENT_APP_VERSION) > 0;

      return {
        hasUpdate,
        forceUpdate: isForced,
        currentVersion: CURRENT_APP_VERSION,
        latestUpdate: this.cachedUpdate,
      };
    }

    if (this.isChecking) {
      return {
        hasUpdate: false,
        forceUpdate: false,
        currentVersion: CURRENT_APP_VERSION,
        latestUpdate: this.cachedUpdate,
      };
    }

    this.isChecking = true;

    try {
      // Connect to Firebase Realtime Database
      const url = `${FIREBASE_RTDB_URL}/app_updates/latest.json`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        cache: 'no-cache',
      });

      if (!response.ok) {
        throw new Error(`Firebase returned status ${response.status}`);
      }

      const raw = await response.json();
      if (!raw || !raw.version) {
        return {
          hasUpdate: false,
          forceUpdate: false,
          currentVersion: CURRENT_APP_VERSION,
          latestUpdate: null,
        };
      }

      const updateInfo: AppUpdateInfo = {
        version: raw.version,
        buildNumber: raw.build_number || raw.buildNumber || 0,
        title: raw.title || `Soundwave ${raw.version} Available!`,
        apkUrl: raw.apk_url || raw.apkUrl || '',
        forceUpdate: Boolean(raw.force_update || raw.forceUpdate),
        minSupportedVersion: raw.min_supported_version || raw.minSupportedVersion || '1.0.0',
        changelog: Array.isArray(raw.changelog)
          ? raw.changelog
          : typeof raw.changelog === 'string'
          ? [raw.changelog]
          : ['Performance improvements and bug fixes.'],
        releaseDate: raw.release_date || raw.releaseDate || new Date().toISOString().split('T')[0],
      };

      this.cachedUpdate = updateInfo;
      localStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify(updateInfo));
      localStorage.setItem(LAST_CHECK_KEY, String(now));

      const hasUpdate = this.compareVersions(updateInfo.version, CURRENT_APP_VERSION) > 0;
      const isForced = updateInfo.forceUpdate ||
        this.compareVersions(updateInfo.minSupportedVersion, CURRENT_APP_VERSION) > 0;

      return {
        hasUpdate,
        forceUpdate: isForced,
        currentVersion: CURRENT_APP_VERSION,
        latestUpdate: updateInfo,
      };
    } catch (e) {
      console.warn('Update check failed:', e);
      return {
        hasUpdate: false,
        forceUpdate: false,
        currentVersion: CURRENT_APP_VERSION,
        latestUpdate: this.cachedUpdate,
      };
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Opens the download link for the new APK
   */
  public downloadAndInstallUpdate(apkUrl: string) {
    if (!apkUrl) return;
    if (typeof window !== 'undefined') {
      window.open(apkUrl, '_blank', 'noopener,noreferrer');
    }
  }
}

export const updateService = new UpdateService();
