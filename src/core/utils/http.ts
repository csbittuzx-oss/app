import { Capacitor, CapacitorHttp } from '@capacitor/core';

/**
 * Universal GET for JSON endpoints (uses native Android OkHttp on device).
 */
export async function universalGet<T = any>(url: string, headers: Record<string, string> = {}): Promise<T> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({
      url,
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
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...headers,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}

/**
 * Universal GET for raw HTML / Text responses (avoids JSON.parse errors).
 */
export async function universalGetText(url: string, headers: Record<string, string> = {}): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({
      url,
      responseType: 'text',
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
    const res = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...headers,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
}

/**
 * Universal POST request: uses native Android OkHttp on device to bypass CORS.
 */
export async function universalPost<T = any>(url: string, body: any, headers: Record<string, string> = {}): Promise<T> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.post({
      url,
      data: body,
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
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}
