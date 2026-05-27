import { useState, useMemo } from 'react'
import { parseLocalDate, calcUnemployment, diffDays, VISA_RULES } from '../utils/visaCalc.js'
import styles from './TrackerPage.module.css'
import { supabase } from '../auth/supabase.js'
import { calcStemDates, calcOptEnd } from '../utils/stemDates.js'

const STATUS_META = {
  ok:       { color: 'var(--success)', bg: 'var(--success-soft)', label: 'Within limits'    },
  warn:     { color: 'var(--warning)', bg: 'var(--warning-soft)', label: 'Watch closely'     },
  urgent:   { color: 'var(--warning)', bg: 'var(--warning-soft)', label: 'Approaching limit' },
  critical: { color: 'var(--danger)',  bg: 'var(--danger-soft)',  label: 'Critical'          },
  over:     { color: 'var(--danger)',  bg: 'var(--danger-soft)',  label: 'Limit exceeded'    },
}

function fmtDate(d) {
  return d?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) ?? '—'
}

function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

// Given current unemployment days used + auth end date,
// calculate the date the limit will be hit if unemployment continues from today
function calcDeadline(countable, limit, authEnd) {
  if (!limit || countable >= limit) return null
  const remaining = limit - countable
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const deadline = addDays(today, remaining)
  // Cap at auth end date
  if (authEnd && deadline > authEnd) return null
  return deadline
}

// Build milestone markers — works for both hard limits and advisory thresholds
function calcMilestones(countable, limit, authEnd, rule) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const milestones = []

  if (limit) {
    // Hard limit: show "X days remaining" milestones
    for (const daysLeft of (rule?.milestones || [60, 30])) {
      const atDay = limit - daysLeft
      if (atDay > countable) {
        const daysUntil = atDay - countable
        const date = addDays(today, daysUntil)
        if (!authEnd || date <= authEnd) {
          milestones.push({ label: `${daysLeft} days remaining (${atDay}/${limit} used)`, date, daysUntil, level: daysLeft <= 30 ? 'urgent' : 'warn' })
        }
      }
    }
  } else if (rule?.thresholds) {
    // Advisory: show threshold milestone dates
    const t = rule.thresholds
    const levels = [
      { day: t.warn,     label: `Advisory: ${t.warn}-day gap`,     level: 'warn'     },
      { day: t.urgent,   label: `Advisory: ${t.urgent}-day gap`,   level: 'urgent'   },
      { day: t.critical, label: `Advisory: ${t.critical}-day gap`, level: 'critical' },
    ]
    for (const l of levels) {
      if (l.day > countable) {
        const daysUntil = l.day - countable
        const date = addDays(today, daysUntil)
        if (!authEnd || date <= authEnd) {
          milestones.push({ label: l.label, date, daysUntil, level: l.level })
        }
      }
    }
  }
  return milestones
}

let _id = 0
const newPeriod = () => ({ id: ++_id, startStr: '', endStr: '' })

function calcOptCarryOver(optAuthStartStr, optAuthEndStr, optPeriods) {
  const authStart = parseLocalDate(optAuthStartStr)
  const authEnd   = parseLocalDate(optAuthEndStr)
  if (!authStart || !authEnd) return 0
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const nextDay = d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n }
  // Only add +1 when authEnd is in the past (to include that final day).
  // When authEnd is today or future, use today as-is — no +1 needed.
  const calcEnd = authEnd < today ? nextDay(authEnd) : today
  const sorted = optPeriods
    .filter(p => p.startStr)
    .map(p => ({ start: parseLocalDate(p.startStr), end: parseLocalDate(p.endStr) || today }))
    .sort((a, b) => a.start - b.start)
  const merged = []
  for (const p of sorted) {
    const s = p.start < authStart ? authStart : p.start
    const e = p.end   > calcEnd   ? calcEnd   : p.end
    if (e <= s) continue
    if (merged.length && s <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = e > merged[merged.length - 1].end ? e : merged[merged.length - 1].end
    } else {
      merged.push({ start: new Date(s), end: new Date(e) })
    }
  }
  // Count gap days the same way as visaCalc — gap starts day AFTER job ends
  let gapDays = 0
  let cursor = authStart
  for (const p of merged) {
    if (p.start > cursor) gapDays += diffDays(cursor, p.start)
    const dayAfterEnd = nextDay(p.end)
    if (dayAfterEnd > cursor) cursor = dayAfterEnd
  }
  if (cursor < calcEnd) gapDays += diffDays(cursor, calcEnd)
  return Math.max(0, gapDays)
}

// Date auto-calc helpers
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

export default function TrackerPage({ initialData }) {
  // Tracker starts empty — fresh calculation tool
  // Only pre-select visa type from onboarding
  const [visaType, setVisaType]     = useState(initialData?.visa_type || 'opt')
  const [authStart, setAuthStart]   = useState('')
  const [authEnd, setAuthEnd]       = useState('')
  const [periods, setPeriods]       = useState([newPeriod()])
  const [calculated, setCalculated] = useState(false)
  const [optAuthStart, setOptAuthStart] = useState('')
  const [optAuthEnd, setOptAuthEnd]     = useState('')

  // Auto-calculate OPT end when OPT/auth start is entered
  function handleAuthStartChange(val) {
    setAuthStart(val)
    if (visaType === 'opt' && val && !authEnd) {
      setAuthEnd(calcOptEnd(val))
    }
  }

  // Auto-calculate OPT end when OPT authorization start (for STEM carry-over) changes
  function handleOptAuthStartChange(val) {
    setOptAuthStart(val)
    if (visaType === 'stem' && val) {
      const optEnd = calcOptEnd(val)
      setOptAuthEnd(optEnd)
      const { stemStart, stemEnd } = calcStemDates(optEnd)
      setAuthStart(stemStart)
      setAuthEnd(stemEnd)
    }
  }

  // Auto-calculate STEM dates when OPT end date changes
  function handleOptEndChange(val) {
    setOptAuthEnd(val)
    if (visaType === 'stem' && val) {
      const { stemStart, stemEnd } = calcStemDates(val)
      setAuthStart(stemStart)
      setAuthEnd(stemEnd)
    }
  }
  const [optPeriods, setOptPeriods]     = useState([newPeriod()])

  const addPeriod    = () => setPeriods(p => [...p, newPeriod()])
  const removePeriod = id => setPeriods(p => p.filter(x => x.id !== id))
  const updatePeriod = (id, field, val) =>
    setPeriods(p => p.map(x => x.id === id ? { ...x, [field]: val } : x))
  const addOptPeriod    = () => setOptPeriods(p => [...p, newPeriod()])
  const removeOptPeriod = id => setOptPeriods(p => p.filter(x => x.id !== id))
  const updateOptPeriod = (id, field, val) =>
    setOptPeriods(p => p.map(x => x.id === id ? { ...x, [field]: val } : x))

  const optCarryOver = useMemo(() => {
    if (visaType !== 'stem') return 0
    return calcOptCarryOver(optAuthStart, optAuthEnd, optPeriods)
  }, [visaType, optAuthStart, optAuthEnd, optPeriods])

  const result = useMemo(() => {
    if (!calculated) return null
    return calcUnemployment({
      authStart: parseLocalDate(authStart),
      authEnd:   parseLocalDate(authEnd),
      employmentPeriods: periods.map(p => ({
        start: parseLocalDate(p.startStr),
        end:   parseLocalDate(p.endStr) || null
      })),
      visaType,
      optUnemployedDays: optCarryOver
    })
  }, [calculated, authStart, authEnd, periods, visaType, optCarryOver])

  const meta = result ? STATUS_META[result.status] : null
  const rule = VISA_RULES[visaType]

  // Save updated data back to Supabase when user recalculates
  async function handleSave() {
    setCalculated(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await supabase.from('user_visa_data').update({
        visa_type:   visaType,
        auth_start:  authStart || null,
        auth_end:    authEnd   || null,
        employment_periods: periods.map(p => ({ start: p.startStr, end: p.endStr })),
        opt_auth_start: optAuthStart || null,
        opt_auth_end:   optAuthEnd   || null,
        opt_periods: optPeriods.map(p => ({ start: p.startStr, end: p.endStr })),
        updated_at: new Date().toISOString(),
      }).eq('user_id', session.user.id)
    } catch (err) {
      console.warn('[tracker] Auto-save failed:', err.message)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Status Tracker</h1>
        <p className={styles.subtitle}>Calculate your unemployment days and compliance window</p>
      </div>

      <div className={styles.formCard}>
          <div className={styles.section}>
            <label className={styles.label}>Visa / Authorization type</label>
            <select className={styles.select} value={visaType}
              onChange={e => { setVisaType(e.target.value); setCalculated(false) }}>
              {Object.entries(VISA_RULES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <p className={styles.hint}>{rule.description}</p>
          </div>

          {visaType === 'stem' && (
            <div className={styles.optBlock}>
              <div className={styles.optBlockHeader}>
                <span className={styles.optBlockTitle}>Initial OPT period</span>
                <span className={styles.optBadge}>
                  {optCarryOver} day{optCarryOver !== 1 ? 's' : ''} carry-over
                </span>
              </div>
              <p className={styles.hint} style={{ marginBottom: 10 }}>
                Enter your initial OPT authorization dates and employment history — we'll automatically calculate the unemployment days that carry into your 150-day STEM limit.
              </p>
              <div className={styles.row2} style={{ marginBottom: 10 }}>
                <div>
                  <label className={styles.miniLabel}>OPT auth start</label>
                  <input type="date" className={styles.input} value={optAuthStart}
                    onChange={e => { handleOptAuthStartChange(e.target.value); setCalculated(false) }} />
                </div>
                <div>
                  <label className={styles.miniLabel}>OPT auth end</label>
                  <input type="date" className={styles.input} value={optAuthEnd}
                    onChange={e => { handleOptEndChange(e.target.value); setCalculated(false) }} />
                </div>
              </div>
              <div className={styles.sectionHead} style={{ marginBottom: 6 }}>
                <label className={styles.miniLabel}>OPT employment periods</label>
                <button className={styles.addBtn} onClick={addOptPeriod}>+ Add</button>
              </div>
              {optPeriods.map(p => (
                <div key={p.id} className={styles.periodRow} style={{ marginBottom: 6 }}>
                  <div>
                    <label className={styles.miniLabel}>Start</label>
                    <input type="date" className={styles.input} value={p.startStr}
                      onChange={e => { updateOptPeriod(p.id, 'startStr', e.target.value); setCalculated(false) }} />
                  </div>
                  <div>
                    <label className={styles.miniLabel}>End</label>
                    <input type="date" className={styles.input} value={p.endStr}
                      onChange={e => { updateOptPeriod(p.id, 'endStr', e.target.value); setCalculated(false) }} />
                  </div>
                  {optPeriods.length > 1 && (
                    <button className={styles.delBtn} onClick={() => removeOptPeriod(p.id)}>×</button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className={styles.row2}>
            <div>
              <label className={styles.label}>{visaType === 'stem' ? 'STEM OPT start' : 'Authorization start'}</label>
              {visaType === 'stem' && authStart && (
                <p style={{fontSize:'0.75rem',color:'var(--success)',marginBottom:4}}>
                  ✓ Auto-calculated from OPT end date
                </p>
              )}
              <input type="date" className={styles.input} value={authStart}
                onChange={e => { setAuthStart(e.target.value); setCalculated(false) }} />
            </div>
            <div>
              <label className={styles.label}>{visaType === 'stem' ? 'STEM OPT end' : 'Authorization end'}</label>
              <input type="date" className={styles.input} value={authEnd}
                onChange={e => { setAuthEnd(e.target.value); setCalculated(false) }} />
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <label className={styles.label}>
                {visaType === 'stem' ? 'STEM OPT employment periods' : 'Employment periods'}
              </label>
              <button className={styles.addBtn} onClick={addPeriod}>+ Add period</button>
            </div>
            {periods.map(p => (
              <div key={p.id} className={styles.periodRow}>
                <div>
                  <label className={styles.miniLabel}>Start</label>
                  <input type="date" className={styles.input} value={p.startStr}
                    onChange={e => { updatePeriod(p.id, 'startStr', e.target.value); setCalculated(false) }} />
                </div>
                <div>
                  <label className={styles.miniLabel}>End (blank = current)</label>
                  <input type="date" className={styles.input} value={p.endStr}
                    onChange={e => { updatePeriod(p.id, 'endStr', e.target.value); setCalculated(false) }} />
                </div>
                {periods.length > 1 && (
                  <button className={styles.delBtn} onClick={() => removePeriod(p.id)}>×</button>
                )}
              </div>
            ))}
          </div>

          <button className={styles.calcBtn} onClick={handleSave}>
            Calculate unemployment days
          </button>
      </div>

      <div>
          {!result ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📊</div>
              <p>Fill in your details and click calculate to see your compliance status.</p>
            </div>
          ) : (
            <>
              {/* ── Context cards (OPT + STEM periods) ── */}
              {visaType === 'stem' && (
                <div className={styles.contextCards}>
                  <div className={styles.contextCard}>
                    <div className={styles.contextCardLabel}>OPT period</div>
                    <div className={styles.contextCardDate}>
                      {optAuthStart || '—'} → {optAuthEnd || '—'}
                    </div>
                    <div className={styles.contextCardStat} style={{ color: 'var(--warning)' }}>
                      {result.carryOver} days carried over
                    </div>
                  </div>
                  <div className={styles.contextCard}>
                    <div className={styles.contextCardLabel}>STEM OPT period</div>
                    <div className={styles.contextCardDate}>
                      {authStart || '—'} → {authEnd || '—'}
                    </div>
                    <div className={styles.contextCardStat} style={{ color: meta.color }}>
                      {result.unemployedDays} days this period
                    </div>
                  </div>
                </div>
              )}

              {/* ── Hero card ── */}
              <div className={styles.heroCard}>
                <div className={styles.heroTop}>
                  <div>
                    <div className={styles.heroLabel}>
                      {visaType === 'stem' ? 'Cumulative unemployment' : 'Unemployment days'}
                    </div>
                    <div className={styles.heroNum}>
                      <span style={{ color: meta.color }}>{result.countable}</span>
                      <span className={styles.heroLimit}>/ {result.limit || '—'} days</span>
                    </div>
                  </div>
                  <div className={styles.heroBadge} style={{ background: `${meta.color}18`, color: meta.color }}>
                    {meta.label}
                  </div>
                </div>

                {/* Progress bar */}
                {result.limit && (
                  <div className={styles.heroBar}>
                    <div className={styles.heroBarTrack}>
                      {visaType === 'stem' && result.carryOver > 0 && (
                        <div style={{
                          position: 'absolute', left: 0, top: 0, height: '100%',
                          width: `${Math.min(100, result.carryOver / result.limit * 100)}%`,
                          background: 'var(--warning)',
                          borderRadius: result.carryOver === result.countable ? '5px' : '5px 0 0 5px'
                        }} />
                      )}
                      <div style={{
                        position: 'absolute',
                        left: visaType === 'stem' ? `${Math.min(100, result.carryOver / result.limit * 100)}%` : 0,
                        top: 0, height: '100%',
                        width: `${Math.min(100 - (visaType === 'stem' ? result.carryOver / result.limit * 100 : 0), result.unemployedDays / result.limit * 100)}%`,
                        background: meta.color,
                        borderRadius: result.carryOver > 0 ? '0 5px 5px 0' : '5px'
                      }} />
                      {[result.thresholds?.warn, result.thresholds?.critical].filter(Boolean).map(t => (
                        <div key={t} className={styles.marker} style={{ left: `${Math.min(100, t / result.limit * 100)}%` }} />
                      ))}
                    </div>
                    <div className={styles.heroBarLegend}>
                      {visaType === 'stem' && result.carryOver > 0 && (
                        <span><span className={styles.legendDot} style={{ background: 'var(--warning)' }} />OPT carry-over ({result.carryOver}d)</span>
                      )}
                      <span><span className={styles.legendDot} style={{ background: meta.color }} />{visaType === 'stem' ? 'STEM OPT' : 'Unemployed'} ({result.unemployedDays}d)</span>
                      <span><span className={styles.legendDot} style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }} />{Math.max(0, result.limit - result.countable)} remaining</span>
                    </div>
                  </div>
                )}

                {/* 4-stat row */}
                <div className={styles.heroStats}>
                  <div className={styles.heroStat}>
                    <div className={styles.heroStatLabel}>Employed days</div>
                    <div className={styles.heroStatVal} style={{ color: 'var(--success)' }}>{result.employedDays}</div>
                  </div>
                  {visaType === 'stem' ? (
                    <>
                      <div className={styles.heroStat}>
                        <div className={styles.heroStatLabel}>OPT carry-over</div>
                        <div className={styles.heroStatVal} style={{ color: 'var(--warning)' }}>{result.carryOver}</div>
                      </div>
                      <div className={styles.heroStat} style={{ borderLeft: '1px solid var(--border)' }}>
                        <div className={styles.heroStatLabel}>STEM unemployed</div>
                        <div className={styles.heroStatVal} style={{ color: meta.color }}>{result.unemployedDays}</div>
                      </div>
                    </>
                  ) : (
                    <div className={styles.heroStat}>
                      <div className={styles.heroStatLabel}>Unemployed days</div>
                      <div className={styles.heroStatVal} style={{ color: meta.color }}>{result.unemployedDays}</div>
                    </div>
                  )}
                  {result.limit && (
                    <div className={styles.heroStat} style={{ borderLeft: '1px solid var(--border)' }}>
                      <div className={styles.heroStatLabel}>Days remaining</div>
                      <div className={styles.heroStatVal} style={{ color: Math.max(0, result.limit - result.countable) <= 10 ? 'var(--danger)' : meta.color }}>
                        {Math.max(0, result.limit - result.countable)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Deadline + Milestones ── */}
              {(() => {
                const authEndDate  = authEnd ? parseLocalDate(authEnd) : null
                const deadline     = calcDeadline(result.countable, result.limit, authEndDate)
                const milestones   = calcMilestones(result.countable, result.limit, authEndDate, VISA_RULES[visaType])
                const isAdvisory   = result.limitType === 'advisory'
                const hasAnything  = deadline || milestones.length > 0 || result.advisoryNote
                if (!hasAnything) return null

                const lastGap = result.gaps[result.gaps.length - 1]
                const today   = new Date(); today.setHours(0,0,0,0)
                const isCurrentlyUnemployed = lastGap && lastGap.end >= today

                return (
                  <div className={styles.timelineSection}>
                    <h3 className={styles.gapsTitle}>
                      {isAdvisory ? 'Advisory alerts' : 'Upcoming milestones'}
                    </h3>

                    {/* Advisory note banner */}
                    {result.advisoryNote && (
                      <div style={{
                        fontSize: '0.78rem', color: 'var(--warning)',
                        background: 'var(--warning-soft)', borderRadius: 'var(--radius-md)',
                        padding: '8px 12px', marginBottom: '10px',
                        border: '1px solid rgba(245,158,11,0.25)'
                      }}>
                        ⚠ {result.advisoryNote}
                      </div>
                    )}

                    {/* Hard limit deadline — only if currently unemployed */}
                    {deadline && isCurrentlyUnemployed && !isAdvisory && (
                      <div className={styles.deadlineRow}>
                        <div className={styles.deadlineLeft}>
                          <span className={styles.deadlineIcon}>🚨</span>
                          <div>
                            <div className={styles.deadlineLabel}>Limit reached if still unemployed</div>
                            <div className={styles.deadlineDate}>{fmtDate(deadline)}</div>
                          </div>
                        </div>
                        <span className={styles.deadlineBadge} data-level="over">
                          {result.limit - result.countable} days left
                        </span>
                      </div>
                    )}

                    {/* Milestones (works for both hard + advisory) */}
                    {milestones.map((m, i) => (
                      <div key={i} className={styles.milestoneRow}>
                        <div className={styles.milestoneLeft}>
                          <span className={styles.milestoneIcon}>
                            {m.level === 'critical' ? '🚨' : m.level === 'urgent' ? '⚡' : '📅'}
                          </span>
                          <div>
                            <div className={styles.milestoneLabel}>{m.label}</div>
                            <div className={styles.milestoneDate}>
                              {fmtDate(m.date)} if unemployed from today
                            </div>
                          </div>
                        </div>
                        <span className={styles.deadlineBadge} data-level={m.level}>
                          in {m.daysUntil} days
                        </span>
                      </div>
                    ))}

                    {milestones.length === 0 && !deadline && !result.advisoryNote && (
                      <p className={styles.noGaps}>No upcoming milestones — you have plenty of runway.</p>
                    )}
                  </div>
                )
              })()}

              {/* ── Gap breakdown ── */}
              <div className={styles.gapsSection}>
                <h3 className={styles.gapsTitle}>
                  {visaType === 'stem' ? 'STEM OPT gap breakdown' : 'Gap breakdown'}
                </h3>
                {result.gaps.length === 0 ? (
                  <p className={styles.noGaps}>No gaps — continuous employment throughout.</p>
                ) : result.gaps.map((g, i) => {
                  const sev = result.limit ? g.days >= 30 ? 'danger' : g.days >= 14 ? 'warning' : 'ok' : 'ok'
                  return (
                    <div key={i} className={styles.gapRow}>
                      <span className={styles.gapDates}>{fmtDate(g.start)} → {fmtDate(g.end)}</span>
                      <span className={styles.gapBadge} data-sev={sev}>
                        {g.days} {g.days === 1 ? 'day' : 'days'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
    </div>
  )
}