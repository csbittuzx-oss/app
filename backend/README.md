# Soundwave Backend API 🚀

Node.js Express API server for Soundwave OTA updates and Firebase Realtime Database management.

## Environment Variables
- `FIREBASE_DB_URL`: `https://soundwaves-b520c-default-rtdb.asia-southeast1.firebasedatabase.app`
- `ADMIN_SECRET_KEY`: `soundwave_pandit_secret_2026`
- `PORT`: `3000`

## Endpoints
- `GET /` - Health check & server status
- `GET /api/updates/latest?version=1.2.0` - Fetch latest update metadata for app clients
- `POST /api/updates/publish` - Publish new release (requires `x-admin-key` header)
