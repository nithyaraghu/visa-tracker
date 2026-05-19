# VisaGuard — Visa Unemployment Tracker

> Track OPT/STEM OPT unemployment days, get AI-powered visa policy answers, and receive email alerts before you hit your limit.

![React](https://img.shields.io/badge/React-18-61dafb?logo=react)
![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite)
![Node](https://img.shields.io/badge/Node-20+-339933?logo=node.js)
![Claude](https://img.shields.io/badge/Powered%20by-Claude%20AI-orange)

---

## Features

| Feature | Description |
|---|---|
| **Status Tracker** | Enter employment dates, calculate unemployment days, see visual compliance meter |
| **AI Visa Advisor** | Chat with Claude (web search enabled) for current USCIS/SEVP policy answers |
| **Email Alerts** | Register your email → get notified at 60, 80, 88 days (OPT) or 120, 140, 148 days (STEM) |
| **Multi-visa support** | F-1 OPT, STEM OPT, CPT, H-1B, J-1 |

---

## Project Structure

```
visa-tracker/
├── src/                    # React/Vite frontend
│   ├── pages/
│   │   ├── TrackerPage.jsx     # Unemployment day calculator
│   │   ├── ChatPage.jsx        # AI visa chatbot
│   │   └── AlertsPage.jsx      # Email alert registration
│   └── utils/
│       └── visaCalc.js         # Core calculation logic
├── backend/
│   ├── server.js               # Express server + cron job
│   ├── alertService.js         # Email alert logic
│   ├── db.js                   # PostgreSQL + JSON fallback
│   ├── routes/alerts.js        # Alert API routes
│   └── schema.sql              # PostgreSQL schema
├── .env.example                # Environment variables template
└── README.md
```

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/visa-tracker.git
cd visa-tracker
npm install
cd backend && npm install && cd ..
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `RESEND_API_KEY` | [resend.com](https://resend.com) — free tier: 3,000 emails/month |
| `DATABASE_URL` | Optional — skip for local JSON fallback |

### 3. Run

```bash
# Terminal 1 — frontend (http://localhost:5173)
npm run dev

# Terminal 2 — backend (http://localhost:3001)
npm run server

# Or run both together
npm run dev:all
```

---

## Environment Variables

```env
# Required for AI chatbot
ANTHROPIC_API_KEY=sk-ant-...

# Required for email alerts
RESEND_API_KEY=re_...
ALERT_FROM_EMAIL=alerts@yourdomain.com

# Optional — PostgreSQL (uses local JSON file if not set)
DATABASE_URL=postgresql://user:password@localhost:5432/visa_tracker

# Alert thresholds (days) — customize if needed
OPT_WARN_THRESHOLD=60
OPT_URGENT_THRESHOLD=80
OPT_CRITICAL_THRESHOLD=88
STEM_WARN_THRESHOLD=120
STEM_URGENT_THRESHOLD=140
STEM_CRITICAL_THRESHOLD=148
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/chat` | Proxy to Claude API with web search |
| `POST` | `/api/alerts/register` | Register for email alerts |
| `GET`  | `/api/alerts/subscribers` | List subscribers (dev only) |
| `GET`  | `/api/health` | Health check |

### POST /api/alerts/register

```json
{
  "email": "user@example.com",
  "name": "Priya Sharma",
  "visaType": "opt",
  "authStart": "2024-07-01",
  "authEnd": "2025-06-30",
  "employedSince": "2024-08-15",
  "alertLevels": ["warn", "urgent", "critical"]
}
```

---

## Email Alerts

The backend runs a **daily cron job at 8:00 AM** that:
1. Loads all registered subscribers from PostgreSQL (or local JSON in dev)
2. Calculates current unemployment days for each
3. Sends email via Resend if a threshold is crossed and hasn't been alerted yet

**Alert thresholds:**

| Visa | Warn | Urgent | Critical |
|---|---|---|---|
| F-1 OPT | 60 days | 80 days | 88 days |
| STEM OPT | 120 days | 140 days | 148 days |

Each threshold fires **once** — no duplicate emails.

---

## Database

**Development (no setup needed):** Subscribers are stored in `backend/subscribers.json`.

**Production (PostgreSQL):** Set `DATABASE_URL` and run the schema:

```bash
psql $DATABASE_URL -f backend/schema.sql
```

---

## Deployment

### Frontend — Vercel / Netlify

```bash
npm run build
# Deploy the dist/ folder
```

Set `VITE_API_BASE_URL` to your backend URL.

### Backend — Railway / Render / Fly.io

```bash
# Procfile
web: node backend/server.js
```

Set all environment variables in your hosting dashboard.

---

## Tech Stack

- **Frontend:** React 18, Vite, CSS Modules, Recharts
- **Backend:** Node.js, Express, node-cron
- **AI:** Anthropic Claude (claude-sonnet-4-20250514) with web_search tool
- **Email:** Resend
- **Database:** PostgreSQL (pg) with JSON file fallback

---

## Disclaimer

VisaGuard is for informational purposes only and does not constitute legal advice. Always consult your Designated School Official (DSO) or a qualified immigration attorney for decisions about your visa status. Rules can change — verify current policy at [studyinthestates.dhs.gov](https://studyinthestates.dhs.gov) and [uscis.gov](https://www.uscis.gov).

---

## Contributing

PRs welcome! Some ideas:
- [ ] Add H-1B gap tracking
- [ ] Calendar/timeline visualization
- [ ] SMS alerts via Twilio
- [ ] USCIS case status integration
- [ ] Export PDF compliance report
