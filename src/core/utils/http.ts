import { Capacitor, CapacitorHttp } from '@capacitor/core';

/**
 * Universal GET for JSON endpoints (uses native Android OkHttp with strict 5s timeout on device).
 */
export async function universalGet<T = any>(url: string, headers: Record<string, string> = {}, timeoutMs = 5000): Promise<T> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({
      url,
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
        ...headers,
      },
    });
    if (res.status >= 200 && res.status < 300) {
      if (typeof res.data === 'object' && res.data !== null) return res.data;
      if (typeof res.data === 'string') {
        try {
          return JSON.parse(res.data);
        } catch {
          return res.data as unknown as T;
        }
      }
      return res.data;
    }
    throw new Error(`HTTP ${res.status}`);
  } else {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          ...headers,
        },
        signal: controller ? controller.signal : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}

/**
 * Universal GET for raw HTML / Text responses (avoids JSON.parse errors).
 */
export async function universalGetText(url: string, headers: Record<string, string> = {}, timeoutMs = 5000): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({
      url,
      responseType: 'text',
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...headers,
      },
    });
    if (res.status >= 200 && res.status < 300) {
      if (typeof res.data === 'string') return res.data;
      return JSON.stringify(res.data);
    }
    throw new Error(`HTTP ${res.status}`);
  } else {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...headers,
        },
        signal: controller ? controller.signal : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}

/**
 * Universal POST request: uses native Android OkHttp on device to bypass CORS with strict timeout.
 */
export async function universalPost<T = any>(url: string, body: any, headers: Record<string, string> = {}, timeoutMs = 6000): Promise<T> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.post({
      url,
      data: body,
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Origin: 'https://music.youtube.com',
        Referer: 'https://music.youtube.com/',
        ...headers,
      },
    });
    if (res.status >= 200 && res.status < 300) {
      if (typeof res.data === 'object' && res.data !== null) return res.data;
      if (typeof res.data === 'string') {
        try {
          return JSON.parse(res.data);
        } catch {
          return res.data as unknown as T;
        }
      }
      return res.data;
    }
    throw new Error(`HTTP ${res.status}`);
  } else {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
        signal: controller ? controller.signal : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}
