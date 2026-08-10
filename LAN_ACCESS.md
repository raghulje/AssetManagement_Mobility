# LAN / Wi‑Fi access (phone QR testing)

Your PC Wi‑Fi IP right now: **10.5.7.96**

## Restart both apps

Stop the current `npm run dev` processes, then:

```powershell
# Terminal 1 — API (listens on all interfaces)
cd server
npm run dev

# Terminal 2 — UI (Vite --host)
cd client
npm run dev
```

## Open from another device on the same Wi‑Fi

| What | URL |
|------|-----|
| App (login) | http://10.5.7.96:5173 |
| API health | http://10.5.7.96:3001/api/v1/status |
| Public asset (after Print Label) | http://10.5.7.96:5173/asset/{qr_token} |

## QR labels

`PUBLIC_APP_URL` in `server/.env` is set to `http://10.5.7.96:5173`.  
**Print Label** again so the QR PNG encodes the LAN URL (token stays the same).

## If the phone cannot connect

1. Same Wi‑Fi (not guest/isolated network)
2. Windows Firewall: allow Node.js / ports **5173** and **3001** (Private networks)
3. If your IP changes, update `PUBLIC_APP_URL` and `CLIENT_ORIGIN` in `server/.env`

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '10.*' -or $_.IPAddress -like '192.168.*' }
```
