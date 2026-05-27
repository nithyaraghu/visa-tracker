import { useState, useMemo } from 'react'
import { parseLocalDate, calcUnemployment, diffDays, VISA_RULES } from '../utils/visaCalc.js'
import styles from './TrackerPage.module.css'
import { supabase } from '../auth/supabase.js'

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

export default function TrackerPage({ initialData }) {
  // Seed state from onboarding data if available
  const initPeriods = initialData?.employment_periods?.length
    ? initialData.employment_periods.map(p => ({ id: ++_id, startStr: p.start || '', endStr: p.end || '' }))
    : [newPeriod()]

  const initOptPeriods = initialData?.opt_periods?.length
    ? initialData.opt_periods.map(p => ({ id: ++_id, startStr: p.start || '', endStr: p.end || '' }))
    : [newPeriod()]

  const [visaType, setVisaType]     = useState(initialData?.visa_type || 'opt')
  const [authStart, setAuthStart]   = useState(initialData?.auth_start || '')
  const [authEnd, setAuthEnd]       = useState(initialData?.auth_end || '')
  const [periods, setPeriods]       = useState(initPeriods)
  const [calculated, setCalculated] = useState(!!(initialData?.auth_start))
  const [optAuthStart, setOptAuthStart] = useState(initialData?.opt_auth_start || '')
  const [optAuthEnd, setOptAuthEnd]     = useState(initialData?.opt_auth_end || '')
  const [optPeriods, setOptPeriods]     = useState(initOptPeriods)

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

      <div className={styles.grid}>
        <div className={styles.card}>
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
                    onChange={e => { setOptAuthStart(e.target.value); setCalculated(false) }} />
                </div>
                <div>
                  <label className={styles.miniLabel}>OPT auth end</label>
                  <input type="date" className={styles.input} value={optAuthEnd}
                    onChange={e => { setOptAuthEnd(e.target.value); setCalculated(false) }} />
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
              <div className={styles.statusBadge} style={{ background: meta.bg, borderColor: meta.color }}>
                <span className={styles.statusDot} style={{ background: meta.color }} />
                <span style={{ color: meta.color, fontWeight: 500 }}>{meta.label}</span>
                {result.limit && (
                  <span className={styles.statusDetail} style={{ color: meta.color }}>
                    — {result.countable} / {result.limit} days used
                    {result.carryOver > 0 && ` (incl. ${result.carryOver} from OPT)`}
                  </span>
                )}
              </div>

              <div className={styles.metrics}>
                {[
                  { label: 'Total auth days',  val: result.totalDays,    color: 'var(--text-primary)' },
                  { label: 'Employed days',     val: result.employedDays, color: 'var(--success)'      },
                  { label: visaType === 'stem' ? 'Unemployed (STEM only)' : 'Unemployed days',
                    val: result.unemployedDays, color: meta.color },
                  ...(visaType === 'stem' && result.carryOver > 0 ? [
                    { label: 'Carried over (OPT)', val: result.carryOver, color: 'var(--warning)' },
                    { label: 'Cumulative total',   val: result.stemTotal, color: meta.color       },
                  ] : []),
                  ...(result.limit ? [{
                    label: 'Days remaining',
                    val: Math.max(0, result.limit - result.countable),
                    color: meta.color
                  }] : [])
                ].map(m => (
                  <div key={m.label} className={styles.metricCard}>
                    <div className={styles.metricLabel}>{m.label}</div>
                    <div className={styles.metricVal} style={{ color: m.color }}>{m.val}</div>
                  </div>
                ))}
              </div>

              {visaType === 'stem' && (
                <div style={{
                  fontSize: '0.8rem', color: 'var(--text-muted)',
                  background: 'var(--surface-2)', borderRadius: 'var(--radius-md)',
                  padding: '8px 12px', marginBottom: '1rem', border: '1px solid var(--border)'
                }}>
                  📋 {result.carryOver} days (OPT) + {result.unemployedDays} days (STEM OPT) = <strong style={{ color: meta.color }}>{result.stemTotal} / 150 cumulative days</strong>
                </div>
              )}

              {(result.limit || result.thresholds) && (() => {
                const barLimit   = result.limit || result.thresholds?.critical || 90
                const barLabel   = result.limit ? `${result.limit}-day limit` : `${barLimit}-day advisory max`
                return (
                <div className={styles.barSection}>
                  <div className={styles.barLabels}>
                    <span>0 days</span><span>{barLabel}</span>
                  </div>
                  <div className={styles.barTrack}>
                    {visaType === 'stem' && result.carryOver > 0 && (
                      <div style={{
                        position: 'absolute', left: 0, top: 0, height: '100%',
                        width: `${Math.min(100, result.carryOver / barLimit * 100)}%`,
                        background: 'var(--warning)', borderRadius: '5px 0 0 5px'
                      }} />
                    )}
                    <div className={styles.barFill} style={{
                      marginLeft: visaType === 'stem' ? `${Math.min(100, result.carryOver / barLimit * 100)}%` : 0,
                      width: `${Math.min(100 - (visaType === 'stem' ? result.carryOver / barLimit * 100 : 0), result.unemployedDays / barLimit * 100)}%`,
                      background: meta.color,
                      borderRadius: result.carryOver > 0 ? '0 5px 5px 0' : '5px'
                    }} />
                    {[result.thresholds?.warn, result.thresholds?.critical]
                      .filter(Boolean).map(t => (
                        <div key={t} className={styles.marker} style={{ left: `${Math.min(100, t / barLimit * 100)}%` }} />
                      ))}
                  </div>
                  {visaType === 'stem' && result.carryOver > 0 && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '0.75rem' }}>
                      <span style={{ color: 'var(--warning)' }}>■ OPT carry-over ({result.carryOver}d)</span>
                      <span style={{ color: meta.color }}>■ STEM OPT ({result.unemployedDays}d)</span>
                    </div>
                  )}
                </div>
                )
              })()}

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
    </div>
  )
}