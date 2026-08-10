# ITAgent_2026 — Flutter (Android / iOS / Windows / macOS)

Scaffold for a single codebase that:

1. Optionally scans the printed asset QR (`/asset/{token}`) to bind `asset_tag`
2. Collects device info (`device_info_plus`, `network_info_plus`)
3. POSTs to `POST /api/v1/agent/sync` with `X-Agent-Key`

## Create the app

```bash
flutter create --org com.refex itagent_2026
cd itagent_2026
flutter pub add device_info_plus http shared_preferences mobile_scanner
```

Wire `lib/main.dart` to:

- Read `REFEX_API_URL` / stored API base
- On launch (or schedule): gather model, OS, device id
- If user scanned a label, include `asset_tag`
- `POST …/agent/sync`

Desktop targets (Windows/macOS) can call into the Node agent or use platform channels; mobile focuses on tag-bound sync because hardware serial is often blocked.

## Why Flutter

One project covers **Android, iOS, Windows, macOS** (and Linux) with shared UI for:

- Scan label QR
- Show last sync status
- Manual “Sync now”
