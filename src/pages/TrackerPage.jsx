import { useState, useMemo } from 'react'
import { parseLocalDate, calcUnemployment, VISA_RULES } from '../utils/visaCalc.js'
import { supabase } from '../auth/supabase.js'
import styles from './TrackerPage.module.css'

const STATUS_META = {
  ok:       { color: 'var(--success)', bg: 'var(--success-soft)', label: 'Within limits'    },
  warn:     { color: 'var(--warning)', bg: 'var(--warning-soft)', label: 'Watch closely'     },
  urgent:   { color: 'var(--warning)', bg: 'var(--warning-soft)', label: 'Approaching limit' },
  critical: { color: 'var(--danger)',  bg: 'var(--danger-soft)',  label: 'Critical'          },
  over:     { color: 'var(--danger)',  bg: 'var(--danger-soft)',  label: 'Limit exceeded'    },
}

function fmt(str) {
  if (!str) return '—'
  const [y,m,d] = str.split('-').map(Number)
  return new Date(y,m-1,d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
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

let _pid = 0
const newPeriod = () => ({ id: ++_pid, startStr: '', endStr: '' })

export default function TrackerPage({ initialData }) {
  const [customMode, setCustomMode] = useState(false)
  const [calculated, setCalculated] = useState(false)

  // ── Pre-filled from onboarding ─────────────────────────────
  const prefilled = useMemo(() => {
    if (!initialData?.visa_type) return null
    return {
      visaType:   initialData.visa_type,
      authStart:  initialData.auth_start  || '',
      authEnd:    initialData.auth_end    || '',
      optStart:   initialData.opt_auth_start || '',
      optEnd:     initialData.opt_auth_end   || '',
      periods:    (initialData.employment_periods || []).map(p => ({ id: ++_pid, startStr: p.start||'', endStr: p.end||'' })),
      optPeriods: (initialData.opt_periods || []).map(p => ({ id: ++_pid, startStr: p.start||'', endStr: p.end||'' })),
    }
  }, [initialData])

  // ── Custom mode state ───────────────────────────────────────
  const [visaType,   setVisaType]   = useState('opt')
  const [authStart,  setAuthStart]  = useState('')
  const [authEnd,    setAuthEnd]    = useState('')
  const [optStart,   setOptStart]   = useState('')
  const [optEnd,     setOptEnd]     = useState('')
  const [periods,    setPeriods]    = useState([newPeriod()])
  const [optPeriods, setOptPeriods] = useState([newPeriod()])

  const addPeriod    = () => setPeriods(p => [...p, newPeriod()])
  const removePeriod = id => setPeriods(p => p.filter(x => x.id !== id))
  const updatePeriod = (id,f,v) => setPeriods(p => p.map(x => x.id===id?{...x,[f]:v}:x))
  const addOptPeriod    = () => setOptPeriods(p => [...p, newPeriod()])
  const removeOptPeriod = id => setOptPeriods(p => p.filter(x => x.id !== id))
  const updateOptPeriod = (id,f,v) => setOptPeriods(p => p.map(x => x.id===id?{...x,[f]:v}:x))

  // ── Active data — either pre-filled or custom ───────────────
  const [editedPeriods, setEditedPeriods] = useState(null)
  const [editedOptPeriods, setEditedOptPeriods] = useState(null)

  const activeType       = customMode ? visaType       : prefilled?.visaType      || 'opt'
  const activeAuthStart  = customMode ? authStart      : prefilled?.authStart     || ''
  const activeAuthEnd    = customMode ? authEnd        : prefilled?.authEnd       || ''
  const activeOptStart   = customMode ? optStart       : prefilled?.optStart      || ''
  const activeOptEnd     = customMode ? optEnd         : prefilled?.optEnd        || ''
  const activePeriods    = customMode ? periods        : (editedPeriods    || prefilled?.periods    || [newPeriod()])
  const activeOptPeriods = customMode ? optPeriods     : (editedOptPeriods || prefilled?.optPeriods || [newPeriod()])

  const isSTEM = activeType === 'stem'

  // ── Calculation ─────────────────────────────────────────────
  const result = useMemo(() => {
    if (!calculated || !activeAuthStart) return null
    const empPeriods = activePeriods.filter(p => p.startStr)
      .map(p => ({ start: parseLocalDate(p.startStr), end: parseLocalDate(p.endStr)||null }))

    let carryOver = 0
    if (isSTEM && activeOptStart) {
      const optEmp = activeOptPeriods.filter(p => p.startStr)
        .map(p => ({ start: parseLocalDate(p.startStr), end: parseLocalDate(p.endStr)||null }))
      try {
        const optRes = calcUnemployment({ authStart: parseLocalDate(activeOptStart), authEnd: parseLocalDate(activeOptEnd), employmentPeriods: optEmp, visaType: 'opt' })
        carryOver = optRes.unemployedDays || 0
      } catch {}
    }

    try {
      const res = calcUnemployment({
        authStart: parseLocalDate(activeAuthStart),
        authEnd:   parseLocalDate(activeAuthEnd),
        employmentPeriods: empPeriods,
        visaType:  activeType,
        optUnemployedDays: carryOver,
      })
      return { ...res, carryOver }
    } catch { return null }
  }, [calculated, activeAuthStart, activeAuthEnd, activePeriods, activeOptPeriods, activeType, activeOptStart, activeOptEnd, isSTEM])

  const meta     = result ? (STATUS_META[result.status] || STATUS_META.ok) : null
  const daysUsed = result ? (result.countable ?? result.unemployedDays) : 0
  const pct      = result?.limit ? Math.min(100, Math.round(daysUsed / result.limit * 100)) : 0

  // ── Deadline: if still unemployed, when do I hit the limit? ─
  const limitDeadline = useMemo(() => {
    if (!result?.limit || daysUsed >= result.limit) return null
    const remaining = result.limit - daysUsed
    const today = new Date(); today.setHours(0,0,0,0)
    const dl = new Date(today); dl.setDate(dl.getDate() + remaining)
    return dl.toISOString().split('T')[0]
  }, [result, daysUsed])

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Status Tracker</h1>
        <p className={styles.subtitle}>Calculate your unemployment days and compliance window</p>
      </div>

      {/* ── Mode toggle ── */}
      {prefilled && (
        <div className={styles.modeRow}>
          <button className={`${styles.modeBtn} ${!customMode ? styles.modeBtnActive : ''}`}
            onClick={() => { setCustomMode(false); setCalculated(false) }}>
            My onboarding data
          </button>
          <button className={`${styles.modeBtn} ${customMode ? styles.modeBtnActive : ''}`}
            onClick={() => { setCustomMode(true); setCalculated(false) }}>
            Custom dates
          </button>
        </div>
      )}

      {/* ── Pre-filled mode ── */}
      {!customMode && prefilled && (
        <div className={styles.formCard}>
          <div className={styles.prefilledInfo}>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Visa type</span>
              <span className={styles.infoVal}>{prefilled.visaType === 'stem' ? 'F-1 STEM OPT' : prefilled.visaType === 'opt' ? 'F-1 OPT' : 'F-1 CPT'}</span>
            </div>
            {isSTEM && prefilled.optStart && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>OPT period</span>
                <span className={styles.infoVal}>{fmt(prefilled.optStart)} → {fmt(prefilled.optEnd)}</span>
              </div>
            )}
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{isSTEM ? 'STEM OPT period' : 'OPT period'}</span>
              <span className={styles.infoVal}>{fmt(prefilled.authStart)} → {fmt(prefilled.authEnd)}</span>
            </div>
          </div>

          {/* Employment periods — editable even in pre-filled mode */}
          {isSTEM && (
            <div className={styles.section}>
              <div className={styles.sectionHead}>
                <label className={styles.label}>OPT employment periods</label>
                <button className={styles.addBtn} onClick={() => setEditedOptPeriods(p => [...(p||activeOptPeriods), newPeriod()])}>+ Add</button>
              </div>
              {activeOptPeriods.map(p => (
                <div key={p.id} className={styles.periodRow}>
                  <div className={styles.field}>
                    <label className={styles.miniLabel}>Start</label>
                    <input type="date" className={styles.input} value={p.startStr}
                      onChange={e => {
                        const next = activeOptPeriods.map(x => x.id===p.id?{...x,startStr:e.target.value}:x)
                        setEditedOptPeriods(next)
                      }} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.miniLabel}>End</label>
                    <input type="date" className={styles.input} value={p.endStr}
                      onChange={e => {
                        const next = activeOptPeriods.map(x => x.id===p.id?{...x,endStr:e.target.value}:x)
                        setEditedOptPeriods(next)
                      }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <label className={styles.label}>{isSTEM ? 'STEM OPT employment periods' : 'Employment periods'}</label>
              <button className={styles.addBtn} onClick={() => setEditedPeriods(p => [...(p||activePeriods), newPeriod()])}>+ Add</button>
            </div>
            {activePeriods.map(p => (
              <div key={p.id} className={styles.periodRow}>
                <div className={styles.field}>
                  <label className={styles.miniLabel}>Start</label>
                  <input type="date" className={styles.input} value={p.startStr}
                    min={activeAuthStart || undefined}
                    max={activeAuthEnd || undefined}
                    onChange={e => {
                      const next = activePeriods.map(x => x.id===p.id?{...x,startStr:e.target.value}:x)
                      setEditedPeriods(next)
                      setCalculated(false)
                    }} />
                </div>
                <div className={styles.field}>
                  <label className={styles.miniLabel}>End (blank = current)</label>
                  <input type="date" className={styles.input} value={p.endStr}
                    onChange={e => {
                      const next = activePeriods.map(x => x.id===p.id?{...x,endStr:e.target.value}:x)
                      setEditedPeriods(next)
                      setCalculated(false)
                    }} />
                </div>
                {activePeriods.length > 1 && (
                  <button className={styles.delBtn} onClick={() => setEditedPeriods(activePeriods.filter(x=>x.id!==p.id))}>×</button>
                )}
              </div>
            ))}
          </div>

          <button className={styles.calcBtn} onClick={() => setCalculated(true)}>
            Calculate unemployment days
          </button>
        </div>
      )}

      {/* ── Custom mode ── */}
      {(customMode || !prefilled) && (
        <div className={styles.formCard}>
          <div className={styles.field}>
            <label className={styles.label}>Visa type</label>
            <select className={styles.select} value={visaType} onChange={e => { setVisaType(e.target.value); setCalculated(false) }}>
              <option value="opt">F-1 OPT</option>
              <option value="stem">F-1 STEM OPT</option>
              <option value="cpt">F-1 CPT</option>
            </select>
          </div>

          {visaType === 'stem' && (
            <div className={styles.optBlock}>
              <div className={styles.optBlockTitle}>Initial OPT period</div>
              <div className={styles.row2}>
                <div className={styles.field}>
                  <label className={styles.miniLabel}>OPT start date</label>
                  <input type="date" className={styles.input} value={optStart}
                    onChange={e => { setOptStart(e.target.value); setOptEnd(addD(addM(e.target.value,12),-1)); setCalculated(false) }} />
                </div>
                <div className={styles.field}>
                  <label className={styles.miniLabel}>OPT end date</label>
                  <input type="date" className={styles.input} value={optEnd}
                    onChange={e => { setOptEnd(e.target.value); setAuthStart(addD(e.target.value,1)); setAuthEnd(addD(addM(addD(e.target.value,1),24),-1)); setCalculated(false) }} />
                </div>
              </div>
              <div className={styles.sectionHead} style={{marginTop:8}}>
                <label className={styles.miniLabel}>OPT employment periods</label>
                <button className={styles.addBtn} onClick={addOptPeriod}>+ Add</button>
              </div>
              {optPeriods.map(p => (
                <div key={p.id} className={styles.periodRow}>
                  <div className={styles.field}>
                    <input type="date" className={styles.input} value={p.startStr} onChange={e => updateOptPeriod(p.id,'startStr',e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <input type="date" className={styles.input} value={p.endStr} onChange={e => updateOptPeriod(p.id,'endStr',e.target.value)} />
                  </div>
                  {optPeriods.length > 1 && <button className={styles.delBtn} onClick={() => removeOptPeriod(p.id)}>×</button>}
                </div>
              ))}
            </div>
          )}

          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>{visaType === 'stem' ? 'STEM OPT start' : 'Authorization start'}</label>
              <input type="date" className={styles.input} value={authStart}
                onChange={e => { setAuthStart(e.target.value); if(visaType==='opt') setAuthEnd(addD(addM(e.target.value,12),-1)); setCalculated(false) }} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>{visaType === 'stem' ? 'STEM OPT end' : 'Authorization end'}</label>
              <input type="date" className={styles.input} value={authEnd}
                onChange={e => { setAuthEnd(e.target.value); setCalculated(false) }} />
              {authStart && authEnd && <p className={styles.fieldHint} style={{color:'var(--success)'}}>✓ Auto-calculated</p>}
            </div>
          </div>

          <div className={styles.sectionHead}>
            <label className={styles.label}>Employment periods</label>
            <button className={styles.addBtn} onClick={addPeriod}>+ Add period</button>
          </div>
          {periods.map(p => (
            <div key={p.id} className={styles.periodRow}>
              <div className={styles.field}>
                <label className={styles.miniLabel}>Start date</label>
                <input type="date" className={styles.input} value={p.startStr}
                  min={authStart || undefined}
                  max={authEnd || undefined}
                  onChange={e => { updatePeriod(p.id,'startStr',e.target.value); setCalculated(false) }} />
              </div>
              <div className={styles.field}>
                <label className={styles.miniLabel}>End (blank = current)</label>
                <input type="date" className={styles.input} value={p.endStr} onChange={e => { updatePeriod(p.id,'endStr',e.target.value); setCalculated(false) }} />
              </div>
              {periods.length > 1 && <button className={styles.delBtn} onClick={() => removePeriod(p.id)}>×</button>}
            </div>
          ))}

          <button className={styles.calcBtn} onClick={() => setCalculated(true)} disabled={!authStart}>
            Calculate unemployment days
          </button>
        </div>
      )}

      {/* ── Results ── */}
      {calculated && result && (
        <div className={styles.results}>

          {/* Status hero */}
          <div className={styles.heroCard} style={{ borderColor: `${meta.color}40` }}>
            <div className={styles.heroTop}>
              <div>
                <div className={styles.heroLabel}>
                  {isSTEM ? 'Cumulative unemployment (OPT + STEM)' : 'Unemployment days used'}
                </div>
                <div className={styles.heroNum}>
                  <span style={{ color: meta.color }}>{daysUsed}</span>
                  <span className={styles.heroLimit}>/ {result.limit || '—'} days</span>
                </div>
              </div>
              <div className={styles.heroBadge} style={{ color: meta.color, background: meta.bg }}>
                {meta.label}
              </div>
            </div>

            {/* Progress bar */}
            {result.limit && (
              <div className={styles.heroBar}>
                <div className={styles.heroBarTrack}>
                  {isSTEM && result.carryOver > 0 && (
                    <div style={{ position:'absolute', left:0, top:0, height:'100%', width:`${Math.min(100,result.carryOver/result.limit*100)}%`, background:'var(--warning)', borderRadius:3 }} />
                  )}
                  <div style={{ position:'absolute', left: isSTEM && result.carryOver > 0 ? `${Math.min(100,result.carryOver/result.limit*100)}%` : 0, top:0, height:'100%', width:`${Math.min(100-(isSTEM&&result.carryOver>0?result.carryOver/result.limit*100:0), (daysUsed-(isSTEM?result.carryOver:0))/result.limit*100)}%`, background: meta.color, borderRadius:3 }} />
                </div>
                <span className={styles.progressPct}>{pct}%</span>
              </div>
            )}

            {/* Stats */}
            <div className={styles.heroStats}>
              {isSTEM && result.carryOver > 0 && (
                <div className={styles.heroStat}>
                  <div className={styles.heroStatLabel}>OPT carry-over</div>
                  <div className={styles.heroStatVal} style={{ color: 'var(--warning)' }}>{result.carryOver}</div>
                </div>
              )}
              {isSTEM && (
                <div className={styles.heroStat}>
                  <div className={styles.heroStatLabel}>STEM OPT days</div>
                  <div className={styles.heroStatVal}>{result.unemployedDays}</div>
                </div>
              )}
              <div className={styles.heroStat}>
                <div className={styles.heroStatLabel}>Total used</div>
                <div className={styles.heroStatVal} style={{ color: meta.color }}>{daysUsed}</div>
              </div>
              <div className={styles.heroStat}>
                <div className={styles.heroStatLabel}>Remaining</div>
                <div className={styles.heroStatVal} style={{ color: meta.color }}>{Math.max(0,(result.limit||0)-daysUsed)}</div>
              </div>
              <div className={styles.heroStat}>
                <div className={styles.heroStatLabel}>Employed days</div>
                <div className={styles.heroStatVal} style={{ color: 'var(--success)' }}>{result.employedDays}</div>
              </div>
            </div>
          </div>

          {/* If still unemployed, when do I hit the limit? */}
          {limitDeadline && (
            <div className={styles.deadlineCard} style={{
              borderColor: daysFromNow(limitDeadline) < 30 ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.3)',
              background:  daysFromNow(limitDeadline) < 30 ? 'var(--danger-soft)'  : 'var(--warning-soft)',
            }}>
              <div>
                <div className={styles.deadlineLabel}>If still unemployed, limit reached on</div>
                <div className={styles.deadlineDate} style={{ color: daysFromNow(limitDeadline) < 30 ? 'var(--danger)' : 'var(--warning)' }}>
                  {fmt(limitDeadline)}
                </div>
              </div>
              <div className={styles.deadlineDays} style={{ color: daysFromNow(limitDeadline) < 30 ? 'var(--danger)' : 'var(--warning)' }}>
                {daysFromNow(limitDeadline)} days away
              </div>
            </div>
          )}

          {/* Gaps */}
          {result.gaps?.length > 0 && (
            <div className={styles.gapsCard}>
              <div className={styles.gapsTitle}>Unemployment gaps</div>
              {result.gaps.map((g, i) => (
                <div key={i} className={styles.gapRow}>
                  <span className={styles.gapDates}>
                    {new Date(g.start).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} →{' '}
                    {new Date(g.end).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                  </span>
                  <span className={styles.gapBadge} style={{
                    color: g.days >= 30 ? 'var(--danger)' : g.days >= 14 ? 'var(--warning)' : 'var(--text-secondary)',
                    background: g.days >= 30 ? 'var(--danger-soft)' : g.days >= 14 ? 'var(--warning-soft)' : 'var(--surface-3)',
                  }}>{g.days} days</span>
                </div>
              ))}
            </div>
          )}

          {result.gaps?.length === 0 && (
            <div className={styles.noGaps}>✓ No unemployment gaps found — fully employed throughout this period</div>
          )}
        </div>
      )}

      {!calculated && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📊</div>
          <p>{!customMode && prefilled ? 'Update your employment periods above and click Calculate' : 'Fill in your details and click Calculate to see your compliance status'}</p>
        </div>
      )}
    </div>
  )
}