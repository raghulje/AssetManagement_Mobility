# Refex Mobility — Asset Management

Fleet and vehicle asset management platform for **Refex Mobility**. Staff manage the vehicle registry, GPS-stamped photo captures, driver assignments, and HRMS-linked employees. Field teams register vehicles through a public capture form without logging in.

**Production:** [mobility.refexone.com](https://mobility.refexone.com)  
**Repository:** [github.com/raghulje/AssetManagement_Mobility](https://github.com/raghulje/AssetManagement_Mobility)

---

## Scope

### In scope (this application)

| Area | Description |
|------|-------------|
| **Fleet registry** | Vehicle master data, lifecycle status, assignments, documents, QR codes |
| **Photo captures** | In-app GPS-stamped photos; categorized uploads from the public form |
| **Public capture form** (`/capture`) | Mobile-friendly registration: vehicle number, employee ID, min. 4 vehicle photos, odometer photo, 3 chassis photos |
| **Form review** | Verify / deregister public submissions; registration audit logs |
| **People** | Employees (Adrenalin HRMS sync), app users, drivers |
| **Access control** | Role-based permissions, optional SAML SSO (RefexOne) |
| **Notifications** | Email alerts for form registration and configurable workflow recipients |
| **Reporting & audit** | Fleet KPIs, CSV export, action logs |

### Public routes (no login)

| Route | Purpose |
|-------|---------|
| `/capture` | Field vehicle photo registration form |
| `/vehicle/:token` | Public vehicle view via QR token |
| `/login` | Staff sign-in (password or SSO) |

### Out of scope / notes

- Walkaround video capture is **disabled** on the public form (mobile browser limitations).
- Legacy IT asset / hardware inventory code may exist in the repo; the deployed Mobility UI focuses on **vehicles, drivers, employees, and settings**.

---

## Tech stack

| Layer | Stack |
|-------|--------|
| **Frontend** | React 19, TypeScript, Vite, React Router |
| **Backend** | Node.js, Express 5, TypeScript |
| **Database** | MySQL 8 (`utf8mb4`) |
| **Auth** | JWT, bcrypt, optional SAML 2.0 |
| **Storage** | Local filesystem under `server/storage/` |
| **Integrations** | Adrenalin HRMS, SMTP (Zoho), optional Google Maps APIs |

---

## Project structure

```
Mobility_Asset_Management/
├── client/                 # React SPA (Vite)
│   ├── src/
│   │   ├── pages/vehicles/ # Fleet UI + public capture form
│   │   ├── components/     # Capture frames, webcam, form tabs
│   │   └── api/            # API client
│   └── public/             # Static assets (logos, favicon)
├── server/
│   ├── src/
│   │   ├── routes/         # REST API (vehicles, public form, auth, …)
│   │   ├── services/       # Uploads, mail, HRMS sync, migrations
│   │   └── db/mysql/       # Numbered SQL migrations (001–038+)
│   └── storage/            # Uploaded captures & attachments (gitignored)
└── README.md
```

---

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **MySQL** 8.x
- **npm** 9+

---

## Quick start (local development)

### 1. Database

Create a MySQL database (default name: `ITAssetManagement_2026`).

### 2. Server

```bash
cd server
cp .env.example .env
# Edit .env — DB credentials, JWT_SECRET, ports

npm install
npm run migrate    # Apply schema migrations
npm run seed       # Demo admin user (if seed is configured)
npm run dev        # API on http://localhost:3001 (or PORT from .env)
```

### 3. Client

In a second terminal:

```bash
cd client
npm install
npm run dev        # UI on http://localhost:5173
```

Vite proxies API requests to the backend. Sign in with your seeded admin credentials (see `server/src/db/seed.ts`).

---

## Production deployment

Typical single-port setup (API serves the built SPA):

```bash
cd client && npm ci && npm run build    # Output → client/out/
cd ../server && npm ci
# Set SERVE_CLIENT=true in server/.env
npm run start
```

Important environment variables (`server/.env.example`):

| Variable | Purpose |
|----------|---------|
| `PORT` / `HOST` | Listen address |
| `SERVE_CLIENT` | `true` to serve `client/out` from Express |
| `PUBLIC_APP_URL` | Public URL (e.g. `https://mobility.refexone.com`) |
| `DB_*` | MySQL connection |
| `JWT_SECRET` | Auth signing key |
| `SAML_*` | Optional RefexOne SSO |
| `ADRENALIN_*` | Optional HRMS employee sync |
| `SMTP_*` | Email delivery |

After deploy, open **Settings → General** in the admin UI and run any **pending schema migrations** (especially `038_capture_kind` for categorized form photos).

---

## Key features

### Vehicle record — Photo captures

- Tabs: **Vehicle photos**, **Odometer images**, **Chassis Images**
- Click/tap any photo for **full-screen preview**
- **Form registration** block for `/capture` submissions with Verify / Deregister actions
- In-app **Take photo** with GPS stamping

### Public capture form (`/capture`)

Required uploads per submission:

- Minimum **4** vehicle photos (GPS-stamped)
- **1** odometer photo
- **3** chassis photos

Employee ID is validated against HRMS-linked employees. One registration per vehicle (re-submit blocked until deregistered).

### Fleet dashboard

- Vehicle list with filters, pending-verify workflow, **CSV export**
- Vehicle detail: overview, photos, attachments, maintenance, registration logs
- EOL / warranty tracking and scheduled email digests

---

## Database migrations

Migrations live in `server/src/db/mysql/` and are tracked in `schema_migrations`.

| Migration | Purpose |
|-----------|---------|
| `030_vehicles_and_captures` | Core vehicle & capture tables |
| `035_public_capture_form` | Public form session metadata |
| `037_capture_session_verification` | Verify / audit fields |
| `038_capture_kind` | `capture_kind` on captures (vehicle / odometer / chassis) |

Run migrations:

```bash
cd server
npm run migrate
```

Or use **Settings → General → Run pending migrations** in the admin UI.

---

## API overview

Base path: `/api/v1`

| Endpoint group | Examples |
|----------------|----------|
| Auth | `POST /login`, SAML ACS, password reset |
| Vehicles | `GET /vehicles`, captures, verify session, deregister |
| Public | `POST /public/capture-form`, vehicle lookup |
| People | Employees, users, drivers |
| Admin | Settings, schema migration status, notifications |

Health check: `GET /api/v1/status`

---

## Scripts

| Command | Location | Description |
|---------|----------|-------------|
| `npm run dev` | `client/` / `server/` | Development servers |
| `npm run build` | `client/` | Production SPA build |
| `npm run migrate` | `server/` | Apply DB migrations |
| `npm run seed` | `server/` | Seed demo data |
| `npm run start` | `server/` | Production API (+ SPA if `SERVE_CLIENT=true`) |

---

## Security

- Do **not** commit `server/.env` or real credentials.
- Uploaded files are stored outside the web root and served via authenticated routes.
- Public capture form is rate-limited and validates employee/vehicle data server-side.
- Use HTTPS in production (`PUBLIC_APP_URL`, reverse proxy TLS termination).

---

## License

Proprietary — Refex Mobility / internal use. Contact the project owner for redistribution terms.
