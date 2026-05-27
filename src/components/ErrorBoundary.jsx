// src/components/ErrorBoundary.jsx
// Catches React errors and shows a friendly screen instead of blank page
import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--slate-950)',
        padding: '2rem',
        textAlign: 'center',
        gap: '1rem',
      }}>
        <div style={{ fontSize: '2.5rem' }}>⚠</div>
        <h2 style={{ color: 'var(--text-primary)', fontSize: '1.3rem' }}>
          Something went wrong
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', maxWidth: 400 }}>
          An unexpected error occurred. Try refreshing the page.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 24px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '0.875rem',
            cursor: 'pointer',
            marginTop: '8px',
          }}
        >
          Refresh page
        </button>
        {import.meta.env.DEV && (
          <pre style={{
            marginTop: '1rem',
            padding: '12px',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '0.72rem',
            color: 'var(--danger)',
            textAlign: 'left',
            maxWidth: '600px',
            overflow: 'auto',
          }}>
            {this.state.error?.toString()}
          </pre>
        )}
      </div>
    )
  }
}