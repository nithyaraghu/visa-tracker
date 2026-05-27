// src/utils/stemDates.js
// Shared STEM OPT date calculation logic
// Used by OnboardingPage, EligibilityPage, TrackerPage

/**
 * Given an OPT start date string (YYYY-MM-DD),
 * returns the OPT end date (12 months - 1 day = EAD expiry convention).
 *
 * Rule: OPT EAD is valid for 12 months.
 *       EAD expiry = day before the 1-year anniversary of start.
 *       e.g. start Feb 10, 2025 → end Feb 9, 2026
 */
export function calcOptEnd(optStartStr) {
  if (!optStartStr) return ''
  const d = new Date(optStartStr)
  d.setFullYear(d.getFullYear() + 1)
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

/**
 * Given an OPT EAD expiry date string (YYYY-MM-DD),
 * returns the correct STEM OPT start, end, and apply-by dates.
 *
 * Rule: STEM OPT starts the day AFTER OPT expires.
 *       STEM OPT ends 24 months after start, minus 1 day (EAD expiry convention).
 *       Apply by = 90 days before OPT expires.
 */
export function calcStemDates(optEndStr) {
  if (!optEndStr) return { stemStart: '', stemEnd: '', applyBy: '' }

  const optEnd = new Date(optEndStr)

  // STEM start = day after OPT ends
  const stemStart = new Date(optEnd)
  stemStart.setDate(stemStart.getDate() + 1)

  // STEM end = 24 months after start, minus 1 day
  const stemEnd = new Date(stemStart)
  stemEnd.setMonth(stemEnd.getMonth() + 24)
  stemEnd.setDate(stemEnd.getDate() - 1)

  // Apply by = 90 days before OPT ends
  const applyBy = new Date(optEnd)
  applyBy.setDate(applyBy.getDate() - 90)

  function fmt(d) {
    return d.toISOString().split('T')[0]
  }

  return {
    stemStart: fmt(stemStart),
    stemEnd:   fmt(stemEnd),
    applyBy:   fmt(applyBy),
  }
}