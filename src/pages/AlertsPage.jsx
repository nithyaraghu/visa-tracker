// src/pages/AlertsPage.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../auth/supabase.js'
import styles from './AlertsPage.module.css'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

const THRESHOLDS = {
  opt:  [
    { id: 'warn',     days: 60,  label: 'Early warning', desc: '60 days — start active job search', color: '#f59e0b' },
    { id: 'urgent',   days: 80,  label: 'Urgent',        desc: '80 days — secure employment immediately', color: '#f97316' },
    { id: 'critical', days: 88,  label: 'Critical',      desc: '88 days — 2 days from the 90-day limit', color: '#ef4444' },
  ],
  stem: [
    { id: 'warn',     days: 120, label: 'Early warning', desc: '120 days — review employment options', color: '#f59e0b' },
    { id: 'urgent',   days: 140, label: 'Urgent',        desc: '140 days — act immediately', color: '#f97316' },
    { id: 'critical', days: 148, label: 'Critical',      desc: '148 days — 2 days from the 150-day limit', color: '#ef4444' },
  ],
  cpt: [
    { id: 'warn',     days: 14,  label: 'Gap advisory',  desc: '14 days — notify your DSO', color: '#f59e0b' },
    { id: 'urgent',   days: 30,  label: 'Extended gap',  desc: '30 days — DSO notification required', color: '#f97316' },
  ],
}

export default function AlertsPage({ user, visaData }) {
  const [enabled,  setEnabled]  = useState({ warn: true, urgent: true, critical: true })
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState('')

  const email    = user?.email || ''
  const visaType = visaData?.visa_type || 'opt'
  const thresholds = THRESHOLDS[visaType] || THRESHOLDS.opt

  const visaLabels = { opt: 'F-1 OPT', stem: 'F-1 STEM OPT', cpt: 'F-1 CPT' }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError('')

    const selectedLevels = Object.entries(enabled)
      .filter(([, v]) => v)
      .map(([k]) => k)

    try {
      const res = await fetch(`${API_BASE}/api/alerts/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name:         user?.user_metadata?.full_name || '',
          visaType,
          authStart:    visaData?.auth_start    || undefined,
          authEnd:      visaData?.auth_end      || undefined,
          employedSince: visaData?.employment_periods?.find(p => !p.end)?.start || undefined,
          alertLevels:  selectedLevels,
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Registration failed')
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 4000)
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Email Alerts</h1>
        <p className={styles.subtitle}>
          Get notified before you approach your unemployment day limit
        </p>
      </div>

      <div className={styles.layout}>
        {/* Left — main config */}
        <div className={styles.main}>

          {/* Account info — auto-filled */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Your account</div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Email</span>
              <span className={styles.infoValue}>
                {user?.user_metadata?.avatar_url && (
                  <img src={user.user_metadata.avatar_url} className={styles.avatar} alt="" referrerPolicy="no-referrer" />
                )}
                {email}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Visa type</span>
              <span className={styles.infoValue}>
                <span className={styles.visaBadge}>{visaLabels[visaType]}</span>
              </span>
            </div>
            {visaData?.auth_end && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Authorization ends</span>
                <span className={styles.infoValue}>{visaData.auth_end}</span>
              </div>
            )}
            {!visaData?.visa_type && (
              <p className={styles.noData}>
                ⚠ Complete onboarding first to auto-fill your visa details.
              </p>
            )}
          </div>

          {/* Alert thresholds */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Alert thresholds</div>
            <p className={styles.cardSub}>Choose which alerts to receive. Each fires once — no spam.</p>

            <div className={styles.toggleList}>
              {thresholds.map(t => (
                <label
                  key={t.id}
                  className={`${styles.toggleRow} ${enabled[t.id] ? styles.toggleOn : ''}`}
                  style={enabled[t.id] ? { borderColor: `${t.color}40`, background: `${t.color}08` } : {}}
                >
                  <div className={styles.toggleLeft}>
                    <div className={styles.toggleLabel} style={{ color: enabled[t.id] ? t.color : 'var(--text-primary)' }}>
                      {t.label}
                    </div>
                    <div className={styles.toggleDesc}>{t.desc}</div>
                  </div>
                  <div className={styles.toggleRight}>
                    <span className={styles.daysBadge} style={{ color: t.color, background: `${t.color}15` }}>
                      {t.days} days
                    </span>
                    <div
                      className={`${styles.toggle} ${enabled[t.id] ? styles.toggleActive : ''}`}
                      style={enabled[t.id] ? { background: t.color } : {}}
                      onClick={() => setEnabled(e => ({ ...e, [t.id]: !e[t.id] }))}
                    >
                      <div className={styles.toggleThumb} />
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Save button */}
          {error && <div className={styles.error}>{error}</div>}

          {saved && (
            <div className={styles.success}>
              ✓ Alerts registered! You'll receive emails at {email}
            </div>
          )}

          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={saving || !email || Object.values(enabled).every(v => !v)}
          >
            {saving ? 'Saving…' : saved ? '✓ Alerts active' : 'Activate email alerts'}
          </button>
        </div>

        {/* Right — how it works */}
        <div className={styles.sidebar}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>How it works</div>
            <div className={styles.howList}>
              {[
                { icon: '⏰', title: 'Daily check',      desc: 'Backend checks your unemployment days every morning at 8 AM' },
                { icon: '📊', title: 'Threshold match',  desc: `When you cross ${thresholds.map(t => t.days).join(', ')} days, an alert triggers` },
                { icon: '📧', title: 'Email sent',       desc: 'You receive a clear email with your current count and next steps' },
                { icon: '🔕', title: 'No spam',          desc: 'Each threshold fires exactly once — not daily' },
              ].map((h, i) => (
                <div key={i} className={styles.howRow}>
                  <span className={styles.howIcon}>{h.icon}</span>
                  <div>
                    <div className={styles.howTitle}>{h.title}</div>
                    <div className={styles.howDesc}>{h.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.noteCard}>
            <div className={styles.noteTitle}>📋 What you'll receive</div>
            <div className={styles.noteBody}>
              A clear email showing your current unemployment days, days remaining, 
              status level, and recommended actions — sent only when you cross a threshold.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}