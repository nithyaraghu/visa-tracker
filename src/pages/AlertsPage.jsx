import { useState } from 'react'
import { VISA_RULES } from '../utils/visaCalc.js'
import styles from './AlertsPage.module.css'

const THRESHOLD_INFO = {
  opt: [
    { days: 60, level: 'warn',     label: 'Early warning', desc: '60 days — start active job search' },
    { days: 80, level: 'urgent',   label: 'Urgent',        desc: '80 days — secure employment immediately' },
    { days: 88, level: 'critical', label: 'Critical',      desc: '88 days — 2 days from limit' },
  ],
  stem: [
    { days: 120, level: 'warn',    label: 'Early warning', desc: '120 days — start active job search' },
    { days: 140, level: 'urgent',  label: 'Urgent',        desc: '140 days — secure employment immediately' },
    { days: 148, level: 'critical',label: 'Critical',      desc: '148 days — 2 days from limit' },
  ],
  cpt: [
    { days: 14, level: 'warn',     label: 'Advisory',      desc: '14 days — notify your DSO of the gap' },
    { days: 30, level: 'urgent',   label: 'Extended gap',  desc: '30 days — contact DSO immediately' },
    { days: 60, level: 'critical', label: 'Prolonged',     desc: '60 days — risk to CPT authorization' },
  ],
  h1b: [
    { days: 30, level: 'warn',     label: 'Early warning', desc: '30 days — begin new H-1B sponsorship process' },
    { days: 50, level: 'urgent',   label: 'Urgent',        desc: '50 days — 10 days left, act immediately' },
    { days: 58, level: 'critical', label: 'Critical',      desc: '58 days — 2 days from 60-day grace period limit' },
  ],
  j1: [
    { days: 14, level: 'warn',     label: 'Advisory',      desc: '14 days — contact your J-1 sponsor' },
    { days: 30, level: 'urgent',   label: 'Extended gap',  desc: '30 days — sponsor notification required' },
    { days: 45, level: 'critical', label: 'Critical',      desc: '45 days — program status at risk' },
  ]
}

export default function AlertsPage() {
  const [form, setForm] = useState({
    email: '', name: '', visaType: 'opt',
    authStart: '', authEnd: '',
    alertLevels: ['warn', 'urgent', 'critical'],
    employedSince: ''
  })
  const [status, setStatus] = useState(null) // null | 'loading' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  function toggle(level) {
    setForm(f => ({
      ...f,
      alertLevels: f.alertLevels.includes(level)
        ? f.alertLevels.filter(l => l !== level)
        : [...f.alertLevels, level]
    }))
  }

  async function handleSubmit() {
    if (!form.email || !form.visaType) return
    setStatus('loading')
    try {
      const res = await fetch('/api/alerts/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Registration failed')
      setStatus('success')
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  const thresholds = THRESHOLD_INFO[form.visaType] || []

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Email Alerts</h1>
        <p className={styles.subtitle}>Get notified before you approach your unemployment day limit</p>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          {status === 'success' ? (
            <div className={styles.successState}>
              <div className={styles.successIcon}>✓</div>
              <h2>Alerts registered!</h2>
              <p>You'll receive email notifications at {form.email} when you approach your limit.</p>
              <p className={styles.note}>
                The backend cron job checks daily. Make sure the server is running with a valid RESEND_API_KEY.
              </p>
              <button className={styles.resetBtn} onClick={() => setStatus(null)}>Register another</button>
            </div>
          ) : (
            <>
              <div className={styles.section}>
                <label className={styles.label}>Your name</label>
                <input className={styles.input} type="text" placeholder="e.g. Priya Sharma"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>

              <div className={styles.section}>
                <label className={styles.label}>Email address</label>
                <input className={styles.input} type="email" placeholder="your@email.com"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>

              <div className={styles.section}>
                <label className={styles.label}>Visa type</label>
                <select className={styles.select} value={form.visaType}
                  onChange={e => setForm(f => ({ ...f, visaType: e.target.value }))}>
                  {Object.entries(VISA_RULES)
                    .filter(([k]) => ['opt','stem','cpt','h1b','j1'].includes(k))
                    .map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>

              <div className={styles.row2}>
                <div>
                  <label className={styles.label}>Authorization start</label>
                  <input className={styles.input} type="date"
                    value={form.authStart} onChange={e => setForm(f => ({ ...f, authStart: e.target.value }))} />
                </div>
                <div>
                  <label className={styles.label}>Authorization end</label>
                  <input className={styles.input} type="date"
                    value={form.authEnd} onChange={e => setForm(f => ({ ...f, authEnd: e.target.value }))} />
                </div>
              </div>

              <div className={styles.section}>
                <label className={styles.label}>Currently employed since (blank if unemployed)</label>
                <input className={styles.input} type="date"
                  value={form.employedSince} onChange={e => setForm(f => ({ ...f, employedSince: e.target.value }))} />
              </div>

              {thresholds.length > 0 && (
                <div className={styles.section}>
                  <label className={styles.label}>Alert me at these thresholds</label>
                  <div className={styles.thresholds}>
                    {thresholds.map(t => (
                      <label key={t.level} className={`${styles.thresholdItem} ${styles[t.level]}`}>
                        <input type="checkbox"
                          checked={form.alertLevels.includes(t.level)}
                          onChange={() => toggle(t.level)} />
                        <div>
                          <span className={styles.thresholdLabel}>{t.label}</span>
                          <span className={styles.thresholdDesc}>{t.desc}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {status === 'error' && (
                <p className={styles.errorMsg}>⚠ {errorMsg}</p>
              )}

              <button
                className={styles.submitBtn}
                onClick={handleSubmit}
                disabled={status === 'loading' || !form.email}
              >
                {status === 'loading' ? 'Registering…' : 'Register email alerts'}
              </button>
            </>
          )}
        </div>

        {/* How it works */}
        <div className={styles.howItWorks}>
          <h2>How alerts work</h2>
          <div className={styles.steps}>
            {[
              { icon: '📅', title: 'Daily cron job', desc: 'The backend server checks your unemployment days every morning.' },
              { icon: '📊', title: 'Threshold check', desc: 'When your days cross a threshold (e.g. 60 for OPT), an alert is triggered.' },
              { icon: '📧', title: 'Email via Resend', desc: 'You receive a clear email with your current count and recommended actions.' },
              { icon: '🛡', title: 'No duplicates', desc: 'Each threshold fires once. You won\'t be spammed daily.' },
            ].map(s => (
              <div key={s.title} className={styles.step}>
                <span className={styles.stepIcon}>{s.icon}</span>
                <div>
                  <div className={styles.stepTitle}>{s.title}</div>
                  <div className={styles.stepDesc}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.setupNote}>
            <h3>Backend setup required</h3>
            <code>cd backend && npm install</code>
            <code>cp ../.env.example ../.env  # add RESEND_API_KEY</code>
            <code>node server.js</code>
            <p>Get a free Resend API key at <a href="https://resend.com" target="_blank" rel="noreferrer">resend.com</a> — 3,000 emails/month free.</p>
          </div>
        </div>
      </div>
    </div>
  )
}