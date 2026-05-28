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
  // Parse as local date to avoid timezone shift
  const [y, m, d] = optStartStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setFullYear(date.getFullYear() + 1)
  date.setDate(date.getDate() - 1)
  return date.toISOString().split('T')[0]
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

  // Parse as local date to avoid timezone shift
  const [y, m, d] = optEndStr.split('-').map(Number)
  const optEnd = new Date(y, m - 1, d)

  const stemStart = new Date(y, m - 1, d + 1)             // day after OPT ends
  const stemEnd   = new Date(stemStart.getFullYear(),
                             stemStart.getMonth() + 24,
                             stemStart.getDate() - 1)      // 24 months - 1 day
  const applyBy   = new Date(y, m - 1, d - 90)            // 90 days before OPT ends

  function fmt(dt) {
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
  }

  return {
    stemStart: fmt(stemStart),
    stemEnd:   fmt(stemEnd),
    applyBy:   fmt(applyBy),
  }
}