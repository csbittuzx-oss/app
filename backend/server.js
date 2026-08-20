// ═══════════════════════════════════════════
//  Soundwave Backend API & Web Admin Control Panel
//  Developed by Pandit Bittu (@panditbittu.x)
// ═══════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: false // Allows admin dashboard styles & inline scripts
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || 'https://soundwaves-b520c-default-rtdb.asia-southeast1.firebasedatabase.app';
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'soundwave_pandit_secret_2026';

// ── 1. Client Endpoint: Soundwave App checks this URL ──
app.get('/api/updates/latest', async (req, res) => {
  try {
    const clientVersion = req.query.version || '1.0.0';

    const response = await fetch(`${FIREBASE_DB_URL}/app_updates/latest.json`, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-cache'
    });

    if (!response.ok) {
      throw new Error(`Firebase returned HTTP ${response.status}`);
    }

    const updateData = await response.json();

    if (!updateData || !updateData.version) {
      return res.json({
        success: true,
        hasUpdate: false,
        message: 'No update available'
      });
    }

    const hasUpdate = compareVersions(updateData.version, clientVersion) > 0;
    const forceUpdate = updateData.force_update || compareVersions(updateData.min_supported_version || '1.0.0', clientVersion) > 0;

    return res.json({
      success: true,
      hasUpdate,
      forceUpdate,
      currentClientVersion: clientVersion,
      update: {
        version: updateData.version,
        buildNumber: updateData.build_number,
        title: updateData.title || `Soundwave ${updateData.version} Available!`,
        apkUrl: updateData.apk_url,
        forceUpdate: Boolean(updateData.force_update),
        minSupportedVersion: updateData.min_supported_version || '1.0.0',
        changelog: updateData.changelog || [],
        releaseDate: updateData.release_date
      }
    });
  } catch (error) {
    console.error('Update check error:', error);
    return res.status(500).json({ success: false, message: 'Could not check updates' });
  }
});

// ── 2. Admin Endpoint: Push update from Web Admin Panel / API ──
app.post('/api/updates/publish', async (req, res) => {
  const adminKey = req.headers['x-admin-key'] || req.body.adminKey;
  if (!adminKey || adminKey !== ADMIN_SECRET_KEY) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Invalid Admin Secret Key' });
  }

  const { version, build_number, title, apk_url, force_update, min_supported_version, changelog } = req.body;

  if (!version || !apk_url) {
    return res.status(400).json({ success: false, message: 'App Version and APK Download Link are required.' });
  }

  let parsedChangelog = [];
  if (Array.isArray(changelog)) {
    parsedChangelog = changelog.filter(Boolean);
  } else if (typeof changelog === 'string') {
    parsedChangelog = changelog
      .split('\n')
      .map(line => line.replace(/^[-*•\d.]\s*/, '').trim())
      .filter(line => line.length > 0);
  }

  if (parsedChangelog.length === 0) {
    parsedChangelog = ['Performance improvements and bug fixes.'];
  }

  const payload = {
    version: version.trim(),
    build_number: build_number ? parseInt(build_number, 10) : Date.now(),
    title: title ? title.trim() : `Soundwave ${version} is Live!`,
    apk_url: apk_url.trim(),
    force_update: force_update === true || force_update === 'true' || force_update === 'on',
    min_supported_version: min_supported_version ? min_supported_version.trim() : '1.0.0',
    changelog: parsedChangelog,
    release_date: new Date().toISOString().split('T')[0],
    updated_at: new Date().toISOString()
  };

  try {
    const fbRes = await fetch(`${FIREBASE_DB_URL}/app_updates/latest.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!fbRes.ok) {
      throw new Error(`Firebase write error: HTTP ${fbRes.status}`);
    }

    return res.json({
      success: true,
      message: `Update v${version} successfully sent to all Soundwave users!`,
      data: payload
    });
  } catch (error) {
    console.error('Publish error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// ── 3. AI Music Search Intent & Smart Personalization Endpoint ──
app.post('/api/ai/intent', async (req, res) => {
  const { query, language } = req.body;
  if (!query) {
    return res.status(400).json({ success: false, message: 'Query is required' });
  }

  if (!GEMINI_API_KEY) {
    return res.json({
      success: true,
      hasGemini: false,
      query,
    });
  }

  try {
    const prompt = `You are a music recommendation and search intent intelligence engine for SoundWave music streaming application.
Analyze the user's natural-language music query: "${query}" (Preferred languages: ${language || 'Hindi, English'}).
Output ONLY a strict JSON object with these exact keys:
{
  "isNaturalLanguage": true,
  "intentType": "mood" | "activity" | "era" | "similarity" | "genre" | "direct",
  "expandedQuery": "clean search keywords optimized for JioSaavn / YouTube Music",
  "smartTag": "Short 2-3 word clean badge title (e.g. Study & Focus, Late Night Drive, 2000s Hits)",
  "categoryHint": "Short description"
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const gRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    if (!gRes.ok) {
      throw new Error(`Gemini returned HTTP ${gRes.status}`);
    }

    const gData = await gRes.json();
    const rawText = gData?.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(rawText);

    return res.json({
      success: true,
      hasGemini: true,
      data: parsed
    });
  } catch (error) {
    console.error('Gemini intent error:', error);
    return res.json({ success: false, message: error.message });
  }
});

// ── 3. Web Admin Dashboard UI (Desktop & Mobile Responsive) ──
app.get(['/', '/admin'], async (req, res) => {
  let currentRelease = null;
  try {
    const fbRes = await fetch(`${FIREBASE_DB_URL}/app_updates/latest.json`);
    currentRelease = await fbRes.json();
  } catch (e) {
    // ignore
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Soundwave Release Control Center</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090A0F;
      --surface: #12141D;
      --surface-2: #1A1D2B;
      --border: rgba(255, 255, 255, 0.1);
      --accent: #F59E0B;
      --accent-glow: rgba(245, 158, 11, 0.35);
      --text: #F3F4F6;
      --text-muted: #9CA3AF;
      --success: #10B981;
      --danger: #EF4444;
      --radius: 16px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px 16px;
      background-image: radial-gradient(circle at 50% 0%, rgba(245, 158, 11, 0.12) 0%, transparent 60%);
    }
    .container {
      width: 100%;
      max-width: 900px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    header {
      display: flex;
      align-items: center;
      justifyContent: space-between;
      flex-wrap: wrap;
      gap: 16px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 20px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .logo-badge {
      width: 48px;
      height: 48px;
      border-radius: 14px;
      background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 800;
      font-size: 24px;
      box-shadow: 0 4px 16px var(--accent-glow);
    }
    h1 {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 24px;
      color: #fff;
      letter-spacing: -0.02em;
    }
    .dev-tag {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .status-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(16, 185, 129, 0.12);
      color: var(--success);
      border: 1px solid rgba(16, 185, 129, 0.25);
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 8px var(--success);
    }
    .grid {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 24px;
    }
    @media (max-width: 820px) {
      .grid { grid-template-columns: 1fr; }
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
    }
    .card-title {
      font-size: 16px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 18px;
    }
    label {
      font-size: 12px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    input, textarea {
      width: 100%;
      background: var(--surface-2);
      border: 1.5px solid var(--border);
      border-radius: 10px;
      padding: 12px 14px;
      color: #fff;
      font-family: inherit;
      font-size: 14px;
      transition: all 180ms ease;
    }
    input:focus, textarea:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }
    textarea {
      resize: vertical;
      min-height: 110px;
      line-height: 1.5;
    }
    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      background: var(--surface-2);
      border: 1.5px solid var(--border);
      border-radius: 10px;
      margin-bottom: 20px;
    }
    .toggle-label {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .toggle-title {
      font-size: 13.5px;
      font-weight: 700;
      color: #fff;
    }
    .toggle-desc {
      font-size: 11.5px;
      color: var(--text-muted);
    }
    .switch {
      position: relative;
      display: inline-block;
      width: 48px;
      height: 26px;
    }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
      background-color: #374151;
      transition: .3s;
      border-radius: 34px;
    }
    .slider:before {
      position: absolute; content: ""; height: 18px; width: 18px; left: 4px; bottom: 4px;
      background-color: white;
      transition: .3s;
      border-radius: 50%;
    }
    input:checked + .slider { background-color: var(--danger); }
    input:checked + .slider:before { transform: translateX(22px); }
    .btn-send {
      width: 100%;
      background: linear-gradient(135deg, var(--accent) 0%, #D97706 100%);
      color: #000;
      border: none;
      padding: 14px 20px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      box-shadow: 0 6px 20px var(--accent-glow);
      transition: all 180ms ease;
    }
    .btn-send:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px var(--accent-glow);
    }
    .btn-send:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    /* Mobile Mockup Preview */
    .preview-card {
      background: #000;
      border: 2px solid #27272A;
      border-radius: 24px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
      position: sticky;
      top: 24px;
    }
    .preview-header {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .preview-icon {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #000;
      font-weight: 800;
    }
    .preview-badge {
      font-size: 10px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(239, 68, 68, 0.2);
      color: var(--danger);
    }
    .preview-changelog {
      background: #18181B;
      border-radius: 12px;
      padding: 12px;
      max-height: 180px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 12px;
      color: #E4E4E7;
      line-height: 1.4;
    }
    .preview-btn {
      background: var(--accent);
      color: #000;
      font-weight: 800;
      font-size: 13px;
      padding: 12px;
      border-radius: 10px;
      text-align: center;
    }
    .toast {
      position: fixed;
      top: 24px;
      right: 24px;
      background: #10B981;
      color: #fff;
      padding: 14px 24px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 14px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      display: none;
      animation: slideIn 200ms ease;
      z-index: 9999;
    }
    @keyframes slideIn {
      from { transform: translateY(-20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="logo-badge">⚡</div>
        <div>
          <h1>Soundwave Release Control</h1>
          <div class="dev-tag">Developer: Pandit Bittu • @panditbittu.x</div>
        </div>
      </div>
      <div class="status-pill">
        <div class="status-dot"></div>
        <span>Live: v${currentRelease ? currentRelease.version : '1.2.0'}</span>
      </div>
    </header>

    <div class="grid">
      <!-- Release Form -->
      <div class="card">
        <div class="card-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span>Send App Update to Users</span>
        </div>

        <form id="updateForm">
          <div class="form-group">
            <label>App Version (e.g. 1.3.0)</label>
            <input type="text" id="version" name="version" placeholder="1.3.0" value="${currentRelease ? currentRelease.version : '1.3.0'}" required>
          </div>

          <div class="form-group">
            <label>Update Title / Headline</label>
            <input type="text" id="title" name="title" placeholder="Soundwave 1.3.0 is here!" value="Soundwave Update Available!">
          </div>

          <div class="form-group">
            <label>APK Download Link (Direct URL)</label>
            <input type="url" id="apk_url" name="apk_url" placeholder="https://github.com/.../app-release.apk" value="${currentRelease && currentRelease.apk_url ? currentRelease.apk_url : ''}" required>
          </div>

          <div class="form-group">
            <label>What's New in this Update (Description / Changelog)</label>
            <textarea id="changelog" name="changelog" placeholder="- Brand new offline music downloads\n- Faster audio streaming\n- Bug fixes and UI improvements">${currentRelease && currentRelease.changelog ? currentRelease.changelog.join('\n') : '- High Quality 320kbps Audio Engine\n- Smart AutoPlay Recommendations\n- Offline Continue Listening'}</textarea>
          </div>

          <!-- Non-Closeable Force Update Toggle -->
          <div class="toggle-row">
            <div class="toggle-label">
              <span class="toggle-title">Mandatory Update (Non-Closeable)</span>
              <span class="toggle-desc">User cannot close or bypass popup without updating</span>
            </div>
            <label class="switch">
              <input type="checkbox" id="force_update" name="force_update" checked>
              <span class="slider"></span>
            </label>
          </div>

          <div class="form-group">
            <label>Admin Secret Key</label>
            <input type="password" id="adminKey" name="adminKey" placeholder="Enter secret password" value="soundwave_pandit_secret_2026" required>
          </div>

          <button type="submit" id="btnSubmit" class="btn-send">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            <span>Send Update to All Soundwave Users</span>
          </button>
        </form>
      </div>

      <!-- Live Mobile App Popup Preview -->
      <div>
        <div class="card-title" style="margin-bottom: 12px;">📱 In-App Popup Preview (User View)</div>
        <div class="preview-card">
          <div class="preview-header">
            <div class="preview-icon">⚡</div>
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <strong style="font-size:15px; color:#fff;" id="prevTitle">Update Available</strong>
                <span class="preview-badge" id="prevBadge">Required Update</span>
              </div>
              <p style="font-size:11px; color:#A1A1AA; margin-top:2px;" id="prevVer">v1.2.0 ➔ v1.3.0</p>
            </div>
          </div>

          <div style="font-size:12px; font-weight:700; color:#A1A1AA; text-transform:uppercase;">What's New</div>
          <div class="preview-changelog" id="prevLogs">
            <!-- items -->
          </div>

          <div class="preview-btn">🚀 Update Now (Download APK)</div>
          <div style="text-align:center; font-size:11px; color:#71717A;">🔒 Popup cannot be dismissed until updated</div>
        </div>
      </div>
    </div>
  </div>

  <div id="toast" class="toast"></div>

  <script>
    const form = document.getElementById('updateForm');
    const prevTitle = document.getElementById('prevTitle');
    const prevVer = document.getElementById('prevVer');
    const prevLogs = document.getElementById('prevLogs');
    const prevBadge = document.getElementById('prevBadge');
    const toast = document.getElementById('toast');
    const btnSubmit = document.getElementById('btnSubmit');

    function updatePreview() {
      const ver = document.getElementById('version').value || '1.3.0';
      const title = document.getElementById('title').value || 'Update Available';
      const changelog = document.getElementById('changelog').value || '';
      const isForce = document.getElementById('force_update').checked;

      prevTitle.textContent = title;
      prevVer.textContent = 'v1.2.0 ➔ v' + ver;
      prevBadge.textContent = isForce ? 'Required Update' : 'New Release';
      prevBadge.style.color = isForce ? '#EF4444' : '#F59E0B';
      prevBadge.style.background = isForce ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)';

      const lines = changelog.split('\\n').filter(Boolean);
      prevLogs.innerHTML = lines.map(line => '<div>✓ ' + line.replace(/^[-*•\\d.]\\s*/, '') + '</div>').join('') || '<div>✓ Bug fixes & performance updates</div>';
    }

    ['version', 'title', 'changelog', 'force_update'].forEach(id => {
      document.getElementById(id).addEventListener('input', updatePreview);
    });
    document.getElementById('force_update').addEventListener('change', updatePreview);
    updatePreview();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = 'Sending Update...';

      const payload = {
        version: document.getElementById('version').value,
        title: document.getElementById('title').value,
        apk_url: document.getElementById('apk_url').value,
        changelog: document.getElementById('changelog').value,
        force_update: document.getElementById('force_update').checked,
        adminKey: document.getElementById('adminKey').value
      };

      try {
        const res = await fetch('/api/updates/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.success) {
          showToast('🎉 ' + data.message);
        } else {
          alert('❌ ' + data.message);
        }
      } catch (err) {
        alert('Network error: ' + err.message);
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = 'Send Update to All Soundwave Users';
      }
    });

    function showToast(msg) {
      toast.textContent = msg;
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 4000);
    }
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// ═════════════════════════════════════════════════════════════════════
//  LAST.FM METADATA API PROXY & CACHE SYSTEM
// ═════════════════════════════════════════════════════════════════════

const LASTFM_API_KEY = process.env.LASTFM_API_KEY || 'b25b959554ed76058ac220b7b2e0a026';
const LASTFM_BASE_URL = 'https://ws.audioscrobbler.com/2.0';

// In-Memory TTL Cache (15-minute expiration)
const lastfmCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

function getCached(key) {
  const item = lastfmCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    lastfmCache.delete(key);
    return null;
  }
  return item.data;
}

function setCached(key, data) {
  if (lastfmCache.size > 1000) {
    const firstKey = lastfmCache.keys().next().value;
    lastfmCache.delete(firstKey);
  }
  lastfmCache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS });
}

function buildLastfmUrl(method, params = {}) {
  const p = new URLSearchParams({
    method,
    api_key: LASTFM_API_KEY,
    format: 'json',
    autocorrect: '1',
    ...params
  });
  return `${LASTFM_BASE_URL}/?${p.toString()}`;
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim()
    .split('Read more')[0]
    .trim();
}

function extractLastfmImage(images) {
  if (!Array.isArray(images)) return '';
  const mega = images.find(i => i.size === 'mega')?.['#text'];
  const xl = images.find(i => i.size === 'extralarge')?.['#text'];
  const lg = images.find(i => i.size === 'large')?.['#text'];
  const med = images.find(i => i.size === 'medium')?.['#text'];
  return mega || xl || lg || med || '';
}

// 1. Get Artist Information (Bio, Listeners, Playcount, Tags, Image)
app.get('/api/lastfm/artist/:name', async (req, res) => {
  const artistName = req.params.name?.trim();
  if (!artistName) {
    return res.status(400).json({ success: false, message: 'Artist name is required' });
  }

  const cacheKey = `artist_${artistName.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json({ success: true, cached: true, ...cached });

  try {
    const url = buildLastfmUrl('artist.getInfo', { artist: artistName });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Last.fm returned HTTP ${response.status}`);
    
    const data = await response.json();
    const a = data?.artist;
    if (!a) {
      return res.status(404).json({ success: false, message: 'Artist not found' });
    }

    const payload = {
      artist: {
        id: `lastfm_${a.mbid || encodeURIComponent(a.name)}`,
        name: a.name,
        image: extractLastfmImage(a.image),
        listeners: parseInt(a.stats?.listeners || '0'),
        playcount: parseInt(a.stats?.playcount || '0'),
        bio: stripHtml(a.bio?.summary || ''),
        tags: Array.isArray(a.tags?.tag) ? a.tags.tag.map(t => t.name) : [],
        similar: Array.isArray(a.similar?.artist) ? a.similar.artist.map(s => ({
          name: s.name,
          url: s.url,
          image: extractLastfmImage(s.image)
        })) : [],
        url: a.url
      }
    };

    setCached(cacheKey, payload);
    return res.json({ success: true, ...payload });
  } catch (error) {
    console.error(`Last.fm artist error for "${artistName}":`, error.message);
    return res.status(500).json({ success: false, message: 'Could not fetch artist from Last.fm' });
  }
});

// 2. Get Similar Artists
app.get('/api/lastfm/artist/:name/similar', async (req, res) => {
  const artistName = req.params.name?.trim();
  const limit = parseInt(req.query.limit) || 12;
  if (!artistName) {
    return res.status(400).json({ success: false, message: 'Artist name is required' });
  }

  const cacheKey = `similar_${artistName.toLowerCase()}_${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json({ success: true, cached: true, ...cached });

  try {
    const url = buildLastfmUrl('artist.getSimilar', { artist: artistName, limit: String(limit) });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Last.fm returned HTTP ${response.status}`);

    const data = await response.json();
    const rawArtists = data?.similarartists?.artist || [];
    const artists = (Array.isArray(rawArtists) ? rawArtists : [rawArtists]).map(a => ({
      name: a.name,
      match: parseFloat(a.match || '0'),
      image: extractLastfmImage(a.image),
      url: a.url
    }));

    const payload = { artists };
    setCached(cacheKey, payload);
    return res.json({ success: true, ...payload });
  } catch (error) {
    console.error(`Last.fm similar error for "${artistName}":`, error.message);
    return res.status(500).json({ success: false, message: 'Could not fetch similar artists' });
  }
});

// 3. Get Artist Top Tracks
app.get('/api/lastfm/artist/:name/top-tracks', async (req, res) => {
  const artistName = req.params.name?.trim();
  const limit = parseInt(req.query.limit) || 20;
  if (!artistName) {
    return res.status(400).json({ success: false, message: 'Artist name is required' });
  }

  const cacheKey = `toptracks_${artistName.toLowerCase()}_${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json({ success: true, cached: true, ...cached });

  try {
    const url = buildLastfmUrl('artist.getTopTracks', { artist: artistName, limit: String(limit) });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Last.fm returned HTTP ${response.status}`);

    const data = await response.json();
    const rawTracks = data?.toptracks?.track || [];
    const tracks = (Array.isArray(rawTracks) ? rawTracks : [rawTracks]).map(t => ({
      title: t.name,
      artist: t.artist?.name || artistName,
      listeners: parseInt(t.listeners || '0'),
      playcount: parseInt(t.playcount || '0'),
      image: extractLastfmImage(t.image),
      url: t.url
    }));

    const payload = { tracks };
    setCached(cacheKey, payload);
    return res.json({ success: true, ...payload });
  } catch (error) {
    console.error(`Last.fm top tracks error for "${artistName}":`, error.message);
    return res.status(500).json({ success: false, message: 'Could not fetch artist top tracks' });
  }
});

// 4. Get Track Information (Album, Duration, Summary, Tags)
app.get('/api/lastfm/track/info', async (req, res) => {
  const artist = req.query.artist?.trim();
  const track = req.query.track?.trim();
  if (!artist || !track) {
    return res.status(400).json({ success: false, message: 'Both artist and track params are required' });
  }

  const cacheKey = `track_${artist.toLowerCase()}_${track.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json({ success: true, cached: true, ...cached });

  try {
    const url = buildLastfmUrl('track.getInfo', { artist, track });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Last.fm returned HTTP ${response.status}`);

    const data = await response.json();
    const t = data?.track;
    if (!t) return res.status(404).json({ success: false, message: 'Track not found' });

    const payload = {
      track: {
        title: t.name,
        artist: t.artist?.name || artist,
        album: t.album?.title || '',
        image: extractLastfmImage(t.album?.image),
        duration: parseInt(t.duration || '0') / 1000, // seconds
        listeners: parseInt(t.listeners || '0'),
        playcount: parseInt(t.playcount || '0'),
        summary: stripHtml(t.wiki?.summary || ''),
        tags: Array.isArray(t.toptags?.tag) ? t.toptags.tag.map(tag => tag.name) : [],
        url: t.url
      }
    };

    setCached(cacheKey, payload);
    return res.json({ success: true, ...payload });
  } catch (error) {
    console.error(`Last.fm track info error:`, error.message);
    return res.status(500).json({ success: false, message: 'Could not fetch track info' });
  }
});

// 4b. Get Similar Tracks (Musically / Acoustically Similar Songs)
app.get('/api/lastfm/track/similar', async (req, res) => {
  const artist = req.query.artist?.trim();
  const track = req.query.track?.trim();
  const limit = parseInt(req.query.limit) || 10;
  if (!artist || !track) {
    return res.status(400).json({ success: false, message: 'Both artist and track params are required' });
  }

  const cacheKey = `track_similar_${artist.toLowerCase()}_${track.toLowerCase()}_${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json({ success: true, cached: true, ...cached });

  try {
    const url = buildLastfmUrl('track.getSimilar', { artist, track, limit: String(limit) });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Last.fm returned HTTP ${response.status}`);

    const data = await response.json();
    const rawTracks = data?.similartracks?.track || [];
    const tracks = (Array.isArray(rawTracks) ? rawTracks : [rawTracks]).map(t => ({
      title: t.name,
      artist: t.artist?.name || '',
      match: parseFloat(t.match || '0'),
      duration: parseInt(t.duration || '0'),
      playcount: parseInt(t.playcount || '0'),
      image: extractLastfmImage(t.image),
      url: t.url
    }));

    const payload = { tracks };
    setCached(cacheKey, payload);
    return res.json({ success: true, ...payload });
  } catch (error) {
    console.error(`Last.fm track similar error:`, error.message);
    return res.status(500).json({ success: false, message: 'Could not fetch similar tracks' });
  }
});

// 4c. Get Album Information & Summary (Wiki, Release Date, Tracklist)
app.get('/api/lastfm/album/info', async (req, res) => {
  const artist = req.query.artist?.trim();
  const album = req.query.album?.trim();
  if (!artist || !album) {
    return res.status(400).json({ success: false, message: 'Both artist and album params are required' });
  }

  const cacheKey = `album_${artist.toLowerCase()}_${album.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json({ success: true, cached: true, ...cached });

  try {
    const url = buildLastfmUrl('album.getInfo', { artist, album });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Last.fm returned HTTP ${response.status}`);

    const data = await response.json();
    const alb = data?.album;
    if (!alb) return res.status(404).json({ success: false, message: 'Album not found' });

    const rawTracks = alb.tracks?.track || [];
    const tracks = (Array.isArray(rawTracks) ? rawTracks : [rawTracks]).map(t => ({
      title: t.name,
      duration: parseInt(t.duration || '0'),
      rank: parseInt(t['@attr']?.rank || '0'),
      url: t.url
    }));

    const payload = {
      album: {
        title: alb.name,
        artist: alb.artist,
        listeners: parseInt(alb.listeners || '0'),
        playcount: parseInt(alb.playcount || '0'),
        image: extractLastfmImage(alb.image),
        releasedate: alb.wiki?.published || '',
        summary: stripHtml(alb.wiki?.summary || ''),
        tags: Array.isArray(alb.tags?.tag) ? alb.tags.tag.map(tag => tag.name) : [],
        tracks,
        url: alb.url
      }
    };

    setCached(cacheKey, payload);
    return res.json({ success: true, ...payload });
  } catch (error) {
    console.error(`Last.fm album info error:`, error.message);
    return res.status(500).json({ success: false, message: 'Could not fetch album info' });
  }
});

// 5. Global Charts: Top Artists
app.get('/api/lastfm/chart/top-artists', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const cacheKey = `chart_top_artists_${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json({ success: true, cached: true, ...cached });

  try {
    const url = buildLastfmUrl('chart.getTopArtists', { limit: String(limit) });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Last.fm returned HTTP ${response.status}`);

    const data = await response.json();
    const rawArtists = data?.artists?.artist || [];
    const artists = (Array.isArray(rawArtists) ? rawArtists : [rawArtists]).map(a => ({
      name: a.name,
      listeners: parseInt(a.listeners || '0'),
      playcount: parseInt(a.playcount || '0'),
      image: extractLastfmImage(a.image),
      url: a.url
    }));

    const payload = { artists };
    setCached(cacheKey, payload);
    return res.json({ success: true, ...payload });
  } catch (error) {
    console.error('Last.fm chart top artists error:', error.message);
    return res.status(500).json({ success: false, message: 'Could not fetch top artists chart' });
  }
});

// 6. Global Charts: Top Tracks
app.get('/api/lastfm/chart/top-tracks', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const cacheKey = `chart_top_tracks_${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json({ success: true, cached: true, ...cached });

  try {
    const url = buildLastfmUrl('chart.getTopTracks', { limit: String(limit) });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Last.fm returned HTTP ${response.status}`);

    const data = await response.json();
    const rawTracks = data?.tracks?.track || [];
    const tracks = (Array.isArray(rawTracks) ? rawTracks : [rawTracks]).map(t => ({
      title: t.name,
      artist: t.artist?.name || '',
      listeners: parseInt(t.listeners || '0'),
      playcount: parseInt(t.playcount || '0'),
      image: extractLastfmImage(t.image),
      url: t.url
    }));

    const payload = { tracks };
    setCached(cacheKey, payload);
    return res.json({ success: true, ...payload });
  } catch (error) {
    console.error('Last.fm chart top tracks error:', error.message);
    return res.status(500).json({ success: false, message: 'Could not fetch top tracks chart' });
  }
});

// 7. Genre / Tag Top Tracks
app.get('/api/lastfm/tag/:tag/top-tracks', async (req, res) => {
  const tag = req.params.tag?.trim();
  const limit = parseInt(req.query.limit) || 20;
  if (!tag) {
    return res.status(400).json({ success: false, message: 'Tag name is required' });
  }

  const cacheKey = `tag_toptracks_${tag.toLowerCase()}_${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json({ success: true, cached: true, ...cached });

  try {
    const url = buildLastfmUrl('tag.getTopTracks', { tag, limit: String(limit) });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Last.fm returned HTTP ${response.status}`);

    const data = await response.json();
    const rawTracks = data?.tracks?.track || [];
    const tracks = (Array.isArray(rawTracks) ? rawTracks : [rawTracks]).map(t => ({
      title: t.name,
      artist: t.artist?.name || '',
      rank: parseInt(t['@attr']?.rank || '0'),
      image: extractLastfmImage(t.image),
      url: t.url
    }));

    const payload = { tag, tracks };
    setCached(cacheKey, payload);
    return res.json({ success: true, ...payload });
  } catch (error) {
    console.error(`Last.fm tag top tracks error for "${tag}":`, error.message);
    return res.status(500).json({ success: false, message: 'Could not fetch tag top tracks' });
  }
});

// Helper: Semantic Version Comparator
function compareVersions(v1, v2) {
  const p1 = (v1 || '0').split('.').map(Number);
  const p2 = (v2 || '0').split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

app.get('/health', (req, res) => res.json({ status: 'OK', project: 'soundwaves-b520c', timestamp: Date.now() }));

app.listen(PORT, () => console.log(`Soundwave Backend & Admin Control Panel running on port ${PORT}`));
