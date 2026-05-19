// backend/alertService.js
import { Resend } from 'resend'
import { loadSubscribers, markAlertSent } from './db.js'

// Lazy init — only create Resend client when actually sending, so server
// starts fine even without RESEND_API_KEY set during development
const getResend = () => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY not set — email alerts disabled')
  }
  return new Resend(process.env.RESEND_API_KEY)
}

const LIMITS = { opt: 90, stem: 150, h1b: 60 }
const THRESHOLDS = {
  opt: [
    { days: 60, level: 'warn',     subject: 'OPT Alert: 60 unemployment days reached' },
    { days: 80, level: 'urgent',   subject: '⚡ OPT Alert: 80 days — act now' },
    { days: 88, level: 'critical', subject: '🚨 OPT Critical: 88/90 days — 2 days left' },
  ],
  stem: [
    { days: 120, level: 'warn',    subject: 'STEM OPT Alert: 120 unemployment days reached' },
    { days: 140, level: 'urgent',  subject: '⚡ STEM OPT Alert: 140 days — act now' },
    { days: 148, level: 'critical',subject: '🚨 STEM OPT Critical: 148/150 days left' },
  ],
  cpt: [
    { days: 14, level: 'warn',     subject: 'CPT Advisory: 14-day gap — notify your DSO' },
    { days: 30, level: 'urgent',   subject: '⚡ CPT Advisory: 30-day gap — contact DSO immediately' },
    { days: 60, level: 'critical', subject: '🚨 CPT Advisory: 60-day gap — authorization at risk' },
  ],
  h1b: [
    { days: 30, level: 'warn',     subject: 'H-1B Alert: 30-day grace period used — begin new sponsorship' },
    { days: 50, level: 'urgent',   subject: '⚡ H-1B Alert: 50 days used — only 10 days remaining' },
    { days: 58, level: 'critical', subject: '🚨 H-1B Critical: 58/60 days — 2 days left in grace period' },
  ],
  j1: [
    { days: 14, level: 'warn',     subject: 'J-1 Advisory: 14-day gap — contact your sponsor' },
    { days: 30, level: 'urgent',   subject: '⚡ J-1 Advisory: 30-day gap — sponsor notification required' },
    { days: 45, level: 'critical', subject: '🚨 J-1 Advisory: 45-day gap — program status at risk' },
  ]
}

function diffDays(a, b) {
  return Math.round((b - a) / 86_400_000)
}

function calcUnemployedDays(subscriber) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const authStart = subscriber.auth_start ? new Date(subscriber.auth_start) : null
  const authEnd   = subscriber.auth_end   ? new Date(subscriber.auth_end)   : today
  const empSince  = subscriber.employed_since ? new Date(subscriber.employed_since) : null

  if (!authStart) return 0

  const rangeEnd = authEnd < today ? authEnd : today
  const total    = diffDays(authStart, rangeEnd)

  let employed = 0
  if (empSince && empSince > authStart) {
    const empEnd = rangeEnd
    if (empEnd > empSince) employed = diffDays(empSince, empEnd)
  }

  return Math.max(0, total - employed)
}

function buildEmailHtml(subscriber, unemployedDays, threshold) {
  const limit   = LIMITS[subscriber.visa_type]
  const pct     = Math.round(unemployedDays / limit * 100)
  const remaining = limit - unemployedDays
  const color   = threshold.level === 'critical' ? '#ef4444'
                : threshold.level === 'urgent'   ? '#f59e0b' : '#3b82f6'

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 20px; }
    .card { max-width: 560px; margin: 0 auto; background: #0f2040; border-radius: 12px; padding: 32px; color: #e8f0fc; }
    .logo { font-size: 1.2rem; font-weight: 600; margin-bottom: 24px; }
    .logo em { color: #3b82f6; font-style: normal; }
    h1 { font-size: 1.4rem; margin: 0 0 8px; }
    .sub { color: #8aa6cc; font-size: 0.9rem; margin-bottom: 24px; }
    .meter-wrap { background: #162b55; border-radius: 6px; height: 10px; margin: 16px 0; }
    .meter-fill { height: 100%; border-radius: 6px; background: ${color}; width: ${pct}%; }
    .stats { display: flex; gap: 16px; margin: 20px 0; }
    .stat { background: #162b55; border-radius: 8px; padding: 12px 16px; flex: 1; }
    .stat-label { font-size: 0.75rem; color: #8aa6cc; }
    .stat-val { font-size: 1.4rem; font-weight: 300; color: ${color}; }
    .actions { background: #162b55; border-radius: 8px; padding: 16px; margin-top: 20px; }
    .actions h3 { font-size: 0.9rem; margin: 0 0 10px; color: #a8c4e8; }
    .actions li { font-size: 0.85rem; color: #8aa6cc; margin-bottom: 6px; }
    .disclaimer { font-size: 0.75rem; color: #4a6a99; margin-top: 24px; border-top: 1px solid #162b55; padding-top: 16px; }
    a { color: #3b82f6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Visa<em>Guard</em></div>
    <h1>${threshold.level === 'critical' ? '🚨' : threshold.level === 'urgent' ? '⚡' : '📊'} ${threshold.subject.replace(/^[^ ]+ /, '')}</h1>
    <p class="sub">Hi ${subscriber.name || 'there'} — here's your ${subscriber.visa_type.toUpperCase()} unemployment status update.</p>

    <div style="display:flex;justify-content:space-between;font-size:0.82rem;color:#8aa6cc;">
      <span>0 days</span><span>${limit} day limit</span>
    </div>
    <div class="meter-wrap"><div class="meter-fill"></div></div>

    <div class="stats">
      <div class="stat">
        <div class="stat-label">Unemployment days</div>
        <div class="stat-val">${unemployedDays}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Days remaining</div>
        <div class="stat-val">${remaining}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Limit</div>
        <div class="stat-val">${limit}</div>
      </div>
    </div>

    <div class="actions">
      <h3>Recommended actions</h3>
      <ul>
        ${threshold.level === 'critical' ? `
          <li>🚨 Contact your DSO immediately — you have ${remaining} days left</li>
          <li>Consider a school transfer, change of status, or departure planning</li>
          <li>Document any job offers, interviews, or pending applications</li>
        ` : threshold.level === 'urgent' ? `
          <li>Prioritize job applications — only ${remaining} days remaining</li>
          <li>Consult your DSO about your options if employment is uncertain</li>
          <li>Keep records of active job search (emails, applications, interviews)</li>
        ` : `
          <li>Increase job search intensity — you've used ${pct}% of your limit</li>
          <li>Attend networking events and reach out to your university career center</li>
          <li>Keep your DSO updated on your employment status</li>
        `}
      </ul>
    </div>

    <p class="disclaimer">
      This is an automated notification from VisaGuard. This is for informational purposes only
      and does not constitute legal advice. Always consult your Designated School Official (DSO)
      or a qualified immigration attorney for decisions about your visa status.
    </p>
  </div>
</body>
</html>`
}

export async function checkAndSendAlerts() {
  const subscribers = await loadSubscribers()

  for (const sub of subscribers) {
    const unemployedDays = calcUnemployedDays(sub)
    const thresholds     = THRESHOLDS[sub.visa_type] || []
    const alertLevels    = sub.alert_levels || ['warn', 'urgent', 'critical']
    const sentAlerts     = sub.sent_alerts  || []

    for (const t of thresholds) {
      if (
        unemployedDays >= t.days &&
        alertLevels.includes(t.level) &&
        !sentAlerts.includes(t.level)
      ) {
        try {
          await getResend().emails.send({
            from: process.env.ALERT_FROM_EMAIL || 'alerts@visaguard.app',
            to:   sub.email,
            subject: t.subject,
            html: buildEmailHtml(sub, unemployedDays, t)
          })
          await markAlertSent(sub.id, t.level)
          console.log(`[alerts] Sent ${t.level} alert to ${sub.email} (${unemployedDays} days)`)
        } catch (err) {
          console.error(`[alerts] Failed to send to ${sub.email}:`, err.message)
        }
      }
    }
  }
}