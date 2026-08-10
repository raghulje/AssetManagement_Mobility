import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight, BarChart3, Boxes, CheckCircle2, ClipboardCheck,
  Eye, EyeOff, LayoutDashboard, Lock, Monitor, Package,
  Rocket, ShieldCheck, Sparkles, User, Zap,
} from 'lucide-react'
import confetti from 'canvas-confetti'
import AnimatedCharacters, { type MascotMood } from './animated-characters/AnimatedCharacters'
import './login-suite.css'

type Props = {
  onSubmit: (creds: { email: string; password: string }) => Promise<void>
}

function useCountUp(target: number, duration = 1200, suffix = '') {
  const [value, setValue] = useState(0)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce) {
      setValue(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - t) ** 3
      setValue(Math.round(target * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, reduce])
  return `${value.toLocaleString()}${suffix}`
}

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
  }),
}

export default function InteractiveLoginPage({ onSubmit: onSubmitProp }: Props) {
  const reduce = useReducedMotion()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [isPasswordFocused, setIsPasswordFocused] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [userError, setUserError] = useState(false)
  const [passwordError, setPasswordError] = useState(false)
  const [shake, setShake] = useState(false)
  const [mascotMood, setMascotMood] = useState<MascotMood>('idle')

  const assets = useCountUp(1200, 1400)
  const deployed = useCountUp(640, 1300)
  const audited = useCountUp(98, 1500, '%')
  const due = useCountUp(120, 1200)

  const mood: MascotMood = useMemo(() => {
    if (mascotMood === 'success' || mascotMood === 'fail') return mascotMood
    if (isPasswordFocused) return 'password'
    if (isTyping) return 'typing'
    return 'idle'
  }, [mascotMood, isPasswordFocused, isTyping])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setUserError(false)
    setPasswordError(false)
    setErrorMsg('')
    setMascotMood('idle')

    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !cleanEmail.includes('@') || cleanEmail.length < 5) {
      setUserError(true)
      setErrorMsg('Please enter a valid email address.')
      setShake(true)
      setMascotMood('fail')
      setTimeout(() => setShake(false), 500)
      return
    }
    if (!password || password.length < 6) {
      setPasswordError(true)
      setErrorMsg('Password must be at least 6 characters.')
      setShake(true)
      setMascotMood('fail')
      setTimeout(() => setShake(false), 500)
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmitProp({ email: cleanEmail, password })
      setMascotMood('success')
      if (!reduce) {
        confetti({
          particleCount: 70,
          spread: 62,
          origin: { y: 0.55, x: 0.72 },
          colors: ['#0F9D8A', '#34D399', '#3B82F6', '#F97316'],
        })
      }
    } catch (err) {
      setPasswordError(true)
      setErrorMsg(err instanceof Error ? err.message : 'Login failed. Please try again.')
      setShake(true)
      setMascotMood('fail')
      setTimeout(() => setShake(false), 520)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="em-page">
      <div className="em-bg" aria-hidden>
        <span className="em-orb em-orb--a" />
        <span className="em-orb em-orb--b" />
        <span className="em-orb em-orb--c" />
        <span className="em-grid" />
      </div>

      <div className="em-shell">
        {/* LEFT — marketing */}
        <section className="em-hero">
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show" className="em-badge">
            <Sparkles size={14} />
            IT ASSET MANAGEMENT
          </motion.div>

          <motion.h1 custom={1} variants={fadeUp} initial="hidden" animate="show" className="em-title">
            Smarter Assets.<br />
            <span>Stronger Business.</span>
          </motion.h1>

          <motion.p custom={2} variants={fadeUp} initial="hidden" animate="show" className="em-lead">
            Track, manage and optimize your IT assets across the organization with complete visibility and control.
          </motion.p>

          <motion.div custom={3} variants={fadeUp} initial="hidden" animate="show" className="em-features">
            {[
              { icon: Boxes, title: 'Track', desc: 'Tags, serials & custody', color: 'green' },
              { icon: Package, title: 'Assign', desc: 'Employees & locations', color: 'violet' },
              { icon: ClipboardCheck, title: 'Audit', desc: 'Due lists & reports', color: 'blue' },
              { icon: Rocket, title: 'Assign', desc: 'Ready-to-assign assets', color: 'teal' },
            ].map((f) => (
              <article key={f.title} className={`em-feature em-feature--${f.color}`}>
                <div className="em-feature-icon"><f.icon size={18} strokeWidth={2.2} /></div>
                <strong>{f.title}</strong>
                <span>{f.desc}</span>
              </article>
            ))}
          </motion.div>

          <motion.div custom={4} variants={fadeUp} initial="hidden" animate="show" className="em-preview">
            <aside className="em-preview-side">
              <button type="button" className="is-active" aria-label="Dashboard"><LayoutDashboard size={16} /></button>
              <button type="button" aria-label="Hardware"><Monitor size={16} /></button>
              <button type="button" aria-label="Inventory"><Package size={16} /></button>
              <button type="button" aria-label="Reports"><BarChart3 size={16} /></button>
              <button type="button" aria-label="Security"><ShieldCheck size={16} /></button>
            </aside>

            <div className="em-preview-main">
              <div className="em-stats">
                {[
                  { label: 'Total Assets', value: assets, tone: 'teal' },
                  { label: 'Assigned', value: deployed, tone: 'blue' },
                  { label: 'Audited', value: audited, tone: 'green' },
                  { label: 'Due for Audit', value: due, tone: 'orange' },
                ].map((s) => (
                  <div key={s.label} className={`em-stat em-stat--${s.tone}`}>
                    <span>{s.label}</span>
                    <em>{s.value}</em>
                    <svg className="em-spark" viewBox="0 0 80 24" preserveAspectRatio="none" aria-hidden>
                      <path d="M0 18 C12 16, 18 8, 28 12 S48 22, 60 10 S72 4, 80 8" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  </div>
                ))}
              </div>

              <div className="em-preview-grid">
                <div className="em-panel">
                  <header>Asset Overview</header>
                  <div className="em-donut-wrap">
                    <div className="em-donut" aria-hidden />
                    <ul className="em-legend">
                      <li><i className="t" /> Hardware</li>
                      <li><i className="b" /> Licenses</li>
                      <li><i className="o" /> Accessories</li>
                      <li><i className="g" /> Other</li>
                    </ul>
                  </div>
                </div>
                <div className="em-panel">
                  <header>Recent Activity</header>
                  <ul className="em-timeline">
                    <li>Asset assigned to employee</li>
                    <li>Audit completed</li>
                    <li>Accessory returned to stock</li>
                    <li>License Pack assigned</li>
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.ul custom={5} variants={fadeUp} initial="hidden" animate="show" className="em-trust">
            <li><CheckCircle2 size={15} /> Secure by Design</li>
            <li><CheckCircle2 size={15} /> Role Based Access</li>
            <li><CheckCircle2 size={15} /> Real-time Insights</li>
            <li><CheckCircle2 size={15} /> Enterprise Ready</li>
          </motion.ul>

          <motion.div
            className="em-bot"
            aria-hidden
            animate={reduce ? undefined : { y: [0, -6, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="em-bot-body">
              <div className="em-bot-eye" />
              <div className="em-bot-eye" />
              <div className="em-bot-mouth" />
            </div>
            <div className="em-bot-arm" />
          </motion.div>
        </section>

        {/* RIGHT — auth */}
        <section className="em-auth">
          <motion.div
            className={`em-card${shake ? ' is-shake' : ''}`}
            initial={reduce ? false : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
          >
            <div className="em-card-head">
              <img src="/refex-mark.svg" alt="" className="em-mark" />
              <div>
                <h2>Welcome back!</h2>
                <p>Sign in to your asset workspace.</p>
              </div>
            </div>

            <div className="em-mascots">
              <AnimatedCharacters
                isTyping={isTyping}
                isPasswordFocused={isPasswordFocused}
                showPassword={showPassword}
                passwordLength={password.length}
                emailLength={email.length}
                isExcited={isSubmitting || mascotMood === 'success'}
                mood={mood}
              />
            </div>

            <form onSubmit={onSubmit} noValidate>
              <div className={`em-field${userError ? ' is-error' : ''}`}>
                <label htmlFor="login-email">Email</label>
                <div className="em-field-box">
                  <User size={17} strokeWidth={2} />
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (userError) setUserError(false)
                      if (errorMsg) setErrorMsg('')
                      if (mascotMood === 'fail') setMascotMood('idle')
                    }}
                    onFocus={() => setIsTyping(true)}
                    onBlur={() => setIsTyping(false)}
                    placeholder="name@refex.co.in"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className={`em-field${passwordError ? ' is-error' : ''}`}>
                <label htmlFor="login-password">Password</label>
                <div className="em-field-box">
                  <Lock size={17} strokeWidth={2} />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (passwordError) setPasswordError(false)
                      if (errorMsg) setErrorMsg('')
                      if (mascotMood === 'fail') setMascotMood('idle')
                    }}
                    onFocus={() => setIsPasswordFocused(true)}
                    onBlur={() => setIsPasswordFocused(false)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="em-eye-btn"
                    onClick={() => setShowPassword((p) => !p)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <div className="em-row">
                <label className="em-remember">
                  <input type="checkbox" defaultChecked />
                  <span>Remember me</span>
                </label>
                <Link to="/forgot-password" className="em-forgot">Forgot password?</Link>
              </div>

              {errorMsg ? <div className="em-error" role="alert">{errorMsg}</div> : null}

              <button type="submit" className="em-submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <span className="em-spinner" aria-hidden />
                ) : (
                  <>
                    Sign in
                    <ArrowRight size={18} />
                  </>
                )}
              </button>

              <div className="em-or"><span>or continue with</span></div>

              <div className="em-sso">
                <button type="button" className="em-sso-btn" onClick={() => undefined}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 001 12c0 1.94.46 3.77 1.18 5.07l3.66-2.84v-.14z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Google SSO
                </button>
              </div>
            </form>
          </motion.div>
        </section>
      </div>

      <footer className="em-foot">
        <Zap size={12} />
        Refex · Enterprise IT Asset Management
      </footer>
    </div>
  )
}
