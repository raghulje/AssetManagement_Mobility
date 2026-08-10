# Local / LAN access

For **server hosting with a domain**, follow [DEPLOY.md](DEPLOY.md) (Biogas_MIS style: `.env` + `docker-compose` + external `proxy` network).

This page is only for a quick local smoke test on one machine.

## Local single-port test

```powershell
cd client
npm run build

cd ..\server
# In .env: SERVE_CLIENT=true, FRONTEND_URL / PUBLIC_APP_URL / CLIENT_ORIGIN = http://localhost:3001
npm start
```

| What | URL |
|------|-----|
| App | `http://localhost:3001` |
| API health | `http://localhost:3001/api/v1/status` |

## Split dev (Vite + API)

`SERVE_CLIENT=false` in `server/.env`:

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
| App | `http://localhost:5173` |
| API | `http://localhost:3001/api/v1/status` |

Login still requires an App User listed in `ALLOWED_LOGIN_EMAILS`.
