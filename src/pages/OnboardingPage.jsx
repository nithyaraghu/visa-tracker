// src/pages/OnboardingPage.jsx
// Combined F-1 OPT + STEM OPT flow — single timeline
import { useState, useMemo } from 'react'
import { supabase } from '../auth/supabase.js'
import { parseLocalDate, calcUnemployment } from '../utils/visaCalc.js'
import styles from './OnboardingPage.module.css'

// ── Date helpers (timezone-safe) ─────────────────────────────────
function parseDate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function fmt(str) {
  if (!str) return '—'
  const d = parseDate(str)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function toStr(d) {
  if (!d) return ''
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function addD(str, n)  {
  if (!str) return ''
  const [y,m,d] = str.split('-').map(Number)
  return toStr(new Date(y, m-1, d+n))
}
function addM(str, n)  {
  if (!str) return ''
  const [y,m,d] = str.split('-').map(Number)
  return toStr(new Date(y, m-1+n, d))
}
function isAfter(a, b)  { return a && b && parseDate(a) > parseDate(b) }
function isBefore(a, b) { return a && b && parseDate(a) < parseDate(b) }
function daysLeft(str)  {
  if (!str) return null
  const today = new Date(); today.setHours(0,0,0,0)
  return Math.round((parseDate(str) - today) / 86400000)
}

// ── Status cards ─────────────────────────────────────────────────
const STATUS_CARDS = [
  {
    id: 'pre_opt',
    icon: '🎓',
    label: 'Approaching graduation',
    sublabel: "Haven't applied for OPT yet",
    desc: 'I want to track my OPT application deadline and plan my authorization period.',
    color: '#f97316',
  },
  {
    id: 'on_opt',
    icon: '📋',
    label: 'Currently on OPT',
    sublabel: 'F-1 Optional Practical Training',
    desc: 'I have my EAD card and am tracking my 90-day unemployment limit.',
    color: '#3b82f6',
  },
  {
    id: 'on_stem',
    icon: '🔬',
    label: 'Currently on STEM OPT',
    sublabel: 'F-1 STEM OPT Extension',
    desc: 'I completed OPT and am now on my 24-month STEM extension tracking 150-day limit.',
    color: '#8b5cf6',
  },
  {
    id: 'cpt',
    icon: '📚',
    label: 'On CPT',
    sublabel: 'Curricular Practical Training',
    desc: 'Semester-based work authorization integrated with my curriculum.',
    color: '#22c55e',
  },
]

let _pid = 0
const newPeriod = () => ({ id: ++_pid, startStr: '', endStr: '' })

function StepIndicator({ current, total }) {
  return (
    <div className={styles.stepIndicator}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`${styles.stepDot}
          ${i < current ? styles.stepDone : i === current ? styles.stepActive : ''}`} />
      ))}
    </div>
  )
}

function DateRow({ label, value, color, note, urgent }) {
  if (!value) return null
  return (
    <div className={styles.dateRow} style={{ borderColor: urgent ? 'rgba(239,68,68,0.3)' : 'var(--border)' }}>
      <span className={styles.dateLabel}>{label}</span>
      <div className={styles.dateRight}>
        <span className={styles.dateVal} style={{ color: color || 'var(--text-primary)' }}>{fmt(value)}</span>
        {note && <span className={styles.dateNote}>{note}</span>}
      </div>
    </div>
  )
}

function Gate({ title, message, onBack }) {
  return (
    <div className={styles.gateCard}>
      <div className={styles.gateIcon}>🚨</div>
      <h2 className={styles.gateTitle}>{title}</h2>
      <p className={styles.gateMsg}>{message}</p>
      <div className={styles.dsoBox}>
        <div className={styles.dsoTitle}>Contact your DSO immediately</div>
        <div className={styles.dsoStep}>1. Email or visit your international student office</div>
        <div className={styles.dsoStep}>2. Explain your timeline and ask about available options</div>
        <div className={styles.dsoStep}>3. Do NOT start working until your status is resolved</div>
      </div>
      <button className={styles.backBtn} onClick={onBack}>← Go back and correct dates</button>
    </div>
  )
}

export default function OnboardingPage({ user, onComplete }) {
  const [step,    setStep]    = useState(0)
  const [status,  setStatus]  = useState(null)   // pre_opt | on_opt | on_stem | cpt
  const [blocked, setBlocked] = useState(null)
  const [saving,  setSaving]  = useState(false)

  // ── Shared fields ────────────────────────────────────────────
  const [i20End,          setI20End]          = useState('')
  const [optAppliedDate,  setOptAppliedDate]  = useState('')
  const [optStartDate,    setOptStartDate]    = useState('')
  const [optPeriods,      setOptPeriods]      = useState([newPeriod()])
  const [stemAppliedDate, setStemAppliedDate] = useState('')
  const [stemPeriods,     setStemPeriods]     = useState([newPeriod()])

  // ── CPT fields ───────────────────────────────────────────────
  const [cptStart,       setCptStart]       = useState('')
  const [cptEnd,         setCptEnd]         = useState('')
  const [enrolledMonths, setEnrolledMonths] = useState('12')

  // ── Auto-calculated dates ────────────────────────────────────
  const dates = useMemo(() => {
    const optApplyOpen     = i20End    ? addD(i20End, -90)    : ''
    const optApplyDeadline = i20End    ? addD(i20End, 60)     : ''
    const optEarliestStart = i20End    ? addD(i20End, 1)      : ''
    const optLatestStart   = i20End    ? addD(i20End, 60)     : ''
    const optEnd           = optStartDate ? addD(addM(optStartDate, 12), -1) : ''
    const stemApplyBy      = optEnd    ? addD(optEnd, -90)    : ''
    const stemStart        = optEnd    ? addD(optEnd, 1)      : ''
    const stemEnd          = stemStart ? addD(addM(stemStart, 24), -1) : ''
    return { optApplyOpen, optApplyDeadline, optEarliestStart, optLatestStart, optEnd, stemApplyBy, stemStart, stemEnd }
  }, [i20End, optStartDate])

  const isPre  = status === 'pre_opt'
  const isOPT  = status === 'on_opt'
  const isSTEM = status === 'on_stem'
  const isCPT  = status === 'cpt'

  // Steps: pre_opt=4, on_opt=5, on_stem=6, cpt=3
  const totalSteps = isPre ? 4 : isOPT ? 5 : isSTEM ? 4 : 3

  const addOptPeriod    = () => setOptPeriods(p => [...p, newPeriod()])
  const removeOptPeriod = id => setOptPeriods(p => p.filter(x => x.id !== id))
  const updateOptPeriod = (id, f, v) => setOptPeriods(p => p.map(x => x.id === id ? { ...x, [f]: v } : x))
  const addStemPeriod    = () => setStemPeriods(p => [...p, newPeriod()])
  const removeStemPeriod = id => setStemPeriods(p => p.filter(x => x.id !== id))
  const updateStemPeriod = (id, f, v) => setStemPeriods(p => p.map(x => x.id === id ? { ...x, [f]: v } : x))

  // ── Gate checks ──────────────────────────────────────────────
  function checkOptApply() {
    if (!optAppliedDate) return true
    if (isAfter(optAppliedDate, dates.optApplyDeadline)) {
      setBlocked({ title: 'OPT application submitted after deadline', message: `Your OPT application was submitted on ${fmt(optAppliedDate)}, but the deadline was ${fmt(dates.optApplyDeadline)} — 60 days after your I-20 end date of ${fmt(i20End)}.` })
      return false
    }
    if (isBefore(optAppliedDate, dates.optApplyOpen)) {
      setBlocked({ title: 'OPT application submitted too early', message: `Your OPT application was submitted on ${fmt(optAppliedDate)}, but the earliest you could apply was ${fmt(dates.optApplyOpen)} — 90 days before your I-20 end date.` })
      return false
    }
    return true
  }

  function checkOptStart() {
    if (!optStartDate) return true
    if (isAfter(optStartDate, dates.optLatestStart)) {
      setBlocked({ title: 'OPT start date is after the allowed window', message: `Your OPT start date is ${fmt(optStartDate)}, but OPT must start by ${fmt(dates.optLatestStart)} — 60 days after your I-20 end date of ${fmt(i20End)}.` })
      return false
    }
    return true
  }

  function checkStemApply() {
    if (!stemAppliedDate) return true
    if (isAfter(stemAppliedDate, dates.stemApplyBy)) {
      setBlocked({ title: 'STEM OPT application submitted after deadline', message: `Your STEM OPT application was submitted on ${fmt(stemAppliedDate)}, but the deadline was ${fmt(dates.stemApplyBy)} — 90 days before your OPT end date of ${fmt(dates.optEnd)}.` })
      return false
    }
    return true
  }

  // ── Save ─────────────────────────────────────────────────────
  async function handleFinish() {
    setSaving(true)
    const visaType = isSTEM ? 'stem' : isCPT ? 'cpt' : 'opt'
    const data = {
      user_id:    user.id,
      visa_type:  visaType,
      i20_end:    i20End || null,
      opt_applied_date:  optAppliedDate  || null,
      stem_applied_date: stemAppliedDate || null,
      // Auth period
      auth_start: isSTEM ? dates.stemStart : optStartDate || null,
      auth_end:   isSTEM ? dates.stemEnd   : dates.optEnd || null,
      employment_periods: (isSTEM ? stemPeriods : optPeriods).map(p => ({ start: p.startStr, end: p.endStr })),
      // OPT carry-over for STEM
      opt_auth_start: isSTEM ? optStartDate    : null,
      opt_auth_end:   isSTEM ? dates.optEnd    : null,
      opt_periods:    isSTEM ? optPeriods.map(p => ({ start: p.startStr, end: p.endStr })) : [],
      // CPT
      cpt_program_start: cptStart || null,
      cpt_program_end:   cptEnd   || null,
      enrolled_months:   parseInt(enrolledMonths) || 0,
      onboarded:  true,
      updated_at: new Date().toISOString(),
    }

    localStorage.setItem(`visaguard_onboarded_${user.id}`, 'true')
    localStorage.setItem(`visaguard_data_${user.id}`, JSON.stringify(data))

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        await supabase.from('user_visa_data').upsert(
          { ...data, user_id: session.user.id },
          { onConflict: 'user_id', ignoreDuplicates: false }
        )
      }
    } catch (err) { console.error('[onboarding]', err.message) }

    setSaving(false)
    onComplete(data)
  }

  const selectedCard = STATUS_CARDS.find(c => c.id === status)

  if (blocked) return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.brand}>⚖ Visa<em>Guard</em></div>
        </div>
        <Gate title={blocked.title} message={blocked.message} onBack={() => setBlocked(null)} />
      </div>
    </div>
  )

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.brand}>⚖ Visa<em>Guard</em></div>
          <StepIndicator current={step} total={totalSteps} />
        </div>

        {/* ── Step 0: Status selection ── */}
        {step === 0 && (
          <div className={styles.stepContent}>
            <h1 className={styles.stepTitle}>Where are you in your F-1 journey?</h1>
            <p className={styles.stepSub}>Select your current status — we'll build your complete immigration timeline</p>
            <div className={styles.visaGrid}>
              {STATUS_CARDS.map(card => (
                <button key={card.id}
                  className={`${styles.visaCard} ${status === card.id ? styles.visaCardSelected : ''}`}
                  style={status === card.id ? { borderColor: card.color, background: `${card.color}12` } : {}}
                  onClick={() => setStatus(card.id)}>
                  <span className={styles.visaIcon}>{card.icon}</span>
                  <div className={styles.visaCardBody}>
                    <div className={styles.visaCardLabel}>{card.label}</div>
                    <div className={styles.visaCardSublabel}>{card.sublabel}</div>
                    <div className={styles.visaCardDesc}>{card.desc}</div>
                  </div>
                </button>
              ))}
            </div>
            <button className={styles.nextBtn} disabled={!status} onClick={() => {
                if (isSTEM) setStep(2)  // STEM skips I-20 step
                else setStep(1)
              }}>
              Continue →
            </button>
          </div>
        )}

        {/* ── Step 1: I-20 end date (all except CPT) ── */}
        {step === 1 && !isCPT && (
          <div className={styles.stepContent}>
            <div className={styles.stepBadge} style={{ color: selectedCard?.color }}>
              {selectedCard?.icon} {selectedCard?.label}
            </div>
            <h1 className={styles.stepTitle}>Your I-20 program end date</h1>
            <p className={styles.stepSub}>The "Program End Date" on your I-20 form — all OPT deadlines are calculated from this</p>

            <div className={styles.field}>
              <label className={styles.label}>I-20 program end date</label>
              <input type="date" className={styles.input} value={i20End} onChange={e => setI20End(e.target.value)} />
            </div>

            {i20End && (
              <div className={styles.calcBox}>
                <div className={styles.calcTitle}>📅 Your OPT application window</div>
                <DateRow label="Earliest to apply"    value={dates.optApplyOpen}     color="var(--text-secondary)" />
                <DateRow label="Deadline to apply"    value={dates.optApplyDeadline} color="var(--danger)" urgent />
                <DateRow label="OPT must start by"    value={dates.optLatestStart}   color="var(--warning)" />
                {isPre && daysLeft(dates.optApplyDeadline) !== null && (
                  <div className={styles.daysAlert} style={{
                    background: daysLeft(dates.optApplyDeadline) < 30 ? 'var(--danger-soft)' : 'var(--warning-soft)',
                    color: daysLeft(dates.optApplyDeadline) < 30 ? 'var(--danger)' : 'var(--warning)',
                    borderColor: daysLeft(dates.optApplyDeadline) < 30 ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)',
                  }}>
                    {daysLeft(dates.optApplyDeadline) > 0
                      ? `⚡ ${daysLeft(dates.optApplyDeadline)} days left to apply for OPT`
                      : '🚨 OPT application deadline has passed'}
                  </div>
                )}
              </div>
            )}

            <div className={styles.navRow}>
              <button className={styles.backBtn} onClick={() => setStep(0)}>← Back</button>
              <button className={styles.nextBtn} disabled={!i20End} onClick={() => setStep(2)}>Continue →</button>
            </div>
          </div>
        )}

        {/* ── Step 1 CPT ── */}
        {step === 1 && isCPT && (
          <div className={styles.stepContent}>
            <div className={styles.stepBadge} style={{ color: '#22c55e' }}>📚 F-1 CPT</div>
            <h1 className={styles.stepTitle}>Your CPT program details</h1>
            <p className={styles.stepSub}>CPT is authorized per semester by your DSO — no unemployment day limit</p>
            <div className={styles.row2}>
              <div className={styles.field}>
                <label className={styles.label}>Program start date</label>
                <input type="date" className={styles.input} value={cptStart} onChange={e => setCptStart(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Program end date</label>
                <input type="date" className={styles.input} value={cptEnd} onChange={e => setCptEnd(e.target.value)} />
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

        {/* ── Step 2: OPT application details (pre_opt, on_opt, on_stem) ── */}
        {step === 2 && !isCPT && (
          <div className={styles.stepContent}>
            <div className={styles.stepBadge} style={{ color: '#f97316' }}>🎓 OPT Application</div>
            <h1 className={styles.stepTitle}>
              {isPre ? 'Plan your OPT application' : isSTEM ? 'Your OPT dates' : 'Your OPT application details'}
            </h1>
            <p className={styles.stepSub}>
              {isPre
                ? "Enter your planned application date — we'll verify it's within your window"
                : isSTEM
                  ? 'Enter your OPT start date from your EAD card — all other dates calculate automatically'
                  : 'Enter when you applied and when your OPT started — we verify both are within the allowed window'}
            </p>

            {!isSTEM && (
              <div className={styles.field}>
                <label className={styles.label}>
                  {isPre ? 'When do you plan to apply for OPT?' : 'When did you submit your OPT application?'}
                </label>
                <input type="date" className={styles.input} value={optAppliedDate}
                  min={dates.optApplyOpen} max={dates.optApplyDeadline}
                  onChange={e => setOptAppliedDate(e.target.value)} />
                {optAppliedDate && (
                  isAfter(optAppliedDate, dates.optApplyDeadline)
                    ? <p className={styles.errorHint}>⚠ After deadline of {fmt(dates.optApplyDeadline)}</p>
                    : isBefore(optAppliedDate, dates.optApplyOpen)
                      ? <p className={styles.errorHint}>⚠ Before window opens on {fmt(dates.optApplyOpen)}</p>
                      : <p className={styles.successHint}>✓ Within the allowed window</p>
                )}
              </div>
            )}

            {(!isPre || isSTEM) && (
              <div className={styles.field}>
                <label className={styles.label}>OPT start date (from your EAD card)</label>
                <input type="date" className={styles.input} value={optStartDate}
                  min={isSTEM ? undefined : dates.optEarliestStart}
                  max={isSTEM ? undefined : dates.optLatestStart}
                  onChange={e => setOptStartDate(e.target.value)} />
                {optStartDate && !isSTEM && (
                  isAfter(optStartDate, dates.optLatestStart)
                    ? <p className={styles.errorHint}>⚠ OPT must start by {fmt(dates.optLatestStart)}</p>
                    : <p className={styles.successHint}>✓ Within the allowed window</p>
                )}
                {optStartDate && isSTEM && (
                  <p className={styles.successHint}>✓ OPT end and all STEM dates calculated automatically</p>
                )}
              </div>
            )}

            {/* Auto-calculated dates */}
            {(optStartDate || isPre) && dates.optEnd && (
              <div className={styles.calcBox}>
                <div className={styles.calcTitle}>✓ Your full F-1 timeline</div>
                <DateRow label="OPT start"            value={optStartDate || '—'}   color="var(--accent)" />
                <DateRow label="OPT end (EAD expiry)" value={dates.optEnd}           color="var(--accent)" />
                <DateRow label="Apply for STEM OPT by" value={dates.stemApplyBy} color="var(--success)"
                  note="90 days before OPT ends" />
                <DateRow label="STEM OPT start"       value={dates.stemStart}        color="var(--success)" />
                <DateRow label="STEM OPT end"         value={dates.stemEnd}          color="var(--success)" />
              </div>
            )}

            <div className={styles.navRow}>
              <button className={styles.backBtn} onClick={() => isSTEM ? setStep(0) : setStep(1)}>← Back</button>
              <button className={styles.nextBtn}
                disabled={isSTEM ? !optStartDate : (!optAppliedDate || (!isPre && !optStartDate))}
                onClick={() => {
                  if (!isSTEM && !checkOptApply()) return
                  if (!isSTEM && !isPre && !checkOptStart()) return
                  setStep(3)
                }}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2 CPT: Eligibility ── */}
        {step === 2 && isCPT && (
          <div className={styles.stepContent}>
            <div className={styles.stepBadge} style={{ color: '#22c55e' }}>📚 CPT Eligibility</div>
            <h1 className={styles.stepTitle}>Your CPT eligibility</h1>
            {(() => {
              const months = parseInt(enrolledMonths) || 0
              const ok = months >= 9
              return (
                <>
                  <div className={`${styles.eligResult} ${ok ? styles.eligOk : styles.eligFail}`}>
                    <span>{ok ? '✓' : '✗'}</span>
                    <div>
                      <div>{ok ? 'Eligible for CPT' : 'Not yet eligible — need 9+ months enrollment'}</div>
                      <div className={styles.eligNote}>{months} months enrolled</div>
                    </div>
                  </div>
                  {months >= 12 && (
                    <div className={styles.warningBox}>
                      ⚠ 12+ months full-time CPT = OPT ineligible. Track carefully.
                    </div>
                  )}
                </>
              )
            })()}
            <div className={styles.navRow}>
              <button className={styles.backBtn} onClick={() => setStep(1)}>← Back</button>
              <button className={styles.nextBtn} onClick={handleFinish} disabled={saving}>
                {saving ? 'Setting up…' : 'Go to dashboard →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: OPT employment (on_opt, on_stem, pre_opt) ── */}
        {step === 3 && !isCPT && (
          <div className={styles.stepContent}>
            <div className={styles.stepBadge} style={{ color: '#f97316' }}>
              {isPre ? '🎓 Planned Employment' : '📋 OPT Employment'}
            </div>
            <h1 className={styles.stepTitle}>
              {isPre ? 'Planned employment' : 'Your OPT employment history'}
            </h1>
            <p className={styles.stepSub}>
              {isPre
                ? 'Add any planned employment — leave blank if unknown'
                : isSTEM
                  ? `OPT period: ${fmt(optStartDate)} → ${fmt(dates.optEnd)} — used for carry-over calculation`
                  : 'Add jobs during your OPT period — leave end date blank if currently employed'}
            </p>

            <div className={styles.sectionHead}>
              <label className={styles.label}>Employment periods</label>
              <button className={styles.addBtn} onClick={addOptPeriod}>+ Add period</button>
            </div>
            {!optStartDate && (
              <p className={styles.errorHint}>⚠ Enter your OPT start date first to enable employment date selection</p>
            )}
            {optPeriods.map(p => (
              <div key={p.id} className={styles.periodRow}>
                <div className={styles.field}>
                  <label className={styles.label}>Start date</label>
                  <input type="date" className={styles.input} value={p.startStr}
                    min={optStartDate || undefined}
                    max={dates.optEnd || undefined}
                    disabled={!optStartDate}
                    onChange={e => updateOptPeriod(p.id, 'startStr', e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>End (blank = current)</label>
                  <input type="date" className={styles.input} value={p.endStr}
                    min={p.startStr || optStartDate || undefined}
                    max={dates.optEnd || undefined}
                    disabled={!optStartDate}
                    onChange={e => updateOptPeriod(p.id, 'endStr', e.target.value)} />
                </div>
                {optPeriods.length > 1 && (
                  <button className={styles.delBtn} onClick={() => removeOptPeriod(p.id)}>×</button>
                )}
              </div>
            ))}

            <div className={styles.navRow}>
              <button className={styles.backBtn} onClick={() => setStep(2)}>← Back</button>
              <button className={styles.nextBtn} onClick={() => {
                if (isPre || isOPT) setStep(4)
                else if (isSTEM) setStep(4)        // STEM goes to review (no more STEM apply step here)
                else setStep(4)
              }}>
                {isPre || isOPT || isSTEM ? 'Review & finish →' : 'Continue →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: STEM OPT details (on_stem only) ── */}
        {step === 4 && isSTEM && (
          <div className={styles.stepContent}>
            <div className={styles.stepBadge} style={{ color: '#8b5cf6' }}>🔬 STEM OPT Application</div>
            <h1 className={styles.stepTitle}>Your STEM OPT application</h1>
            <p className={styles.stepSub}>Enter when you applied for STEM OPT — must be within 90 days before OPT expires</p>

            <div className={styles.field}>
              <label className={styles.label}>When did you submit your STEM OPT application?</label>
              <input type="date" className={styles.input} value={stemAppliedDate}
                max={dates.stemApplyBy}
                onChange={e => setStemAppliedDate(e.target.value)} />
              {stemAppliedDate && (
                isAfter(stemAppliedDate, dates.stemApplyBy)
                  ? <p className={styles.errorHint}>⚠ After deadline of {fmt(dates.stemApplyBy)}</p>
                  : <p className={styles.successHint}>
                      ✓ Applied {Math.round((parseDate(dates.stemApplyBy) - parseDate(stemAppliedDate)) / 86400000)} days before deadline
                    </p>
              )}
            </div>

            <div className={styles.calcBox}>
              <div className={styles.calcTitle}>✓ Your STEM OPT dates</div>
              <DateRow label="STEM OPT start"         value={dates.stemStart} color="var(--success)" />
              <DateRow label="STEM OPT end (EAD expiry)" value={dates.stemEnd} color="var(--success)" />
            </div>

            <div className={styles.navRow}>
              <button className={styles.backBtn} onClick={() => setStep(3)}>← Back</button>
              <button className={styles.nextBtn} disabled={!stemAppliedDate}
                onClick={() => {
                  if (!checkStemApply()) return
                  setStep(5)
                }}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 5: STEM employment (on_stem) ── */}
        {step === 5 && isSTEM && (
          <div className={styles.stepContent}>
            <div className={styles.stepBadge} style={{ color: '#8b5cf6' }}>🔬 STEM OPT Employment</div>
            <h1 className={styles.stepTitle}>Your STEM OPT employment</h1>
            <p className={styles.stepSub}>
              Enter jobs from your STEM OPT start date ({fmt(dates.stemStart)}) onwards only
            </p>

            <div className={styles.sectionHead}>
              <label className={styles.label}>STEM OPT employment periods</label>
              <button className={styles.addBtn} onClick={addStemPeriod}>+ Add period</button>
            </div>
            {stemPeriods.map(p => (
              <div key={p.id} className={styles.periodRow}>
                <div className={styles.field}>
                  <label className={styles.label}>Start</label>
                  <input type="date" className={styles.input} value={p.startStr}
                    min={dates.stemStart || undefined}
                    max={dates.stemEnd || undefined}
                    onChange={e => updateStemPeriod(p.id, 'startStr', e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>End (blank = current)</label>
                  <input type="date" className={styles.input} value={p.endStr}
                    min={p.startStr || dates.stemStart || undefined}
                    max={dates.stemEnd || undefined}
                    onChange={e => updateStemPeriod(p.id, 'endStr', e.target.value)} />
                </div>
                {stemPeriods.length > 1 && (
                  <button className={styles.delBtn} onClick={() => removeStemPeriod(p.id)}>×</button>
                )}
              </div>
            ))}

            <div className={styles.navRow}>
              <button className={styles.backBtn} onClick={() => setStep(4)}>← Back</button>
              <button className={styles.nextBtn} onClick={() => setStep(6)}>Review & finish →</button>
            </div>
          </div>
        )}

        {/* ── Final review ── */}
        {((step === 4 && (isPre || isOPT)) || (step === 4 && isSTEM) || step === 6) && (
          <div className={styles.stepContent}>
            <h1 className={styles.stepTitle}>You're all set! 🎉</h1>
            <p className={styles.stepSub}>Your complete F-1 timeline — all dates verified</p>

            <div className={styles.summaryCard}>
              <div className={styles.summaryRow}>
                <span>Status</span>
                <strong>{STATUS_CARDS.find(c => c.id === status)?.label}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>I-20 end date</span>
                <strong>{fmt(i20End)}</strong>
              </div>
              {!isPre && (
                <>
                  <div className={styles.summaryRow}>
                    <span>OPT period</span>
                    <strong>{fmt(optStartDate)} → {fmt(dates.optEnd)}</strong>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Apply for STEM OPT by</span>
                    <strong style={{ color: daysLeft(dates.stemApplyBy) < 30 ? 'var(--warning)' : 'var(--text-primary)' }}>
                      {fmt(dates.stemApplyBy)}
                    </strong>
                  </div>
                </>
              )}
              {isSTEM && (
                <div className={styles.summaryRow}>
                  <span>STEM OPT period</span>
                  <strong>{fmt(dates.stemStart)} → {fmt(dates.stemEnd)}</strong>
                </div>
              )}
              <div className={styles.summaryRow} style={{ color: 'var(--success)' }}>
                <span>✓ Deadlines verified</span>
                <strong style={{ color: 'var(--success)' }}>Compliant</strong>
              </div>
            </div>

            <button className={styles.finishBtn} onClick={handleFinish} disabled={saving}>
              {saving ? 'Setting up your dashboard…' : 'Go to my dashboard →'}
            </button>
            <p className={styles.fieldHint} style={{ textAlign: 'center', marginTop: 8 }}>
              You can update your details anytime from the Status Tracker
            </p>
          </div>
        )}

      </div>
    </div>
  )
}