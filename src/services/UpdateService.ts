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
export const CURRENT_APP_VERSION = '1.2.1';
export const CURRENT_BUILD_NUMBER = 20260817;

const DEFAULT_RENDER_BACKEND = 'https://app-oorz.onrender.com';
const FIREBASE_RTDB_URL = 'https://soundwaves-b520c-default-rtdb.asia-southeast1.firebasedatabase.app';
const UPDATE_CACHE_KEY = 'sw_latest_update_info';

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

  public getBackendUrl(): string {
    return DEFAULT_RENDER_BACKEND;
  }

  /**
   * Compares semantic version strings (e.g., "1.3.0" vs "1.2.1")
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
   * Fetches latest update metadata from Render Backend & Firebase Realtime Database
   */
  public async checkForUpdates(_force = false): Promise<UpdateCheckResult> {
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
      let raw: any = null;
      const backendBase = this.getBackendUrl();

      // 1. Try Configured Render Backend API
      try {
        const renderUrl = `${backendBase}/api/updates/latest?version=${encodeURIComponent(CURRENT_APP_VERSION)}&t=${Date.now()}`;
        const res = await fetch(renderUrl, {
          headers: { 'Accept': 'application/json' },
          cache: 'no-store',
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const resData = await res.json();
          if (resData?.update?.version) {
            raw = resData.update;
          }
        }
      } catch (err) {
        console.warn('Backend update check skipped:', err);
      }

      // 2. Fallback to Firebase Realtime Database directly
      if (!raw || !raw.version) {
        try {
          const fbUrl = `${FIREBASE_RTDB_URL}/app_updates/latest.json?t=${Date.now()}`;
          const fbRes = await fetch(fbUrl, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store',
            signal: AbortSignal.timeout(4000),
          });
          if (fbRes.ok) {
            raw = await fbRes.json();
          }
        } catch {}
      }

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
