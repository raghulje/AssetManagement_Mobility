import { Link } from 'react-router-dom'
import { useEffect, useState, type FormEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight, BarChart3, CheckCircle2,
  Eye, EyeOff, LayoutDashboard, Lock, Monitor, Package,
  Rocket, ShieldCheck, Sparkles, User, Zap,
} from 'lucide-react'
import confetti from 'canvas-confetti'
import { EVMascot, useMascotController } from './mascot'
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
  const mascot = useMascotController()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [userError, setUserError] = useState(false)
  const [passwordError, setPasswordError] = useState(false)
  const [shake, setShake] = useState(false)

  const assets = useCountUp(1569, 1400)
  const deployed = useCountUp(1499, 1300)
  const inStock = useCountUp(5, 1200)
  const licenses = useCountUp(70, 1350)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setUserError(false)
    setPasswordError(false)
    setErrorMsg('')

    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !cleanEmail.includes('@') || cleanEmail.length < 5) {
      setUserError(true)
      setErrorMsg('Please enter a valid email address.')
      setShake(true)
      mascot.setFocus('email')
      mascot.setError()
      setTimeout(() => setShake(false), 500)
      return
    }
    if (!password || password.length < 6) {
      setPasswordError(true)
      setErrorMsg('Password must be at least 6 characters.')
      setShake(true)
      mascot.setFocus('password')
      mascot.setError()
      setTimeout(() => setShake(false), 500)
      return
    }

    setIsSubmitting(true)
    mascot.setLoading(true)
    try {
      await onSubmitProp({ email: cleanEmail, password })
      mascot.setSuccess()
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
      mascot.setError()
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
        <section className="em-hero">
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show" className="em-badge">
            <Sparkles size={14} />
            REFEX MOBILITY
          </motion.div>

          <motion.h1 custom={1} variants={fadeUp} initial="hidden" animate="show" className="em-title">
            Smarter Fleet.<br />
            <span>Cleaner Mobility.</span>
          </motion.h1>

          <motion.p custom={2} variants={fadeUp} initial="hidden" animate="show" className="em-lead">
            Track, assign, capture and maintain your Refex EV fleet with complete visibility across cities.
          </motion.p>

          <motion.div custom={3} variants={fadeUp} initial="hidden" animate="show" className="em-features">
            {[
              { icon: Zap, title: 'Track', desc: 'Plates, models & cities', color: 'green' },
              { icon: Package, title: 'Assign', desc: 'Drivers & custodians', color: 'violet' },
              { icon: Rocket, title: 'Capture', desc: 'Geo-stamped photos', color: 'blue' },
              { icon: ShieldCheck, title: 'Maintain', desc: 'Repairs & parts log', color: 'teal' },
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
              <button type="button" className="is-active" aria-label="Fleet"><LayoutDashboard size={16} /></button>
              <button type="button" aria-label="Vehicles"><Monitor size={16} /></button>
              <button type="button" aria-label="Captures"><Package size={16} /></button>
              <button type="button" aria-label="Reports"><BarChart3 size={16} /></button>
              <button type="button" aria-label="Safety"><ShieldCheck size={16} /></button>
            </aside>

            <div className="em-preview-main">
              <div className="em-stats">
                {[
                  { label: 'Fleet vehicles', value: assets, tone: 'teal' },
                  { label: 'EV units', value: deployed, tone: 'blue' },
                  { label: 'Cities', value: inStock, tone: 'green' },
                  { label: 'CNG / Petrol', value: licenses, tone: 'orange' },
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
                  <header>Fleet overview</header>
                  <div className="em-donut-wrap">
                    <div className="em-donut" aria-hidden />
                    <ul className="em-legend">
                      <li><i className="t" /> Tigor</li>
                      <li><i className="b" /> Citroën</li>
                      <li><i className="o" /> XUV 400</li>
                      <li><i className="g" /> Nexon</li>
                    </ul>
                  </div>
                </div>
                <div className="em-panel">
                  <header>Recent activity</header>
                  <ul className="em-timeline">
                    <li>Vehicle assigned in Chennai</li>
                    <li>Geo photo capture saved</li>
                    <li>Part replacement logged</li>
                    <li>QR label generated</li>
                    <li>EOL reminder queued</li>
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
        </section>

        <section className="em-auth">
          <motion.div
            className={`em-card${shake ? ' is-shake' : ''}`}
            initial={reduce ? false : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
          >
            <div className="em-card-head">
              <img className="em-card-logo" src="/refexone-logo.png" alt="RefexOne" />
              <div>
                <h2>Welcome back!</h2>
                <p>Sign in to your EV asset workspace.</p>
              </div>
            </div>

            <div className="em-mascots">
              <EVMascot snapshot={mascot.snapshot} containerRef={mascot.containerRef} />
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
                      mascot.setTyping(true)
                      if (userError) setUserError(false)
                      if (errorMsg) setErrorMsg('')
                    }}
                    onFocus={() => {
                      mascot.setFocus('email')
                      mascot.setTyping(true)
                    }}
                    onBlur={() => mascot.setFocus('none')}
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
                      mascot.setTyping(true)
                      if (passwordError) setPasswordError(false)
                      if (errorMsg) setErrorMsg('')
                    }}
                    onFocus={() => mascot.setFocus('password')}
                    onBlur={() => mascot.setFocus('none')}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="em-eye-btn"
                    onClick={() => {
                      const next = !showPassword
                      setShowPassword(next)
                      mascot.setShowPassword(next)
                    }}
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

              <button
                type="submit"
                className="em-submit"
                disabled={isSubmitting}
                onMouseEnter={() => {
                  mascot.setButtonHovered(true)
                  mascot.setFocus('button')
                }}
                onMouseLeave={() => {
                  mascot.setButtonHovered(false)
                  mascot.setFocus('none')
                }}
              >
                {isSubmitting ? (
                  <span className="em-spinner" aria-hidden />
                ) : (
                  <>
                    Sign in
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </section>
      </div>

      <footer className="em-foot">
        <Zap size={12} />
        Refex Mobility · EV Asset Management
      </footer>
    </div>
  )
}
