import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

type EyeProps = {
  mouseX: number
  mouseY: number
  size?: number
  pupil?: number
  max?: number
  blink?: boolean
  closed?: boolean
  forceX?: number
  forceY?: number
  sad?: boolean
  color?: string
}

/** Large green kawaii eye — white sclera + green pupil that tracks cursor */
function Eye({
  mouseX, mouseY, size = 22, pupil = 9, max = 4.2,
  blink, closed, forceX, forceY, sad, color = '#16A34A',
}: EyeProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!ref.current || closed || sad || blink) return
    if (forceX !== undefined && forceY !== undefined) {
      setPos({ x: forceX, y: forceY })
      return
    }
    const r = ref.current.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const dx = mouseX - cx
    const dy = mouseY - cy
    const dist = Math.min(Math.hypot(dx, dy), max)
    const a = Math.atan2(dy, dx)
    setPos({ x: Math.cos(a) * dist, y: Math.sin(a) * dist })
  }, [mouseX, mouseY, forceX, forceY, max, closed, sad, blink])

  if (closed || blink) {
    return <div className="km-eye km-eye--closed km-eye--green" style={{ width: size }} />
  }

  return (
    <div
      ref={ref}
      className={`km-eye km-eye--green${sad ? ' km-eye--sad' : ''}`}
      style={{ width: size, height: size }}
    >
      <i
        style={{
          width: pupil,
          height: pupil,
          background: color,
          boxShadow: `inset -2px -2px 0 rgba(0,0,0,0.12), 0 0 0 2px ${color}33`,
          transform: `translate(${pos.x}px, ${pos.y}px)`,
        }}
      />
    </div>
  )
}

function Mouth({ mood }: { mood: 'o' | 'smile' | 'flat' | 'sad' | 'happy' }) {
  return <div className={`km-mouth km-mouth--${mood}`} />
}

function SmokePuff({ delay, side }: { delay: number; side: 'front' | 'rear' }) {
  return (
    <span
      className={`km-smoke km-smoke--${side}`}
      style={{ animationDelay: `${delay}ms` }}
      aria-hidden
    />
  )
}

/** White Refex Mobility hatchback EV — charger left, battery buddy right */
function EvHeroScene({
  spinFast,
  smoking,
  covering,
}: {
  spinFast: boolean
  smoking: boolean
  covering: boolean
}) {
  return (
    <div className={`km-hero${spinFast ? ' is-spin-fast' : ''}${smoking ? ' is-smoking' : ''}${covering ? ' is-covering' : ''}`}>
      {/* Eco glow + city silhouette */}
      <div className="km-hero-glow" aria-hidden>
        <svg className="km-skyline" viewBox="0 0 280 80" preserveAspectRatio="xMidYMax meet">
          <path
            d="M0 78 L18 78 L18 52 L28 52 L28 38 L40 38 L40 58 L52 58 L52 30 L68 18 L84 30 L84 50 L100 50 L100 42 L112 42 L112 60 L128 60 L128 36 L140 24 L152 36 L152 55 L170 55 L170 40 L186 40 L186 62 L204 62 L204 28 L220 28 L220 48 L238 48 L238 35 L252 35 L252 58 L280 58 L280 78 Z"
            fill="rgba(15,118,110,0.14)"
          />
          <g fill="rgba(15,118,110,0.22)">
            <rect x="48" y="8" width="3" height="14" rx="1" />
            <path d="M49.5 8 L42 18 L57 18 Z" />
            <rect x="210" y="6" width="3" height="16" rx="1" />
            <path d="M211.5 6 L204 17 L219 17 Z" />
          </g>
        </svg>
      </div>

      {/* Charger */}
      <div className="km-charger" aria-hidden>
        <svg viewBox="0 0 56 120" className="km-charger-art">
          <rect x="14" y="8" width="28" height="88" rx="8" fill="#0F766E" />
          <rect x="18" y="14" width="20" height="28" rx="4" fill="#ECFDF5" />
          <rect x="22" y="20" width="12" height="3" rx="1.5" fill="#14B8A6" />
          <rect x="22" y="27" width="8" height="3" rx="1.5" fill="#5EEAD4" />
          <circle cx="28" cy="52" r="7" fill="#34D399" />
          <path d="M26 48 L31 52 L27 52 L30 56 L25 52 L29 52 Z" fill="#fff" />
          <path d="M28 72 C40 78, 46 90, 44 104" fill="none" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />
          <rect x="40" y="102" width="10" height="6" rx="2" fill="#64748B" />
          <rect x="10" y="96" width="36" height="10" rx="3" fill="#134E4A" />
        </svg>
      </div>

      {/* Car */}
      <div className="km-car-wrap">
        <svg className="km-car-art" viewBox="0 0 280 150" aria-hidden>
          <defs>
            <linearGradient id="kmBody" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#E2E8F0" />
            </linearGradient>
            <linearGradient id="kmGlass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#BAE6FD" />
              <stop offset="100%" stopColor="#7DD3FC" />
            </linearGradient>
            <filter id="kmCarSoft" x="-15%" y="-15%" width="130%" height="140%">
              <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#0f172a" floodOpacity="0.16" />
            </filter>
          </defs>

          {/* Ground shadow */}
          <ellipse cx="140" cy="138" rx="96" ry="8" fill="rgba(15,23,42,0.12)" />

          <g filter="url(#kmCarSoft)">
            {/* Body */}
            <path
              d="M34 98 C42 72, 70 52, 118 46 C160 42, 198 48, 228 68 C242 78, 250 90, 254 102 L258 112 C258 120, 250 126, 242 126 L46 126 C36 126, 30 120, 30 112 Z"
              fill="url(#kmBody)"
              stroke="#CBD5E1"
              strokeWidth="1.5"
            />
            {/* Roof / windshield glass area (face sits here) */}
            <path
              d="M78 74 C100 52, 150 48, 188 58 C200 62, 208 70, 214 80 L92 86 C86 84, 80 80, 78 74 Z"
              fill="url(#kmGlass)"
              opacity="0.95"
            />
            {/* Side window */}
            <path d="M150 78 L198 74 L208 90 L156 92 Z" fill="#E0F2FE" opacity="0.85" />
            {/* Bumper smile area */}
            <path d="M48 112 C70 118, 110 120, 140 118" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
            {/* Door line + branding */}
            <path d="M148 86 L148 118" stroke="#CBD5E1" strokeWidth="1.5" />
            <text x="108" y="108" fontSize="9" fontWeight="700" fill="#0F766E" letterSpacing="0.5">refex</text>
            <text x="138" y="108" fontSize="7" fontWeight="700" fill="#14B8A6" letterSpacing="1">MOBILITY</text>
            {/* Headlight */}
            <ellipse cx="52" cy="100" rx="8" ry="5" fill="#FEF08A" stroke="#F59E0B" strokeWidth="1" />
            {/* EV badge */}
            <rect x="218" y="96" width="22" height="10" rx="3" fill="#ECFDF5" stroke="#14B8A6" strokeWidth="1" />
            <text x="222" y="104" fontSize="7" fontWeight="800" fill="#0F766E">EV</text>
          </g>

          {/* Wheels — spin via CSS on .km-wheel */}
          <g className="km-wheel km-wheel--rear" style={{ transformOrigin: '86px 126px' }}>
            <circle cx="86" cy="126" r="18" fill="#0F172A" />
            <circle cx="86" cy="126" r="11" fill="#334155" />
            <circle cx="86" cy="126" r="4" fill="#94A3B8" />
            <path d="M86 115 L86 137 M75 126 L97 126" stroke="#64748B" strokeWidth="2" />
          </g>
          <g className="km-wheel km-wheel--front" style={{ transformOrigin: '214px 126px' }}>
            <circle cx="214" cy="126" r="18" fill="#0F172A" />
            <circle cx="214" cy="126" r="11" fill="#334155" />
            <circle cx="214" cy="126" r="4" fill="#94A3B8" />
            <path d="M214 115 L214 137 M203 126 L225 126" stroke="#64748B" strokeWidth="2" />
          </g>
        </svg>

        {/* Tire friction smog */}
        <div className="km-smoke-layer" aria-hidden>
          <SmokePuff delay={0} side="rear" />
          <SmokePuff delay={180} side="rear" />
          <SmokePuff delay={360} side="rear" />
          <SmokePuff delay={90} side="front" />
          <SmokePuff delay={270} side="front" />
          <SmokePuff delay={450} side="front" />
        </div>
      </div>

      {/* Battery buddy */}
      <div className="km-battery" aria-hidden>
        <svg viewBox="0 0 64 90" className="km-battery-art">
          <rect x="14" y="18" width="36" height="56" rx="10" fill="#22C55E" />
          <rect x="20" y="10" width="24" height="10" rx="3" fill="#16A34A" />
          <circle cx="26" cy="38" r="3.5" fill="#052e16" />
          <circle cx="38" cy="38" r="3.5" fill="#052e16" />
          <path d="M26 50 Q32 56 38 50" fill="none" stroke="#052e16" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M50 48 C58 52, 60 62, 56 70" fill="none" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />
          <rect x="52" y="68" width="10" height="6" rx="2" fill="#64748B" />
        </svg>
      </div>
    </div>
  )
}

export type MascotMood = 'idle' | 'typing' | 'password' | 'success' | 'fail'

type Props = {
  isTyping?: boolean
  isPasswordFocused?: boolean
  showPassword?: boolean
  passwordLength?: number
  emailLength?: number
  isExcited?: boolean
  mood?: MascotMood
}

/**
 * Interactive Refex Mobility EV mascot:
 * cursor-tracking eyes, eyes close on password, spinning wheels + tire smog.
 */
export default function AnimatedCharacters({
  isTyping = false,
  isPasswordFocused = false,
  showPassword = false,
  passwordLength = 0,
  emailLength = 0,
  isExcited = false,
  mood = 'idle',
}: Props) {
  const reduce = useReducedMotion()
  const [mouseX, setMouseX] = useState(0)
  const [mouseY, setMouseY] = useState(0)
  const [blink, setBlink] = useState(false)

  const covering = (isPasswordFocused && !showPassword) || mood === 'password'
  const watching = isTyping || emailLength > 0 || mood === 'typing'
  const sad = mood === 'fail'
  const happy = mood === 'success' || isExcited
  const spinFast = isTyping || isExcited || passwordLength > 0 || watching
  const smoking = !reduce && (spinFast || isExcited)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setMouseX(e.clientX)
      setMouseY(e.clientY)
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  useEffect(() => {
    if (reduce || covering) return
    let timeout: ReturnType<typeof setTimeout>
    const run = () => {
      timeout = setTimeout(() => {
        setBlink(true)
        setTimeout(() => {
          setBlink(false)
          run()
        }, 130)
      }, Math.random() * 2600 + 1600)
    }
    run()
    return () => clearTimeout(timeout)
  }, [reduce, covering])

  const mouth: 'o' | 'smile' | 'flat' | 'sad' | 'happy' = sad
    ? 'sad'
    : happy
      ? 'happy'
      : covering
        ? 'flat'
        : watching
          ? 'o'
          : 'smile'

  const forceX = watching && !covering
    ? Math.min(3.8, Math.max(-1.2, emailLength * 0.32))
    : undefined
  const forceY = watching && !covering ? 2.6 : undefined

  return (
    <div className={`km-stage km-stage--ev${sad ? ' is-sad' : ''}${happy ? ' is-happy' : ''}`}>
      <motion.div
        className="km-hero-motion"
        initial={reduce ? false : { opacity: 0, y: 16, scale: 0.94 }}
        animate={{
          opacity: 1,
          y: reduce ? 0 : happy ? -4 : 0,
          scale: 1,
        }}
        transition={{ type: 'spring', stiffness: 240, damping: 18 }}
      >
        <EvHeroScene spinFast={spinFast && !covering} smoking={smoking && !covering} covering={covering} />

        <div className="km-face km-face--windshield">
          <div className="km-eyes" style={{ gap: 14 }}>
            <Eye
              mouseX={mouseX}
              mouseY={mouseY}
              size={24}
              pupil={10}
              max={4.5}
              blink={blink && !covering}
              closed={covering}
              sad={sad}
              forceX={forceX}
              forceY={forceY}
              color="#16A34A"
            />
            <Eye
              mouseX={mouseX}
              mouseY={mouseY}
              size={24}
              pupil={10}
              max={4.5}
              blink={blink && !covering}
              closed={covering}
              sad={sad}
              forceX={forceX}
              forceY={forceY}
              color="#16A34A"
            />
          </div>
          <Mouth mood={mouth} />
        </div>
      </motion.div>
    </div>
  )
}
