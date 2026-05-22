import { useState, useRef, useEffect } from 'react'
import styles from './ChatPage.module.css'

function buildSystemPrompt(visaData) {
  const base = `You are VisaGuard AI, a specialized visa compliance advisor for F-1 OPT and STEM OPT students.

Your role:
- Answer questions about unemployment day rules, compliance requirements, and status maintenance
- Provide up-to-date information by searching USCIS, SEVP, and official government sources
- Explain what students/workers should do when approaching unemployment day limits
- Always note when the user should consult their DSO or an immigration attorney

Key facts:
- F-1 OPT: 90-day cumulative unemployment limit (days count 7 days/week including weekends)
- F-1 STEM OPT: 150-day cumulative limit (includes unemployment days from initial OPT)
- Exceeding limits can result in F-1 status termination

Tone: Clear, authoritative, empathetic. Users are anxious about their immigration status.
Always use web search to verify current USCIS policy before answering.
End answers with a brief disclaimer to verify with DSO or immigration counsel.`

  if (!visaData || !visaData.visa_type) return base

  const visaLabels = { opt: 'F-1 OPT', stem: 'F-1 STEM OPT', cpt: 'F-1 CPT' }
  const limits     = { opt: 90, stem: 150 }

  let context = `

CURRENT USER VISA DATA (use this for personalized answers):
- Visa type: ${visaLabels[visaData.visa_type] || visaData.visa_type}
- Unemployment limit: ${limits[visaData.visa_type] ? limits[visaData.visa_type] + ' days' : 'N/A'}
- Authorization start: ${visaData.auth_start || 'not entered'}
- Authorization end: ${visaData.auth_end || 'not entered'}`

  if (visaData.visa_type === 'stem' && visaData.opt_auth_start) {
    context += `
- Initial OPT period: ${visaData.opt_auth_start} to ${visaData.opt_auth_end || 'unknown'}`
  }

  if (visaData.employment_periods?.length) {
    const jobs = visaData.employment_periods.filter(p => p.start)
    context += `
- Employment periods: ${jobs.length} period(s) on file`
    jobs.forEach((p, i) => {
      context += `
  Job ${i+1}: ${p.start} to ${p.end || 'present'}`
    })
  }

  context += `

When the user asks about their compliance, days remaining, or risk level — use their actual data above to give a personalized answer.`

  return base + context
}

const SUGGESTED = [
  'How many unemployment days do I have left?',
  'Am I at risk of violating my OPT status?',
  'What happens if I exceed 90 unemployment days on OPT?',
  'Can I do freelance work on STEM OPT?',
  'How does the 60-day grace period work after OPT ends?',
]

export default function ChatPage({ visaData }) {
  const [messages, setMessages] = useState([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text) {
    const userMsg = text || input.trim()
    if (!userMsg || loading) return
    setInput('')

    const newMessages = [...messages, { role: 'user', content: userMsg }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
      const res = await fetch(`${API_BASE}/api/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          system:   buildSystemPrompt(visaData)
        })
      })

      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠ AI advisor unavailable — backend service is starting up. Please try again in a moment.`
      }])
    }
    setLoading(false)
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>AI Visa Advisor</h1>
        <p className={styles.subtitle}>
          Powered by Groq/Llama with live web search — always answers with current USCIS policy
          {visaData?.visa_type && (
            <span className={styles.contextBadge}>
              ✓ Knows your {visaData.visa_type.toUpperCase()} data
            </span>
          )}
        </p>
      </div>

      <div className={styles.chatBox}>
        {messages.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🤖</div>
            <p className={styles.emptyTitle}>VisaGuard AI</p>
            <p className={styles.emptySub}>
              {visaData?.visa_type
                ? `I have your ${visaData.visa_type.toUpperCase()} data loaded. Ask me anything about your compliance status.`
                : 'Ask me anything about OPT, STEM OPT compliance, or USCIS policies.'}
            </p>
            <div className={styles.suggestions}>
              {SUGGESTED.map(s => (
                <button key={s} className={styles.suggestBtn} onClick={() => sendMessage(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`${styles.msg} ${styles[m.role]}`}>
            {m.role === 'assistant' && <div className={styles.msgLabel}>VISAGUARD AI</div>}
            {m.role === 'user'      && <div className={styles.msgLabel}>YOU</div>}
            <div className={styles.msgContent}>{m.content}</div>
          </div>
        ))}

        {loading && (
          <div className={`${styles.msg} ${styles.assistant}`}>
            <div className={styles.msgLabel}>VISAGUARD AI</div>
            <div className={styles.msgContent}>
              <span className={styles.typing}>Thinking</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className={styles.inputRow}>
        <input
          className={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Ask about OPT rules, STEM OPT compliance, visa changes..."
          disabled={loading}
        />
        <button
          className={styles.sendBtn}
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  )
}