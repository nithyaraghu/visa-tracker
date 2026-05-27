// src/pages/JourneyPage.jsx
// Unified visa journey dashboard — shows full OPT → STEM OPT timeline
import { useState, useMemo } from 'react'
import { parseLocalDate, calcUnemployment, diffDays, VISA_RULES } from '../utils/visaCalc.js'
import styles from './JourneyPage.module.css'

// ── Date helpers ──────────────────────────────────────────────────
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function addMonths(d, n) { const r = new Date(d); r.setMonth(r.getMonth() + n); return r }
function fmtDate(d) {
  if (!d) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function daysFromNow(d) {
  const today = new Date(); today.setHours(0,0,0,0)
  return Math.round((d - today) / 86400000)
}

const STATUS_COLOR = {
  ok: 'var(--success)', warn: 'var(--warning)', urgent: 'var(--warning)',
  critical: 'var(--danger)', over: 'var(--danger)'
}
const STATUS_LABEL = {
  ok: 'Within limits', warn: 'Watch closely', urgent: 'Approaching limit',
  critical: 'Critical', over: 'Limit exceeded'
}

// ── OPT stage ────────────────────────────────────────────────────
function OPTStage({ data, isActive, onExpand, expanded }) {
  const result = useMemo(() => {
    if (!data?.auth_start) return null
    const periods = (data.employment_periods || [])
      .filter(p => p.start)
      .map(p => ({ start: parseLocalDate(p.start), end: parseLocalDate(p.end) || null }))
    return calcUnemployment({
      authStart: parseLocalDate(data.auth_start),
      authEnd:   parseLocalDate(data.auth_end),
      employmentPeriods: periods,
      visaType: 'opt'
    })
  }, [data])

  const authEnd   = data?.auth_end   ? parseLocalDate(data.auth_end)   : null
  const applyBy   = authEnd ? addDays(authEnd, -90) : null
  const daysToApply = applyBy ? daysFromNow(applyBy) : null

  const pct = result?.limit ? Math.min(100, Math.round((result.countable ?? result.unemployedDays) / result.limit * 100)) : 0
  const color = result ? STATUS_COLOR[result.status] : 'var(--success)'

  return (
    <div className={`${styles.stage} ${isActive ? styles.stageActive : ''}`}>
      <div className={styles.stageHeader} onClick={onExpand}>
        <div className={styles.stageLeft}>
          <div className={styles.stageDot} style={{ background: isActive ? color : 'var(--surface-3)', borderColor: isActive ? color : 'var(--border-md)' }}>
            {isActive ? '●' : '○'}
          </div>
          <div>
            <div className={styles.stageTitle}>F-1 OPT <span className={styles.stagePeriod}>{data?.auth_start ? `${fmtDate(parseLocalDate(data.auth_start))} → ${fmtDate(authEnd)}` : ''}</span></div>
            {result && (
              <div className={styles.stageSummary} style={{ color }}>
                {result.countable ?? result.unemployedDays} / {result.limit} days used · {Math.max(0, result.limit - (result.countable ?? result.unemployedDays))} remaining
              </div>
            )}
          </div>
        </div>
        <div className={styles.stageRight}>
          <span className={styles.stageBadge} style={{ color, background: `${color}18` }}>
            {result ? STATUS_LABEL[result.status] : 'Active'}
          </span>
          <span className={styles.expandIcon}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Progress bar always visible when active */}
      {isActive && result?.limit && (
        <div className={styles.progressWrap}>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${pct}%`, background: color }} />
          </div>
          <span className={styles.progressPct}>{pct}%</span>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className={styles.stageBody}>
          {result?.gaps?.length > 0 && (
            <div className={styles.detailSection}>
              <div className={styles.detailTitle}>Unemployment gaps</div>
              {result.gaps.map((g, i) => (
                <div key={i} className={styles.gapRow}>
                  <span>{fmtDate(new Date(g.start))} → {fmtDate(new Date(g.end))}</span>
                  <span className={styles.gapBadge}>{g.days} days</span>
                </div>
              ))}
            </div>
          )}

          {applyBy && (
            <div className={styles.actionBox}>
              <div className={styles.actionIcon}>📅</div>
              <div>
                <div className={styles.actionTitle}>Apply for STEM OPT by {fmtDate(applyBy)}</div>
                <div className={styles.actionSub}>
                  {daysToApply > 0 ? `${daysToApply} days away — apply 90 days before OPT expires` : daysToApply === 0 ? 'Today is the deadline!' : `${Math.abs(daysToApply)} days past deadline`}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── STEM OPT stage ────────────────────────────────────────────────
function STEMStage({ optData, stemData, optResult, isActive, isFuture, onExpand, expanded }) {
  // Calculate OPT carry-over
  const optCarryOver = useMemo(() => {
    if (!optResult) return 0
    return optResult.unemployedDays || 0
  }, [optResult])

  const stemResult = useMemo(() => {
    if (!stemData?.auth_start) return null
    const periods = (stemData.employment_periods || [])
      .filter(p => p.start)
      .map(p => ({ start: parseLocalDate(p.start), end: parseLocalDate(p.end) || null }))
    return calcUnemployment({
      authStart: parseLocalDate(stemData.auth_start),
      authEnd:   parseLocalDate(stemData.auth_end),
      employmentPeriods: periods,
      visaType: 'stem',
      optUnemployedDays: optCarryOver
    })
  }, [stemData, optCarryOver])

  // Eligibility from OPT data
  const optEnd    = optData?.auth_end ? parseLocalDate(optData.auth_end) : null
  const stemStart = optEnd ? addDays(optEnd, 1) : null  // STEM starts day AFTER OPT ends
  const stemEnd   = stemStart ? addDays(addMonths(stemStart, 24), -1) : null  // EAD expiry = day before 2yr anniversary
  const applyBy   = optEnd ? addDays(optEnd, -90) : null
  const daysToApply = applyBy ? daysFromNow(applyBy) : null

  const cumulative = (stemResult?.unemployedDays || 0) + optCarryOver
  const remaining  = Math.max(0, 150 - cumulative)
  const pct        = Math.min(100, Math.round(cumulative / 150 * 100))
  const color      = stemResult ? STATUS_COLOR[stemResult.status] : isFuture ? 'var(--text-muted)' : 'var(--accent)'

  return (
    <div className={`${styles.stage} ${isActive ? styles.stageActive : ''} ${isFuture ? styles.stageFuture : ''}`}>
      <div className={styles.stageHeader} onClick={onExpand}>
        <div className={styles.stageLeft}>
          <div className={styles.stageDot} style={{
            background: isActive ? color : isFuture ? 'transparent' : 'var(--surface-3)',
            borderColor: isActive ? color : isFuture ? 'var(--border-md)' : 'var(--border-md)'
          }}>
            {isActive ? '●' : isFuture ? '◎' : '○'}
          </div>
          <div>
            <div className={styles.stageTitle}>
              F-1 STEM OPT
              <span className={styles.stagePeriod}>
                {stemStart ? ` ${fmtDate(stemStart)} → ${fmtDate(stemEnd)}` : ' · 24-month extension (starts day after OPT ends)'}
              </span>
            </div>
            <div className={styles.stageSummary} style={{ color: isFuture ? 'var(--text-muted)' : color }}>
              {isActive && stemResult
                ? `${cumulative} / 150 cumulative days used · ${remaining} remaining`
                : isFuture
                ? applyBy
                  ? daysToApply > 0
                    ? `Apply by ${fmtDate(applyBy)} — ${daysToApply} days away`
                    : 'Application window open now'
                  : 'Follows your OPT period'
                : 'Completed'}
            </div>
          </div>
        </div>
        <div className={styles.stageRight}>
          <span className={styles.stageBadge} style={{
            color: isFuture ? 'var(--accent)' : color,
            background: isFuture ? 'var(--accent-glow)' : `${color}18`
          }}>
            {isActive ? STATUS_LABEL[stemResult?.status || 'ok'] : isFuture ? 'Plan ahead' : 'Upcoming'}
          </span>
          <span className={styles.expandIcon}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {isActive && stemResult && (
        <div className={styles.progressWrap}>
          <div className={styles.progressBar}>
            {/* OPT carry-over segment */}
            {optCarryOver > 0 && (
              <div className={styles.progressSegment} style={{
                width: `${Math.min(100, optCarryOver / 150 * 100)}%`,
                background: 'var(--warning)'
              }} />
            )}
            <div className={styles.progressFill} style={{
              width: `${Math.min(100 - (optCarryOver / 150 * 100), (stemResult.unemployedDays / 150) * 100)}%`,
              background: color,
              marginLeft: `${Math.min(100, optCarryOver / 150 * 100)}%`
            }} />
          </div>
          <span className={styles.progressPct}>{pct}%</span>
        </div>
      )}

      {expanded && (
        <div className={styles.stageBody}>
          {/* Eligibility checklist */}
          <div className={styles.detailSection}>
            <div className={styles.detailTitle}>STEM OPT requirements</div>
            {[
              { ok: true,  text: 'Valid F-1 OPT status',          note: 'Apply before OPT expires' },
              { ok: null,  text: 'STEM-designated degree',         note: 'Verify CIP code with DSO' },
              { ok: null,  text: 'E-Verify registered employer',   note: 'Check at e-verify.gov' },
              { ok: true,  text: 'Form I-983 Training Plan',       note: 'Must be signed by employer' },
              { ok: true,  text: 'Apply 90 days before OPT ends',  note: applyBy ? `Deadline: ${fmtDate(applyBy)}` : '' },
            ].map((r, i) => (
              <div key={i} className={`${styles.reqRow} ${r.ok === true ? styles.reqOk : r.ok === false ? styles.reqFail : styles.reqCheck}`}>
                <span>{r.ok === true ? '✓' : r.ok === false ? '✗' : '?'}</span>
                <div>
                  <div className={styles.reqText}>{r.text}</div>
                  {r.note && <div className={styles.reqNote}>{r.note}</div>}
                </div>
              </div>
            ))}
          </div>

          {optCarryOver > 0 && (
            <div className={styles.infoBox}>
              📋 {optCarryOver} OPT unemployment days will carry over → {150 - optCarryOver} days available in STEM OPT
            </div>
          )}

          {applyBy && daysToApply > 0 && daysToApply <= 90 && (
            <div className={styles.actionBox} style={{ borderColor: 'var(--warning)' }}>
              <div className={styles.actionIcon}>⚡</div>
              <div>
                <div className={styles.actionTitle}>Apply soon — {daysToApply} days to deadline</div>
                <div className={styles.actionSub}>File Form I-765 with your DSO recommendation letter</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── CPT stage ────────────────────────────────────────────────────
function CPTStage({ data, isActive, onExpand, expanded }) {
  const months = data?.enrolled_months || 0
  const eligible = months >= 9

  return (
    <div className={`${styles.stage} ${isActive ? styles.stageActive : ''}`}>
      <div className={styles.stageHeader} onClick={onExpand}>
        <div className={styles.stageLeft}>
          <div className={styles.stageDot} style={{
            background: isActive ? 'var(--success)' : 'var(--surface-3)',
            borderColor: isActive ? 'var(--success)' : 'var(--border-md)'
          }}>
            {isActive ? '●' : '○'}
          </div>
          <div>
            <div className={styles.stageTitle}>F-1 CPT <span className={styles.stagePeriod}>Curricular Practical Training</span></div>
            <div className={styles.stageSummary} style={{ color: eligible ? 'var(--success)' : 'var(--warning)' }}>
              {eligible ? '✓ Eligible — semester-based authorization' : '⚠ Check enrollment requirement'}
            </div>
          </div>
        </div>
        <div className={styles.stageRight}>
          <span className={styles.stageBadge} style={{
            color: eligible ? 'var(--success)' : 'var(--warning)',
            background: eligible ? 'var(--success-soft)' : 'var(--warning-soft)'
          }}>
            {eligible ? 'Eligible' : 'Check requirements'}
          </span>
          <span className={styles.expandIcon}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className={styles.stageBody}>
          <div className={styles.detailSection}>
            <div className={styles.detailTitle}>CPT key facts</div>
            {[
              { ok: months >= 9, text: `Full-time enrollment ≥ 9 months (you have ${months})` },
              { ok: true,        text: 'No unemployment day limit — authorization is semester-based' },
              { ok: true,        text: 'DSO authorization required each semester on Form I-20' },
              { ok: true,        text: 'Work must be integral part of established curriculum' },
              { ok: months < 12, text: '⚠ 12+ months full-time CPT = OPT ineligible' },
            ].map((r, i) => (
              <div key={i} className={`${styles.reqRow} ${r.ok ? styles.reqOk : styles.reqCheck}`}>
                <span>{r.ok ? '✓' : '⚠'}</span>
                <div className={styles.reqText}>{r.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Journey Page ─────────────────────────────────────────────
export default function JourneyPage({ visaData }) {
  const [expanded, setExpanded] = useState({ opt: true, stem: false, cpt: true })

  const toggle = key => setExpanded(e => ({ ...e, [key]: !e[key] }))

  const visaType = visaData?.visa_type
  const isCPT    = visaType === 'cpt'
  const isOPT    = visaType === 'opt'
  const isSTEM   = visaType === 'stem'

  // Calculate OPT result for carry-over into STEM
  const optResult = useMemo(() => {
    if (!visaData?.auth_start || isSTEM) return null
    const periods = (visaData.employment_periods || [])
      .filter(p => p.start)
      .map(p => ({ start: parseLocalDate(p.start), end: parseLocalDate(p.end) || null }))
    try {
      return calcUnemployment({
        authStart: parseLocalDate(visaData.auth_start),
        authEnd:   parseLocalDate(visaData.auth_end),
        employmentPeriods: periods,
        visaType: 'opt'
      })
    } catch { return null }
  }, [visaData])

  if (!visaData || !visaData.visa_type) {
    return (
      <div className={styles.empty}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📊</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          No visa data yet. Go to <strong>Status Tracker</strong> to enter your details.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Your Visa Journey</h1>
        <p className={styles.subtitle}>
          Full immigration timeline — current status, next steps, and future planning
        </p>
      </div>

      <div className={styles.timeline}>
        {/* Connector line */}
        <div className={styles.connector} />

        {/* CPT path */}
        {isCPT && (
          <>
            <CPTStage
              data={visaData}
              isActive={true}
              onExpand={() => toggle('cpt')}
              expanded={expanded.cpt}
            />
            <div className={styles.stageArrow}>↓ After CPT</div>
            <OPTStage
              data={{ auth_start: null }}
              isActive={false}
              isFuture={true}
              onExpand={() => toggle('opt')}
              expanded={expanded.opt}
            />
          </>
        )}

        {/* OPT path */}
        {isOPT && (
          <>
            <OPTStage
              data={visaData}
              isActive={true}
              onExpand={() => toggle('opt')}
              expanded={expanded.opt}
            />
            <div className={styles.stageArrow}>↓ Next step</div>
            <STEMStage
              optData={visaData}
              stemData={null}
              optResult={optResult}
              isActive={false}
              isFuture={true}
              onExpand={() => toggle('stem')}
              expanded={expanded.stem}
            />
          </>
        )}

        {/* STEM OPT path */}
        {isSTEM && (
          <>
            <OPTStage
              data={{ auth_start: visaData.opt_auth_start, auth_end: visaData.opt_auth_end, employment_periods: visaData.opt_periods || [] }}
              isActive={false}
              onExpand={() => toggle('opt')}
              expanded={expanded.opt}
            />
            <div className={styles.stageArrow}>↓ Current</div>
            <STEMStage
              optData={{ auth_start: visaData.opt_auth_start, auth_end: visaData.opt_auth_end }}
              stemData={visaData}
              optResult={null}
              isActive={true}
              isFuture={false}
              onExpand={() => toggle('stem')}
              expanded={expanded.stem}
            />
          </>
        )}

      </div>
      <p className={styles.disclaimer}>
        For informational purposes only. Always verify with your DSO or immigration attorney.
      </p>
    </div>
  )
}