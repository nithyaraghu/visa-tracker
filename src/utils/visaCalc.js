// utils/visaCalc.js — core unemployment day logic

export const VISA_RULES = {
  opt: {
    label: 'F-1 OPT (initial)',
    limit: 90,
    description: 'Post-completion OPT. 90-day cumulative unemployment limit.',
    thresholds: { warn: 60, urgent: 80, critical: 88 },
    milestones: [60, 30],
    limitType: 'hard'
  },
  stem: {
    label: 'F-1 STEM OPT',
    limit: 150,
    description: 'STEM OPT extension. 150-day limit includes days from initial OPT.',
    thresholds: { warn: 120, urgent: 140, critical: 148 },
    milestones: [60, 30],
    limitType: 'hard'
  },
  cpt: {
    label: 'F-1 CPT',
    limit: null,
    description: 'Semester-authorized. No strict unemployment day limit. Notify DSO if gap exceeds 2 weeks.',
    // Advisory thresholds — no legal limit but DSO notification recommended
    thresholds: { warn: 14, urgent: 30, critical: 60 },
    milestones: [30, 14],
    limitType: 'advisory',
    advisoryNote: 'CPT has no legal unemployment limit. These are advisory alerts — notify your DSO if gaps are prolonged.'
  }
}

export function parseLocalDate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function diffDays(a, b) {
  return Math.round((b - a) / 86_400_000)
}

/**
 * Calculate unemployment gaps given:
 *  - authStart / authEnd      (Date or null)
 *  - employmentPeriods        [{ start: Date, end: Date|null }]
 *  - optUnemployedDays        (number) OPT carry-over days — STEM OPT only
 * Returns { totalDays, employedDays, unemployedDays, stemTotal, gaps, pctUsed, status }
 */
export function calcUnemployment({ authStart, authEnd, employmentPeriods, visaType, optUnemployedDays = 0 }) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const rangeStart = authStart || today

  // Unemployment can only be counted up to TODAY — never into the future.
  // authEnd is used for totalDays display only, not for gap calculation.
  //
  // calcEnd rules:
  //   - If authEnd is in the PAST: use nextDay(authEnd) so the auth end date itself
  //     is included in gap calculation (e.g. auth ends Feb 9 → include Feb 9 → boundary = Feb 10)
  //   - If authEnd is today or in the FUTURE (or absent): use today as-is — no +1 needed
  //     because today is already being counted inclusively via the gap display
  const nextDay  = d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n }
  const authEndIsPast = authEnd && authEnd < today
  const calcEnd  = authEndIsPast ? nextDay(authEnd) : today
  const rangeEnd = authEnd || today

  const sorted = [...employmentPeriods]
    .filter(p => p.start)
    .map(p => ({ start: p.start, end: p.end || today }))
    .sort((a, b) => a.start - b.start)

  const totalDays = Math.max(0, diffDays(rangeStart, rangeEnd))

  // Merge overlapping periods — cap everything at calcEnd (today or authEnd if past)
  const merged = []
  for (const p of sorted) {
    const s = p.start < rangeStart ? rangeStart : p.start
    const e = p.end   > calcEnd    ? calcEnd    : p.end
    if (e <= s) continue
    if (merged.length && s <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = e > merged[merged.length - 1].end ? e : merged[merged.length - 1].end
    } else {
      merged.push({ start: new Date(s), end: new Date(e) })
    }
  }

  let employedDays = 0
  for (const p of merged) employedDays += diffDays(p.start, p.end)

  // Find gaps — only up to calcEnd, never future dates.
  // Gap starts the day AFTER employment ends (end date is last day worked, not first day unemployed).
  // e.g. employed Feb 10 → Apr 3, next job Apr 6 → gap is Apr 4, Apr 5, Apr 6 = 3 days.
  const gaps = []
  let cursor = rangeStart
  for (const p of merged) {
    // Gap runs from cursor up to (but not including) the new job start
    if (p.start > cursor && p.start <= calcEnd) {
      const gapEnd = p.start < calcEnd ? p.start : calcEnd
      gaps.push({ start: new Date(cursor), end: new Date(gapEnd), days: diffDays(cursor, gapEnd) })
    }
    // Next potential gap starts the day AFTER this job ends
    const dayAfterEnd = nextDay(p.end)
    if (dayAfterEnd > cursor) cursor = dayAfterEnd
  }
  if (cursor < calcEnd) {
    gaps.push({ start: new Date(cursor), end: new Date(calcEnd), days: diffDays(cursor, calcEnd) })
  }

  const unemployedDays = gaps.reduce((s, g) => s + g.days, 0)
  const rule  = VISA_RULES[visaType]
  const limit = rule?.limit ?? null

  // For STEM OPT: add carry-over days from initial OPT period
  const carryOver  = visaType === 'stem' ? Math.max(0, optUnemployedDays) : 0
  const stemTotal  = unemployedDays + carryOver   // total cumulative for STEM
  const countable  = visaType === 'stem' ? stemTotal : unemployedDays
  const pctUsed    = limit ? Math.round(countable / limit * 100) : null

  // Status uses thresholds for ALL visa types (hard limit or advisory)
  const t = rule.thresholds
  let status = 'ok'
  if (t) {
    if      (limit && countable >= limit) status = 'over'
    else if (countable >= t.critical)     status = 'critical'
    else if (countable >= t.urgent)       status = 'urgent'
    else if (countable >= t.warn)         status = 'warn'
  }

  return {
    totalDays, employedDays, unemployedDays, stemTotal, carryOver,
    gaps, pctUsed, status, limit, countable,
    limitType:    rule.limitType || 'hard',
    advisoryNote: rule.advisoryNote || null,
    milestones:   rule.milestones || [],
    thresholds:   t
  }
}