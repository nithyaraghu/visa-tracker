// backend/server.js
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env') })

import express    from 'express'
import cors       from 'cors'
import cron       from 'node-cron'
import rateLimit  from 'express-rate-limit'
import helmet     from 'helmet'
import { z }      from 'zod'
import { checkAndSendAlerts } from './alertService.js'
import alertRoutes from './routes/alerts.js'

const app  = express()
const port = process.env.PORT || 3001

// ── Validation schemas (Zod) ──────────────────────────────────────
// These define exactly what shape of data we accept
// Anything that doesn't match gets rejected with a 400 error

const MessageSchema = z.object({
  role:    z.enum(['user', 'assistant', 'system']),  // only these 3 roles allowed
  content: z.string().min(1).max(4000),              // must be 1-4000 chars
})

const ChatSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(50),   // 1-50 messages
  system:   z.string().max(8000).optional(),          // optional system prompt
})

const AlertSchema = z.object({
  email:        z.string().email(),                   // must be valid email
  name:         z.string().max(100).optional(),
  visaType:     z.enum(['opt', 'stem', 'cpt']),
  authStart:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // YYYY-MM-DD
  authEnd:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  alertLevels:  z.array(z.enum(['warn', 'urgent', 'critical'])).optional(),
})

// Helper — validates request body and returns error if invalid
function validate(schema, body) {
  const result = schema.safeParse(body)
  if (!result.success) {
    const errors = result.error?.errors?.map(e => `${e.path.join('.')}: ${e.message}`) || ['Invalid request body']
    return { valid: false, errors }
  }
  return { valid: true, data: result.data }
}

// ── Rate limiting ─────────────────────────────────────────────────
// General limiter: 100 requests per 15 mins per IP (protects all routes)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests — please wait 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Chat limiter: 10 messages per minute (protects Groq API credits)
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Chat limit reached — please wait a moment' },
})

app.use(helmet({
  // Allow Vercel frontend to connect
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // We'll configure this later
}))
app.use(limiter)
app.use(cors())
app.use(express.json())

// ── Chat endpoint ─────────────────────────────────────────────────
const AGENTS_URL = process.env.AGENTS_URL || 'http://localhost:8000'

app.post('/api/chat', chatLimiter, async (req, res) => {
  // Validate input shape before doing anything
  const { valid, errors, data } = validate(ChatSchema, req.body)
  if (!valid) return res.status(400).json({ error: 'Invalid request', details: errors })
  const { messages, system } = data

  // Try Python LangGraph agents first
  try {
    const agentRes = await fetch(`${AGENTS_URL}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ messages, system }),
      signal:  AbortSignal.timeout(30000)
    })
    if (agentRes.ok) {
      const data = await agentRes.json()
      console.log(`[chat] LangGraph agents: ${data.agents_used?.join(' -> ')}`)
      return res.json({ content: data.content, agents_used: data.agents_used })
    }
  } catch (err) {
    console.warn('[chat] Agents service unavailable, falling back to Groq:', err.message)
  }

  // Fallback: Groq
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
app.get('/api/health', (_, res) => res.json({
  status: 'ok',
  time: new Date().toISOString(),
  security: { rateLimit: 'enabled', chatLimit: '10/min' }
}))

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
  console.log(`Groq API key:   ${process.env.GROQ_API_KEY   ? '✓ set' : '✗ MISSING'}`)
  console.log(`Resend API key: ${process.env.RESEND_API_KEY  ? '✓ set' : '✗ MISSING (email alerts disabled)'}`)
  console.log(`Security:       ✓ rate limiting + helmet headers enabled`)
})