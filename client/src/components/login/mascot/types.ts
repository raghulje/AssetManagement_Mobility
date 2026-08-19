/** Semantic mascot contract — UI talks only through these, never animation internals. */
import type { RefObject } from 'react'

export type MascotFocus = 'none' | 'email' | 'password' | 'button'

export type MascotPhase =
  | 'enter'
  | 'idle'
  | 'attentive'
  | 'privacy'
  | 'loading'
  | 'success'
  | 'error'

export type MascotSnapshot = {
  phase: MascotPhase
  focus: MascotFocus
  gazeX: number // -1 … 1
  gazeY: number // -1 … 1
  isTyping: boolean
  showPassword: boolean
  buttonHovered: boolean
  wheelSpeed: number // 0 … 1
  chargeLevel: number // 0 … 1
  scrollNudge: number // -1 … 1 brief
  reducedMotion: boolean
  nearMascot: boolean
}

export type MascotControllerApi = {
  snapshot: MascotSnapshot
  setGazeFromPointer: (clientX: number, clientY: number, rect: DOMRect) => void
  setFocus: (field: MascotFocus) => void
  setTyping: (active: boolean) => void
  setShowPassword: (show: boolean) => void
  setButtonHovered: (hovered: boolean) => void
  setLoading: (active: boolean) => void
  setSuccess: () => void
  setError: () => void
  setIdle: () => void
  nudgeScroll: (direction: 1 | -1) => void
  containerRef: RefObject<HTMLDivElement | null>
}
