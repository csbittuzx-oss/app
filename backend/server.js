// ═══════════════════════════════════════════
//  Soundwave Backend API Server (Node.js + Express)
//  Securely proxies and manages Firebase Realtime Database updates.
// ═══════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || 'https://soundwaves-b520c-default-rtdb.asia-southeast1.firebasedatabase.app';
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'soundwave_pandit_secret_2026';

// ── 1. Client Endpoint: Soundwave App checks this URL ──
app.get('/api/updates/latest', async (req, res) => {
  try {
    const clientVersion = req.query.version || '1.0.0';

    // Fetch update from your Firebase Realtime DB safely
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
        changelog: updateData.changelog || [],
        releaseDate: updateData.release_date
      }
    });
  } catch (error) {
    console.error('Update check error:', error);
    return res.status(500).json({ success: false, message: 'Could not check updates' });
  }
});

// ── 2. Admin Endpoint: Push update from terminal / Postman anytime ──
app.post('/api/updates/publish', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== ADMIN_SECRET_KEY) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Invalid Admin Secret Key' });
  }

  const { version, build_number, title, apk_url, force_update, min_supported_version, changelog } = req.body;

  if (!version || !apk_url) {
    return res.status(400).json({ success: false, message: 'version and apk_url are required' });
  }

  const payload = {
    version,
    build_number: build_number || Date.now(),
    title: title || `Soundwave ${version}`,
    apk_url,
    force_update: Boolean(force_update),
    min_supported_version: min_supported_version || '1.0.0',
    changelog: Array.isArray(changelog) ? changelog : [changelog || 'Performance improvements'],
    release_date: new Date().toISOString().split('T')[0]
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
      message: `Version ${version} published successfully!`,
      data: payload
    });
  } catch (error) {
    console.error('Publish error:', error);
    return res.status(500).json({ success: false, message: error.message });
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
app.get('/', (req, res) => res.send('Soundwave Backend API Server is Live!'));

app.listen(PORT, () => console.log(`Soundwave Backend API running on port ${PORT}`));
