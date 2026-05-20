// backend/routes/alerts.js
import express from 'express'
import { saveSubscriber, loadSubscribers } from '../db.js'

const router = express.Router()

// POST /api/alerts/register
router.post('/register', async (req, res) => {
  const { email, name, visaType, authStart, authEnd, employedSince, alertLevels } = req.body

  if (!email || !visaType) {
    return res.status(400).json({ error: 'email and visaType are required' })
  }
  if (!['opt', 'stem', 'cpt', 'h1b', 'j1'].includes(visaType)) {
    return res.status(400).json({ error: 'visaType must be opt or stem' })
  }

  try {
    const subscriber = await saveSubscriber({
      email, name, visaType, authStart, authEnd, employedSince,
      alertLevels: alertLevels || ['warn', 'urgent', 'critical']
    })
    res.json({ success: true, id: subscriber.id })
  } catch (err) {
    console.error('[alerts/register]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/alerts/subscribers  (dev only — remove in production)
router.get('/subscribers', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'forbidden' })
  }
  const subs = await loadSubscribers()
  res.json(subs.map(s => ({ ...s, email: s.email.replace(/(.{2}).*(@)/, '$1***$2') })))
})

export default router