// backend/server.js
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env') })
import express from 'express'
import cors from 'cors'
import cron from 'node-cron'
import { checkAndSendAlerts } from './alertService.js'
import alertRoutes from './routes/alerts.js'

const app  = express()
const port = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// ── Chat endpoint — proxies to Python LangGraph agents service ───
// Python service runs on port 8000: cd agents && python main.py
// Falls back to Groq if agents service is unavailable
const AGENTS_URL = process.env.AGENTS_URL || 'http://localhost:8000'

app.post('/api/chat', async (req, res) => {
  const { messages, system } = req.body
  if (!messages?.length) return res.status(400).json({ error: 'messages required' })

  // Try Python LangGraph agents first
  try {
    const agentRes = await fetch(`${AGENTS_URL}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ messages, system }),
      signal: AbortSignal.timeout(60000)
    })
    if (agentRes.ok) {
      const data = await agentRes.json()
      console.log(`[chat] LangGraph agents: ${data.agents_used?.join(' -> ')}`)
      return res.json({ content: data.content, agents_used: data.agents_used })
    }
  } catch (err) {
    console.warn('[chat] Agents service unavailable, falling back to Groq:', err.message)
  }

  // Fallback: Groq (dynamic import so server starts even if groq-sdk not installed)
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ error: 'Agents service unavailable and no GROQ_API_KEY set.' })
    }
    const { default: Groq } = await import('groq-sdk')
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      messages: [{ role: 'system', content: system }, ...messages]
    })
    console.log('[chat] Fallback: Groq')
    res.json({ content: response.choices[0].message.content })
  } catch (err) {
    console.error('[chat] Groq fallback error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Alert routes ──────────────────────────────────────────────────
app.use('/api/alerts', alertRoutes)

// ── Health check ──────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }))

// ── Daily alert cron (runs at 8:00 AM server time) ────────────────
cron.schedule('0 8 * * *', async () => {
  console.log('[cron] Running daily alert check…')
  try {
    await checkAndSendAlerts()
    console.log('[cron] Alert check complete')
  } catch (err) {
    console.error('[cron] Error:', err.message)
  }
})

app.listen(port, () => {
  console.log(`VisaGuard backend running on http://localhost:${port}`)
  console.log(`Groq API key:   ${process.env.GROQ_API_KEY  ? '✓ set' : '✗ MISSING'}`)
  console.log(`Resend API key: ${process.env.RESEND_API_KEY ? '✓ set' : '✗ MISSING (email alerts disabled)'}`)
})