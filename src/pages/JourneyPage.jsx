// src/pages/JourneyPage.jsx
// Unified visa journey dashboard — shows full OPT → STEM → H-1B timeline
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
  const stemStart = optEnd ? new Date(optEnd) : null
  const stemEnd   = stemStart ? addMonths(stemStart, 24) : null
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
                {stemStart ? ` ${fmtDate(stemStart)} → ${fmtDate(stemEnd)}` : ' · 24-month extension'}
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

// ── H-1B stage ────────────────────────────────────────────────────
function H1BStage({ stemData, optData, hasMasters, capExempt, isFuture, onExpand, expanded }) {
  const today = new Date(); today.setHours(0,0,0,0)
  const CURRENT_YEAR = today.getFullYear()

  // Determine last eligible lottery year based on STEM OPT end
  const stemEnd = stemData?.auth_end
    ? parseLocalDate(stemData.auth_end)
    : optData?.auth_end
    ? addMonths(parseLocalDate(optData.auth_end), 24)
    : null

  const futureWindows = []
  for (let yr = CURRENT_YEAR; yr <= (stemEnd ? stemEnd.getFullYear() + 1 : CURRENT_YEAR + 3); yr++) {
    const regDate   = new Date(yr, 2, 1)  // March 1
    const startDate = new Date(yr, 9, 1)  // Oct 1
    if (stemEnd && startDate > stemEnd) break
    if (regDate >= today) {
      futureWindows.push({ year: yr, regDate, startDate, daysUntil: daysFromNow(regDate) })
    }
  }

  const nextLottery = futureWindows[0]

  return (
    <div className={`${styles.stage} ${isFuture ? styles.stageFuture : ''}`}>
      <div className={styles.stageHeader} onClick={onExpand}>
        <div className={styles.stageLeft}>
          <div className={styles.stageDot} style={{ background: 'transparent', borderColor: 'var(--border-md)' }}>◎</div>
          <div>
            <div className={styles.stageTitle}>H-1B Lottery</div>
            <div className={styles.stageSummary} style={{ color: 'var(--text-muted)' }}>
              {nextLottery
                ? `Next lottery: March ${nextLottery.year} · ${nextLottery.daysUntil} days away`
                : 'Plan your H-1B strategy'}
            </div>
          </div>
        </div>
        <div className={styles.stageRight}>
          <span className={styles.stageBadge} style={{ color: 'var(--accent)', background: 'var(--accent-glow)' }}>
            {capExempt ? 'Cap-exempt' : 'Plan ahead'}
          </span>
          <span className={styles.expandIcon}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className={styles.stageBody}>
          {capExempt ? (
            <div className={styles.actionBox} style={{ borderColor: 'var(--success)' }}>
              <div className={styles.actionIcon}>⭐</div>
              <div>
                <div className={styles.actionTitle}>Cap-exempt — no lottery needed!</div>
                <div className={styles.actionSub}>Your employer can file anytime. Work with immigration attorney.</div>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.detailSection}>
                <div className={styles.detailTitle}>Upcoming lottery windows</div>
                {futureWindows.slice(0, 3).map(w => (
                  <div key={w.year} className={styles.lotteryRow}>
                    <div>
                      <div className={styles.lotteryYear}>{w.year} Lottery</div>
                      <div className={styles.lotterySub}>
                        Registration: {fmtDate(w.regDate)} · H-1B starts {fmtDate(w.startDate)}
                      </div>
                    </div>
                    <span className={styles.gapBadge} style={{ color: 'var(--accent)', background: 'var(--accent-glow)' }}>
                      in {w.daysUntil} days
                    </span>
                  </div>
                ))}
              </div>

              <div className={styles.infoBox}>
                {hasMasters
                  ? '🎓 US Masters degree: 2 lottery entries per year (regular cap + 20k masters pool) — ~35–45% combined odds'
                  : '📊 Regular cap: ~20–30% selection odds. A US Masters degree gives you 2 entries per year.'}
              </div>

              <div className={styles.detailSection}>
                <div className={styles.detailTitle}>Key facts</div>
                {[
                  'Registration opens March each year (~$215 fee)',
                  'H-1B employment starts October 1',
                  'Cap-exempt employers (universities, non-profits) can file anytime',
                  'H-1B portability: can change jobs after 180 days',
                ].map((f, i) => (
                  <div key={i} className={styles.factRow}>● {f}</div>
                ))}
              </div>
            </>
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
          <div className={styles.stageDot} style={{ background: isActive ? 'var(--success)' : 'var(--surface-3)', borderColor: isActive ? 'var(--success)' : 'var(--border-md)' }}>
            {isActive ? '●' : '○'}
          </div>
          <div>
            <div className={styles.stageTitle}>F-1 CPT <span className={styles.stagePeriod}>Curricular Practical Training</span></div>
            <div className={styles.stageSummary} style={{ color: eligible ? 'var(--success)' : 'var(--warning)' }}>
              {eligible ? '✓ Eligible — semester-based authorization' : '⚠ Enrollment requirement not yet met'}
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
          <div className={styles.detailSection}>
            <div className={styles.detailTitle}>CPT eligibility checklist</div>
            {[
              { ok: months >= 9, text: `Full-time enrollment ≥ 9 months`, note: `You have ${months} months` },
              { ok: true,        text: 'Work must be integral to curriculum', note: 'Verify with DSO' },
              { ok: true,        text: 'DSO authorization required each semester', note: 'Listed on Form I-20' },
              { ok: null,        text: '12+ months full-time CPT = OPT ineligible', note: 'Track your CPT duration' },
            ].map((r, i) => (
              <div key={i} className={`${styles.reqRow} ${r.ok === true ? styles.reqOk : r.ok === false ? styles.reqFail : styles.reqCheck}`}>
                <span>{r.ok === true ? '✓' : r.ok === false ? '✗' : '⚠'}</span>
                <div>
                  <div className={styles.reqText}>{r.text}</div>
                  {r.note && <div className={styles.reqNote}>{r.note}</div>}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.infoBox}>
            CPT has no unemployment day limit — authorization is semester-based. Always get DSO approval before starting work.
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Journey Page ─────────────────────────────────────────────
export default function JourneyPage({ visaData }) {
  const [expanded, setExpanded] = useState({ opt: true, stem: false, h1b: false, cpt: true })

  const toggle = key => setExpanded(e => ({ ...e, [key]: !e[key] }))

  const visaType = visaData?.visa_type
  const isCPT    = visaType === 'cpt'
  const isOPT    = visaType === 'opt'
  const isSTEM   = visaType === 'stem'
  const isH1B    = visaType === 'h1b'

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
            <div className={styles.stageArrow}>↓ Future</div>
            <H1BStage
              optData={visaData}
              stemData={null}
              hasMasters={true}
              capExempt={false}
              isFuture={true}
              onExpand={() => toggle('h1b')}
              expanded={expanded.h1b}
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
            <div className={styles.stageArrow}>↓ Future</div>
            <H1BStage
              optData={null}
              stemData={visaData}
              hasMasters={true}
              capExempt={false}
              isFuture={true}
              onExpand={() => toggle('h1b')}
              expanded={expanded.h1b}
            />
          </>
        )}

        {/* H-1B path */}
        {isH1B && (
          <H1BStage
            optData={null}
            stemData={null}
            hasMasters={true}
            capExempt={false}
            isFuture={false}
            onExpand={() => toggle('h1b')}
            expanded={expanded.h1b}
          />
        )}
      </div>

      <p className={styles.disclaimer}>
        For informational purposes only. Always verify with your DSO or immigration attorney.
      </p>
    </div>
  )
}