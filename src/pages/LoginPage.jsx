// src/pages/LoginPage.jsx
import { useState } from 'react'
import { supabase } from '../auth/supabase'
import styles from './LoginPage.module.css'

export default function LoginPage() {
  const [mode,     setMode]     = useState('login')   // 'login' | 'signup' | 'otp'
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [otp,      setOtp]      = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [message,  setMessage]  = useState('')

  // ── Google OAuth ──────────────────────────────────────────────
  async function handleGoogle() {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { access_type: 'offline', prompt: 'consent' }
      }
    })
    if (error) { setError(error.message); setLoading(false) }
  }

  // ── Email signup ──────────────────────────────────────────────
  async function handleSignup() {
    if (!email || !password) return setError('Please enter email and password')
    if (password.length < 6) return setError('Password must be at least 6 characters')
    setLoading(true); setError('')

    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin }
    })
    if (error) { setError(error.message) }
    else {
      setMessage('Check your email for a confirmation link!')
      setMode('login')
    }
    setLoading(false)
  }

  // ── Email login ───────────────────────────────────────────────
  async function handleLogin() {
    if (!email || !password) return setError('Please enter email and password')
    setLoading(true); setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.message.includes('Email not confirmed')) {
        setError('Please confirm your email first. Check your inbox.')
      } else {
        setError(error.message)
      }
    }
    setLoading(false)
  }

  // ── OTP (magic link) ──────────────────────────────────────────
  async function handleSendOTP() {
    if (!email) return setError('Please enter your email')
    setLoading(true); setError('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: undefined,  // disable magic link redirect
      }
    })
    if (error) { setError(error.message) }
    else {
      setMessage(`OTP sent to ${email}`)
      setMode('otp')
    }
    setLoading(false)
  }

  async function handleVerifyOTP() {
    if (!otp) return setError('Please enter the OTP from your email')
    setLoading(true); setError('')

    const { error } = await supabase.auth.verifyOtp({
      email, token: otp, type: 'email'
    })
    if (error) setError(error.message)
    setLoading(false)
  }

  function handleKey(e, action) {
    if (e.key === 'Enter') action()
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {/* Brand */}
        <div className={styles.brand}>
          <span className={styles.brandIcon}>⚖</span>
          <span className={styles.brandName}>Visa<em>Guard</em></span>
        </div>

        <h1 className={styles.title}>
          {mode === 'signup' ? 'Create account'
           : mode === 'otp'  ? 'Enter your OTP'
           : 'Welcome back'}
        </h1>
        <p className={styles.sub}>
          {mode === 'signup' ? 'Track your visa compliance status'
           : mode === 'otp'  ? `We sent a 6-digit code to ${email}`
           : 'Sign in to your VisaGuard account'}
        </p>

        {error   && <div className={styles.error}>{error}</div>}
        {message && <div className={styles.success}>{message}</div>}

        {/* OTP entry */}
        {mode === 'otp' ? (
          <>
            <div className={styles.field}>
              <label className={styles.label}>6-digit OTP code</label>
              <input
                className={styles.input}
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                onKeyDown={e => handleKey(e, handleVerifyOTP)}
                autoFocus
              />
            </div>
            <button className={styles.primaryBtn} onClick={handleVerifyOTP} disabled={loading}>
              {loading ? 'Verifying…' : 'Verify OTP'}
            </button>
            <button className={styles.linkBtn} onClick={() => { setMode('login'); setOtp(''); setError('') }}>
              ← Back to login
            </button>
          </>
        ) : (
          <>
            {/* Google button */}
            <button className={styles.googleBtn} onClick={handleGoogle} disabled={loading}>
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
              </svg>
              Continue with Google
            </button>

            <div className={styles.divider}><span>or</span></div>

            {/* Email field */}
            <div className={styles.field}>
              <label className={styles.label}>Email address</label>
              <input
                className={styles.input}
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => handleKey(e, mode === 'signup' ? handleSignup : handleLogin)}
              />
            </div>

            {/* Password field */}
            <div className={styles.field}>
              <label className={styles.label}>Password</label>
              <input
                className={styles.input}
                type="password"
                placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => handleKey(e, mode === 'signup' ? handleSignup : handleLogin)}
              />
            </div>

            {/* Primary action */}
            <button
              className={styles.primaryBtn}
              onClick={mode === 'signup' ? handleSignup : handleLogin}
              disabled={loading}
            >
              {loading ? 'Please wait…'
               : mode === 'signup' ? 'Create account'
               : 'Sign in'}
            </button>

            {/* OTP alternative */}
            <button className={styles.otpBtn} onClick={handleSendOTP} disabled={loading}>
              📧 Sign in with email OTP instead
            </button>

            {/* Toggle mode */}
            <p className={styles.toggle}>
              {mode === 'signup' ? (
                <>Already have an account?{' '}
                  <button className={styles.linkBtn} onClick={() => { setMode('login'); setError('') }}>Sign in</button>
                </>
              ) : (
                <>Don't have an account?{' '}
                  <button className={styles.linkBtn} onClick={() => { setMode('signup'); setError('') }}>Sign up</button>
                </>
              )}
            </p>
          </>
        )}

        <p className={styles.disclaimer}>
          For informational purposes only. Always consult your DSO or immigration attorney.
        </p>
      </div>
    </div>
  )
}