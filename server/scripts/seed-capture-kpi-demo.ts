import dotenv from 'dotenv'
dotenv.config()

import { all, get, run, now } from '../src/db/index.js'

/**
 * Local demo data only: mark a few vehicles as photos-submitted (pending review)
 * and a few as verified so KPI cards can be eyeballed.
 */
async function main() {
  const vehicles = await all<{ id: number; vehicle_number: string }>(`
    SELECT id, vehicle_number FROM vehicles
    WHERE deleted_at IS NULL
    ORDER BY id ASC
    LIMIT 12
  `)
  if (vehicles.length < 6) {
    throw new Error(`Need at least 6 vehicles; found ${vehicles.length}`)
  }

  const pending = vehicles.slice(0, 3) // Photos submitted · pending review
  const verified = vehicles.slice(3, 6) // Photos submitted · verified
  const ts = now()

  const results: Array<Record<string, unknown>> = []

  for (const v of pending) {
    // Clear prior public_form sessions for clean demo
    const old = await all<{ id: number }>(`
      SELECT id FROM vehicle_capture_sessions
      WHERE vehicle_id = ? AND source = 'public_form'
    `, [v.id])
    for (const s of old) {
      await run(`UPDATE vehicle_captures SET session_id = NULL WHERE session_id = ?`, [s.id])
      await run(`DELETE FROM vehicle_capture_sessions WHERE id = ?`, [s.id])
    }

    const session = await run(`
      INSERT INTO vehicle_capture_sessions (
        vehicle_id, captured_by, notes,
        submitter_name, submitter_email, submitter_phone, source,
        verified_at, verified_by, verified_summary, verification_log,
        created_at, updated_at
      ) VALUES (?, NULL, 'Demo pending review',
        'Demo Submitter', 'demo.pending@refex.co.in', '9999999999', 'public_form',
        NULL, NULL, NULL, NULL, ?, ?)
    `, [v.id, ts, ts])
    const sessionId = Number(session.insertId)

    // Placeholder capture row (no real file) so Photos tab isn't empty conceptually
    await run(`
      INSERT INTO vehicle_captures (
        vehicle_id, session_id, captured_by, storage_path, original_name, mime_type, file_size,
        captured_at, latitude, longitude, address, created_at, updated_at
      ) VALUES (?, ?, NULL, 'public/vehicles/demo-placeholder.jpg', 'demo-pending.jpg', 'image/jpeg', 0,
        ?, NULL, NULL, 'Demo seed', ?, ?)
    `, [v.id, sessionId, ts, ts, ts])

    results.push({ vehicle: v.vehicle_number, status: 'pending_review', session_id: sessionId })
  }

  for (const v of verified) {
    const old = await all<{ id: number }>(`
      SELECT id FROM vehicle_capture_sessions
      WHERE vehicle_id = ? AND source = 'public_form'
    `, [v.id])
    for (const s of old) {
      await run(`UPDATE vehicle_captures SET session_id = NULL WHERE session_id = ?`, [s.id])
      await run(`DELETE FROM vehicle_capture_sessions WHERE id = ?`, [s.id])
    }

    const log = JSON.stringify([{
      action: 'verified',
      verified_at: ts,
      verified_by: 1,
      verified_by_name: 'Demo Verifier',
      summary: 'Demo verification for KPI card check',
    }])

    const session = await run(`
      INSERT INTO vehicle_capture_sessions (
        vehicle_id, captured_by, notes,
        submitter_name, submitter_email, submitter_phone, source,
        verified_at, verified_by, verified_summary, verification_log,
        created_at, updated_at
      ) VALUES (?, NULL, 'Demo verified registration',
        'Demo Submitter', 'demo.verified@refex.co.in', '8888888888', 'public_form',
        ?, 1, 'Demo verification for KPI card check', ?, ?, ?)
    `, [v.id, ts, log, ts, ts])
    const sessionId = Number(session.insertId)

    await run(`
      INSERT INTO vehicle_captures (
        vehicle_id, session_id, captured_by, storage_path, original_name, mime_type, file_size,
        captured_at, latitude, longitude, address, created_at, updated_at
      ) VALUES (?, ?, NULL, 'public/vehicles/demo-placeholder.jpg', 'demo-verified.jpg', 'image/jpeg', 0,
        ?, NULL, NULL, 'Demo seed', ?, ?)
    `, [v.id, sessionId, ts, ts, ts])

    results.push({ vehicle: v.vehicle_number, status: 'verified', session_id: sessionId })
  }

  const stats = await get<{
    photos_submitted: number
    pending_review: number
    fleet: number
  }>(`
    SELECT
      (SELECT COUNT(*) FROM vehicles v WHERE v.deleted_at IS NULL) AS fleet,
      (SELECT COUNT(DISTINCT v.id) FROM vehicles v
        INNER JOIN vehicle_capture_sessions s ON s.vehicle_id = v.id AND s.source = 'public_form'
        WHERE v.deleted_at IS NULL) AS photos_submitted,
      (SELECT COUNT(DISTINCT v.id) FROM vehicles v
        INNER JOIN vehicle_capture_sessions s ON s.vehicle_id = v.id AND s.source = 'public_form' AND s.verified_at IS NULL
        WHERE v.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM vehicle_capture_sessions s2
            WHERE s2.vehicle_id = v.id AND s2.source = 'public_form' AND s2.verified_at IS NOT NULL
          )) AS pending_review
  `)

  const fleet = Number(stats?.fleet || 0)
  const photos = Number(stats?.photos_submitted || 0)
  const pendingReview = Number(stats?.pending_review || 0)

  console.log(JSON.stringify({
    seeded: results,
    cards: {
      photos_submitted: photos,
      capture_pending: Math.max(0, fleet - photos),
      pending_review: pendingReview,
    },
  }, null, 2))
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e)
  process.exit(1)
})
