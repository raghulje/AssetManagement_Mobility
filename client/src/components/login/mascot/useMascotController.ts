import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import type { MascotControllerApi, MascotFocus, MascotPhase, MascotSnapshot } from './types'
import { clamp, distanceToRect, lerp, normalizePointer } from './mascotUtils'

/**
 * Single source of truth for mascot behaviour.
 * Login page only calls these methods — never touches animation internals.
 */
export function useMascotController(): MascotControllerApi {
  const reduce = useReducedMotion() ?? false
  const containerRef = useRef<HTMLDivElement | null>(null)

  const [phase, setPhase] = useState<MascotPhase>('enter')
  const [focus, setFocusState] = useState<MascotFocus>('none')
  const [isTyping, setIsTyping] = useState(false)
  const [showPassword, setShowPasswordState] = useState(false)
  const [buttonHovered, setButtonHovered] = useState(false)
  const [nearMascot, setNearMascot] = useState(false)
  const [scrollNudge, setScrollNudge] = useState(0)

  const targetGaze = useRef({ x: 0, y: 0 })
  const smoothGaze = useRef({ x: 0, y: 0 })
  const [gaze, setGaze] = useState({ x: 0, y: 0 })
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phaseLock = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Page enter → idle
  useEffect(() => {
    if (reduce) {
      setPhase('idle')
      return
    }
    const t = setTimeout(() => setPhase('idle'), 1800)
    return () => clearTimeout(t)
  }, [reduce])

  // Smooth gaze via rAF
  useEffect(() => {
    if (reduce) return
    let raf = 0
    const tick = () => {
      const ease = phase === 'privacy' ? 0.08 : 0.12
      smoothGaze.current = {
        x: lerp(smoothGaze.current.x, targetGaze.current.x, ease),
        y: lerp(smoothGaze.current.y, targetGaze.current.y, ease),
      }
      setGaze({ ...smoothGaze.current })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduce, phase])

  // Global pointer for gaze + proximity
  useEffect(() => {
    if (reduce) return
    const onMove = (e: MouseEvent) => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const n = normalizePointer(e.clientX, e.clientY, rect)
      // Privacy: keep gaze soft / away
      if (phase === 'privacy' && !showPassword) {
        targetGaze.current = { x: clamp(n.x * 0.15, -0.2, 0.2), y: 0.15 }
      } else if (focus === 'email') {
        targetGaze.current = { x: lerp(n.x, 0.15, 0.35), y: lerp(n.y, 0.55, 0.4) }
      } else if (focus === 'button' || buttonHovered) {
        targetGaze.current = { x: lerp(n.x, 0.2, 0.3), y: lerp(n.y, 0.75, 0.35) }
      } else {
        targetGaze.current = n
      }
      setNearMascot(distanceToRect(e.clientX, e.clientY, rect) < 48)
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [reduce, phase, focus, buttonHovered, showPassword])

  // Scroll nudge
  useEffect(() => {
    if (reduce) return
    let clearT: ReturnType<typeof setTimeout> | null = null
    const onScroll = () => {
      const dir = (window.scrollY > (onScroll as unknown as { _y?: number })._y! ? 1 : -1) as 1 | -1
      ;(onScroll as unknown as { _y?: number })._y = window.scrollY
      setScrollNudge(dir)
      if (clearT) clearTimeout(clearT)
      clearT = setTimeout(() => setScrollNudge(0), 420)
    }
    ;(onScroll as unknown as { _y?: number })._y = window.scrollY
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (clearT) clearTimeout(clearT)
    }
  }, [reduce])

  const lockPhase = useCallback((next: MascotPhase, ms: number, after: MascotPhase = 'idle') => {
    if (phaseLock.current) clearTimeout(phaseLock.current)
    setPhase(next)
    phaseLock.current = setTimeout(() => setPhase(after), ms)
  }, [])

  const setFocus = useCallback((field: MascotFocus) => {
    setFocusState(field)
    if (field === 'password') {
      setPhase('privacy')
    } else if (field === 'email' || field === 'button') {
      setPhase((p) => (p === 'loading' || p === 'success' || p === 'error' ? p : 'attentive'))
    } else {
      setPhase((p) => (p === 'privacy' ? 'idle' : p === 'attentive' ? 'idle' : p))
    }
  }, [])

  const setTyping = useCallback((active: boolean) => {
    if (typingTimer.current) clearTimeout(typingTimer.current)
    if (active) {
      setIsTyping(true)
      setPhase((p) => (p === 'privacy' || p === 'loading' || p === 'success' || p === 'error' ? p : 'attentive'))
      typingTimer.current = setTimeout(() => setIsTyping(false), 900)
    }
  }, [])

  const setShowPassword = useCallback((show: boolean) => {
    setShowPasswordState(show)
  }, [])

  const setLoading = useCallback((active: boolean) => {
    if (active) setPhase('loading')
    else setPhase((p) => (p === 'loading' ? 'idle' : p))
  }, [])

  const setSuccess = useCallback(() => {
    lockPhase('success', 1200, 'idle')
  }, [lockPhase])

  const setError = useCallback(() => {
    lockPhase('error', 700, 'attentive')
  }, [lockPhase])

  const setIdle = useCallback(() => {
    setFocusState('none')
    setPhase('idle')
  }, [])

  const setGazeFromPointer = useCallback((clientX: number, clientY: number, rect: DOMRect) => {
    const n = normalizePointer(clientX, clientY, rect)
    targetGaze.current = n
  }, [])

  const nudgeScroll = useCallback((direction: 1 | -1) => {
    setScrollNudge(direction)
    setTimeout(() => setScrollNudge(0), 400)
  }, [])

  const wheelSpeed = useMemo(() => {
    if (reduce) return 0
    if (phase === 'loading') return 0.35
    if (phase === 'success') return 0.85
    if (Math.abs(scrollNudge) > 0) return 0.55
    if (buttonHovered) return 0.2
    if (isTyping) return 0.15
    return 0
  }, [reduce, phase, scrollNudge, buttonHovered, isTyping])

  const chargeLevel = useMemo(() => {
    if (phase === 'success') return 1
    if (phase === 'error') return 0.35
    if (phase === 'loading') return 0.85
    if (isTyping || focus === 'email') return 0.65
    if (phase === 'privacy') return 0.45
    return 0.4
  }, [phase, isTyping, focus])

  const snapshot: MascotSnapshot = {
    phase,
    focus,
    gazeX: reduce ? 0 : gaze.x,
    gazeY: reduce ? 0 : gaze.y,
    isTyping,
    showPassword,
    buttonHovered,
    wheelSpeed,
    chargeLevel,
    scrollNudge,
    reducedMotion: reduce,
    nearMascot,
  }

  return {
    snapshot,
    setGazeFromPointer,
    setFocus,
    setTyping,
    setShowPassword,
    setButtonHovered,
    setLoading,
    setSuccess,
    setError,
    setIdle,
    nudgeScroll,
    containerRef,
  }
}
