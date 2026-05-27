import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import { supabase } from './auth/supabase.js'
import LoginPage from './pages/LoginPage.jsx'
import OnboardingPage from './pages/OnboardingPage.jsx'
import JourneyPage from './pages/JourneyPage.jsx'
import TrackerPage from './pages/TrackerPage.jsx'
import ChatPage from './pages/ChatPage.jsx'
import AlertsPage from './pages/AlertsPage.jsx'
import EligibilityPage from './pages/EligibilityPage.jsx'
import styles from './App.module.css'

function getNav(visaType) {
  const base = [
    { id: 'journey',     label: 'My Journey'     },
    { id: 'tracker',     label: 'Status Tracker' },
    { id: 'eligibility', label: 'Eligibility'    },
    { id: 'chat',        label: 'AI Advisor'     },
    { id: 'alerts',      label: 'Email Alerts'   },
  ]
  return base
}

function AppInner() {
  const { user, loading, signOut } = useAuth()
  const [page,       setPage]       = useState('journey')
  const [onboarded,  setOnboarded]  = useState(null)  // null = checking
  const [visaData,   setVisaData]   = useState(null)

  // Check if user has completed onboarding
  useEffect(() => {
    if (!user) { setOnboarded(null); return }

    // First verify we have a valid session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        console.warn('[app] No session found')
        const local = localStorage.getItem(`visaguard_onboarded_${user.id}`)
        setOnboarded(local === 'true')
        return
      }
    })

    supabase
      .from('user_visa_data')
      .select('onboarded, visa_type, auth_start, auth_end, employment_periods, opt_auth_start, opt_auth_end, opt_periods, enrolled_months, cpt_program_start, cpt_program_end')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          // Supabase failed — load from localStorage fallback
          const localOnboarded = localStorage.getItem(`visaguard_onboarded_${user.id}`)
          const localData      = localStorage.getItem(`visaguard_data_${user.id}`)
          setOnboarded(localOnboarded === 'true')
          if (localData) setVisaData(JSON.parse(localData))
          console.warn('[onboarding check] Supabase error, using localStorage:', error.message)
          return
        }
        setOnboarded(data?.onboarded ?? false)
        if (data) setVisaData(data)
        // Also cache in localStorage for offline use
        if (data?.onboarded) {
          localStorage.setItem(`visaguard_onboarded_${user.id}`, 'true')
          localStorage.setItem(`visaguard_data_${user.id}`, JSON.stringify(data))
        }
      })
  }, [user])

  if (loading || (user && onboarded === null)) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingBrand}>⚖ Visa<em>Guard</em></div>
        <div className={styles.loadingSpinner} />
      </div>
    )
  }

  if (!user) return <LoginPage />

  if (!onboarded) {
    return (
      <OnboardingPage
        user={user}
        onComplete={(data) => {
          setVisaData(data)
          setOnboarded(true)
          // Save to localStorage as fallback in case Supabase RLS fails
          localStorage.setItem(`visaguard_onboarded_${user.id}`, 'true')
        }}
      />
    )
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}>⚖</span>
          <span className={styles.brandName}>Visa<em>Guard</em></span>
        </div>
        <nav className={styles.nav}>
          {getNav().map(n => (
            <button
              key={n.id}
              className={`${styles.navBtn} ${page === n.id ? styles.active : ''}`}
              onClick={() => setPage(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className={styles.userRow}>
          <button
            className={styles.resetBtn}
            title="Change visa type or update your details"
            onClick={async () => {
              if (!window.confirm('Reset your visa setup? You can re-enter your details.')) return
              localStorage.removeItem(`visaguard_onboarded_${user.id}`)
              localStorage.removeItem(`visaguard_data_${user.id}`)
                await supabase.from('user_visa_data').update({ onboarded: false }).eq('user_id', user.id)
              setOnboarded(false)
              setVisaData(null)
            }}
          >
            ⚙ Edit setup
          </button>
          <span className={styles.userEmail}>
            {user.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                className={styles.avatar}
                alt=""
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className={styles.avatarFallback}>
                {(user.user_metadata?.full_name || user.email || '?')[0].toUpperCase()}
              </span>
            )}
            {user.user_metadata?.full_name || user.email}
          </span>
          <button className={styles.signOutBtn} onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main className={styles.main}>
        {page === 'journey'     && <JourneyPage visaData={visaData || JSON.parse(localStorage.getItem(`visaguard_data_${user?.id}`) || 'null')} />}
        {page === 'tracker'     && <TrackerPage initialData={visaData} />}
        {page === 'eligibility' && <EligibilityPage />}
        {page === 'chat'        && <ChatPage visaData={visaData} />}
        {page === 'alerts'      && <AlertsPage user={user} visaData={visaData} />}
      </main>

      <footer className={styles.footer}>
        <p>VisaGuard — for informational purposes only. Always consult your DSO or immigration attorney.</p>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}