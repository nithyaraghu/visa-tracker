// src/pages/EligibilityPage.jsx
// OPT and STEM OPT eligibility checker
import { useState, useMemo } from 'react'
import styles from './EligibilityPage.module.css'

const TABS = [
  { id: 'opt',  label: 'OPT Eligibility'     },
  { id: 'stem', label: 'STEM OPT Eligibility' },
  { id: 'cpt',  label: 'CPT Eligibility'      },
]

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

import { calcStemDates, calcOptEnd } from '../utils/stemDates.js'

function fmtDate(d) {
  if (!d) return '—'
  if (typeof d === 'string') {
    const [y, m, day] = d.split('-').map(Number)
    d = new Date(y, m - 1, day)
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function addDays(d, n)    { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function addMonths(d, n)  { const r = new Date(d); r.setMonth(r.getMonth() + n); return r }
function daysFromNow(d)   {
  const today = new Date(); today.setHours(0,0,0,0)
  return Math.round((d - today) / 86400000)
}

// ── OPT Eligibility ───────────────────────────────────────────────
function OPTTab() {
  const [gradDate,    setGradDate]    = useState('')
  const [degreeLevel, setDegreeLevel] = useState('bachelors')
  const [calculated,  setCalculated]  = useState(false)

  const result = useMemo(() => {
    if (!gradDate || !calculated) return null
    const grad = new Date(gradDate)
    const today = new Date(); today.setHours(0, 0, 0, 0)

    const applyFrom  = addDays(grad, -90)
    const applyBy    = addDays(grad, 60)
    const ead5months = addMonths(today, 5)
    const earliestStart = new Date(Math.max(grad.getTime(), today.getTime()))

    const daysToApply    = daysFromNow(applyFrom)
    const daysToDeadline = daysFromNow(applyBy)
    const alreadyGraded  = grad <= today

    let status = 'ok'
    let statusMsg = ''
    if (!alreadyGraded && daysToApply > 0) {
      status = 'waiting'
      statusMsg = `Application window opens in ${daysToApply} days`
    } else if (daysToDeadline < 0) {
      status = 'expired'
      statusMsg = 'OPT application deadline has passed'
    } else if (daysToDeadline <= 14) {
      status = 'urgent'
      statusMsg = `Only ${daysToDeadline} days left to apply!`
    } else {
      status = 'eligible'
      statusMsg = 'You are eligible to apply for OPT'
    }

    return {
      status, statusMsg,
      applyFrom, applyBy, ead5months, earliestStart,
      daysToApply, daysToDeadline, alreadyGraded
    }
  }, [gradDate, calculated, degreeLevel])

  const STATUS_COLOR = {
    waiting:  'var(--text-secondary)',
    expired:  'var(--danger)',
    urgent:   'var(--warning)',
    eligible: 'var(--success)',
    ok:       'var(--success)',
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Your graduation details</div>
        <div className={styles.row2}>
          <div className={styles.field}>
            <label className={styles.label}>Graduation date</label>
            <input type="date" className={styles.input}
              value={gradDate} onChange={e => setGradDate(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Degree level</label>
            <select className={styles.input} value={degreeLevel}
              onChange={e => setDegreeLevel(e.target.value)}>
              <option value="bachelors">Bachelor's degree</option>
              <option value="masters">Master's degree</option>
              <option value="phd">PhD / Doctorate</option>
            </select>
          </div>
        </div>
        <button className={styles.calcBtn}
          onClick={() => setCalculated(true)} disabled={!gradDate}>
          Check OPT eligibility
        </button>
      </div>

      {result && (
        <>
          <div className={styles.statusCard}>
            <div className={styles.statusBadge}
              style={{ color: STATUS_COLOR[result.status], background: `${STATUS_COLOR[result.status]}18` }}>
              {result.status === 'eligible' ? '✓ Eligible' :
               result.status === 'expired'  ? '✗ Expired'  :
               result.status === 'urgent'   ? '⚡ Urgent'   : '⏳ Waiting'}
            </div>
            <p className={styles.statusMsg} style={{ color: STATUS_COLOR[result.status] }}>
              {result.statusMsg}
            </p>
          </div>

          <div className={styles.timelineCard}>
            <div className={styles.timelineTitle}>Key dates</div>
            {[
              { label: 'Application window opens', date: result.applyFrom,
                note: '90 days before graduation', urgent: result.daysToApply > 0 && result.daysToApply < 14 },
              { label: 'Application deadline',     date: result.applyBy,
                note: '60 days after graduation', urgent: result.daysToDeadline > 0 && result.daysToDeadline < 30 },
              { label: 'Estimated EAD receipt',    date: result.ead5months,
                note: 'Apply early — USCIS takes ~5 months' },
              { label: 'Earliest OPT start',       date: result.earliestStart,
                note: 'Day after graduation or today (whichever is later)' },
            ].map((item, i) => (
              <div key={i} className={`${styles.timelineRow} ${item.urgent ? styles.urgent : ''}`}>
                <div>
                  <div className={styles.timelineLabel}>{item.label}</div>
                  <div className={styles.timelineNote}>{item.note}</div>
                </div>
                <div className={styles.timelineDate}
                  style={{ color: item.urgent ? 'var(--warning)' : 'var(--text-primary)' }}>
                  {fmtDate(item.date)}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.requirementsCard}>
            <div className={styles.reqTitle}>OPT requirements checklist</div>
            {[
              { text: 'Full-time F-1 student for at least one academic year',    ok: true },
              { text: 'Employment must be directly related to your major',        ok: true },
              { text: 'Apply on SEVP portal — DSO recommendation required',       ok: true },
              { text: 'Form I-765 (Application for Employment Authorization)',    ok: true },
              { text: 'OPT valid for 12 months — 90-day unemployment limit',      ok: true },
              { text: 'Can be used before OR after graduation (pre/post-comp)',   ok: true },
            ].map((r, i) => (
              <div key={i} className={styles.reqRow}>
                <span className={styles.reqCheck}>✓</span>
                <span>{r.text}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── STEM OPT Eligibility ──────────────────────────────────────────
function STEMTab() {
  const [optEnd,      setOptEnd]      = useState('')
  const [stemStartStr, setStemStartStr] = useState('')
  const [stemEndStr,   setStemEndStr]   = useState('')
  const [hasStemDeg,  setHasStemDeg]  = useState(null)
  const [eVerify,     setEVerify]     = useState(null)
  const [calculated,  setCalculated]  = useState(false)

  function handleOptEndChange(val) {
    setOptEnd(val)
    if (val) {
      const { stemStart, stemEnd } = calcStemDates(val)
      setStemStartStr(stemStart)
      setStemEndStr(stemEnd)
    } else {
      setStemStartStr('')
      setStemEndStr('')
    }
  }

  const result = useMemo(() => {
    if (!optEnd || !calculated) return null
    const optEndDate = new Date(optEnd)
    const applyBy    = addDays(optEndDate, -90)
    const stemStart  = addDays(optEndDate, 1)   // STEM OPT starts day AFTER OPT ends
    const stemEnd    = addDays(addMonths(stemStart, 24), -1)  // EAD expiry = day before 2yr anniversary
    const daysLeft   = daysFromNow(applyBy)
    const today      = new Date(); today.setHours(0,0,0,0)

    const eligible   = hasStemDeg === true && eVerify === true
    const maybeElig  = hasStemDeg === null || eVerify === null

    return {
      eligible, maybeElig,
      applyBy, stemStart, stemEnd, daysLeft,
      optEndDate,
      deadlinePassed: applyBy < today
    }
  }, [optEnd, hasStemDeg, eVerify, calculated])

  return (
    <div className={styles.tabContent}>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Your OPT details</div>
        <div className={styles.field}>
          <label className={styles.label}>OPT end date (EAD expiry)</label>
          <input type="date" className={styles.input}
            value={optEnd} onChange={e => handleOptEndChange(e.target.value)} />
        </div>

        {stemStartStr && (
          <div className={styles.field}>
            <div style={{
              background: 'var(--success-soft)',
              border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: '0.82rem',
              color: 'var(--success)',
            }}>
              ✓ STEM OPT start: <strong>{stemStartStr}</strong> → end: <strong>{stemEndStr}</strong>
              <div style={{fontSize:'0.75rem', color:'var(--text-muted)', marginTop:3}}>
                Auto-calculated · You can apply by {addDaysToStr(optEnd, -90)}
              </div>
            </div>
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label}>Do you have a STEM-designated degree?</label>
          <div className={styles.boolBtns}>
            <button className={`${styles.boolBtn} ${hasStemDeg === true ? styles.boolActive : ''}`}
              onClick={() => setHasStemDeg(true)}>✓ Yes</button>
            <button className={`${styles.boolBtn} ${hasStemDeg === false ? styles.boolNo : ''}`}
              onClick={() => setHasStemDeg(false)}>✗ No</button>
          </div>
          <p className={styles.fieldHint}>
            Check your CIP code at <a href="https://studyinthestates.dhs.gov/stem-opt-hub" target="_blank" rel="noreferrer"
              style={{color:'var(--accent)'}}>studyinthestates.dhs.gov</a>
          </p>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Is your employer E-Verify registered?</label>
          <div className={styles.boolBtns}>
            <button className={`${styles.boolBtn} ${eVerify === true ? styles.boolActive : ''}`}
              onClick={() => setEVerify(true)}>✓ Yes</button>
            <button className={`${styles.boolBtn} ${eVerify === false ? styles.boolNo : ''}`}
              onClick={() => setEVerify(false)}>✗ No / Unknown</button>
          </div>
          <p className={styles.fieldHint}>
            Verify at <a href="https://www.e-verify.gov/employers/e-verify-employer-search" target="_blank" rel="noreferrer"
              style={{color:'var(--accent)'}}>e-verify.gov</a>
          </p>
        </div>

        <button className={styles.calcBtn}
          onClick={() => setCalculated(true)} disabled={!optEnd}>
          Check STEM OPT eligibility
        </button>
      </div>

      {result && (
        <>
          {eVerify === false && (
            <div className={styles.alertCard} style={{borderColor:'var(--danger)'}}>
              ✗ <strong>Employer not E-Verify registered</strong> — STEM OPT requires your employer to be
              enrolled in E-Verify. Ask your HR team to register before you apply.
            </div>
          )}
          {hasStemDeg === false && (
            <div className={styles.alertCard} style={{borderColor:'var(--danger)'}}>
              ✗ <strong>Non-STEM degree</strong> — Only DHS-designated STEM degrees qualify.
              Check the STEM list with your DSO.
            </div>
          )}

          {result.eligible && (
            <div className={styles.statusCard}>
              <div className={styles.statusBadge} style={{color:'var(--success)',background:'var(--success-soft)'}}>
                ✓ Eligible for STEM OPT
              </div>
              <p className={styles.statusMsg} style={{color:'var(--success)'}}>
                You qualify for the 24-month STEM OPT extension
              </p>
            </div>
          )}

          <div className={styles.timelineCard}>
            <div className={styles.timelineTitle}>Key dates</div>
            {[
              { label: 'Apply by (90 days before OPT ends)', date: result.applyBy,
                urgent: result.daysLeft > 0 && result.daysLeft < 60,
                note: result.daysLeft > 0 ? `${result.daysLeft} days away` : 'Deadline passed' },
              { label: 'OPT end date',      date: result.optEndDate, note: 'Your current EAD expiry' },
              { label: 'STEM OPT start',   date: result.stemStart,  note: 'Day after OPT ends — apply before this' },
              { label: 'STEM OPT end',     date: result.stemEnd,    note: '24 months after STEM OPT starts' },
            ].map((item, i) => (
              <div key={i} className={`${styles.timelineRow} ${item.urgent ? styles.urgent : ''}`}>
                <div>
                  <div className={styles.timelineLabel}>{item.label}</div>
                  <div className={styles.timelineNote}>{item.note}</div>
                </div>
                <div className={styles.timelineDate}
                  style={{ color: item.urgent ? 'var(--warning)' : 'var(--text-primary)' }}>
                  {fmtDate(item.date)}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.requirementsCard}>
            <div className={styles.reqTitle}>STEM OPT requirements checklist</div>
            {[
              { text: 'Valid F-1 OPT status when you apply',                            ok: true },
              { text: 'STEM-designated degree (check DHS CIP code list)',               ok: hasStemDeg === true },
              { text: 'E-Verify registered employer (check e-verify.gov)',              ok: eVerify === true },
              { text: 'Form I-983 Training Plan — must be signed by employer',          ok: true },
              { text: 'Apply within 90 days of OPT end date',                          ok: !result.deadlinePassed },
              { text: 'DSO recommendation letter required',                             ok: true },
              { text: '150-day cumulative unemployment limit (includes OPT days)',      ok: true },
            ].map((r, i) => (
              <div key={i} className={`${styles.reqRow} ${!r.ok ? styles.reqFail : ''}`}>
                <span className={styles.reqCheck} style={{ color: r.ok ? 'var(--success)' : 'var(--danger)' }}>
                  {r.ok ? '✓' : '✗'}
                </span>
                <span style={{ color: r.ok ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                  {r.text}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── CPT Eligibility ───────────────────────────────────────────────
function CPTTab() {
  const [enrolledMonths, setEnrolledMonths] = useState('')
  const [calculated, setCalculated]         = useState(false)

  const result = useMemo(() => {
    if (!calculated) return null
    const months = parseInt(enrolledMonths) || 0
    return {
      eligible: months >= 9,
      months,
      ptRisk: months >= 12,
    }
  }, [enrolledMonths, calculated])

  return (
    <div className={styles.tabContent}>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Your enrollment details</div>
        <div className={styles.field}>
          <label className={styles.label}>Full-time enrollment duration (months)</label>
          <input type="number" min="0" max="120" className={styles.input}
            placeholder="e.g. 12" value={enrolledMonths}
            onChange={e => setEnrolledMonths(e.target.value)} />
          <p className={styles.fieldHint}>Must be enrolled full-time for at least 9 months to qualify</p>
        </div>
        <button className={styles.calcBtn}
          onClick={() => setCalculated(true)} disabled={!enrolledMonths}>
          Check CPT eligibility
        </button>
      </div>

      {result && (
        <>
          <div className={styles.statusCard}>
            <div className={styles.statusBadge}
              style={{ color: result.eligible ? 'var(--success)' : 'var(--danger)',
                       background: result.eligible ? 'var(--success-soft)' : 'var(--danger-soft)' }}>
              {result.eligible ? '✓ Eligible for CPT' : '✗ Not yet eligible'}
            </div>
            <p className={styles.statusMsg}
              style={{ color: result.eligible ? 'var(--success)' : 'var(--danger)' }}>
              {result.eligible
                ? `${result.months} months enrolled — you qualify for CPT`
                : `${result.months} months enrolled — need at least 9 months`}
            </p>
          </div>

          {result.ptRisk && (
            <div className={styles.alertCard} style={{ borderColor: 'var(--warning)' }}>
              ⚠ <strong>12+ months full-time CPT makes you ineligible for OPT.</strong> Track your
              CPT duration carefully with your DSO.
            </div>
          )}

          <div className={styles.requirementsCard}>
            <div className={styles.reqTitle}>CPT requirements checklist</div>
            {[
              { text: `Full-time enrollment ≥ 9 months (you have ${result.months})`, ok: result.months >= 9 },
              { text: 'Work must be integral part of established curriculum',          ok: true },
              { text: 'DSO authorization required each semester (listed on I-20)',    ok: true },
              { text: 'No unemployment day limit — authorization is semester-based',  ok: true },
              { text: '12+ months full-time CPT = OPT ineligible (track carefully)',  ok: !result.ptRisk },
            ].map((r, i) => (
              <div key={i} className={`${styles.reqRow} ${!r.ok ? styles.reqFail : ''}`}>
                <span className={styles.reqCheck}
                  style={{ color: r.ok ? 'var(--success)' : 'var(--warning)' }}>
                  {r.ok ? '✓' : '⚠'}
                </span>
                <span>{r.text}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────
export default function EligibilityPage() {
  const [activeTab, setActiveTab] = useState('opt')

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Eligibility Planner</h1>
        <p className={styles.subtitle}>
          Check your OPT, STEM OPT, and CPT eligibility with key dates and deadlines
        </p>
      </div>

      <div className={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'opt'  && <OPTTab />}
      {activeTab === 'stem' && <STEMTab />}
      {activeTab === 'cpt'  && <CPTTab />}
    </div>
  )
}