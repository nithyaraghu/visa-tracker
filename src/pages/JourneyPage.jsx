// src/pages/JourneyPage.jsx — Timeline view
import { useState, useMemo } from 'react'
import { parseLocalDate, calcUnemployment } from '../utils/visaCalc.js'
import styles from './JourneyPage.module.css'

function fmtDate(str) {
  if (!str) return '—'
  const [y,m,d] = str.split('-').map(Number)
  return new Date(y,m-1,d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
}
function fmtMon(str) {
  if (!str) return '—'
  const [y,m,d] = str.split('-').map(Number)
  return new Date(y,m-1,d).toLocaleDateString('en-US', { month:'short', year:'numeric' })
}
function addD(str,n) {
  if (!str) return ''
  const [y,m,d] = str.split('-').map(Number)
  const dt = new Date(y,m-1,d+n)
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
}
function addM(str,n) {
  if (!str) return ''
  const [y,m,d] = str.split('-').map(Number)
  const dt = new Date(y,m-1+n,d)
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
}
function daysFromNow(str) {
  if (!str) return null
  const [y,m,d] = str.split('-').map(Number)
  const today = new Date(); today.setHours(0,0,0,0)
  return Math.round((new Date(y,m-1,d) - today) / 86400000)
}
function pct(used, total) { return Math.min(100, Math.round(used / total * 100)) }

// ── Checklist item ───────────────────────────────────────────────
function CheckItem({ id, label, note, checks, toggle }) {
  const done = checks[id]
  return (
    <div className={styles.checkRow} onClick={() => toggle(id)}>
      <div className={`${styles.checkBox} ${done ? styles.checkOn : ''}`}>
        {done && <span style={{ fontSize: 10, color: '#fff', fontWeight: 700 }}>✓</span>}
      </div>
      <div>
        <div className={`${styles.checkText} ${done ? styles.checkDone : ''}`}>{label}</div>
        {note && <div className={styles.checkNote}>{note}</div>}
      </div>
    </div>
  )
}

// ── Progress bar ─────────────────────────────────────────────────
function ProgressBar({ used, total, carry }) {
  const carryPct  = carry  ? pct(carry, total) : 0
  const stemPct   = pct(Math.max(0, used - (carry||0)), total)
  const color     = used/total > 0.8 ? 'var(--danger)' : used/total > 0.6 ? 'var(--warning)' : 'var(--success)'
  return (
    <div className={styles.progWrap}>
      <div className={styles.progLabels}>
        <span>{used} / {total} days used</span>
        <span>{pct(used,total)}%</span>
      </div>
      <div className={styles.progBar}>
        {carry > 0 && <div style={{ width:`${carryPct}%`, height:'100%', background:'var(--warning)', borderRadius:3 }} />}
        <div style={{ width:`${stemPct}%`, height:'100%', background:color, borderRadius:3 }} />
      </div>
      {carry > 0 && (
        <div className={styles.progLegend}>
          <span><span className={styles.legendDot} style={{background:'var(--warning)'}}/>OPT carry-over ({carry}d)</span>
          <span><span className={styles.legendDot} style={{background:color}}/> STEM OPT ({used-carry}d)</span>
          <span>{total - used} days remaining</span>
        </div>
      )}
    </div>
  )
}

// ── Timeline event ───────────────────────────────────────────────
function Event({ type, date, label, badge, badgeType, children, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen || false)

  const dotClass = {
    done:   styles.dotDone,
    now:    styles.dotNow,
    urgent: styles.dotUrgent,
    danger: styles.dotDanger,
    future: styles.dotFuture,
  }[type] || styles.dotFuture

  const cardClass = {
    done:   styles.cardDone,
    now:    styles.cardNow,
    urgent: styles.cardUrgent,
    danger: styles.cardDanger,
    future: styles.cardFuture,
  }[type] || styles.cardFuture

  const badgeClass = {
    done:   styles.badgeDone,
    now:    styles.badgeNow,
    urgent: styles.badgeUrgent,
    danger: styles.badgeDanger,
    future: styles.badgeFuture,
  }[badgeType || type] || styles.badgeFuture

  return (
    <div className={styles.event}>
      <div className={`${styles.dot} ${dotClass}`} />
      <div className={`${styles.card} ${cardClass}`} onClick={() => setOpen(o => !o)}>
        <div className={styles.cardTop}>
          <span className={styles.eventDate}>{date}</span>
          <span className={styles.eventLabel}>{label}</span>
          <span className={`${styles.badge} ${badgeClass}`}>{badge}</span>
          <span className={styles.chevron} style={{ transform: open ? 'rotate(180deg)' : '' }}>▼</span>
        </div>
        {open && children && (
          <div className={styles.detail} onClick={e => e.stopPropagation()}>
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────
export default function JourneyPage({ visaData, user }) {
  const [checks, setChecks] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`visaguard_checklist_${user?.id||'guest'}`) || '{}') }
    catch { return {} }
  })

  function toggle(id) {
    setChecks(prev => {
      const next = { ...prev, [id]: !prev[id] }
      localStorage.setItem(`visaguard_checklist_${user?.id||'guest'}`, JSON.stringify(next))
      return next
    })
  }

  const visaType = visaData?.visa_type
  const isSTEM   = visaType === 'stem'
  const isOPT    = visaType === 'opt'
  const isCPT    = visaType === 'cpt'

  // Dates
  const i20End        = visaData?.i20_end        || null
  const optStart      = isSTEM ? visaData?.opt_auth_start : visaData?.auth_start
  const optEnd        = isSTEM ? visaData?.opt_auth_end   : visaData?.auth_end
  const stemStart     = isSTEM ? visaData?.auth_start     : (optEnd ? addD(optEnd, 1) : null)
  const stemEnd       = isSTEM ? visaData?.auth_end       : (stemStart ? addD(addM(stemStart, 24), -1) : null)
  const stemApplyBy   = optEnd ? addD(optEnd, -90) : null
  const stemDaysAway  = stemApplyBy ? daysFromNow(stemApplyBy) : null

  // OPT calculation
  const optResult = useMemo(() => {
    const start = optStart
    const end   = optEnd
    const periods = ((isSTEM ? visaData?.opt_periods : visaData?.employment_periods) || [])
      .filter(p => p.start)
      .map(p => ({ start: parseLocalDate(p.start), end: parseLocalDate(p.end) || null }))
    if (!start) return null
    try {
      return calcUnemployment({ authStart: parseLocalDate(start), authEnd: parseLocalDate(end), employmentPeriods: periods, visaType: 'opt' })
    } catch { return null }
  }, [visaData, isSTEM, optStart, optEnd])

  // STEM calculation
  const stemResult = useMemo(() => {
    if (!isSTEM || !stemStart) return null
    const carryOver = optResult?.unemployedDays || 0
    const periods = (visaData?.employment_periods || []).filter(p => p.start)
      .map(p => ({ start: parseLocalDate(p.start), end: parseLocalDate(p.end) || null }))
    try {
      return calcUnemployment({ authStart: parseLocalDate(stemStart), authEnd: parseLocalDate(stemEnd), employmentPeriods: periods, visaType: 'stem', optUnemployedDays: carryOver })
    } catch { return null }
  }, [visaData, isSTEM, stemStart, stemEnd, optResult])

  const optUsed     = optResult ? (optResult.countable ?? optResult.unemployedDays) : 0
  const stemUsed    = stemResult ? (stemResult.countable ?? stemResult.unemployedDays) : 0
  const carryOver   = optResult?.unemployedDays || 0
  const optStatus   = optResult?.status || 'ok'
  const stemStatus  = stemResult?.status || 'ok'

  if (!visaData?.visa_type) return (
    <div className={styles.empty}>
      <div style={{fontSize:'2rem',marginBottom:'1rem'}}>📋</div>
      <p style={{color:'var(--text-secondary)'}}>No visa data yet. Complete onboarding to see your timeline.</p>
    </div>
  )

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Your visa journey</h1>
        <p className={styles.subtitle}>Tap any milestone to see details and requirements</p>
      </div>

      <div className={styles.timeline}>

        {/* ── Graduation ── */}
        {i20End && (
          <Event type="done" date={fmtMon(i20End)} label="Graduated" badge="Done">
            <p className={styles.detailNote}>
              I-20 program end date: <strong>{fmtDate(i20End)}</strong>. Your OPT application window opened 90 days before this date.
            </p>
          </Event>
        )}

        {/* ── Applied for OPT ── */}
        {visaData?.opt_applied_date && (
          <Event type="done" date={fmtDate(visaData.opt_applied_date)} label="Applied for OPT" badge="Done">
            <p className={styles.detailNote}>Filed Form I-765 with USCIS within the valid application window.</p>
            <div className={styles.checklist}>
              <CheckItem id="opt_i765"     label="Filed Form I-765"                     checks={checks} toggle={toggle} />
              <CheckItem id="opt_dso_rec"  label="DSO recommendation letter obtained"   checks={checks} toggle={toggle} />
            </div>
          </Event>
        )}

        {/* ── OPT started ── */}
        {optStart && (
          <Event
            type={isSTEM ? 'done' : 'now'}
            date={fmtDate(optStart)}
            label="OPT started"
            badge={isSTEM ? 'Completed' : optStatus === 'ok' ? 'Active — within limits' : optStatus}
            badgeType={isSTEM ? 'done' : optStatus}
            defaultOpen={isOPT}
          >
            {!isSTEM && optResult && (
              <ProgressBar used={optUsed} total={optResult.limit || 90} />
            )}
            {isSTEM && optResult && (
              <div className={styles.statRow}>
                <div className={styles.stat}><div className={styles.statVal}>{optUsed}</div><div className={styles.statLabel}>Days used</div></div>
                <div className={styles.stat}><div className={styles.statVal}>{Math.max(0,(optResult.limit||90)-optUsed)}</div><div className={styles.statLabel}>Remaining</div></div>
                <div className={styles.stat}><div className={styles.statVal} style={{color:'var(--warning)'}}>{carryOver}</div><div className={styles.statLabel}>Carried over</div></div>
              </div>
            )}
            {optResult?.gaps?.length > 0 && (
              <div className={styles.gaps}>
                <div className={styles.gapsTitle}>Unemployment gaps</div>
                {optResult.gaps.map((g,i) => (
                  <div key={i} className={styles.gapRow}>
                    <span>{fmtDate(new Date(g.start).toISOString().split('T')[0])} → {fmtDate(new Date(g.end).toISOString().split('T')[0])}</span>
                    <span className={styles.gapBadge}>{g.days} days</span>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.checklist}>
              <CheckItem id="opt_ead"      label="Received EAD card from USCIS"           note="Allow 3–5 months processing time"        checks={checks} toggle={toggle} />
              <CheckItem id="opt_employer" label="Found qualifying employer"               note="Must be related to your degree field"    checks={checks} toggle={toggle} />
              <CheckItem id="opt_dso_emp"  label="Notified DSO of employer within 10 days"                                               checks={checks} toggle={toggle} />
            </div>
          </Event>
        )}

        {/* ── Apply for STEM OPT deadline ── */}
        {!isSTEM && stemApplyBy && optStart && (
          <Event
            type={
              checks['opt_stem_applied'] ? 'done' :
              stemDaysAway === null ? 'future' :
              stemDaysAway < 0  ? 'danger' :
              stemDaysAway < 30 ? 'danger' :
              stemDaysAway < 90 ? 'urgent' : 'future'
            }
            date={fmtDate(stemApplyBy)}
            label="Apply for STEM OPT"
            badge={
              checks['opt_stem_applied'] ? 'Applied ✓' :
              stemDaysAway === null ? 'Upcoming' :
              stemDaysAway < 0  ? 'Deadline passed' :
              `${stemDaysAway} days away`
            }
            badgeType={
              checks['opt_stem_applied'] ? 'done' :
              stemDaysAway !== null && stemDaysAway < 30 ? 'danger' :
              stemDaysAway !== null && stemDaysAway < 90 ? 'urgent' : 'future'
            }
          >
            {!checks['opt_stem_applied'] && stemDaysAway !== null && stemDaysAway < 0 && (
              <div className={styles.alertBox}>
                🚨 The STEM OPT application deadline has passed. If you have not applied, contact your DSO immediately.
              </div>
            )}
            {!checks['opt_stem_applied'] && stemDaysAway !== null && stemDaysAway >= 0 && (
              <p className={styles.detailNote}>
                File your STEM OPT application at least 90 days before your OPT expires on <strong>{fmtDate(optEnd)}</strong>. Do not miss this deadline.
              </p>
            )}
            <div className={styles.checklist}>
              <CheckItem id="opt_stem_everify"  label="Confirmed employer is E-Verify registered" note="Verify at e-verify.gov before accepting any offer" checks={checks} toggle={toggle} />
              <CheckItem id="opt_stem_i983"     label="I-983 Training Plan signed by employer"     note="Required before you can file"                     checks={checks} toggle={toggle} />
              <CheckItem id="opt_stem_dso_rec"  label="DSO recommendation letter obtained"                                                                  checks={checks} toggle={toggle} />
              <CheckItem id="opt_stem_applied"  label="Filed Form I-765 for STEM OPT"                                                                       checks={checks} toggle={toggle} />
            </div>
          </Event>
        )}

        {/* ── OPT ends ── */}
        {optEnd && (
          <Event
            type={isSTEM ? 'done' : 'future'}
            date={fmtDate(optEnd)}
            label="OPT ends"
            badge={isSTEM ? 'Done' : 'Upcoming'}
          >
            <p className={styles.detailNote}>
              Your OPT EAD card expires. {isSTEM
                ? `STEM OPT started the next day (${fmtDate(stemStart)}). ${carryOver} OPT unemployment days carried over into your 150-day STEM limit.`
                : `STEM OPT begins the next day if your extension is approved. Any OPT unemployment days carry over into your 150-day STEM limit.`}
            </p>
          </Event>
        )}

        {/* ── STEM OPT starts ── */}
        {stemStart && (
          <Event
            type={isSTEM ? 'now' : 'future'}
            date={fmtDate(stemStart)}
            label="STEM OPT starts"
            badge={isSTEM
              ? stemStatus === 'ok' ? 'Active — within limits' : stemStatus
              : 'Upcoming'}
            badgeType={isSTEM ? stemStatus : 'future'}
            defaultOpen={isSTEM}
          >
            {isSTEM && stemResult && (
              <ProgressBar used={stemUsed} total={150} carry={carryOver} />
            )}
            {!isSTEM && (
              <p className={styles.detailNote}>
                24-month STEM OPT extension. Your 150-day cumulative limit will include {optUsed > 0 ? `${optUsed} OPT days already used, leaving ${150-optUsed} days available` : 'any OPT unemployment days used'}.
              </p>
            )}
            {isSTEM && stemResult?.gaps?.length > 0 && (
              <div className={styles.gaps}>
                <div className={styles.gapsTitle}>STEM OPT gaps</div>
                {stemResult.gaps.map((g,i) => (
                  <div key={i} className={styles.gapRow}>
                    <span>{fmtDate(new Date(g.start).toISOString().split('T')[0])} → {fmtDate(new Date(g.end).toISOString().split('T')[0])}</span>
                    <span className={styles.gapBadge}>{g.days} days</span>
                  </div>
                ))}
              </div>
            )}
            {isSTEM && (
              <div className={styles.checklist}>
                <CheckItem id="stem_ead"     label="Received STEM OPT EAD card"                                                              checks={checks} toggle={toggle} />
                <CheckItem id="stem_6mo_1"   label="6-month validation report submitted (1st)" note={`Due ${fmtDate(addM(stemStart,6))}`}   checks={checks} toggle={toggle} />
                <CheckItem id="stem_6mo_2"   label="6-month validation report submitted (2nd)" note={`Due ${fmtDate(addM(stemStart,12))}`}  checks={checks} toggle={toggle} />
                <CheckItem id="stem_6mo_3"   label="6-month validation report submitted (3rd)" note={`Due ${fmtDate(addM(stemStart,18))}`}  checks={checks} toggle={toggle} />
                <CheckItem id="stem_6mo_4"   label="6-month validation report submitted (4th)" note={`Due ${fmtDate(addM(stemStart,24))}`}  checks={checks} toggle={toggle} />
                <CheckItem id="stem_changes" label="Reported all employer / address changes to DSO" note="Required within 10 days"          checks={checks} toggle={toggle} />
              </div>
            )}
          </Event>
        )}

        {/* ── STEM OPT ends ── */}
        {stemEnd && (
          <Event type="future" date={fmtDate(stemEnd)} label="STEM OPT ends"
            badge={`${daysFromNow(stemEnd) !== null ? Math.round(daysFromNow(stemEnd)/365*10)/10 + ' years away' : 'Upcoming'}`}>
            <p className={styles.detailNote}>
              STEM OPT EAD expires. You will need an alternative visa status by this date — typically H-1B sponsorship. Start planning 12–18 months before this date.
            </p>
          </Event>
        )}

        {/* ── CPT ── */}
        {isCPT && (
          <Event type="now" date="Current" label="F-1 CPT" badge="Active">
            <p className={styles.detailNote}>CPT is authorized per semester by your DSO. No unemployment day limit applies.</p>
            <div className={styles.checklist}>
              <CheckItem id="cpt_auth"    label="DSO authorization received each semester" note="Listed on your I-20"             checks={checks} toggle={toggle} />
              <CheckItem id="cpt_related" label="Work is integral to curriculum"           note="Verified with DSO"               checks={checks} toggle={toggle} />
            </div>
            {(visaData?.enrolled_months || 0) >= 12 && (
              <div className={styles.alertBox}>⚠ You have 12+ months of full-time CPT which makes you ineligible for OPT. Track carefully.</div>
            )}
          </Event>
        )}

      </div>

      <p className={styles.disclaimer}>For informational purposes only. Always verify with your DSO or immigration attorney.</p>
    </div>
  )
}