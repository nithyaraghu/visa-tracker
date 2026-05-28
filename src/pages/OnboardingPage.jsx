// src/pages/OnboardingPage.jsx
// Gated onboarding — validates OPT/STEM deadlines before allowing user in
import { useState, useMemo } from 'react'
import { supabase } from '../auth/supabase.js'
import { parseLocalDate, calcUnemployment, diffDays, VISA_RULES } from '../utils/visaCalc.js'
import { calcStemDates, calcOptEnd } from '../utils/stemDates.js'
import styles from './OnboardingPage.module.css'

// ── Date helpers ────────────────────────────────────────────────
function fmt(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function addDays(dateStr, n) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
}
function addMonths(dateStr, n) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1 + n, d)
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
}
function isAfter(a, b)  { return a && b && new Date(a) > new Date(b) }
function isBefore(a, b) { return a && b && new Date(a) < new Date(b) }
function daysBetween(a, b) {
  if (!a || !b) return null
  return Math.round((new Date(b) - new Date(a)) / 86400000)
}

const VISA_CARDS = [
  { id: 'opt',  label: 'F-1 OPT',      sublabel: 'Optional Practical Training', icon: '🎓', color: '#f97316', desc: '12-month post-graduation work authorization. 90-day unemployment limit.' },
  { id: 'stem', label: 'F-1 STEM OPT', sublabel: 'STEM OPT Extension',          icon: '🔬', color: '#3b82f6', desc: '24-month extension for STEM graduates. 150-day cumulative unemployment limit.' },
  { id: 'cpt',  label: 'F-1 CPT',      sublabel: 'Curricular Practical Training',icon: '📚', color: '#22c55e', desc: 'Semester-based authorization. No unemployment limit.' },
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

// ── Deadline gate — shown when user missed a deadline ───────────
function DeadlineBlocked({ title, message, onBack }) {
  return (
    <div className={styles.blockedCard}>
      <div className={styles.blockedIcon}>🚨</div>
      <h2 className={styles.blockedTitle}>{title}</h2>
      <p className={styles.blockedMsg}>{message}</p>
      <div className={styles.blockedActions}>
        <div className={styles.dsoCard}>
          <div className={styles.dsoTitle}>Contact your DSO immediately</div>
          <div className={styles.dsoSteps}>
            <div>1. Email or visit your international student office</div>
            <div>2. Explain your situation and ask about options</div>
            <div>3. Do NOT begin working until your status is resolved</div>
          </div>
        </div>
        <button className={styles.backBtn} onClick={onBack}>← Go back and correct dates</button>
      </div>
    </div>
  )
}

// ── Date info row ────────────────────────────────────────────────
function DateInfo({ label, value, color, note }) {
  if (!value) return null
  return (
    <div className={styles.dateInfo} style={{ borderColor: `${color || 'var(--border)'}` }}>
      <span className={styles.dateInfoLabel}>{label}</span>
      <div>
        <span className={styles.dateInfoVal} style={{ color: color || 'var(--text-primary)' }}>{value}</span>
        {note && <span className={styles.dateInfoNote}> · {note}</span>}
      </div>
    </div>
  )
}

export default function OnboardingPage({ user, onComplete }) {
  const [step,       setStep]       = useState(0)
  const [visaType,   setVisaType]   = useState(null)
  const [blocked,    setBlocked]    = useState(null)  // null | { title, message }
  const [saving,     setSaving]     = useState(false)

  // ── Shared dates ─────────────────────────────────────────────
  const [i20End,         setI20End]         = useState('')  // I-20 program end date
  const [optAppliedDate, setOptAppliedDate] = useState('')  // When user applied for OPT
  const [optStartDate,   setOptStartDate]   = useState('')  // EAD start date
  const [periods,        setPeriods]        = useState([newPeriod()])

  // ── STEM specific ─────────────────────────────────────────────
  const [stemAppliedDate, setStemAppliedDate] = useState('')  // When user applied for STEM OPT
  const [stemPeriods,     setStemPeriods]     = useState([newPeriod()])

  // ── CPT specific ─────────────────────────────────────────────
  const [cptStart,        setCptStart]        = useState('')
  const [cptEnd,          setCptEnd]          = useState('')
  const [enrolledMonths,  setEnrolledMonths]  = useState('12')

  // ── Auto-calculated dates ─────────────────────────────────────
  const calc = useMemo(() => {
    if (!i20End) return {}

    const optApplyWindowOpen  = addDays(i20End, -90)   // 90 days before I-20 end
    const optApplyDeadline    = addDays(i20End, 60)    // 60 days after I-20 end
    const optEarliestStart    = addDays(i20End, 1)     // Day after I-20 end
    const optLatestStart      = addDays(i20End, 60)    // Same as apply deadline

    const optEnd = optStartDate ? addDays(addMonths(optStartDate, 12), -1) : ''

    const stemApplyDeadline = optEnd ? addDays(optEnd, -90) : ''
    const stemStart         = optEnd ? addDays(optEnd, 1)   : ''
    const stemEnd           = stemStart ? addDays(addMonths(stemStart, 24), -1) : ''

    return {
      optApplyWindowOpen, optApplyDeadline,
      optEarliestStart, optLatestStart,
      optEnd,
      stemApplyDeadline, stemStart, stemEnd,
    }
  }, [i20End, optStartDate])

  const isCPT  = visaType === 'cpt'
  const isSTEM = visaType === 'stem'
  const totalSteps = isCPT ? 3 : isSTEM ? 5 : 4

  const addPeriod    = () => setPeriods(p => [...p, newPeriod()])
  const removePeriod = id => setPeriods(p => p.filter(x => x.id !== id))
  const updatePeriod = (id, f, v) => setPeriods(p => p.map(x => x.id === id ? { ...x, [f]: v } : x))

  const addStemPeriod    = () => setStemPeriods(p => [...p, newPeriod()])
  const removeStemPeriod = id => setStemPeriods(p => p.filter(x => x.id !== id))
  const updateStemPeriod = (id, f, v) => setStemPeriods(p => p.map(x => x.id === id ? { ...x, [f]: v } : x))

  // ── Gate checks ───────────────────────────────────────────────
  function checkOptApplicationDeadline() {
    if (!optAppliedDate || !calc.optApplyDeadline) return true
    if (isAfter(optAppliedDate, calc.optApplyDeadline)) {
      setBlocked({
        title: 'OPT application submitted after deadline',
        message: `Your OPT application was submitted on ${fmt(optAppliedDate)}, but the deadline was ${fmt(calc.optApplyDeadline)} (60 days after your I-20 end date of ${fmt(i20End)}). USCIS requires OPT applications to be filed within 60 days of your program end date.`
      })
      return false
    }
    if (isBefore(optAppliedDate, calc.optApplyWindowOpen)) {
      setBlocked({
        title: 'OPT application submitted too early',
        message: `Your OPT application was submitted on ${fmt(optAppliedDate)}, but the earliest you could apply was ${fmt(calc.optApplyWindowOpen)} (90 days before your I-20 end date). Applications submitted outside this window are invalid.`
      })
      return false
    }
    return true
  }

  function checkOptStartDeadline() {
    if (!optStartDate || !calc.optLatestStart) return true
    if (isAfter(optStartDate, calc.optLatestStart)) {
      setBlocked({
        title: 'OPT start date is after the allowed window',
        message: `Your OPT start date is ${fmt(optStartDate)}, but OPT must start by ${fmt(calc.optLatestStart)} (60 days after your I-20 end date of ${fmt(i20End)}). Contact your DSO immediately.`
      })
      return false
    }
    return true
  }

  function checkStemApplicationDeadline() {
    if (!stemAppliedDate || !calc.stemApplyDeadline) return true
    if (isAfter(stemAppliedDate, calc.stemApplyDeadline)) {
      setBlocked({
        title: 'STEM OPT application submitted after deadline',
        message: `Your STEM OPT application was submitted on ${fmt(stemAppliedDate)}, but the deadline was ${fmt(calc.stemApplyDeadline)} (90 days before your OPT end date of ${fmt(calc.optEnd)}). USCIS requires STEM OPT applications to be filed within 90 days of OPT expiry.`
      })
      return false
    }
    return true
  }

  // ── Save and complete ─────────────────────────────────────────
  async function handleFinish() {
    setSaving(true)
    const data = {
      user_id:    user.id,
      visa_type:  visaType,
      // OPT as auth for non-STEM, STEM auth for STEM users
      auth_start:  isSTEM ? calc.stemStart : optStartDate || null,
      auth_end:    isSTEM ? calc.stemEnd   : calc.optEnd  || null,
      employment_periods: (isSTEM ? stemPeriods : periods).map(p => ({ start: p.startStr, end: p.endStr })),
      // OPT carry-over fields for STEM
      opt_auth_start: isSTEM ? optStartDate        : null,
      opt_auth_end:   isSTEM ? calc.optEnd         : null,
      opt_periods:    isSTEM ? periods.map(p => ({ start: p.startStr, end: p.endStr })) : [],
      // Meta
      i20_end:           i20End          || null,
      opt_applied_date:  optAppliedDate  || null,
      stem_applied_date: stemAppliedDate || null,
      // CPT
      cpt_program_start: cptStart        || null,
      cpt_program_end:   cptEnd          || null,
      enrolled_months:   parseInt(enrolledMonths) || 0,
      onboarded: true,
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
    } catch (err) {
      console.error('[onboarding] Save error:', err.message)
    }

    setSaving(false)
    onComplete(data)
  }

  // ── Render ────────────────────────────────────────────────────
  if (blocked) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.header}>
            <div className={styles.brand}>⚖ Visa<em>Guard</em></div>
          </div>
          <DeadlineBlocked
            title={blocked.title}
            message={blocked.message}
            onBack={() => setBlocked(null)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.brand}>⚖ Visa<em>Guard</em></div>
          <StepIndicator current={step} total={totalSteps} />
        </div>

        {/* ── Step 0: Visa type ── */}
        {step === 0 && (
          <div className={styles.stepContent}>
            <h1 className={styles.stepTitle}>What is your current F-1 status?</h1>
            <p className={styles.stepSub}>Select the visa type you are currently on or applying for</p>
            <div className={styles.visaGrid}>
              {VISA_CARDS.map(card => (
                <button key={card.id}
                  className={`${styles.visaCard} ${visaType === card.id ? styles.visaCardSelected : ''}`}
                  style={visaType === card.id ? { borderColor: card.color, background: `${card.color}12` } : {}}
                  onClick={() => setVisaType(card.id)}>
                  <span className={styles.visaIcon}>{card.icon}</span>
                  <div className={styles.visaCardBody}>
                    <div className={styles.visaCardLabel}>{card.label}</div>
                    <div className={styles.visaCardSublabel}>{card.sublabel}</div>
                    <div className={styles.visaCardDesc}>{card.desc}</div>
                  </div>
                </button>
              ))}
            </div>
            <button className={styles.nextBtn} disabled={!visaType} onClick={() => setStep(1)}>
              Continue →
            </button>
          </div>
        )}

        {/* ── Step 1: I-20 end date ── */}
        {step === 1 && !isCPT && (
          <div className={styles.stepContent}>
            <div className={styles.stepBadge} style={{ color: VISA_CARDS.find(c => c.id === visaType)?.color }}>
              {VISA_CARDS.find(c => c.id === visaType)?.icon} {VISA_CARDS.find(c => c.id === visaType)?.label}
            </div>
            <h1 className={styles.stepTitle}>Your I-20 program end date</h1>
            <p className={styles.stepSub}>This is the "Program End Date" printed on your I-20 form — all OPT deadlines are calculated from this date</p>

            <div className={styles.field}>
              <label className={styles.label}>I-20 program end date</label>
              <input type="date" className={styles.input} value={i20End} onChange={e => setI20End(e.target.value)} />
            </div>

            {i20End && (
              <div className={styles.autoCalcBox}>
                <div className={styles.autoCalcTitle}>📅 Your OPT application window</div>
                <DateInfo label="Earliest you can apply" value={fmt(calc.optApplyWindowOpen)} color="var(--text-secondary)" />
                <DateInfo label="DEADLINE to apply" value={fmt(calc.optApplyDeadline)} color="var(--danger)" />
                <DateInfo label="OPT must start by" value={fmt(calc.optLatestStart)} color="var(--warning)" />
              </div>
            )}

            <div className={styles.navRow}>
              <button className={styles.backBtn} onClick={() => setStep(0)}>← Back</button>
              <button className={styles.nextBtn} disabled={!i20End} onClick={() => setStep(2)}>Continue →</button>
            </div>
          </div>
        )}

        {/* ── Step 2: OPT application date + start date ── */}
        {step === 2 && !isCPT && (
          <div className={styles.stepContent}>
            <div className={styles.stepBadge} style={{ color: '#f97316' }}>🎓 OPT Application</div>
            <h1 className={styles.stepTitle}>Your OPT application details</h1>
            <p className={styles.stepSub}>Enter when you applied and when your OPT started — we'll verify both are within the allowed window</p>

            <div className={styles.field}>
              <label className={styles.label}>When did you submit your OPT application?</label>
              <input type="date" className={styles.input} value={optAppliedDate}
                onChange={e => setOptAppliedDate(e.target.value)}
                min={calc.optApplyWindowOpen} max={calc.optApplyDeadline} />
              {optAppliedDate && calc.optApplyDeadline && (
                isAfter(optAppliedDate, calc.optApplyDeadline)
                  ? <p className={styles.errorHint}>⚠ This is after the deadline of {fmt(calc.optApplyDeadline)}</p>
                  : isBefore(optAppliedDate, calc.optApplyWindowOpen)
                    ? <p className={styles.errorHint}>⚠ This is before the window opened on {fmt(calc.optApplyWindowOpen)}</p>
                    : <p className={styles.successHint}>✓ Within the allowed window</p>
              )}
            </div>

            <div className={styles.field}>
              <label className={styles.label}>What is your OPT start date? (from your EAD card)</label>
              <input type="date" className={styles.input} value={optStartDate}
                onChange={e => setOptStartDate(e.target.value)}
                min={calc.optEarliestStart} max={calc.optLatestStart} />
              {optStartDate && calc.optLatestStart && (
                isAfter(optStartDate, calc.optLatestStart)
                  ? <p className={styles.errorHint}>⚠ OPT must start by {fmt(calc.optLatestStart)}</p>
                  : <p className={styles.successHint}>✓ Within the allowed window</p>
              )}
            </div>

            {optStartDate && calc.optEnd && (
              <div className={styles.autoCalcBox}>
                <div className={styles.autoCalcTitle}>✓ Auto-calculated from your OPT start date</div>
                <DateInfo label="OPT end date (EAD expiry)" value={fmt(calc.optEnd)} color="var(--accent)" />
                {isSTEM && <DateInfo label="Apply for STEM OPT by" value={fmt(calc.stemApplyDeadline)} color="var(--warning)" />}
                {isSTEM && <DateInfo label="STEM OPT start" value={fmt(calc.stemStart)} color="var(--success)" />}
                {isSTEM && <DateInfo label="STEM OPT end (EAD expiry)" value={fmt(calc.stemEnd)} color="var(--success)" />}
              </div>
            )}

            <div className={styles.navRow}>
              <button className={styles.backBtn} onClick={() => setStep(1)}>← Back</button>
              <button className={styles.nextBtn}
                disabled={!optAppliedDate || !optStartDate}
                onClick={() => {
                  if (!checkOptApplicationDeadline()) return
                  if (!checkOptStartDeadline()) return
                  setStep(3)
                }}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: OPT employment ── */}
        {step === 3 && !isCPT && !isSTEM && (
          <div className={styles.stepContent}>
            <div className={styles.stepBadge} style={{ color: '#f97316' }}>🎓 F-1 OPT</div>
            <h1 className={styles.stepTitle}>Your OPT employment history</h1>
            <p className={styles.stepSub}>Add jobs during your OPT period — leave end date blank if currently employed</p>

            <div className={styles.sectionHead}>
              <label className={styles.label}>Employment periods</label>
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

            <div className={styles.navRow}>
              <button className={styles.backBtn} onClick={() => setStep(2)}>← Back</button>
              <button className={styles.nextBtn} onClick={() => setStep(4)}>Review & finish →</button>
            </div>
          </div>
        )}

        {/* ── Step 3 (STEM): OPT employment ── */}
        {step === 3 && isSTEM && (
          <div className={styles.stepContent}>
            <div className={styles.stepBadge} style={{ color: '#f97316' }}>🎓 OPT Employment</div>
            <h1 className={styles.stepTitle}>Your OPT employment history</h1>
            <p className={styles.stepSub}>Add jobs during your initial OPT period — used to calculate carry-over days into your 150-day STEM limit</p>

            <div className={styles.sectionHead}>
              <label className={styles.label}>OPT employment periods ({fmt(optStartDate)} → {fmt(calc.optEnd)})</label>
              <button className={styles.addBtn} onClick={addPeriod}>+ Add</button>
            </div>
            {periods.map(p => (
              <div key={p.id} className={styles.periodRow}>
                <div className={styles.field}>
                  <label className={styles.label}>Start</label>
                  <input type="date" className={styles.input} value={p.startStr} onChange={e => updatePeriod(p.id, 'startStr', e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>End</label>
                  <input type="date" className={styles.input} value={p.endStr} onChange={e => updatePeriod(p.id, 'endStr', e.target.value)} />
                </div>
                {periods.length > 1 && <button className={styles.delBtn} onClick={() => removePeriod(p.id)}>×</button>}
              </div>
            ))}

            <div className={styles.navRow}>
              <button className={styles.backBtn} onClick={() => setStep(2)}>← Back</button>
              <button className={styles.nextBtn} onClick={() => setStep(4)}>Continue →</button>
            </div>
          </div>
        )}

        {/* ── Step 4 (STEM): STEM application + employment ── */}
        {step === 4 && isSTEM && (
          <div className={styles.stepContent}>
            <div className={styles.stepBadge} style={{ color: '#3b82f6' }}>🔬 STEM OPT</div>
            <h1 className={styles.stepTitle}>Your STEM OPT details</h1>
            <p className={styles.stepSub}>Enter when you applied for STEM OPT — must be within 90 days before OPT expires</p>

            <div className={styles.field}>
              <label className={styles.label}>When did you submit your STEM OPT application?</label>
              <input type="date" className={styles.input} value={stemAppliedDate}
                onChange={e => setStemAppliedDate(e.target.value)}
                max={calc.stemApplyDeadline} />
              {stemAppliedDate && calc.stemApplyDeadline && (
                isAfter(stemAppliedDate, calc.stemApplyDeadline)
                  ? <p className={styles.errorHint}>⚠ This is after the deadline of {fmt(calc.stemApplyDeadline)}</p>
                  : <p className={styles.successHint}>✓ Applied {daysBetween(stemAppliedDate, calc.stemApplyDeadline)} days before deadline</p>
              )}
            </div>

            {calc.stemStart && (
              <div className={styles.autoCalcBox}>
                <div className={styles.autoCalcTitle}>✓ Your STEM OPT dates</div>
                <DateInfo label="STEM OPT start" value={fmt(calc.stemStart)} color="var(--success)" />
                <DateInfo label="STEM OPT end (EAD expiry)" value={fmt(calc.stemEnd)} color="var(--success)" />
              </div>
            )}

            <div className={styles.sectionHead} style={{ marginTop: 16 }}>
              <label className={styles.label}>STEM OPT employment periods</label>
              <button className={styles.addBtn} onClick={addStemPeriod}>+ Add period</button>
            </div>
            <p className={styles.fieldHint}>Enter only jobs from your STEM OPT start date onwards</p>
            {stemPeriods.map(p => (
              <div key={p.id} className={styles.periodRow}>
                <div className={styles.field}>
                  <label className={styles.label}>Start</label>
                  <input type="date" className={styles.input} value={p.startStr} onChange={e => updateStemPeriod(p.id, 'startStr', e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>End (blank = current)</label>
                  <input type="date" className={styles.input} value={p.endStr} onChange={e => updateStemPeriod(p.id, 'endStr', e.target.value)} />
                </div>
                {stemPeriods.length > 1 && <button className={styles.delBtn} onClick={() => removeStemPeriod(p.id)}>×</button>}
              </div>
            ))}

            <div className={styles.navRow}>
              <button className={styles.backBtn} onClick={() => setStep(3)}>← Back</button>
              <button className={styles.nextBtn}
                disabled={!stemAppliedDate}
                onClick={() => {
                  if (!checkStemApplicationDeadline()) return
                  setStep(5)
                }}>
                Review & finish →
              </button>
            </div>
          </div>
        )}

        {/* ── CPT Step 1: Program details ── */}
        {step === 1 && isCPT && (
          <div className={styles.stepContent}>
            <div className={styles.stepBadge} style={{ color: '#22c55e' }}>📚 F-1 CPT</div>
            <h1 className={styles.stepTitle}>Your CPT program details</h1>
            <p className={styles.stepSub}>CPT is authorized per semester — no unemployment day limit applies</p>

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
              <input type="number" min="0" max="120" className={styles.input} value={enrolledMonths} onChange={e => setEnrolledMonths(e.target.value)} />
              <p className={styles.fieldHint}>Must be at least 9 months to qualify for CPT</p>
            </div>

            <div className={styles.navRow}>
              <button className={styles.backBtn} onClick={() => setStep(0)}>← Back</button>
              <button className={styles.nextBtn} onClick={() => setStep(2)}>Continue →</button>
            </div>
          </div>
        )}

        {/* ── CPT Step 2: Eligibility ── */}
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
                      <div>{ok ? 'You are eligible for CPT' : 'Not yet eligible — need 9+ months enrollment'}</div>
                      <div className={styles.eligNote}>{months} months enrolled {ok ? '— meets the 9-month requirement' : ''}</div>
                    </div>
                  </div>
                  {months >= 12 && (
                    <div className={styles.warningBox}>
                      ⚠ 12+ months of full-time CPT makes you ineligible for OPT. Track your CPT duration carefully.
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

        {/* ── Final review ── */}
        {(step === 4 && !isSTEM) || step === 5 ? (
          <div className={styles.stepContent}>
            <h1 className={styles.stepTitle}>You're all set! 🎉</h1>
            <p className={styles.stepSub}>Here's your compliance summary</p>

            <div className={styles.summaryCard}>
              <div className={styles.summaryRow}>
                <span>Visa type</span>
                <strong>{VISA_CARDS.find(c => c.id === visaType)?.label}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>I-20 end date</span>
                <strong>{fmt(i20End)}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>OPT start date</span>
                <strong>{fmt(optStartDate)}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>OPT end date</span>
                <strong>{fmt(calc.optEnd)}</strong>
              </div>
              {isSTEM && <>
                <div className={styles.summaryRow}>
                  <span>STEM OPT start</span>
                  <strong>{fmt(calc.stemStart)}</strong>
                </div>
                <div className={styles.summaryRow}>
                  <span>STEM OPT end</span>
                  <strong>{fmt(calc.stemEnd)}</strong>
                </div>
              </>}
              <div className={styles.summaryRow} style={{ color: 'var(--success)' }}>
                <span>✓ All deadlines verified</span>
                <strong style={{ color: 'var(--success)' }}>Compliant</strong>
              </div>
            </div>

            <button className={styles.finishBtn} onClick={handleFinish} disabled={saving}>
              {saving ? 'Setting up your dashboard…' : 'Go to my dashboard →'}
            </button>
          </div>
        ) : null}

      </div>
    </div>
  )
}