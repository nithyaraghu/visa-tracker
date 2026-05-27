// src/pages/JourneyPage.jsx
import { useState, useMemo } from 'react'
import { parseLocalDate, calcUnemployment } from '../utils/visaCalc.js'
import styles from './JourneyPage.module.css'

function addDays(d, n)   { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function addMonths(d, n) { const r = new Date(d); r.setMonth(r.getMonth() + n); return r }
function fmtDate(d)      { if (!d) return '—'; return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
function daysFromNow(d)  { const t = new Date(); t.setHours(0,0,0,0); return Math.round((d - t) / 86400000) }

const STATUS_COLOR = { ok: 'var(--success)', warn: 'var(--warning)', urgent: 'var(--warning)', critical: 'var(--danger)', over: 'var(--danger)' }
const STATUS_LABEL = { ok: 'Within limits', warn: 'Warning', urgent: 'Urgent', critical: 'Critical', over: 'Exceeded' }

// ── Plain-English status summary ─────────────────────────────────
function StatusSummary({ status, daysUsed, limit, daysRemaining, visaType }) {
  const messages = {
    ok:       `You have used ${daysUsed} of ${limit} days. You have ${daysRemaining} days remaining — you're in good standing.`,
    warn:     `You have used ${daysUsed} of ${limit} days. Only ${daysRemaining} days left — start your job search now.`,
    urgent:   `You have used ${daysUsed} of ${limit} days. Only ${daysRemaining} days remaining — secure employment immediately.`,
    critical: `You have used ${daysUsed} of ${limit} days. Only ${daysRemaining} days left — this is critical, contact your DSO today.`,
    over:     `You have exceeded your ${limit}-day limit by ${daysUsed - limit} days. Contact your DSO immediately.`,
  }
  return (
    <div className={styles.summaryBox} style={{ borderColor: `${STATUS_COLOR[status]}40`, background: `${STATUS_COLOR[status]}08` }}>
      <span className={styles.summaryDot} style={{ background: STATUS_COLOR[status] }} />
      <p className={styles.summaryText}>{messages[status]}</p>
    </div>
  )
}

// ── What to do next ──────────────────────────────────────────────
function NextSteps({ steps }) {
  if (!steps?.length) return null
  return (
    <div className={styles.nextSteps}>
      <div className={styles.nextTitle}>What to do next</div>
      {steps.map((s, i) => (
        <div key={i} className={styles.nextRow} style={{ borderColor: `${s.color}30` }}>
          <span className={styles.nextIcon} style={{ background: `${s.color}15`, color: s.color }}>{s.icon}</span>
          <div>
            <div className={styles.nextLabel}>{s.label}</div>
            {s.note && <div className={styles.nextNote}>{s.note}</div>}
          </div>
          {s.deadline && <span className={styles.nextDeadline} style={{ color: s.color }}>{s.deadline}</span>}
        </div>
      ))}
    </div>
  )
}

// ── OPT Stage ────────────────────────────────────────────────────
function OPTStage({ data, isActive, isFuture, onExpand, expanded }) {
  const result = useMemo(() => {
    if (!data?.auth_start) return null
    const periods = (data.employment_periods || []).filter(p => p.start)
      .map(p => ({ start: parseLocalDate(p.start), end: parseLocalDate(p.end) || null }))
    try { return calcUnemployment({ authStart: parseLocalDate(data.auth_start), authEnd: parseLocalDate(data.auth_end), employmentPeriods: periods, visaType: 'opt' }) }
    catch { return null }
  }, [data])

  const authEnd     = data?.auth_end ? parseLocalDate(data.auth_end) : null
  const applyBy     = authEnd ? addDays(authEnd, -90) : null
  const daysToApply = applyBy ? daysFromNow(applyBy) : null
  const daysUsed    = result ? (result.countable ?? result.unemployedDays) : 0
  const remaining   = result ? Math.max(0, result.limit - daysUsed) : 90
  const pct         = result?.limit ? Math.min(100, Math.round(daysUsed / result.limit * 100)) : 0
  const color       = result ? STATUS_COLOR[result.status] : 'var(--text-muted)'

  const nextSteps = []
  if (applyBy && daysToApply !== null) {
    if (daysToApply > 0 && daysToApply <= 120)
      nextSteps.push({ icon: '📅', label: 'Apply for STEM OPT extension', note: 'File I-765 with DSO recommendation letter — 90 days before OPT ends', deadline: `by ${fmtDate(applyBy)}`, color: daysToApply <= 30 ? 'var(--danger)' : 'var(--warning)' })
    else if (daysToApply <= 0)
      nextSteps.push({ icon: '⚠', label: 'STEM OPT deadline has passed', note: 'Contact your DSO immediately to discuss your options', color: 'var(--danger)' })
  }
  if (result?.status === 'warn' || result?.status === 'urgent')
    nextSteps.push({ icon: '💼', label: 'Find employment soon', note: `Only ${remaining} unemployment days remaining on OPT`, color: 'var(--warning)' })

  return (
    <div className={`${styles.stage} ${isActive ? styles.stageActive : ''} ${isFuture ? styles.stageFuture : ''}`}>
      <div className={styles.stageHeader} onClick={onExpand}>
        <div className={styles.stageLeft}>
          <div className={styles.stageDot} style={{ background: isActive ? color : isFuture ? 'transparent' : 'var(--surface-3)', borderColor: isActive ? color : 'var(--border-md)' }}>
            {isActive ? '●' : isFuture ? '◎' : '○'}
          </div>
          <div>
            <div className={styles.stageTitle}>
              F-1 OPT
              {data?.auth_start && <span className={styles.stagePeriod}> {fmtDate(parseLocalDate(data.auth_start))} → {fmtDate(authEnd)}</span>}
            </div>
            <div className={styles.stageSummary} style={{ color: isFuture ? 'var(--text-muted)' : color }}>
              {isActive && result ? `${daysUsed} / ${result.limit} days used · ${remaining} remaining` : isFuture ? '12-month work authorization' : 'Completed'}
            </div>
          </div>
        </div>
        <div className={styles.stageRight}>
          <span className={styles.stageBadge} style={{ color: isFuture ? 'var(--accent)' : color, background: isFuture ? 'var(--accent-glow)' : `${color}18` }}>
            {isActive && result ? STATUS_LABEL[result.status] : isFuture ? 'Upcoming' : 'Done'}
          </span>
          <span className={styles.expandIcon}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {isActive && result?.limit && (
        <div className={styles.progressWrap}>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${pct}%`, background: color }} />
          </div>
          <span className={styles.progressPct}>{pct}%</span>
        </div>
      )}

      {expanded && (
        <div className={styles.stageBody}>
          {isActive && result && (
            <StatusSummary status={result.status} daysUsed={daysUsed} limit={result.limit} daysRemaining={remaining} />
          )}

          {result?.gaps?.length > 0 && (
            <div className={styles.detailSection}>
              <div className={styles.detailTitle}>Unemployment gaps</div>
              {result.gaps.map((g, i) => (
                <div key={i} className={styles.gapRow}>
                  <span className={styles.gapDates}>{fmtDate(new Date(g.start))} → {fmtDate(new Date(g.end))}</span>
                  <span className={styles.gapBadge}>{g.days} days</span>
                </div>
              ))}
            </div>
          )}

          <NextSteps steps={nextSteps} />

          {isFuture && (
            <div className={styles.infoBox}>
              ℹ OPT gives you 12 months of work authorization after graduation. You have a 90-day cumulative unemployment limit — days count 7 days/week including weekends.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── STEM OPT Stage ───────────────────────────────────────────────
function STEMStage({ optData, stemData, optResult, isActive, isFuture, onExpand, expanded }) {
  const optCarryOver = useMemo(() => optResult?.unemployedDays || 0, [optResult])

  const stemResult = useMemo(() => {
    if (!stemData?.auth_start) return null
    const periods = (stemData.employment_periods || []).filter(p => p.start)
      .map(p => ({ start: parseLocalDate(p.start), end: parseLocalDate(p.end) || null }))
    try { return calcUnemployment({ authStart: parseLocalDate(stemData.auth_start), authEnd: parseLocalDate(stemData.auth_end), employmentPeriods: periods, visaType: 'stem', optUnemployedDays: optCarryOver }) }
    catch { return null }
  }, [stemData, optCarryOver])

  const optEnd      = optData?.auth_end ? parseLocalDate(optData.auth_end) : null
  const stemStart   = optEnd ? addDays(optEnd, 1) : null
  const stemEnd     = stemStart ? addDays(addMonths(stemStart, 24), -1) : null
  const applyBy     = optEnd ? addDays(optEnd, -90) : null
  const daysToApply = applyBy ? daysFromNow(applyBy) : null
  const cumulative  = (stemResult?.unemployedDays || 0) + optCarryOver
  const remaining   = Math.max(0, 150 - cumulative)
  const pct         = Math.min(100, Math.round(cumulative / 150 * 100))
  const color       = stemResult ? STATUS_COLOR[stemResult.status] : isFuture ? 'var(--text-muted)' : 'var(--accent)'

  const nextSteps = []
  if (isActive) {
    if (stemResult?.status === 'warn' || stemResult?.status === 'urgent')
      nextSteps.push({ icon: '💼', label: 'Secure employment immediately', note: `Only ${remaining} days remaining out of 150 cumulative`, color: 'var(--warning)' })
    if (stemResult?.status === 'critical' || stemResult?.status === 'over')
      nextSteps.push({ icon: '🚨', label: 'Contact your DSO today', note: 'You are near or over the 150-day cumulative limit', color: 'var(--danger)' })
    nextSteps.push({ icon: '📋', label: 'Submit I-983 validation report every 6 months', note: 'Required for STEM OPT compliance', color: 'var(--text-muted)' })
    nextSteps.push({ icon: '📍', label: 'Report address or employer changes within 10 days', note: 'Required by USCIS', color: 'var(--text-muted)' })
  }
  if (isFuture && applyBy) {
    if (daysToApply > 0)
      nextSteps.push({ icon: '📅', label: 'File STEM OPT application', note: 'I-765 + DSO recommendation + I-983 Training Plan', deadline: `by ${fmtDate(applyBy)}`, color: daysToApply <= 30 ? 'var(--danger)' : 'var(--warning)' })
    nextSteps.push({ icon: '✔', label: 'Confirm employer is E-Verify registered', note: 'Required — verify at e-verify.gov before accepting any job', color: 'var(--accent)' })
  }

  return (
    <div className={`${styles.stage} ${isActive ? styles.stageActive : ''} ${isFuture ? styles.stageFuture : ''}`}>
      <div className={styles.stageHeader} onClick={onExpand}>
        <div className={styles.stageLeft}>
          <div className={styles.stageDot} style={{ background: isActive ? color : isFuture ? 'transparent' : 'var(--surface-3)', borderColor: isActive ? color : 'var(--border-md)' }}>
            {isActive ? '●' : isFuture ? '◎' : '○'}
          </div>
          <div>
            <div className={styles.stageTitle}>
              F-1 STEM OPT
              <span className={styles.stagePeriod}>{stemStart ? ` ${fmtDate(stemStart)} → ${fmtDate(stemEnd)}` : ' · 24-month extension'}</span>
            </div>
            <div className={styles.stageSummary} style={{ color: isFuture ? 'var(--text-muted)' : color }}>
              {isActive && stemResult
                ? `${cumulative} / 150 cumulative days used · ${remaining} remaining`
                : isFuture && applyBy
                  ? daysToApply > 0 ? `Apply by ${fmtDate(applyBy)} — ${daysToApply} days away` : 'Apply now — deadline passed'
                  : '24-month work authorization extension'}
            </div>
          </div>
        </div>
        <div className={styles.stageRight}>
          <span className={styles.stageBadge} style={{ color: isFuture ? 'var(--accent)' : color, background: isFuture ? 'var(--accent-glow)' : `${color}18` }}>
            {isActive && stemResult ? STATUS_LABEL[stemResult.status] : isFuture ? 'Plan ahead' : 'Upcoming'}
          </span>
          <span className={styles.expandIcon}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {isActive && stemResult && (
        <div className={styles.progressWrap}>
          <div className={styles.progressBar}>
            {optCarryOver > 0 && <div className={styles.progressSegment} style={{ width: `${Math.min(100, optCarryOver / 150 * 100)}%`, background: 'var(--warning)' }} />}
            <div className={styles.progressFill} style={{
              width: `${Math.min(100 - (optCarryOver / 150 * 100), stemResult.unemployedDays / 150 * 100)}%`,
              background: color,
              marginLeft: `${Math.min(100, optCarryOver / 150 * 100)}%`
            }} />
          </div>
          <span className={styles.progressPct}>{pct}%</span>
        </div>
      )}

      {expanded && (
        <div className={styles.stageBody}>
          {isActive && stemResult && (
            <StatusSummary status={stemResult.status} daysUsed={cumulative} limit={150} daysRemaining={remaining} />
          )}

          {isActive && optCarryOver > 0 && (
            <div className={styles.carryOverBox}>
              <div className={styles.carryOverRow}>
                <span style={{ color: 'var(--warning)' }}>⬆ {optCarryOver} days carried over from OPT</span>
                <span style={{ color: 'var(--text-muted)' }}>+</span>
                <span style={{ color: color }}>{stemResult?.unemployedDays || 0} days in STEM OPT</span>
                <span style={{ color: 'var(--text-muted)' }}>=</span>
                <span style={{ fontWeight: 600, color }}>{cumulative} / 150 total</span>
              </div>
              <div className={styles.carryOverLegend}>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--warning)', marginRight: 4 }} />OPT carry-over ({optCarryOver}d)</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: color, marginRight: 4 }} />STEM OPT ({stemResult?.unemployedDays || 0}d)</span>
                <span>{remaining} days remaining</span>
              </div>
            </div>
          )}

          {isActive && stemResult?.gaps?.length > 0 && (
            <div className={styles.detailSection}>
              <div className={styles.detailTitle}>STEM OPT gap breakdown</div>
              {stemResult.gaps.map((g, i) => (
                <div key={i} className={styles.gapRow}>
                  <span className={styles.gapDates}>{fmtDate(new Date(g.start))} → {fmtDate(new Date(g.end))}</span>
                  <span className={styles.gapBadge}>{g.days} days</span>
                </div>
              ))}
            </div>
          )}

          <NextSteps steps={nextSteps} />

          {isFuture && (
            <div className={styles.detailSection}>
              <div className={styles.detailTitle}>STEM OPT requirements</div>
              {[
                { ok: true,  text: 'Valid F-1 OPT status when you apply' },
                { ok: null,  text: 'STEM-designated degree — verify CIP code with your DSO' },
                { ok: null,  text: 'Employer must be E-Verify registered (e-verify.gov)' },
                { ok: true,  text: 'Form I-983 Training Plan signed by employer' },
                { ok: true,  text: 'Apply at least 90 days before OPT expires' },
              ].map((r, i) => (
                <div key={i} className={`${styles.reqRow} ${r.ok === true ? styles.reqOk : styles.reqCheck}`}>
                  <span>{r.ok === true ? '✓' : '?'}</span>
                  <div className={styles.reqText}>{r.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── CPT Stage ────────────────────────────────────────────────────
function CPTStage({ data, isActive, onExpand, expanded }) {
  const months  = data?.enrolled_months || 0
  const eligible = months >= 9

  return (
    <div className={`${styles.stage} ${isActive ? styles.stageActive : ''}`}>
      <div className={styles.stageHeader} onClick={onExpand}>
        <div className={styles.stageLeft}>
          <div className={styles.stageDot} style={{ background: isActive ? 'var(--success)' : 'var(--surface-3)', borderColor: isActive ? 'var(--success)' : 'var(--border-md)' }}>
            {isActive ? '●' : '○'}
          </div>
          <div>
            <div className={styles.stageTitle}>F-1 CPT</div>
            <div className={styles.stageSummary} style={{ color: eligible ? 'var(--success)' : 'var(--warning)' }}>
              {eligible ? 'Eligible — semester-based authorization' : 'Check enrollment requirements'}
            </div>
          </div>
        </div>
        <div className={styles.stageRight}>
          <span className={styles.stageBadge} style={{ color: eligible ? 'var(--success)' : 'var(--warning)', background: eligible ? 'var(--success-soft)' : 'var(--warning-soft)' }}>
            {eligible ? 'Eligible' : 'Check requirements'}
          </span>
          <span className={styles.expandIcon}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className={styles.stageBody}>
          <div className={styles.infoBox}>
            ℹ CPT has no unemployment day limit. Authorization is semester-based — your DSO must authorize each semester on your I-20.
          </div>
          <NextSteps steps={[
            { icon: '📋', label: 'Get DSO authorization each semester', note: 'CPT is listed on your I-20 form', color: 'var(--accent)' },
            { icon: '⚠', label: '12+ months full-time CPT = OPT ineligible', note: 'Track your CPT duration carefully', color: 'var(--warning)' },
          ]} />
        </div>
      )}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────
export default function JourneyPage({ visaData }) {
  const [expanded, setExpanded] = useState({ opt: true, stem: true, cpt: true })
  const toggle = key => setExpanded(e => ({ ...e, [key]: !e[key] }))

  const visaType = visaData?.visa_type
  const isCPT  = visaType === 'cpt'
  const isOPT  = visaType === 'opt'
  const isSTEM = visaType === 'stem'

  const optResult = useMemo(() => {
    if (isSTEM) {
      if (!visaData?.opt_auth_start) return null
      const periods = (visaData.opt_periods || []).filter(p => p.start)
        .map(p => ({ start: parseLocalDate(p.start), end: parseLocalDate(p.end) || null }))
      try { return calcUnemployment({ authStart: parseLocalDate(visaData.opt_auth_start), authEnd: parseLocalDate(visaData.opt_auth_end), employmentPeriods: periods, visaType: 'opt' }) }
      catch { return null }
    }
    if (!visaData?.auth_start) return null
    const periods = (visaData.employment_periods || []).filter(p => p.start)
      .map(p => ({ start: parseLocalDate(p.start), end: parseLocalDate(p.end) || null }))
    try { return calcUnemployment({ authStart: parseLocalDate(visaData.auth_start), authEnd: parseLocalDate(visaData.auth_end), employmentPeriods: periods, visaType: 'opt' }) }
    catch { return null }
  }, [visaData, isSTEM])

  if (!visaData || !visaData.visa_type) {
    return (
      <div className={styles.empty}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📊</div>
        <p style={{ color: 'var(--text-secondary)' }}>No visa data yet. Go to <strong>Status Tracker</strong> to enter your details.</p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Your Visa Journey</h1>
        <p className={styles.subtitle}>Your full immigration timeline — current status and what to do next</p>
      </div>

      <div className={styles.timeline}>
        <div className={styles.connector} />

        {isCPT && (
          <>
            <CPTStage data={visaData} isActive={true} onExpand={() => toggle('cpt')} expanded={expanded.cpt} />
            <div className={styles.stageArrow}>↓ After CPT</div>
            <OPTStage data={{ auth_start: null }} isActive={false} isFuture={true} onExpand={() => toggle('opt')} expanded={expanded.opt} />
          </>
        )}

        {isOPT && (
          <>
            <OPTStage data={visaData} isActive={true} onExpand={() => toggle('opt')} expanded={expanded.opt} />
            <div className={styles.stageArrow}>↓ Next step</div>
            <STEMStage optData={visaData} stemData={null} optResult={optResult} isActive={false} isFuture={true} onExpand={() => toggle('stem')} expanded={expanded.stem} />
          </>
        )}

        {isSTEM && (
          <>
            <OPTStage data={{ auth_start: visaData.opt_auth_start, auth_end: visaData.opt_auth_end, employment_periods: visaData.opt_periods || [] }} isActive={false} onExpand={() => toggle('opt')} expanded={expanded.opt} />
            <div className={styles.stageArrow}>↓ Current</div>
            <STEMStage optData={{ auth_start: visaData.opt_auth_start, auth_end: visaData.opt_auth_end }} stemData={visaData} optResult={optResult} isActive={true} isFuture={false} onExpand={() => toggle('stem')} expanded={expanded.stem} />
          </>
        )}
      </div>

      <p className={styles.disclaimer}>For informational purposes only. Always verify with your DSO or immigration attorney.</p>
    </div>
  )
}