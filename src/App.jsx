import { useState } from 'react'
import TrackerPage from './pages/TrackerPage.jsx'
import ChatPage from './pages/ChatPage.jsx'
import AlertsPage from './pages/AlertsPage.jsx'
import styles from './App.module.css'

const NAV = [
  { id: 'tracker', label: 'Status Tracker' },
  { id: 'chat',    label: 'AI Advisor'     },
  { id: 'alerts',  label: 'Email Alerts'   },
]

export default function App() {
  const [page, setPage] = useState('tracker')

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}>⚖</span>
          <span className={styles.brandName}>Visa<em>Guard</em></span>
        </div>
        <nav className={styles.nav}>
          {NAV.map(n => (
            <button
              key={n.id}
              className={`${styles.navBtn} ${page === n.id ? styles.active : ''}`}
              onClick={() => setPage(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>
      </header>

      <main className={styles.main}>
        {page === 'tracker' && <TrackerPage />}
        {page === 'chat'    && <ChatPage />}
        {page === 'alerts'  && <AlertsPage />}
      </main>

      <footer className={styles.footer}>
        <p>VisaGuard — for informational purposes only. Always consult your DSO or immigration attorney.</p>
      </footer>
    </div>
  )
}
