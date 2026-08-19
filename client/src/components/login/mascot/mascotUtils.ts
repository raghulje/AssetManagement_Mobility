/** Gaze / motion helpers — keep physics out of React components */

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

/** Normalize pointer against container → -1…1 */
export function normalizePointer(clientX: number, clientY: number, rect: DOMRect) {
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height * 0.42
  const x = (clientX - cx) / (rect.width * 0.5)
  const y = (clientY - cy) / (rect.height * 0.5)
  return {
    x: clamp(x, -1, 1),
    y: clamp(y, -1, 1),
  }
}

export function distanceToRect(clientX: number, clientY: number, rect: DOMRect) {
  const dx = Math.max(rect.left - clientX, 0, clientX - rect.right)
  const dy = Math.max(rect.top - clientY, 0, clientY - rect.bottom)
  return Math.hypot(dx, dy)
}
