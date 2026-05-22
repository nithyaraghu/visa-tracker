import { useState, useRef, useEffect } from 'react'
import styles from './ChatPage.module.css'

const SYSTEM_PROMPT = `You are VisaGuard AI, a specialized immigration compliance advisor focused on US visa status maintenance — particularly F-1 OPT, STEM OPT, H-1B, J-1, and related work authorizations.

Your role:
- Answer questions about unemployment day rules, compliance requirements, and status maintenance
- Provide up-to-date information by searching USCIS, SEVP, and official government sources
- Explain what students/workers should do when approaching unemployment day limits
- Clarify grace periods, extensions, status changes, and reporting requirements
- Always note when the user should consult their DSO or an immigration attorney for their specific situation

Key facts to anchor on:
- F-1 OPT: 90-day unemployment limit
- F-1 STEM OPT: 150 days total (including any days from initial OPT)
- Days count 7 days/week including weekends
- Exceeding limits can result in status termination

Tone: Clear, authoritative, empathetic. Users are anxious about their immigration status.
Always use web search to verify current USCIS policy before answering, as rules can change.
End answers with a brief disclaimer to verify with official DSO or immigration counsel for personal decisions.`

const SUGGESTED = [
  'What happens if I exceed 90 unemployment days on OPT?',
  'Can I do freelance work on STEM OPT?',
  'What are the latest USCIS policy changes for OPT?',
  'How does the 60-day grace period work after OPT ends?',
  'Can I travel abroad while unemployed on OPT?',
]

export default function ChatPage({ visaData }) {
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          system: buildSystemPrompt(visaData)
        })
      })

      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = await res.json()

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.content
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠ Error connecting to AI advisor: ${err.message}. Make sure the backend server is running (npm run server) and your ANTHROPIC_API_KEY is set in .env`
      }])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>AI Visa Advisor</h1>
        <p className={styles.subtitle}>
          Powered by Groq/Llama with live web search — always answers with current USCIS policy
        </p>
      </div>

      <div className={styles.chatContainer}>
        {messages.length === 0 && (
          <div className={styles.welcome}>
            <div className={styles.welcomeIcon}>⚖</div>
            <h2>Ask anything about your visa status</h2>
            <p>I search official USCIS and SEVP sources to give you current, accurate answers.</p>
            <div className={styles.suggestions}>
              {SUGGESTED.map(s => (
                <button key={s} className={styles.suggestion} onClick={() => sendMessage(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={styles.messages}>
          {messages.map((m, i) => (
            <div key={i} className={`${styles.msg} ${styles[m.role]}`}>
              <div className={styles.msgRole}>{m.role === 'user' ? 'You' : 'VisaGuard AI'}</div>
              <div className={styles.msgContent}>{m.content}</div>
            </div>
          ))}
          {loading && (
            <div className={`${styles.msg} ${styles.assistant}`}>
              <div className={styles.msgRole}>VisaGuard AI</div>
              <div className={styles.typing}>
                <span /><span /><span />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className={styles.inputRow}>
          <textarea
            className={styles.textarea}
            placeholder="Ask about OPT rules, STEM OPT compliance, visa changes…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={2}
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
    </div>
  )
}