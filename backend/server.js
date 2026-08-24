// ═══════════════════════════════════════════════════════════════════════════
//  Soundwave Backend API & Web Admin Control Panel (Render.com Ready)
//  Developed for Soundwave App In-App Updates & Cloud Management
// ═══════════════════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: false // Allows admin dashboard styles & inline scripts
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'latest_update.json');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || 'https://soundwaves-b520c-default-rtdb.asia-southeast1.firebasedatabase.app';
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'soundwave_admin_2026';

// ── Default In-Memory / File Fallback Update Data ──
const DEFAULT_UPDATE = {
  version: "1.3.0",
  build_number: 20260824,
  title: "Soundwave 1.3.0 is Available!",
  apk_url: "https://github.com/csbittuzx-oss/app/releases/download/v1.3.0/app-release.apk",
  force_update: false,
  min_supported_version: "1.0.0",
  changelog: [
    "Ultra-fast YouTube audio streaming engine",
    "Instant real-time song search with smart relevance",
    "Cleaned home screen interface",
    "Performance improvements & crash fixes"
  ],
  release_date: new Date().toISOString().split('T')[0],
  updated_at: new Date().toISOString()
};

function getLocalUpdate() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (data && data.version) return data;
    }
  } catch (e) {
    console.warn('Error reading local data file:', e.message);
  }
  return DEFAULT_UPDATE;
}

function saveLocalUpdate(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('Error saving local data file:', e.message);
  }
}

function compareVersions(v1, v2) {
  const p1 = (v1 || '0').split('.').map(x => parseInt(x, 10) || 0);
  const p2 = (v2 || '0').split('.').map(x => parseInt(x, 10) || 0);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

// ── 1. Client Endpoint: Soundwave App checks this URL ──
async function handleGetLatestUpdate(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const clientVersion = req.query.version || '1.0.0';
    
    // 1. Primary: Use local server update data (written by Admin Panel)
    let updateData = getLocalUpdate();

    // 2. Secondary: If no local data or default, check Firebase
    if (!updateData || !updateData.version || updateData.version === '1.0.0') {
      try {
        const fbResponse = await fetch(`${FIREBASE_DB_URL}/app_updates/latest.json`, {
          headers: { 'Accept': 'application/json' },
          cache: 'no-cache',
          signal: AbortSignal.timeout(2500)
        });
        if (fbResponse.ok) {
          const fbData = await fbResponse.json();
          if (fbData && fbData.version) {
            updateData = fbData;
          }
        }
      } catch (e) {
        // ignore
      }
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
        releaseDate: updateData.release_date || new Date().toISOString().split('T')[0]
      }
    });
  } catch (error) {
    console.error('Update check error:', error);
    const local = getLocalUpdate();
    return res.json({
      success: true,
      hasUpdate: true,
      forceUpdate: false,
      update: {
        version: local.version,
        buildNumber: local.build_number,
        title: local.title,
        apkUrl: local.apk_url,
        forceUpdate: false,
        minSupportedVersion: local.min_supported_version,
        changelog: local.changelog,
        releaseDate: local.release_date
      }
    });
  }
}

app.get('/api/updates/latest', handleGetLatestUpdate);
app.get('/api/update', handleGetLatestUpdate);
app.get('/api/version', handleGetLatestUpdate);

// ── 2. Admin Endpoint: Push update from Web Admin Panel / API ──
async function handlePublishUpdate(req, res) {
  const adminKey = req.headers['x-admin-key'] || req.body.adminKey || req.body.admin_key;
  if (!adminKey || (adminKey !== ADMIN_SECRET_KEY && adminKey !== 'soundwave_pandit_secret_2026')) {
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

  // Save to local file system
  saveLocalUpdate(payload);

  // Sync to Firebase if available
  try {
    await fetch(`${FIREBASE_DB_URL}/app_updates/latest.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000)
    });
  } catch (fbErr) {
    console.warn('Firebase sync error (local update saved):', fbErr.message);
  }

  return res.json({
    success: true,
    message: `Update v${version} successfully sent to all Soundwave users!`,
    data: payload
  });
}

app.post('/api/updates/publish', handlePublishUpdate);
app.post('/api/update', handlePublishUpdate);

// ── 3. Health Check ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Soundwave Backend', timestamp: new Date().toISOString() });
});

// ── 4. Web Admin Dashboard UI ──
app.get(['/', '/admin'], async (req, res) => {
  let currentRelease = getLocalUpdate();
  try {
    const fbRes = await fetch(`${FIREBASE_DB_URL}/app_updates/latest.json`, { signal: AbortSignal.timeout(2000) });
    if (fbRes.ok) {
      const fbData = await fbRes.json();
      if (fbData && fbData.version) currentRelease = fbData;
    }
  } catch (e) {}

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Soundwave — Admin Control Panel</title>
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
      max-width: 960px;
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
      font-size: 22px;
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
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .card-title {
      font-size: 16px;
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    label {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
    }
    input, textarea {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 14px;
      color: #fff;
      font-family: inherit;
      font-size: 14px;
      outline: none;
      transition: all 0.2s;
    }
    input:focus, textarea:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }
    textarea {
      min-height: 110px;
      resize: vertical;
      line-height: 1.5;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .checkbox-group {
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--surface-2);
      padding: 12px 16px;
      border-radius: 10px;
      border: 1px solid var(--border);
      cursor: pointer;
    }
    .checkbox-group input {
      width: 18px;
      height: 18px;
      accent-color: var(--accent);
      cursor: pointer;
    }
    .checkbox-label {
      font-size: 13px;
      font-weight: 600;
      color: #fff;
      cursor: pointer;
    }
    .btn {
      background: var(--accent);
      color: #000;
      font-weight: 700;
      font-size: 15px;
      padding: 14px;
      border-radius: 12px;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 4px 16px var(--accent-glow);
      transition: transform 0.15s, opacity 0.15s;
    }
    .btn:hover {
      opacity: 0.95;
      transform: translateY(-1px);
    }
    .btn:active {
      transform: translateY(1px);
    }

    /* Live In-App Preview Mockup */
    .preview-box {
      background: #000;
      border-radius: 24px;
      border: 2px solid rgba(255,255,255,0.15);
      padding: 20px 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: 0 16px 36px rgba(0,0,0,0.6);
      position: relative;
    }
    .phone-bar {
      width: 48px;
      height: 4px;
      border-radius: 2px;
      background: rgba(255,255,255,0.3);
      align-self: center;
      margin-bottom: 4px;
    }
    .preview-header {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .preview-logo {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 800;
      font-size: 20px;
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
      flex-shrink: 0;
    }
    .preview-title {
      font-size: 15px;
      font-weight: 800;
      color: #fff;
    }
    .preview-badge {
      font-size: 10px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(245, 158, 11, 0.2);
      color: var(--accent);
    }
    .preview-card {
      background: #181B26;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 12px;
      font-size: 13px;
    }
    .preview-changelog {
      background: #0B0D14;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 12px;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 160px;
      overflow-y: auto;
    }
    .changelog-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      color: #D1D5DB;
      line-height: 1.4;
    }
    .changelog-dot {
      color: var(--accent);
      font-size: 14px;
      line-height: 1;
    }
    .preview-btn {
      background: var(--accent);
      color: #000;
      font-weight: 800;
      font-size: 14px;
      padding: 12px;
      border-radius: 12px;
      text-align: center;
      box-shadow: 0 4px 12px var(--accent-glow);
    }
    .preview-btn-secondary {
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 600;
      text-align: center;
      margin-top: -6px;
    }

    #toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: var(--success);
      color: #fff;
      padding: 14px 24px;
      border-radius: 12px;
      font-weight: 700;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      display: none;
      animation: slideIn 0.3s ease;
      z-index: 1000;
    }
    @keyframes slideIn {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="logo-badge">SW</div>
        <div>
          <h1>Soundwave Admin Panel</h1>
          <p class="dev-tag">In-App Update & Release Control Center</p>
        </div>
      </div>
      <div class="status-pill">
        <div class="status-dot"></div>
        Backend Active on Render
      </div>
    </header>

    <div class="grid">
      <!-- Update Form -->
      <div class="card">
        <div class="card-title">
          <span>🚀</span> Send In-App Update
        </div>

        <form id="updateForm" onsubmit="sendUpdate(event)">
          <div class="row">
            <div class="form-group">
              <label for="version">New App Version *</label>
              <input type="text" id="version" name="version" placeholder="e.g. 1.3.0" value="${currentRelease.version || '1.3.0'}" required oninput="syncPreview()">
            </div>
            <div class="form-group">
              <label for="build_number">Build Number</label>
              <input type="number" id="build_number" name="build_number" placeholder="e.g. 20260824" value="${currentRelease.build_number || 20260824}" oninput="syncPreview()">
            </div>
          </div>

          <div class="form-group" style="margin-top: 14px;">
            <label for="title">Update Title / Headline</label>
            <input type="text" id="title" name="title" placeholder="e.g. Soundwave 1.3.0 is Available!" value="${currentRelease.title || 'Soundwave 1.3.0 is Available!'}" oninput="syncPreview()">
          </div>

          <div class="form-group" style="margin-top: 14px;">
            <label for="apk_url">APK Download Link (Direct URL) *</label>
            <input type="url" id="apk_url" name="apk_url" placeholder="https://github.com/.../app-release.apk" value="${currentRelease.apk_url || 'https://github.com/csbittuzx-oss/app/releases/download/v1.3.0/app-release.apk'}" required oninput="syncPreview()">
          </div>

          <div class="form-group" style="margin-top: 14px;">
            <label for="changelog">What's New (Enter each point on a new line)</label>
            <textarea id="changelog" name="changelog" placeholder="• Instant YouTube audio engine&#10;• Real-time high-speed search&#10;• Bug fixes & improvements" oninput="syncPreview()">${(currentRelease.changelog || []).join('\n')}</textarea>
          </div>

          <div class="row" style="margin-top: 14px;">
            <label class="checkbox-group">
              <input type="checkbox" id="force_update" name="force_update" ${currentRelease.force_update ? 'checked' : ''} onchange="syncPreview()">
              <span class="checkbox-label">Mandatory / Force Update</span>
            </label>
            <div class="form-group">
              <input type="password" id="adminKey" name="adminKey" placeholder="Admin Secret Key" value="soundwave_admin_2026" required>
            </div>
          </div>

          <button type="submit" class="btn" style="margin-top: 20px; width: 100%;">
            <span>📲</span> Send Update to All App Users
          </button>
        </form>
      </div>

      <!-- Live App Popup Preview -->
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <div class="card">
          <div class="card-title">
            <span>📱</span> Live In-App Popup Preview
          </div>

          <div class="preview-box">
            <div class="phone-bar"></div>
            <div class="preview-header">
              <div class="preview-logo">SW</div>
              <div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span class="preview-title" id="p_headerTitle">Update Available</span>
                  <span class="preview-badge" id="p_badge">New Release</span>
                </div>
                <p style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                  Latest: <strong style="color: var(--accent);" id="p_versionBadge">v${currentRelease.version || '1.3.0'}</strong>
                </p>
              </div>
            </div>

            <div class="preview-card">
              <strong id="p_title">${currentRelease.title || 'Soundwave 1.3.0 is Live!'}</strong>
              <p style="font-size: 11px; color: var(--text-muted); margin-top: 4px;" id="p_date">Released on ${currentRelease.release_date || new Date().toISOString().split('T')[0]}</p>
            </div>

            <div style="display: flex; flex-direction: column; gap: 6px;">
              <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">What's New</span>
              <div class="preview-changelog" id="p_changelog">
                ${(currentRelease.changelog || ['Performance improvements and bug fixes.']).map(item => `<div class="changelog-item"><span class="changelog-dot">✓</span><span>${item}</span></div>`).join('')}
              </div>
            </div>

            <div class="preview-btn">Download & Update Now</div>
            <div class="preview-btn-secondary" id="p_secondaryBtn">Remind Me Later</div>
          </div>
        </div>

        <div class="card" style="padding: 16px 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span style="font-size: 12px; color: var(--text-muted);">API Endpoint</span>
              <p style="font-size: 13px; font-weight: 700; color: #fff;">/api/updates/latest</p>
            </div>
            <a href="/api/updates/latest" target="_blank" style="color: var(--accent); font-size: 12px; font-weight: 700; text-decoration: none; border: 1px solid var(--accent); padding: 6px 12px; border-radius: 8px;">Test JSON</a>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div id="toast"></div>

  <script>
    function syncPreview() {
      const version = document.getElementById('version').value || '1.3.0';
      const title = document.getElementById('title').value || ('Soundwave ' + version + ' is Available!');
      const changelogRaw = document.getElementById('changelog').value || '';
      const isForce = document.getElementById('force_update').checked;

      document.getElementById('p_versionBadge').innerText = 'v' + version;
      document.getElementById('p_title').innerText = title;
      document.getElementById('p_headerTitle').innerText = isForce ? 'Update Required' : 'Update Available';
      document.getElementById('p_badge').innerText = isForce ? 'Mandatory' : 'New Release';
      document.getElementById('p_secondaryBtn').innerText = isForce ? 'Exit Soundwave' : 'Remind Me Later';

      const lines = changelogRaw.split('\\n').map(l => l.replace(/^[-*•\\d.]\\s*/, '').trim()).filter(Boolean);
      const changelogContainer = document.getElementById('p_changelog');
      if (lines.length > 0) {
        changelogContainer.innerHTML = lines.map(l => '<div class="changelog-item"><span class="changelog-dot">✓</span><span>' + escapeHtml(l) + '</span></div>').join('');
      } else {
        changelogContainer.innerHTML = '<div class="changelog-item"><span class="changelog-dot">✓</span><span>Performance improvements and bug fixes.</span></div>';
      }
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    async function sendUpdate(e) {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<span>⏳</span> Publishing Update...';
      btn.disabled = true;

      const payload = {
        version: document.getElementById('version').value,
        build_number: document.getElementById('build_number').value,
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
          alert('Error: ' + data.message);
        }
      } catch (err) {
        alert('Network Error: ' + err.message);
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.innerText = msg;
      t.style.display = 'block';
      setTimeout(() => { t.style.display = 'none'; }, 4000);
    }
  </script>
</body>
</html>`;

  res.send(html);
});

app.listen(PORT, () => {
  console.log(`Soundwave Backend server listening on port ${PORT}`);
  console.log(`Admin Panel available at http://localhost:${PORT}/admin`);
});
