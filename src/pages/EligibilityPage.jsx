import { useState, useMemo } from 'react'
import styles from './EligibilityPage.module.css'

// ── Date helpers ──────────────────────────────────────────────────
function parseDate(s) {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function addMonths(d, n) { const r = new Date(d); r.setMonth(r.getMonth() + n); return r }
function fmtDate(d) {
  if (!d) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function daysUntil(d) {
  const today = new Date(); today.setHours(0,0,0,0)
  return Math.round((d - today) / 86400000)
}
function daysUntilLabel(d) {
  const n = daysUntil(d)
  if (n < 0)  return { label: `${Math.abs(n)} days ago`, past: true }
  if (n === 0) return { label: 'Today', past: false }
  return { label: `in ${n} days`, past: false }
}

// ── STEM CIP codes (sample — common STEM degrees) ─────────────────
const STEM_DEGREES = [
  'Computer Science / Computer Engineering',
  'Electrical Engineering',
  'Mechanical Engineering',
  'Chemical Engineering',
  'Civil Engineering',
  'Biomedical Engineering',
  'Data Science / Statistics',
  'Mathematics / Applied Mathematics',
  'Physics / Astrophysics',
  'Biology / Biochemistry',
  'Information Technology / MIS',
  'Cybersecurity',
  'Aerospace Engineering',
  'Environmental Science / Engineering',
  'Other STEM (verify with DSO)',
]

// ── OPT Eligibility Calculator ────────────────────────────────────
function calcOPTEligibility(gradDate, enrolledMonths, prevOPTUsed) {
  if (!gradDate) return null
  const today = new Date(); today.setHours(0,0,0,0)

  // Must have been enrolled full-time for at least 1 academic year (9 months)
  const enrollmentOk = enrolledMonths >= 9

  // Application window: 90 days before graduation up to 60 days after
  const earliestApply = addDays(gradDate, -90)
  const latestApply   = addDays(gradDate, 60)
  const optStartLatest = addDays(gradDate, 60)  // OPT must start within 60 days of graduation

  // EAD processing: USCIS currently ~3-5 months (use 4 months as estimate)
  const EAD_PROCESSING_DAYS = 120
  const recommendedApplyBy = addDays(gradDate, -EAD_PROCESSING_DAYS)
  const estimatedEADDate   = addDays(today > earliestApply ? today : earliestApply, EAD_PROCESSING_DAYS)

  // OPT end date = 12 months from OPT start (assume start = grad date)
  const optEndDate = addMonths(gradDate, 12)

  const canApplyNow = today >= earliestApply && today <= latestApply
  const windowOpen  = today >= earliestApply
  const daysToWindow = daysUntil(earliestApply)

  return {
    enrollmentOk,
    earliestApply,
    latestApply,
    recommendedApplyBy,
    estimatedEADDate,
    optEndDate,
    canApplyNow,
    windowOpen,
    daysToWindow,
    prevOPTUsed,
    eligible: enrollmentOk && !prevOPTUsed,
  }
}

// ── STEM OPT Eligibility Calculator ──────────────────────────────
function calcSTEMEligibility(optEndDate, isStemDegree, employerEVerify, prevExtUsed) {
  if (!optEndDate) return null
  const today = new Date(); today.setHours(0,0,0,0)

  // Must apply 90 days before OPT expires
  const earliestApply     = addDays(optEndDate, -90)
  const latestApply       = addDays(optEndDate, -1)
  const EAD_PROCESSING    = 90 // STEM OPT EAD typically faster ~3 months
  const recommendedApplyBy = addDays(optEndDate, -EAD_PROCESSING)
  const stemEndDate       = addMonths(optEndDate, 24)

  const canApplyNow  = today >= earliestApply && today <= latestApply
  const windowOpen   = today >= earliestApply
  const daysToWindow = daysUntil(earliestApply)

  return {
    isStemDegree,
    employerEVerify,
    prevExtUsed,
    earliestApply,
    latestApply,
    recommendedApplyBy,
    stemEndDate,
    canApplyNow,
    windowOpen,
    daysToWindow,
    eligible: isStemDegree && employerEVerify && !prevExtUsed,
  }
}

// ── H-1B Lottery Tracker ──────────────────────────────────────────
const H1B_LOTTERY_YEARS = [2020,2021,2022,2023,2024,2025,2026]
const CURRENT_YEAR = new Date().getFullYear()
const LOTTERY_REGISTRATION_MONTH = 2 // March (0-indexed)
const LOTTERY_START_DATE = new Date(CURRENT_YEAR, LOTTERY_REGISTRATION_MONTH, 1)

function calcH1BStatus({
  i94Expiry, mastersDegree, capExempt, attempts, i94ExtendedBy
}) {
  if (!i94Expiry) return null
  const today = new Date(); today.setHours(0,0,0,0)

  // H-1B cap year runs Oct 1 → Sep 30
  // Registration opens in March each year for Oct 1 start
  // Last eligible lottery year = the year before I-94 expires
  // (need to be in valid status during registration window)
  const expiryYear = i94Expiry.getFullYear()
  const expiryMonth = i94Expiry.getMonth()

  // Can register in March of a year if I-94 is valid through at least Oct 1 of that year
  let lastEligibleLotteryYear = expiryYear
  if (expiryMonth < 9) lastEligibleLotteryYear = expiryYear - 1 // before Oct 1

  const futureAttempts = []
  for (let yr = CURRENT_YEAR; yr <= lastEligibleLotteryYear + 1; yr++) {
    const regDate    = new Date(yr, 2, 1)   // March 1
    const startDate  = new Date(yr, 9, 1)   // Oct 1
    if (startDate > i94Expiry) break
    if (!attempts.includes(yr)) {
      futureAttempts.push({ year: yr, regDate, startDate })
    }
  }

  const totalAttempted = attempts.length
  const totalRemaining = futureAttempts.length
  const nextLottery    = futureAttempts[0] || null
  const daysToNext     = nextLottery ? daysUntil(nextLottery.regDate) : null

  // Cap-exempt employers: universities, non-profits affiliated with universities,
  // government research orgs — can file any time, no lottery
  return {
    mastersDegree,
    capExempt,
    i94Expiry,
    attempts,
    totalAttempted,
    totalRemaining,
    futureAttempts,
    nextLottery,
    daysToNext,
    lastEligibleLotteryYear,
    // Masters cap: separate 20k quota on top of 65k regular cap
    mastersAdvantage: mastersDegree ? 'Two chances per lottery (masters cap + regular cap)' : 'One chance per lottery (regular cap only)',
  }
}

// ── Checklist Item ────────────────────────────────────────────────
function CheckItem({ ok, text, note }) {
  return (
    <div className={`${styles.checkItem} ${ok ? styles.checkOk : styles.checkNo}`}>
      <span className={styles.checkIcon}>{ok ? '✓' : '✗'}</span>
      <div>
        <span className={styles.checkText}>{text}</span>
        {note && <span className={styles.checkNote}>{note}</span>}
      </div>
    </div>
  )
}

// ── Countdown chip ────────────────────────────────────────────────
function Countdown({ date, label }) {
  if (!date) return null
  const { label: l, past } = daysUntilLabel(date)
  return (
    <div className={styles.countdownChip}>
      <span className={styles.countdownLabel}>{label}</span>
      <span className={styles.countdownDate}>{fmtDate(date)}</span>
      <span className={`${styles.countdownBadge} ${past ? styles.past : ''}`}>{l}</span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────
export default function EligibilityPage() {
  const [activeTab, setActiveTab] = useState('opt')

  // OPT state
  const [gradDate,       setGradDate]       = useState('')
  const [enrolledMonths, setEnrolledMonths] = useState('12')
  const [prevOPTUsed,    setPrevOPTUsed]    = useState(false)
  const [optCalculated,  setOptCalculated]  = useState(false)

  // STEM state
  const [optEnd,         setOptEnd]         = useState('')
  const [stemDegree,     setStemDegree]      = useState('')
  const [eVerify,        setEVerify]         = useState(false)
  const [prevStemUsed,   setPrevStemUsed]    = useState(false)
  const [stemCalculated, setStemCalculated]  = useState(false)

  // H-1B state
  const [i94Expiry,      setI94Expiry]      = useState('')
  const [i94Extended,    setI94Extended]    = useState('')
  const [mastersDeg,     setMastersDeg]     = useState(false)
  const [capExempt,      setCapExempt]      = useState(false)
  const [attemptYears,   setAttemptYears]   = useState([])
  const [h1bCalculated,  setH1bCalculated]  = useState(false)

  const optResult  = useMemo(() => optCalculated  ? calcOPTEligibility(parseDate(gradDate), parseInt(enrolledMonths)||0, prevOPTUsed) : null,
    [optCalculated, gradDate, enrolledMonths, prevOPTUsed])

  const stemResult = useMemo(() => stemCalculated ? calcSTEMEligibility(parseDate(optEnd), !!stemDegree, eVerify, prevStemUsed) : null,
    [stemCalculated, optEnd, stemDegree, eVerify, prevStemUsed])

  const h1bResult  = useMemo(() => h1bCalculated  ? calcH1BStatus({
    i94Expiry: parseDate(i94Extended || i94Expiry),
    mastersDegree: mastersDeg, capExempt, attempts: attemptYears
  }) : null, [h1bCalculated, i94Expiry, i94Extended, mastersDeg, capExempt, attemptYears])

  function toggleAttempt(yr) {
    setAttemptYears(prev => prev.includes(yr) ? prev.filter(y => y !== yr) : [...prev, yr])
    setH1bCalculated(false)
  }

  const TABS = [
    { id: 'opt',  label: 'OPT Eligibility'      },
    { id: 'stem', label: 'STEM OPT Eligibility'  },
  
  ]

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Eligibility Planner</h1>
        <p className={styles.subtitle}>Check when you can apply, track deadlines, and plan your H-1B lottery attempts</p>
      </div>

      {/* Sub-tabs */}
      <div className={styles.subTabs}>
        {TABS.map(t => (
          <button key={t.id}
            className={`${styles.subTab} ${activeTab === t.id ? styles.subTabActive : ''}`}
            onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OPT ELIGIBILITY ── */}
      {activeTab === 'opt' && (
        <div className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Your details</div>

            <div className={styles.field}>
              <label className={styles.label}>Program end / graduation date</label>
              <input type="date" className={styles.input} value={gradDate}
                onChange={e => { setGradDate(e.target.value); setOptCalculated(false) }} />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Full-time enrollment duration (months)</label>
              <input type="number" min="0" max="120" className={styles.input}
                value={enrolledMonths}
                onChange={e => { setEnrolledMonths(e.target.value); setOptCalculated(false) }} />
              <p className={styles.hint}>Must be at least 9 months to qualify for OPT</p>
            </div>

            <label className={styles.toggle}>
              <input type="checkbox" checked={prevOPTUsed}
                onChange={e => { setPrevOPTUsed(e.target.checked); setOptCalculated(false) }} />
              <span>I have already used OPT at this degree level</span>
            </label>

            <button className={styles.calcBtn} onClick={() => setOptCalculated(true)}>
              Check OPT eligibility
            </button>
          </div>

          <div>
            {!optResult ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>🎓</div>
                <p>Enter your graduation date to see your OPT application window.</p>
              </div>
            ) : (
              <div className={styles.results}>
                {/* Eligibility verdict */}
                <div className={`${styles.verdict} ${optResult.eligible ? styles.verdictOk : styles.verdictNo}`}>
                  <span className={styles.verdictIcon}>{optResult.eligible ? '✓' : '✗'}</span>
                  <div>
                    <div className={styles.verdictTitle}>
                      {optResult.eligible ? 'Eligible for OPT' : 'Not currently eligible'}
                    </div>
                    <div className={styles.verdictSub}>
                      {!optResult.enrollmentOk && 'Requires at least 9 months full-time enrollment. '}
                      {optResult.prevOPTUsed && 'OPT already used at this degree level. '}
                      {optResult.eligible && 'You meet the basic eligibility requirements.'}
                    </div>
                  </div>
                </div>

                {/* Checklist */}
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>Requirements checklist</div>
                  <CheckItem ok={optResult.enrollmentOk}
                    text="Full-time enrollment ≥ 9 months"
                    note={`You entered ${enrolledMonths} months`} />
                  <CheckItem ok={!optResult.prevOPTUsed}
                    text="OPT not previously used at this degree level"
                    note="One OPT per degree level (bachelor's, master's, PhD)" />
                  <CheckItem ok={true}
                    text="Valid F-1 status"
                    note="Verify with your DSO" />
                  <CheckItem ok={true}
                    text="SEVIS record in good standing"
                    note="No violations or unauthorized employment" />
                </div>

                {/* Timeline */}
                {optResult.eligible && (
                  <div className={styles.section}>
                    <div className={styles.sectionTitle}>Application timeline</div>
                    <Countdown date={optResult.recommendedApplyBy} label="⭐ Recommended — apply by (for on-time EAD)" />
                    <Countdown date={optResult.earliestApply}      label="Earliest you can apply" />
                    <Countdown date={parseDate(gradDate)}          label="Graduation / program end" />
                    <Countdown date={optResult.latestApply}        label="Latest you can apply" />
                    <Countdown date={optResult.estimatedEADDate}   label="Estimated EAD receipt (~4 months processing)" />
                    <Countdown date={optResult.optEndDate}         label="OPT expires (~12 months from graduation)" />

                    <div className={styles.infoBox}>
                      <strong>⏱ EAD processing note:</strong> USCIS is currently processing OPT EADs in approximately 3–5 months.
                      Apply as close to 90 days before graduation as possible to avoid gaps.
                      Premium processing is not available for OPT.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── STEM OPT ELIGIBILITY ── */}
      {activeTab === 'stem' && (
        <div className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Your details</div>

            <div className={styles.field}>
              <label className={styles.label}>Current OPT end date (EAD expiry)</label>
              <input type="date" className={styles.input} value={optEnd}
                onChange={e => { setOptEnd(e.target.value); setStemCalculated(false) }} />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Your degree field</label>
              <select className={styles.select} value={stemDegree}
                onChange={e => { setStemDegree(e.target.value); setStemCalculated(false) }}>
                <option value="">Select your degree field…</option>
                {STEM_DEGREES.map(d => <option key={d} value={d}>{d}</option>)}
                <option value="non-stem">Non-STEM degree</option>
              </select>
              <p className={styles.hint}>Must be a DHS-designated STEM field (CIP code list)</p>
            </div>

            <label className={styles.toggle}>
              <input type="checkbox" checked={eVerify}
                onChange={e => { setEVerify(e.target.checked); setStemCalculated(false) }} />
              <span>My employer is E-Verify registered</span>
            </label>
            <p className={styles.hint} style={{marginTop: -8, marginLeft: 24}}>
              Check at <a href="https://www.e-verify.gov/employers/employer-search" target="_blank" rel="noreferrer" style={{color:'var(--accent)'}}>e-verify.gov</a>
            </p>

            <label className={styles.toggle}>
              <input type="checkbox" checked={prevStemUsed}
                onChange={e => { setPrevStemUsed(e.target.checked); setStemCalculated(false) }} />
              <span>I have already used a STEM OPT extension</span>
            </label>
            <p className={styles.hint} style={{marginTop: -8, marginLeft: 24}}>
              Only one 24-month STEM extension is allowed per degree level
            </p>

            <button className={styles.calcBtn} onClick={() => setStemCalculated(true)}>
              Check STEM OPT eligibility
            </button>
          </div>

          <div>
            {!stemResult ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>🔬</div>
                <p>Enter your OPT end date and degree details to check STEM OPT eligibility.</p>
              </div>
            ) : (
              <div className={styles.results}>
                <div className={`${styles.verdict} ${stemResult.eligible ? styles.verdictOk : styles.verdictNo}`}>
                  <span className={styles.verdictIcon}>{stemResult.eligible ? '✓' : '✗'}</span>
                  <div>
                    <div className={styles.verdictTitle}>
                      {stemResult.eligible ? 'Eligible for STEM OPT Extension' : 'Not currently eligible'}
                    </div>
                    <div className={styles.verdictSub}>
                      {!stemResult.isStemDegree && 'Degree must be a DHS-designated STEM field. '}
                      {!stemResult.employerEVerify && 'Employer must be E-Verify registered. '}
                      {stemResult.prevExtUsed && 'STEM extension already used at this degree level. '}
                      {stemResult.eligible && '24-month extension available.'}
                    </div>
                  </div>
                </div>

                <div className={styles.section}>
                  <div className={styles.sectionTitle}>Requirements checklist</div>
                  <CheckItem ok={stemResult.isStemDegree && stemDegree !== 'non-stem'}
                    text="DHS-designated STEM degree"
                    note={stemDegree || 'Select your degree field'} />
                  <CheckItem ok={stemResult.employerEVerify}
                    text="Employer is E-Verify registered"
                    note="Required — verify at e-verify.gov" />
                  <CheckItem ok={!stemResult.prevExtUsed}
                    text="STEM extension not previously used at this level"
                    note="One 24-month extension per degree level" />
                  <CheckItem ok={true}
                    text="Valid OPT EAD and F-1 status"
                    note="Must be in valid OPT status when applying" />
                  <CheckItem ok={true}
                    text="Training Plan (Form I-983) completed"
                    note="Required — employer must sign and submit to DSO" />
                </div>

                {stemResult.eligible && (
                  <div className={styles.section}>
                    <div className={styles.sectionTitle}>Application timeline</div>
                    <Countdown date={stemResult.recommendedApplyBy} label="⭐ Recommended — apply by (avoid OPT gap)" />
                    <Countdown date={stemResult.earliestApply}      label="Earliest you can apply (90 days before OPT ends)" />
                    <Countdown date={parseDate(optEnd)}             label="Current OPT expires" />
                    <Countdown date={stemResult.stemEndDate}        label="STEM OPT expires (+24 months)" />

                    <div className={styles.infoBox}>
                      <strong>⚠ Important:</strong> Apply at least 90 days before your OPT expires.
                      If your STEM EAD is still pending when OPT expires, your 180-day cap-gap may apply.
                      Work with your DSO and file early.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── H-1B LOTTERY TRACKER ── */}
      {activeTab === 'h1b' && (
        <div className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Your details</div>

            <div className={styles.field}>
              <label className={styles.label}>Current I-94 / status expiry</label>
              <input type="date" className={styles.input} value={i94Expiry}
                onChange={e => { setI94Expiry(e.target.value); setH1bCalculated(false) }} />
              <p className={styles.hint}>Found at i94.cbp.dhs.gov or on your visa stamp / approval notice</p>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Extended status expiry (if renewed)</label>
              <input type="date" className={styles.input} value={i94Extended}
                onChange={e => { setI94Extended(e.target.value); setH1bCalculated(false) }} />
              <p className={styles.hint}>Leave blank if not extended yet — enter your latest authorized stay</p>
            </div>

            <label className={styles.toggle}>
              <input type="checkbox" checked={mastersDeg}
                onChange={e => { setMastersDeg(e.target.checked); setH1bCalculated(false) }} />
              <span>I have a US Master's degree or higher</span>
            </label>
            <p className={styles.hint} style={{marginTop: -8, marginLeft: 24}}>
              Qualifies for masters cap (20k extra slots) — two lottery entries per year
            </p>

            <label className={styles.toggle}>
              <input type="checkbox" checked={capExempt}
                onChange={e => { setCapExempt(e.target.checked); setH1bCalculated(false) }} />
              <span>My employer is cap-exempt</span>
            </label>
            <p className={styles.hint} style={{marginTop: -8, marginLeft: 24}}>
              Universities, non-profits affiliated with universities, government research orgs
            </p>

            <div className={styles.field}>
              <label className={styles.label}>Years I entered the H-1B lottery</label>
              <div className={styles.yearGrid}>
                {H1B_LOTTERY_YEARS.map(yr => (
                  <button key={yr}
                    className={`${styles.yearBtn} ${attemptYears.includes(yr) ? styles.yearSelected : ''}`}
                    onClick={() => toggleAttempt(yr)}>
                    {yr}
                    {attemptYears.includes(yr) && <span className={styles.yearCheck}>✓</span>}
                  </button>
                ))}
              </div>
              <p className={styles.hint}>Tap the years you registered — even if you didn't win</p>
            </div>

            <button className={styles.calcBtn} onClick={() => setH1bCalculated(true)}>
              Calculate remaining attempts
            </button>
          </div>

          <div>
            {!h1bResult ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>🎰</div>
                <p>Enter your I-94 expiry and lottery history to see your remaining H-1B chances.</p>
              </div>
            ) : capExempt ? (
              <div className={`${styles.verdict} ${styles.verdictOk}`} style={{marginBottom: 0}}>
                <span className={styles.verdictIcon}>⭐</span>
                <div>
                  <div className={styles.verdictTitle}>Cap-exempt — no lottery needed!</div>
                  <div className={styles.verdictSub}>
                    Your employer can file an H-1B petition at any time without going through the annual lottery.
                    Work with your employer's immigration attorney to file directly.
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.results}>
                {/* Summary cards */}
                <div className={styles.h1bMetrics}>
                  <div className={styles.h1bMetric}>
                    <div className={styles.h1bMetricLabel}>Attempts used</div>
                    <div className={styles.h1bMetricVal} style={{color:'var(--text-secondary)'}}>
                      {h1bResult.totalAttempted}
                    </div>
                  </div>
                  <div className={styles.h1bMetric}>
                    <div className={styles.h1bMetricLabel}>Remaining attempts</div>
                    <div className={styles.h1bMetricVal}
                      style={{color: h1bResult.totalRemaining === 0 ? 'var(--danger)' : h1bResult.totalRemaining <= 2 ? 'var(--warning)' : 'var(--success)'}}>
                      {h1bResult.totalRemaining}
                    </div>
                  </div>
                  <div className={styles.h1bMetric}>
                    <div className={styles.h1bMetricLabel}>Last eligible year</div>
                    <div className={styles.h1bMetricVal} style={{color:'var(--text-primary)'}}>
                      {h1bResult.lastEligibleLotteryYear}
                    </div>
                  </div>
                  <div className={styles.h1bMetric}>
                    <div className={styles.h1bMetricLabel}>Lottery entries/year</div>
                    <div className={styles.h1bMetricVal} style={{color: mastersDeg ? 'var(--success)' : 'var(--text-secondary)'}}>
                      {mastersDeg ? '2x' : '1x'}
                    </div>
                  </div>
                </div>

                {/* Masters advantage */}
                <div className={styles.infoBox} style={{marginBottom:'1rem'}}>
                  🎓 {h1bResult.mastersAdvantage}
                  {mastersDeg && ' — your US master\'s degree gives you an extra entry in the masters cap pool (20k additional slots).'}
                </div>

                {/* I-94 expiry */}
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>Status validity</div>
                  <Countdown
                    date={parseDate(i94Extended || i94Expiry)}
                    label="Current authorized stay expires" />
                  {h1bResult.totalRemaining === 0 && (
                    <div className={styles.warningBox}>
                      ⚠ No remaining lottery attempts before your status expires.
                      Consider extending your F-1/OPT, changing employers (cap-exempt),
                      or exploring other visa options (O-1, EB-2 NIW).
                    </div>
                  )}
                </div>

                {/* Future attempts timeline */}
                {h1bResult.futureAttempts.length > 0 && (
                  <div className={styles.section}>
                    <div className={styles.sectionTitle}>Upcoming lottery windows</div>
                    {h1bResult.futureAttempts.map((a, i) => {
                      const { label: dl } = daysUntilLabel(a.regDate)
                      const isNext = i === 0
                      return (
                        <div key={a.year} className={`${styles.lotteryRow} ${isNext ? styles.lotteryNext : ''}`}>
                          <div className={styles.lotteryLeft}>
                            <span className={styles.lotteryYear}>{a.year}</span>
                            <div>
                              <div className={styles.lotteryLabel}>
                                {isNext ? '⭐ Next lottery' : `${a.year} lottery`}
                              </div>
                              <div className={styles.lotteryDates}>
                                Registration opens {fmtDate(a.regDate)} · H-1B starts {fmtDate(a.startDate)}
                              </div>
                            </div>
                          </div>
                          <span className={`${styles.deadlineBadge2} ${isNext ? styles.badgeNext : ''}`}>
                            {dl}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Past attempts */}
                {h1bResult.attempts.length > 0 && (
                  <div className={styles.section}>
                    <div className={styles.sectionTitle}>Past lottery attempts</div>
                    <div className={styles.yearGrid} style={{marginTop: 8}}>
                      {h1bResult.attempts.sort().map(yr => (
                        <div key={yr} className={styles.pastAttempt}>{yr} ✓</div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Odds context */}
                <div className={styles.infoBox}>
                  📊 <strong>Lottery odds context:</strong> Regular cap selection rate has been ~20–30% in recent years.
                  Masters cap holders get two draws, boosting combined odds to ~35–45%.
                  Each year you don't win, consider cap-exempt opportunities to bridge the gap.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}