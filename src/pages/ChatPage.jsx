import { useState, useRef, useEffect } from 'react'
import styles from './ChatPage.module.css'

function buildSystemPrompt(visaData) {
  const base = `You are VisaGuard AI, a visa compliance assistant for F-1 OPT and STEM OPT students.

ACCURACY RULES — follow strictly:
1. ONLY state facts you are certain about. If unsure, say "I'm not certain — please verify with your DSO."
2. NEVER calculate unemployment days yourself — the Status Tracker handles calculations.
3. NEVER guess about USCIS policy changes — recommend checking uscis.gov or studyinthestates.dhs.gov
4. If a question requires legal judgment say: "This requires your DSO or an immigration attorney."
5. Do NOT make up form numbers, processing times, or case-specific advice.

VERIFIED FACTS — use exactly these, do not add to them:

F-1 OPT:
- 90-day cumulative unemployment limit
- Days count 7 days/week including weekends
- Employment must be at least 20 hours/week
- Must be directly related to your degree field
- 60-day grace period after OPT expires
- Multiple part-time jobs can combine to reach 20hrs/week

F-1 STEM OPT:
- 150-day cumulative limit (includes unemployment days from initial OPT period)
- Employer MUST be E-Verify enrolled — verify at e-verify.gov before accepting any job
- Employment MUST be paid — unpaid internships count as unemployment days
- Must be directly related to your STEM degree CIP code
- Employer must sign Form I-983 Training Plan before work starts
- Must report employer or address changes to DSO within 10 days
- Must submit I-983 validation report to DSO every 6 months
- Apply at least 90 days before OPT EAD expires
- Only one STEM extension per degree level

F-1 CPT:
- No unemployment day limit — authorization is semester-based
- Must be integral part of established curriculum
- DSO authorization required each semester on Form I-20
- 12 or more months of full-time CPT makes you ineligible for OPT

RESPONSE FORMAT:
- Short and scannable — bullet points not paragraphs
- Lead with the direct answer in one sentence
- When uncertain say so explicitly — never guess
- For day calculations, direct user to the Status Tracker tab

Always end with: ⚠ Verify with your DSO or check uscis.gov for your specific situation.`

  if (!visaData || !visaData.visa_type) return base

  const visaLabels = { opt: 'F-1 OPT', stem: 'F-1 STEM OPT', cpt: 'F-1 CPT' }
  const limits     = { opt: 90, stem: 150 }

  let context = `

CURRENT USER VISA DATA:
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
- Employment periods on file: ${jobs.length}`
    jobs.forEach((p, i) => {
      context += `
  Job ${i + 1}: ${p.start} to ${p.end || 'present'}`
    })
  }

  context += `

NOTE: When asked about day counts or compliance status, direct the user to the Status Tracker tab for accurate calculations. Do not calculate days yourself.`

  return base + context
}

// Simple markdown renderer
function renderMarkdown(text) {
  if (!text) return ''
  let html = text
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/^[-•*] (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>[\s\S]+?<\/li>)/g, '<ul>$1</ul>')
  html = html.replace(/<\/ul>\s*<ul>/g, '')
  html = html.replace(/\n/g, '<br />')
  return html
}

const SUGGESTED = [
  'What are the employer requirements for STEM OPT?',
  'Does unpaid work count as employment on OPT?',
  'What happens if I exceed 90 unemployment days?',
  'Can I work part-time on OPT?',
  'How do I apply for STEM OPT extension?',
  'What is the E-Verify requirement for STEM OPT?',
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
        content: '⚠ AI advisor unavailable — backend service is starting up. Please try again in a moment.'
      }])
    }
    setLoading(false)
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>AI Visa Advisor</h1>
        <p className={styles.subtitle}>
          Powered by Groq/Llama — answers based on verified USCIS policy facts
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
                ? `I have your ${visaData.visa_type.toUpperCase()} details loaded. Ask me about OPT/STEM OPT rules and requirements.`
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
            <div
              className={styles.msgContent}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
            />
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