import { useEffect, useId, useState, type RefObject } from 'react'
import { motion } from 'framer-motion'
import type { MascotSnapshot } from './types'
import './ev-mascot.css'

type Props = {
  snapshot: MascotSnapshot
  containerRef: RefObject<HTMLDivElement | null>
}

/**
 * Illustrated Refex Mobility EV companion (SVG character — not a photo crop).
 * Controller drives states; this adapter only renders.
 */
export default function EVMascot({ snapshot, containerRef }: Props) {
  const uid = useId().replace(/:/g, '')
  const {
    phase,
    gazeX,
    gazeY,
    isTyping,
    showPassword,
    buttonHovered,
    wheelSpeed,
    chargeLevel,
    scrollNudge,
    reducedMotion,
    nearMascot,
    focus,
  } = snapshot

  const privacy = phase === 'privacy' && !showPassword
  const peek = phase === 'privacy' && showPassword
  const [blink, setBlink] = useState(false)

  useEffect(() => {
    if (reducedMotion || privacy || phase === 'loading' || phase === 'success') return
    let cancelled = false
    let t: ReturnType<typeof setTimeout>
    const schedule = () => {
      t = setTimeout(() => {
        if (cancelled) return
        setBlink(true)
        setTimeout(() => {
          if (!cancelled) setBlink(false)
          schedule()
        }, 160)
      }, 8000 + Math.random() * 12000)
    }
    schedule()
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [reducedMotion, privacy, phase])

  const eyeClosed = privacy || blink
  const pupilX = eyeClosed ? 0 : gazeX * 3.2
  const pupilY = eyeClosed ? 0 : gazeY * 2.4
  const headTilt = reducedMotion ? 0 : gazeX * 2.5 + (privacy ? -3 : 0)
  const bodyTilt =
    reducedMotion ? 0
      : phase === 'success' ? -2
      : phase === 'error' ? 1.4
      : buttonHovered ? -1
      : scrollNudge * 2
      + gazeX * 1.1
      + (privacy ? -2.5 : 0)

  const chargeColor =
    phase === 'error' ? '#D97706'
      : phase === 'success' ? '#16A34A'
      : '#E85A2E'

  const dust = !reducedMotion && wheelSpeed > 0.25
  const spinning = !reducedMotion && wheelSpeed > 0
  const wheelDur = wheelSpeed <= 0 ? 1 : Math.max(0.35, 1.9 - wheelSpeed * 1.4)

  const mouthMood =
    phase === 'success' ? 'happy'
      : phase === 'error' ? 'concern'
      : privacy ? 'soft'
      : isTyping || focus === 'email' || nearMascot || buttonHovered ? 'smile'
      : 'idle'

  const status =
    phase === 'enter' ? 'Powering up'
      : phase === 'loading' ? 'Authenticating…'
      : phase === 'success' ? 'All set'
      : phase === 'error' ? 'Try again'
      : phase === 'privacy' ? (showPassword ? 'Peek…' : 'Privacy on')
      : phase === 'attentive' ? (isTyping ? 'Listening…' : 'Attentive')
      : nearMascot ? 'Hi there'
      : 'Ready'

  return (
    <div
      ref={containerRef}
      className={`evm-stage phase-${phase}${nearMascot ? ' is-near' : ''}${buttonHovered ? ' is-ready' : ''}${privacy ? ' is-privacy' : ''}`}
      aria-hidden
    >
      <motion.div
        className="evm-scene"
        initial={reducedMotion ? false : { opacity: 0, y: 14, scale: 0.96 }}
        animate={
          reducedMotion
            ? { opacity: 1, y: 0, scale: 1, rotate: 0 }
            : {
                opacity: 1,
                y: phase === 'loading' ? 0 : [0, -3.5, 0],
                scale: phase === 'enter' ? [0.96, 1.02, 1] : 1,
                rotate: bodyTilt,
              }
        }
        transition={
          reducedMotion
            ? { duration: 0 }
            : phase === 'enter'
              ? { duration: 1.8, ease: [0.22, 1, 0.36, 1] }
              : {
                  y: { duration: 3.8, repeat: Infinity, ease: 'easeInOut' },
                  rotate: { type: 'spring', stiffness: 95, damping: 18 },
                }
        }
      >
        <div className="evm-ground" />
        <div
          className="evm-glow"
          style={{
            opacity: 0.22 + chargeLevel * 0.5,
            background: `radial-gradient(ellipse at center, ${chargeColor}50, transparent 72%)`,
          }}
        />

        <svg
          className="evm-svg"
          viewBox="0 0 360 190"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id={`body-${uid}`} x1="40" y1="40" x2="320" y2="160" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FFFFFF" />
              <stop offset="0.45" stopColor="#F8FAFC" />
              <stop offset="1" stopColor="#E8EEF5" />
            </linearGradient>
            <linearGradient id={`glass-${uid}`} x1="70" y1="48" x2="150" y2="95" gradientUnits="userSpaceOnUse">
              <stop stopColor="#334155" />
              <stop offset="1" stopColor="#0F172A" />
            </linearGradient>
            <linearGradient id={`trim-${uid}`} x1="40" y1="130" x2="320" y2="160" gradientUnits="userSpaceOnUse">
              <stop stopColor="#1E293B" />
              <stop offset="1" stopColor="#0F172A" />
            </linearGradient>
            <radialGradient id={`halo-${uid}`} cx="50%" cy="50%" r="50%">
              <stop stopColor="#0F9D8A" stopOpacity="0.18" />
              <stop offset="1" stopColor="#0F9D8A" stopOpacity="0" />
            </radialGradient>
            <filter id={`soft-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#0F172A" floodOpacity="0.18" />
            </filter>
          </defs>

          {/* Soft eco halo + tiny skyline */}
          <ellipse cx="180" cy="118" rx="118" ry="48" fill={`url(#halo-${uid})`} />
          <g opacity="0.22" fill="#0F766E">
            <path d="M92 118h8v-22h6v-10h8v10h6v14h10v-18l8-10 8 10v18h12v-12h8v20h-74z" />
            <rect x="108" y="88" width="2.5" height="10" rx="1" />
            <path d="M109.2 88l-5 7h10z" />
            <rect x="248" y="96" width="2.5" height="12" rx="1" />
            <path d="M249.2 96l-5 8h10z" />
          </g>

          {/* Charging pillar */}
          <g className="evm-charger" style={{ opacity: 0.55 + chargeLevel * 0.35 }}>
            <rect x="18" y="72" width="28" height="72" rx="6" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.5" />
            <rect x="24" y="80" width="16" height="22" rx="3" fill="#0F172A" />
            <path
              d="M31 86v6h-3l5 8v-6h3l-5-8z"
              fill={chargeColor}
              style={{ filter: `drop-shadow(0 0 ${4 + chargeLevel * 8}px ${chargeColor})` }}
            />
            <rect x="26" y="108" width="12" height="4" rx="1" fill="#E2E8F0" />
            <rect x="26" y="116" width="12" height="4" rx="1" fill="#E2E8F0" />
            <rect x="26" y="124" width="12" height="4" rx="1" fill="#E2E8F0" />
            <text x="32" y="148" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="#E85A2E" fontFamily="system-ui,sans-serif">
              RX
            </text>
            {/* Cable */}
            <path
              d="M46 118 C62 118, 68 108, 78 108"
              stroke="#64748B"
              strokeWidth="2.2"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="78" cy="108" r="3.2" fill="#334155" />
          </g>

          {/* Car group */}
          <g
            className="evm-car-group"
            filter={`url(#soft-${uid})`}
            style={{ transformOrigin: '200px 140px', transform: `rotate(${headTilt * 0.15}deg)` }}
          >
            {/* Shadow under car */}
            <ellipse cx="200" cy="168" rx="108" ry="8" fill="#0F172A" opacity="0.12" />

            {/* Rear spoiler / roof rail hint */}
            <path d="M168 58h92c4 0 7 2 8 5l2 6H170l-2-6c-1-3 0-5 0-5z" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="1" />

            {/* Main body */}
            <path
              d="M86 118
                 C88 98, 98 78, 122 68
                 L168 52
                 C176 48, 188 46, 204 46
                 L268 48
                 C286 50, 302 58, 312 72
                 L328 102
                 C332 110, 334 118, 332 126
                 L328 142
                 C326 150, 318 154, 308 154
                 L118 154
                 C102 154, 90 146, 86 132
                 Z"
              fill={`url(#body-${uid})`}
              stroke="#CBD5E1"
              strokeWidth="1.4"
            />

            {/* Lower cladding */}
            <path
              d="M92 138
                 C96 148, 108 154, 124 154
                 H300
                 C314 154, 326 148, 328 138
                 C320 146, 300 150, 280 150
                 H130
                 C112 150, 98 146, 92 138 Z"
              fill={`url(#trim-${uid})`}
            />

            {/* Wheel arches cutouts (visual rings) */}
            <path d="M108 154c0-22 18-40 40-40s40 18 40 40" fill="none" stroke="#0F172A" strokeWidth="7" opacity="0.85" />
            <path d="M248 154c0-22 18-40 40-40s40 18 40 40" fill="none" stroke="#0F172A" strokeWidth="7" opacity="0.85" />

            {/* Windows / glass cabin */}
            <path
              d="M130 74
                 L168 58
                 L210 56
                 L248 58
                 L268 72
                 L262 96
                 L138 96
                 Z"
              fill={`url(#glass-${uid})`}
              opacity="0.92"
            />
            <path d="M210 56v40" stroke="#94A3B8" strokeWidth="1.2" opacity="0.45" />
            <path d="M168 58l-8 38" stroke="#94A3B8" strokeWidth="1" opacity="0.35" />

            {/* Face on front glass / A-pillar zone (3/4 view faces left-forward) */}
            <g
              className={`evm-face-svg${eyeClosed ? ' is-closed' : ''}${peek ? ' is-peek' : ''}${phase === 'success' ? ' is-happy' : ''}${phase === 'error' ? ' is-concern' : ''}`}
              transform={`translate(${148 + (eyeClosed ? 0 : gazeX * 2)}, ${68 + (eyeClosed ? 0 : gazeY * 1.5)})`}
            >
              {eyeClosed ? (
                <>
                  <path d="M0 10 Q8 6 16 10" stroke="#0F172A" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.7" />
                  <path d="M24 10 Q32 6 40 10" stroke="#0F172A" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.7" />
                </>
              ) : peek ? (
                <>
                  <ellipse cx="8" cy="10" rx="7.5" ry="7" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="1" />
                  <circle cx={8 + pupilX * 0.35} cy={10 + pupilY * 0.35} r="3.2" fill="#0F9D8A" />
                  <circle cx={6.5 + pupilX * 0.35} cy={8.8 + pupilY * 0.35} r="1.1" fill="#FFFFFF" opacity="0.85" />
                  <path d="M24 10 Q32 6 40 10" stroke="#0F172A" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.7" />
                </>
              ) : (
                <>
                  <ellipse cx="8" cy="10" rx={phase === 'success' ? 8.2 : 7.5} ry={phase === 'error' ? 5.5 : 7} fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="1" />
                  <circle cx={8 + pupilX} cy={10 + pupilY} r="3.4" fill="#0F9D8A" />
                  <circle cx={6.4 + pupilX} cy={8.6 + pupilY} r="1.2" fill="#FFFFFF" opacity="0.9" />
                  <ellipse cx="32" cy="10" rx={phase === 'success' ? 8.2 : 7.5} ry={phase === 'error' ? 5.5 : 7} fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="1" />
                  <circle cx={32 + pupilX} cy={10 + pupilY} r="3.4" fill="#0F9D8A" />
                  <circle cx={30.4 + pupilX} cy={8.6 + pupilY} r="1.2" fill="#FFFFFF" opacity="0.9" />
                </>
              )}

              {/* Mouth */}
              {!eyeClosed && (
                mouthMood === 'happy' ? (
                  <path d="M14 22 Q20 28 26 22" stroke="#0F172A" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.75" />
                ) : mouthMood === 'concern' ? (
                  <path d="M14 26 Q20 21 26 26" stroke="#0F172A" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.7" />
                ) : mouthMood === 'smile' ? (
                  <path d="M15 22 Q20 26 25 22" stroke="#0F172A" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.7" />
                ) : mouthMood === 'soft' ? (
                  <path d="M16 23 H24" stroke="#0F172A" strokeWidth="1.4" strokeLinecap="round" opacity="0.45" />
                ) : (
                  <path d="M16 22 Q20 24.5 24 22" stroke="#0F172A" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.55" />
                )
              )}
            </g>

            {/* Privacy shade over glass */}
            {privacy && (
              <path
                d="M130 74 L168 58 L210 56 L248 58 L268 72 L262 96 L138 96 Z"
                fill="#0F172A"
                opacity="0.28"
              />
            )}

            {/* Door line */}
            <path d="M210 96v52" stroke="#94A3B8" strokeWidth="1" opacity="0.4" />
            <path d="M168 96v40" stroke="#94A3B8" strokeWidth="0.8" opacity="0.3" />

            {/* Refex Mobility door branding */}
            <g transform="translate(178, 108)">
              <text fontFamily="system-ui,Segoe UI,sans-serif" fontSize="11" fontWeight="800" letterSpacing="-0.3">
                <tspan fill="#334155">ref</tspan>
                <tspan fill="#E85A2E">ex</tspan>
              </text>
              <text y="11" fontFamily="system-ui,Segoe UI,sans-serif" fontSize="6.5" fontWeight="600" fill="#E85A2E" letterSpacing="0.4">
                Mobility
              </text>
            </g>
            {/* Orange mark on rear door */}
            <rect x="248" y="112" width="16" height="16" rx="3" fill="#E85A2E" />
            <path d="M252 116h8v3h-3v5h-2v-5h-3z" fill="#FFFFFF" opacity="0.95" transform="rotate(45 256 120)" />
            <path
              d="M253.5 117.5 L258.5 122.5 M258.5 117.5 L253.5 122.5"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeLinecap="round"
            />

            {/* Powered by refex (fender) */}
            <text x="118" y="118" fontFamily="system-ui,sans-serif" fontSize="5" fill="#64748B">
              Powered by <tspan fill="#E85A2E" fontWeight="700">refex</tspan>
            </text>

            {/* Headlight strip (front) */}
            <ellipse
              cx="98"
              cy="108"
              rx="10"
              ry="5"
              fill={chargeColor}
              opacity={phase === 'loading' || buttonHovered || phase === 'success' ? 0.95 : 0.4 + chargeLevel * 0.35}
              style={{ filter: `drop-shadow(0 0 ${6 + chargeLevel * 10}px ${chargeColor})` }}
            />
            <ellipse cx="98" cy="108" rx="5" ry="2.5" fill="#FFF7ED" opacity="0.85" />

            {/* Side mirror */}
            <path d="M128 88c-6 0-10 3-10 6h12c2-2 2-6-2-6z" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="1" />

            {/* Door handle */}
            <rect x="198" y="118" width="12" height="3.5" rx="1.5" fill="#CBD5E1" />

            {/* Wheels — position outer, spin inner (keeps translate intact) */}
            <g transform="translate(148, 154)">
              <g
                className={`evm-wheel${spinning ? ' is-spinning' : ''}`}
                style={{ animationDuration: `${wheelDur}s` }}
              >
                <Wheel />
              </g>
            </g>
            <g transform="translate(288, 154)">
              <g
                className={`evm-wheel${spinning ? ' is-spinning' : ''}`}
                style={{ animationDuration: `${wheelDur}s` }}
              >
                <Wheel />
              </g>
            </g>

            {/* Tyre dust / road friction */}
            {dust && (
              <g className="evm-dust-svg">
                <circle className="evm-dust-p" cx="130" cy="160" r="2.2" style={{ animationDelay: '0ms' }} />
                <circle className="evm-dust-p" cx="142" cy="162" r="1.6" style={{ animationDelay: '60ms' }} />
                <circle className="evm-dust-p" cx="270" cy="160" r="2" style={{ animationDelay: '40ms' }} />
                <circle className="evm-dust-p" cx="282" cy="162" r="1.5" style={{ animationDelay: '100ms' }} />
                <circle className="evm-dust-p" cx="155" cy="161" r="1.3" style={{ animationDelay: '80ms' }} />
              </g>
            )}
          </g>

          {/* Tiny battery buddy */}
          <g className="evm-buddy" transform="translate(318, 128)">
            <rect x="0" y="8" width="22" height="26" rx="5" fill="#0F9D8A" />
            <rect x="6" y="3" width="10" height="6" rx="2" fill="#34D399" />
            <circle cx="7" cy="18" r="2.2" fill="#ECFDF5" />
            <circle cx="15" cy="18" r="2.2" fill="#ECFDF5" />
            <circle cx="7" cy="18" r="1" fill="#0F172A" />
            <circle cx="15" cy="18" r="1" fill="#0F172A" />
            <path d="M7 26 Q11 29 15 26" stroke="#ECFDF5" strokeWidth="1.4" fill="none" strokeLinecap="round" />
            <path d="M22 20h8" stroke="#334155" strokeWidth="2" strokeLinecap="round" />
            <rect x="28" y="16" width="8" height="8" rx="1.5" fill="#F97316" />
          </g>
        </svg>

        <div className={`evm-chip evm-chip--${phase}`}>{status}</div>
      </motion.div>
    </div>
  )
}

function Wheel() {
  return (
    <g>
      <circle r="22" fill="#0F172A" />
      <circle r="18" fill="#1E293B" />
      <circle r="12" fill="#334155" />
      <g stroke="#94A3B8" strokeWidth="1.6" strokeLinecap="round">
        <line x1="0" y1="-11" x2="0" y2="11" />
        <line x1="-11" y1="0" x2="11" y2="0" />
        <line x1="-7.8" y1="-7.8" x2="7.8" y2="7.8" />
        <line x1="7.8" y1="-7.8" x2="-7.8" y2="7.8" />
      </g>
      <circle r="5" fill="#64748B" stroke="#E2E8F0" strokeWidth="1.2" />
      <circle r="2" fill="#E85A2E" />
      {/* tyre highlight */}
      <path d="M-16 -8 A18 18 0 0 1 -4 -17" stroke="#475569" strokeWidth="2" fill="none" opacity="0.5" />
    </g>
  )
}
