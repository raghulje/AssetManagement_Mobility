import { Link } from 'react-router-dom'
import { useState, type FormEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Eye, EyeOff, Lock, User, Zap } from 'lucide-react'
import confetti from 'canvas-confetti'
import './login-suite.css'

type Props = {
  onSubmit: (creds: { email: string; password: string }) => Promise<void>
}

export default function InteractiveLoginPage({ onSubmit: onSubmitProp }: Props) {
  const reduce = useReducedMotion()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [userError, setUserError] = useState(false)
  const [passwordError, setPasswordError] = useState(false)
  const [shake, setShake] = useState(false)

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
      setTimeout(() => setShake(false), 500)
      return
    }
    if (!password || password.length < 6) {
      setPasswordError(true)
      setErrorMsg('Password must be at least 6 characters.')
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmitProp({ email: cleanEmail, password })
      if (!reduce) {
        confetti({
          particleCount: 70,
          spread: 62,
          origin: { y: 0.55, x: 0.5 },
          colors: ['#f4553b', '#ff6b4a', '#F97316', '#3B82F6'],
        })
      }
    } catch (err) {
      setPasswordError(true)
      setErrorMsg(err instanceof Error ? err.message : 'Login failed. Please try again.')
      setShake(true)
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
        <section className="em-auth">
          <motion.div
            className={`em-card${shake ? ' is-shake' : ''}`}
            initial={reduce ? false : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
          >
            <div className="em-card-head">
              <img className="em-card-logo" src="/mobility_logo.png" alt="Refex Mobility" />
              <div>
                <h2>Welcome back!</h2>
                <p>Sign in to your EV fleet workspace.</p>
              </div>
            </div>

            <div className="em-hero-art">
              <img
                src="/test.png"
                alt="Refex Mobility Fleet"
                className="em-hero-art__img"
                draggable={false}
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
                    }}
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
                    }}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="em-eye-btn"
                    onClick={() => setShowPassword((prev) => !prev)}
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
        Refex Mobility · EV Fleet Management
      </footer>
    </div>
  )
}
