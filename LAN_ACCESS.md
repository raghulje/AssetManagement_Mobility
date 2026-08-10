# LAN / Wi‑Fi access (Biogas_MIS_Vizag style)

**Recommended:** single URL on port **3001** (server serves built UI).

Your PC Wi‑Fi IP (update when it changes): check with PowerShell below.

## Production-style LAN (recommended)

```powershell
cd client
npm run build

cd ..\server
# Ensure SERVE_CLIENT=true and PUBLIC_APP_URL=http://YOUR_IP:3001 in .env
npm start
```

| What | URL |
|------|-----|
| App (login) | `http://YOUR_IP:3001` |
| API health | `http://YOUR_IP:3001/api/v1/status` |
| Public asset QR | `http://YOUR_IP:3001/asset/{qr_token}` |

Full steps: [DEPLOY.md](DEPLOY.md).

## Split dev (Vite + API)

Only if `SERVE_CLIENT=false`:

```powershell
# Terminal 1
cd server
npm run dev

# Terminal 2
cd client
npm run dev
```

| What | URL |
|------|-----|
| App | `http://YOUR_IP:5173` |
| API | `http://YOUR_IP:3001/api/v1/status` |

## Login note

Same Wi‑Fi only opens the login page. Accounts must exist and be listed in `ALLOWED_LOGIN_EMAILS`.

## Firewall / network

1. Same Wi‑Fi (not guest/isolated)
2. Allow Node / port **3001** (and **5173** if using Vite) on Private networks
3. If IP changes, update `PUBLIC_APP_URL`, `FRONTEND_URL`, `CLIENT_ORIGIN`

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '10.*' -or $_.IPAddress -like '192.168.*' }
```
