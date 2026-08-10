# Refex Backend (MySQL)

Node.js / Express / TypeScript API for Refex IT Asset Management, backed by **MySQL** (`ITAssetManagement_2026`).

## Database

International-ready InnoDB schema (`utf8mb4_unicode_ci`):

- Organization: companies, locations, departments, users, permission groups
- Inventory: assets, licenses + seats, accessories, consumables, components, kits
- Master data: models, categories, status labels, manufacturers, suppliers, depreciations, custom fields
- Custody: checkout requests, acceptances, accessory/component assignments
- Audit: `action_logs` (with IP, user-agent, request_id, JSON meta), `login_attempts`
- Config: settings, imports, schema_migrations

Schema file: `src/db/mysql/001_schema.sql`

### Configure

Copy `.env.example` → `.env` (already set for local):

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=ITAssetManagement_2026
DB_USER=raghul
DB_PASSWORD=********
```

### Migrate + seed

```bash
cd react/server
npm install
npm run migrate   # create all tables
npm run seed      # demo data (admin / password)
npm run dev       # API on :3001
```

## Auth

```bash
curl -X POST http://localhost:3001/api/v1/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"password\"}"
```

Use the returned JWT as `Authorization: Bearer <token>`.

## Notes

- Storage lives under `server/storage/`
- Do not commit credentials
- Re-run migrate after schema pulls; seed is idempotent
