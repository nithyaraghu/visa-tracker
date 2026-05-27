// src/pages/OnboardingPage.jsx
import { useState, useMemo } from 'react'
import { supabase } from '../auth/supabase.js'
import { parseLocalDate, calcUnemployment, diffDays, VISA_RULES } from '../utils/visaCalc.js'
import { calcStemDates, calcOptEnd } from '../utils/stemDates.js'
import styles from './OnboardingPage.module.css'

const VISA_CARDS = [
  {
    id: 'opt',
    label: 'F-1 OPT',
    sublabel: 'Optional Practical Training',
    icon: '🎓',
    rule: '90-day unemployment limit',
    color: '#f97316',
    desc: 'Post-graduation work authorization for F-1 students',
    tracks: 'unemployment'
  },
  {
    id: 'stem',
    label: 'F-1 STEM OPT',
    sublabel: 'STEM OPT Extension',
    icon: '🔬',
    rule: '150-day cumulative limit',
    color: '#3b82f6',
    desc: '24-month extension for STEM degree holders',
    tracks: 'unemployment'
  },
  {
    id: 'cpt',
    label: 'F-1 CPT',
    sublabel: 'Curricular Practical Training',
    icon: '📚',
    rule: 'Eligibility based',
    color: '#22c55e',
    desc: 'Semester-authorized work integrated with curriculum',
    tracks: 'eligibility'
  },
]

let _pid = 0
const newPeriod = () => ({ id: ++_pid, startStr: '', endStr: '' })

function StepIndicator({ current, total }) {
  return (
    <div className={styles.stepIndicator}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`${styles.stepDot} ${i < current ? styles.stepDone : i === current ? styles.stepActive : ''}`} />
      ))}
    </div>
  )
}

// Date helpers for auto-calculation
function addDaysToStr(dateStr, n) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}
function addMonthsToStr(dateStr, n) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + n)
  return d.toISOString().split('T')[0]
}

export default function OnboardingPage({ user, onComplete }) {
  const [step, setStep]           = useState(0)
  const [visaType, setVisaType]   = useState(null)
  const [authStart, setAuthStart] = useState('')
  const [authEnd, setAuthEnd]     = useState('')
  const [periods, setPeriods]     = useState([newPeriod()])
  const [optAuthStart, setOptAuthStart] = useState('')
  const [optAuthEnd, setOptAuthEnd]     = useState('')
  const [optPeriods, setOptPeriods]     = useState([newPeriod()])
  // CPT specific
  const [programStart, setProgramStart] = useState('')
  const [programEnd, setProgramEnd]     = useState('')
  const [enrolledMonths, setEnrolledMonths] = useState('12')
  const [saving, setSaving]           = useState(false)

  const selectedCard = VISA_CARDS.find(c => c.id === visaType)
  const isCPT  = visaType === 'cpt'
  const totalSteps = isCPT ? 3 : (visaType === 'stem' ? 4 : 3)

  // Auto-calculate STEM dates when OPT end date is entered
  function handleOptStartChange(val) {
    setOptAuthStart(val)
    if (val) {
      const optEnd = calcOptEnd(val)
      setOptAuthEnd(optEnd)
      if (visaType === 'stem' && optEnd) {
        const { stemStart, stemEnd } = calcStemDates(optEnd)
        setAuthStart(stemStart)
        setAuthEnd(stemEnd)
      }
    }
  }

  function handleAuthStartChange(val) {
    setAuthStart(val)
    if ((visaType === 'opt' || visaType === 'cpt') && val) {
      setAuthEnd(calcOptEnd(val))
    }
  }

  function handleOptEndChange(val) {
    setOptAuthEnd(val)
    if (visaType === 'stem' && val) {
      const { stemStart, stemEnd } = calcStemDates(val)
      setAuthStart(stemStart)
      setAuthEnd(stemEnd)
    }
  }


  const addPeriod    = () => setPeriods(p => [...p, newPeriod()])
  const removePeriod = id => setPeriods(p => p.filter(x => x.id !== id))
  const updatePeriod = (id, f, v) => setPeriods(p => p.map(x => x.id === id ? { ...x, [f]: v } : x))
  const addOptPeriod    = () => setOptPeriods(p => [...p, newPeriod()])
  const removeOptPeriod = id => setOptPeriods(p => p.filter(x => x.id !== id))
  const updateOptPeriod = (id, f, v) => setOptPeriods(p => p.map(x => x.id === id ? { ...x, [f]: v } : x))

  // Live calculation for unemployment types
  const liveResult = useMemo(() => {
    if (!visaType || isCPT || !authStart) return null
    try {
      return calcUnemployment({
        authStart: parseLocalDate(authStart),
        authEnd:   parseLocalDate(authEnd),
        employmentPeriods: periods.map(p => ({
          start: parseLocalDate(p.startStr),
          end:   parseLocalDate(p.endStr) || null
        })),
        visaType,
        optUnemployedDays: visaType === 'stem'
          ? (() => {
              if (!optAuthStart || !optAuthEnd) return 0
              const today = new Date(); today.setHours(0,0,0,0)
              const s = parseLocalDate(optAuthStart)
              const e = parseLocalDate(optAuthEnd)
              if (!s || !e) return 0
              const calcEnd = e < today ? new Date(e.getTime() + 86400000) : today
              let employed = 0
              for (const p of optPeriods) {
                const ps = parseLocalDate(p.startStr)
                const pe = parseLocalDate(p.endStr) || today
                if (ps) employed += Math.max(0, diffDays(ps < s ? s : ps, pe > calcEnd ? calcEnd : pe))
              }
              return Math.max(0, diffDays(s, calcEnd) - employed)
            })()
          : 0
      })
    } catch { return null }
  }, [visaType, authStart, authEnd, periods, optAuthStart, optAuthEnd, optPeriods])

  // CPT eligibility
  const cptEligible = useMemo(() => {
    if (!isCPT) return null
    const months = parseInt(enrolledMonths) || 0
    return {
      enrollmentOk: months >= 9,
      months,
      programStart,
      programEnd,
    }
  }, [isCPT, enrolledMonths, programStart, programEnd])

  async function handleFinish() {
    setSaving(true)
    const data = {
      user_id:     user.id,
      visa_type:   visaType,
      auth_start:  authStart || null,
      auth_end:    authEnd   || null,
      employment_periods: periods.map(p => ({ start: p.startStr, end: p.endStr })),
      opt_auth_start: optAuthStart || null,
      opt_auth_end:   optAuthEnd   || null,
      opt_periods: optPeriods.map(p => ({ start: p.startStr, end: p.endStr })),
      cpt_program_start: programStart || null,
      cpt_program_end:   programEnd   || null,
      enrolled_months: parseInt(enrolledMonths) || 0,
      onboarded: true,
      updated_at: new Date().toISOString(),
    }

    // Always save to localStorage first — this is the fallback
    localStorage.setItem(`visaguard_onboarded_${user.id}`, 'true')
    localStorage.setItem(`visaguard_data_${user.id}`, JSON.stringify(data))

    // Save to Supabase — wait for valid session first
    try {
      // Refresh session to ensure we have a valid token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        console.error('[onboarding] No valid session:', sessionError?.message)
      } else {

        const { error } = await supabase
          .from('user_visa_data')
          .upsert(
            { ...data, user_id: session.user.id },
            { onConflict: 'user_id', ignoreDuplicates: false }
          )

        if (error) {
          console.error('[onboarding] Supabase error:', error.code, error.message, error.details)
        } else {
        }
      }
    } catch (err) {
      console.error('[onboarding] Save exception:', err.message)
    }

    // Always proceed to dashboard regardless of Supabase success
    setSaving(false)
    onComplete(data)
  }

  const STATUS_COLOR = {
    ok: '#22c55e', warn: '#f59e0b', urgent: '#f59e0b',
    critical: '#ef4444', over: '#ef4444'
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.brand}>⚖ Visa<em>Guard</em></div>
          <StepIndicator current={step} total={totalSteps} />
        </div>

        {/* ── Step 0: Visa selection ── */}
        {step === 0 && (
          <div className={styles.stepContent}>
            <h1 className={styles.stepTitle}>What's your current visa status?</h1>
            <p className={styles.stepSub}>We'll set up your compliance tracker based on your visa type</p>

            <div className={styles.visaGrid}>
              {VISA_CARDS.map(card => (
                <button
                  key={card.id}
                  className={`${styles.visaCard} ${visaType === card.id ? styles.visaCardSelected : ''}`}
                  style={visaType === card.id ? { borderColor: card.color, background: `${card.color}12` } : {}}
                  onClick={() => setVisaType(card.id)}
                >
                  <span className={styles.visaIcon}>{card.icon}</span>
                  <div className={styles.visaCardBody}>
                    <div className={styles.visaCardLabel}>{card.label}</div>
                    <div className={styles.visaCardSublabel}>{card.sublabel}</div>
                    <div className={styles.visaCardDesc}>{card.desc}</div>
                  </div>
                  <span className={styles.visaRule} style={{ color: card.color, background: `${card.color}18` }}>
                    {card.rule}
                  </span>
                </button>
              ))}
            </div>

            <button
              className={styles.nextBtn}
              disabled={!visaType}
              onClick={() => setStep(1)}
            >
              Continue →
            </button>
          </div>
        )}

        {/* ── Step 2: Authorization dates ── */}
        {step === 1 && !isCPT && (
          <div className={styles.stepContent}>
            <div className={styles.stepBadge} style={{ color: selectedCard?.color, background: `${selectedCard?.color}18` }}>
              {selectedCard?.icon} {selectedCard?.label}
            </div>
            <h1 className={styles.stepTitle}>
              {visaType === 'stem' ? 'Your STEM OPT authorization dates' : 'Your authorization dates'}
            </h1>
            <p className={styles.stepSub}>Found on your EAD card or I-797 approval notice</p>

            {/* OPT carry-over for STEM */}
            {visaType === 'stem' && (
              <div className={styles.optBlock}>
                <div className={styles.optBlockTitle}>📋 Initial OPT period (for carry-over calculation)</div>
                <p className={styles.fieldHint}>Your STEM 150-day limit includes unemployment days from initial OPT</p>
                <div className={styles.row2}>
                  <div className={styles.field}>
                    <label className={styles.label}>OPT start date</label>
                    <input type="date" className={styles.input} value={optAuthStart} onChange={e => handleOptStartChange(e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>OPT end date</label>
                    <input type="date" className={styles.input} value={optAuthEnd} onChange={e => handleOptEndChange(e.target.value)} />
                  </div>
                </div>
                <div className={styles.sectionHead}>
                  <label className={styles.label}>OPT employment periods</label>
                  <button className={styles.addBtn} onClick={addOptPeriod}>+ Add</button>
                </div>
                {optPeriods.map(p => (
                  <div key={p.id} className={styles.periodRow}>
                    <div className={styles.field}>
                      <label className={styles.label}>Start</label>
                      <input type="date" className={styles.input} value={p.startStr} onChange={e => updateOptPeriod(p.id, 'startStr', e.target.value)} />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>End</label>
                      <input type="date" className={styles.input} value={p.endStr} onChange={e => updateOptPeriod(p.id, 'endStr', e.target.value)} />
                    </div>
                    {optPeriods.length > 1 && <button className={styles.delBtn} onClick={() => removeOptPeriod(p.id)}>×</button>}
                  </div>
                ))}
              </div>
            )}

            <div className={styles.row2}>
              <div className={styles.field}>
                <label className={styles.label}>
                  {visaType === 'stem' ? 'STEM OPT start' : 'OPT start date'}
                </label>
                <input type="date" className={styles.input} value={authStart} onChange={e => handleAuthStartChange(e.target.value)} />
                {visaType === 'stem' && authStart && (
                  <p className={styles.fieldHint} style={{color:'var(--success)'}}>✓ Auto-calculated from OPT end date</p>
                )}
              </div>
              <div className={styles.field}>
                <label className={styles.label}>
                  {visaType === 'stem' ? 'STEM OPT end' : 'OPT end date (EAD expiry)'}
                </label>
                <input type="date" className={styles.input} value={authEnd} onChange={e => setAuthEnd(e.target.value)} />
                {visaType === 'stem' && authEnd && (
                  <p className={styles.fieldHint} style={{color:'var(--success)'}}>✓ Auto-calculated (24 months from start)</p>
                )}
              </div>
            </div>

            <div className={styles.navRow}>
              <button className={styles.backBtn} onClick={() => setStep(0)}>← Back</button>
              <button className={styles.nextBtn} disabled={!authStart} onClick={() => setStep(2)}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 1 CPT: Program details ── */}
        {step === 1 && isCPT && (
          <div className={styles.stepContent}>
            <div className={styles.stepBadge} style={{ color: '#22c55e', background: '#22c55e18' }}>
              📚 F-1 CPT
            </div>
            <h1 className={styles.stepTitle}>Your CPT program details</h1>
            <p className={styles.stepSub}>CPT eligibility is based on enrollment duration and program fit, not unemployment days</p>

            <div className={styles.row2}>
              <div className={styles.field}>
                <label className={styles.label}>Program start date</label>
                <input type="date" className={styles.input} value={programStart} onChange={e => setProgramStart(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Program end date</label>
                <input type="date" className={styles.input} value={programEnd} onChange={e => setProgramEnd(e.target.value)} />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Full-time enrollment duration (months)</label>
              <input type="number" min="0" max="120" className={styles.input}
                value={enrolledMonths} onChange={e => setEnrolledMonths(e.target.value)} />
              <p className={styles.fieldHint}>Must be at least 9 months to qualify for CPT</p>
            </div>

            <div className={styles.navRow}>
              <button className={styles.backBtn} onClick={() => setStep(0)}>← Back</button>
              <button className={styles.nextBtn} onClick={() => setStep(2)}>Continue →</button>
            </div>
          </div>
        )}

        {/* ── Step 2: Employment history (non-CPT) ── */}
        {step === 2 && !isCPT && (
          <div className={styles.stepContent}>
            <div className={styles.stepBadge} style={{ color: selectedCard?.color, background: `${selectedCard?.color}18` }}>
              {selectedCard?.icon} {selectedCard?.label}
            </div>
            <h1 className={styles.stepTitle}>
              {visaType === 'stem' ? 'Your STEM OPT employment' : 'Your employment history'}
            </h1>
            <p className={styles.stepSub}>
              {visaType === 'stem'
                ? 'Add jobs during your STEM OPT period only — your OPT unemployment days are already carried over from the previous step'
                : "Add jobs during your authorization period — we'll calculate gaps automatically"}
            </p>

            {visaType === 'stem' && (
              <div style={{
                background: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.25)',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: '0.82rem',
                color: '#60a5fa',
              }}>
                {'📋 OPT carry-over already included. Enter only jobs from '}
                <strong>{authStart || 'your STEM OPT start date'}</strong>
                {' onwards'}
              </div>
            )}

            <div className={styles.sectionHead}>
              <label className={styles.label}>
                {visaType === 'stem' ? 'STEM OPT employment periods' : 'Employment periods'}
              </label>
              <button className={styles.addBtn} onClick={addPeriod}>+ Add period</button>
            </div>
            {periods.map(p => (
              <div key={p.id} className={styles.periodRow}>
                <div className={styles.field}>
                  <label className={styles.label}>Start date</label>
                  <input type="date" className={styles.input} value={p.startStr} onChange={e => updatePeriod(p.id, 'startStr', e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>End (blank = current)</label>
                  <input type="date" className={styles.input} value={p.endStr} onChange={e => updatePeriod(p.id, 'endStr', e.target.value)} />
                </div>
                {periods.length > 1 && <button className={styles.delBtn} onClick={() => removePeriod(p.id)}>×</button>}
              </div>
            ))}

            {/* Live compliance preview */}
            {liveResult && (
              <div className={styles.livePreview}>
                <div className={styles.previewTitle}>📊 Live compliance preview</div>
                <div className={styles.previewMetrics}>
                  <div className={styles.previewMetric}>
                    <span className={styles.previewLabel}>Unemployed days</span>
                    <span className={styles.previewVal} style={{ color: STATUS_COLOR[liveResult.status] }}>
                      {liveResult.countable ?? liveResult.unemployedDays}
                    </span>
                  </div>
                  {liveResult.limit && (
                    <div className={styles.previewMetric}>
                      <span className={styles.previewLabel}>Days remaining</span>
                      <span className={styles.previewVal} style={{ color: STATUS_COLOR[liveResult.status] }}>
                        {Math.max(0, liveResult.limit - (liveResult.countable ?? liveResult.unemployedDays))}
                      </span>
                    </div>
                  )}
                  <div className={styles.previewMetric}>
                    <span className={styles.previewLabel}>Status</span>
                    <span className={styles.previewVal} style={{ color: STATUS_COLOR[liveResult.status], textTransform: 'capitalize' }}>
                      {liveResult.status === 'ok' ? '✓ Good' : liveResult.status}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className={styles.navRow}>
              <button className={styles.backBtn} onClick={() => setStep(1)}>← Back</button>
              <button className={styles.nextBtn} onClick={() => setStep(3)}>Review & finish →</button>
            </div>
          </div>
        )}

        {/* ── Step 2 CPT: Eligibility result ── */}
        {step === 2 && isCPT && (
          <div className={styles.stepContent}>
            <div className={styles.stepBadge} style={{ color: '#22c55e', background: '#22c55e18' }}>
              📚 F-1 CPT Eligibility
            </div>
            <h1 className={styles.stepTitle}>Your CPT eligibility</h1>

            {cptEligible && (
              <div className={styles.eligibilityChecks}>
                <div className={`${styles.check} ${cptEligible.enrollmentOk ? styles.checkOk : styles.checkFail}`}>
                  <span>{cptEligible.enrollmentOk ? '✓' : '✗'}</span>
                  <div>
                    <div className={styles.checkLabel}>Full-time enrollment ≥ 9 months</div>
                    <div className={styles.checkNote}>You entered {cptEligible.months} months</div>
                  </div>
                </div>
                <div className={`${styles.check} ${styles.checkOk}`}>
                  <span>✓</span>
                  <div>
                    <div className={styles.checkLabel}>Work must be integral to curriculum</div>
                    <div className={styles.checkNote}>Verify with your DSO</div>
                  </div>
                </div>
                <div className={`${styles.check} ${styles.checkOk}`}>
                  <span>✓</span>
                  <div>
                    <div className={styles.checkLabel}>DSO authorization required each semester</div>
                    <div className={styles.checkNote}>CPT is authorized on your I-20</div>
                  </div>
                </div>
                <div className={`${styles.check} ${styles.checkOk}`}>
                  <span>⚠</span>
                  <div>
                    <div className={styles.checkLabel}>12+ months full-time CPT = OPT ineligible</div>
                    <div className={styles.checkNote}>Track your CPT duration carefully</div>
                  </div>
                </div>
              </div>
            )}

            <div className={styles.navRow}>
              <button className={styles.backBtn} onClick={() => setStep(1)}>← Back</button>
              <button className={styles.nextBtn} onClick={handleFinish} disabled={saving}>
                {saving ? 'Setting up…' : 'Go to dashboard →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Review & finish ── */}
        {step === 3 && !isCPT && (
          <div className={styles.stepContent}>
            <h1 className={styles.stepTitle}>You're all set! 🎉</h1>
            <p className={styles.stepSub}>Here's your compliance summary</p>

            {liveResult && (
              <div className={styles.summaryCard}>
                <div className={styles.summaryRow}>
                  <span>Visa type</span>
                  <strong>{selectedCard?.label}</strong>
                </div>
                <div className={styles.summaryRow}>
                  <span>Authorization</span>
                  <strong>{authStart} → {authEnd || 'ongoing'}</strong>
                </div>
                <div className={styles.summaryRow}>
                  <span>Unemployment days</span>
                  <strong style={{ color: STATUS_COLOR[liveResult.status] }}>
                    {liveResult.countable ?? liveResult.unemployedDays}
                    {liveResult.limit ? ` / ${liveResult.limit}` : ''}
                  </strong>
                </div>
                <div className={styles.summaryRow}>
                  <span>Compliance status</span>
                  <strong style={{ color: STATUS_COLOR[liveResult.status], textTransform: 'capitalize' }}>
                    {liveResult.status === 'ok' ? '✓ Within limits' : liveResult.status}
                  </strong>
                </div>
              </div>
            )}

            <button className={styles.finishBtn} onClick={handleFinish} disabled={saving}>
              {saving ? 'Setting up your dashboard…' : 'Go to my dashboard →'}
            </button>

            <p className={styles.fieldHint} style={{ textAlign: 'center' }}>
              You can update all these details anytime from the Status Tracker
            </p>
          </div>
        )}
      </div>
    </div>
  )
}