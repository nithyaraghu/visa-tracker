# VisaGuard

**Visa compliance intelligence for F-1 OPT, STEM OPT, H-1B, J-1 and CPT holders.**

Most international students find out they've violated their visa status after it happens. VisaGuard is built to make sure that never happens — combining a deterministic compliance engine, a multi-agent AI advisor with live USCIS policy search, and proactive email alerts that fire before you hit your limit.

![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11-3776ab?logo=python&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-multi--agent-ff6b35)
![Gemini](https://img.shields.io/badge/Gemini-2.0_Flash-4285f4?logo=google&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)
![CI](https://github.com/nithyaraghu/visa-tracker/actions/workflows/test.yml/badge.svg)

🌐 **[Live Demo](https://visa-tracker-nxbe9aejm-nithyashree-raghunathans-projects.vercel.app)** · **[Backend API](https://visa-tracker-backend.onrender.com/api/health)**

---

## Why VisaGuard exists

Asking ChatGPT "how many unemployment days do I have left?" doesn't work — it has no memory of your employment history, it can't do precise calendar math across gaps, and it won't email you at 2 AM when you're close to the limit. VisaGuard solves all three:

- **Deterministic engine** — exact gap calculation with date-boundary logic, carry-over from OPT to STEM OPT, and per-visa threshold tracking. Not probabilistic. Always correct.
- **Multi-agent AI advisor** — a 4-node LangGraph pipeline (classifier → USCIS search → calculator → response) that retrieves live USCIS policy before answering, not stale training data.
- **Proactive alerts** — daily cron job compares your unemployment days against thresholds and sends styled email alerts at warn / urgent / critical levels. One alert per threshold, no spam.

---

## Features

### Status Tracker
- Calculates cumulative unemployment days with correct gap detection (gap starts day after last day of employment)
- STEM OPT carry-over: enter your OPT employment history and the app automatically adds those days to your 150-day cumulative STEM limit
- Visual progress bar with warn/urgent/critical color coding
- Upcoming milestone timeline: "You will hit your limit on Jul 22 if still unemployed"
- Supports F-1 OPT (90 days), STEM OPT (150 cumulative), H-1B (60-day grace), CPT, J-1

### AI Visa Advisor
- 4-agent LangGraph pipeline: classifier → USCIS web search → calculator → response synthesizer
- Powered by Gemini 2.0 Flash via Google AI Studio (free tier)
- Live policy retrieval via Tavily — answers reflect current USCIS rules, not stale training data
- Graceful fallback to Groq/Llama if agents service is unavailable

### Eligibility Planner
- **OPT eligibility:** application window, recommended apply-by date, estimated EAD receipt, requirements checklist
- **STEM OPT eligibility:** E-Verify check, STEM degree validator, I-983 Training Plan reminder
- **H-1B lottery tracker:** years attempted, remaining windows, masters cap advantage, cap-exempt detection

### Email Alert System
- Daily cron job checks unemployment days for all subscribers at 8:00 AM
- Styled HTML emails with compliance meter, stats, and recommended actions
- Each threshold fires once — no duplicate notifications
- PostgreSQL in production, JSON file fallback for local dev

---

## Architecture

```
visa-tracker/
├── src/                          # React 18 + Vite frontend
│   ├── pages/
│   │   ├── TrackerPage.jsx       # Unemployment day calculator UI
│   │   ├── EligibilityPage.jsx   # OPT / STEM / H-1B eligibility planner
│   │   ├── ChatPage.jsx          # AI visa advisor chat
│   │   └── AlertsPage.jsx        # Email alert registration
│   └── utils/
│       └── visaCalc.js           # Deterministic gap calculation engine
│
├── backend/                      # Node.js + Express
│   ├── server.js                 # API server + agent proxy + cron scheduler
│   ├── alertService.js           # Email alert logic (Resend)
│   ├── db.js                     # PostgreSQL / JSON fallback
│   └── routes/alerts.js          # Alert registration endpoints
│
├── agents/                       # Python FastAPI + LangGraph
│   ├── main.py                   # FastAPI server (port 8000)
│   ├── graph.py                  # 4-node LangGraph agent pipeline
│   ├── tools.py                  # Calculator tool + Tavily web search
│   └── eval/
│       ├── golden_qa.json        # 20 ground-truth Q&A pairs
│       └── run_eval.py           # RAGAS evaluation pipeline
│
└── .env.example                  # All required environment variables
```

### Agent pipeline

```
User message
    ↓
[classifier_agent]    Decides: needs_search? needs_calculation?
    ↓
[uscis_search_agent]  Searches USCIS/SEVP for current policy (if needed)
    ↓
[calculator_agent]    Extracts dates, runs deterministic calc (if needed)
    ↓
[response_agent]      Synthesizes results into final answer
    ↓
Response
```

---

## Quick Start

### Prerequisites
- Node.js 20+ · Python 3.11+
- Free API keys: [Groq](https://console.groq.com) · [Gemini](https://aistudio.google.com) · [Tavily](https://tavily.com) · [Resend](https://resend.com)

### 1. Clone and install

```bash
git clone https://github.com/nithyaraghu/visa-tracker.git
cd visa-tracker

npm install
cd backend && npm install && cd ..

cd agents
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
```

| Variable | Where to get it | Free tier |
|---|---|---|
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) | 14,400 req/day |
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) | 1,500 req/day |
| `TAVILY_API_KEY` | [tavily.com](https://tavily.com) | 1,000 searches/month |
| `RESEND_API_KEY` | [resend.com](https://resend.com) | 3,000 emails/month |
| `DATABASE_URL` | Optional — PostgreSQL | JSON fallback if blank |

### 3. Run

```bash
# Terminal 1 — Python agents (LangGraph + Gemini)
cd agents && python main.py         # http://localhost:8000

# Terminal 2 — Node backend
npm run server                       # http://localhost:3001

# Terminal 3 — React frontend
npm run dev                          # http://localhost:5173
```

---

## Evaluation Pipeline

```bash
cd agents
python eval/run_eval.py
```

Runs 20 ground-truth Q&A pairs through the full agent pipeline and scores with RAGAS metrics (answer_correctness, answer_relevancy). Results saved to `agents/eval/eval_results.json`.

---

## Alert Thresholds

| Visa | Type | Warn | Urgent | Critical | Limit |
|---|---|---|---|---|---|
| F-1 OPT | Hard | 60 days | 80 days | 88 days | 90 days |
| F-1 STEM OPT | Hard (cumulative) | 120 days | 140 days | 148 days | 150 days |
| H-1B | Hard (grace period) | 30 days | 50 days | 58 days | 60 days |
| F-1 CPT | Advisory | 14 days | 30 days | 60 days | None |
| J-1 | Advisory | 14 days | 30 days | 45 days | None |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, CSS Modules |
| Node backend | Express, node-cron, Resend |
| AI agents | Python, LangGraph, FastAPI |
| LLM (agents) | Gemini 2.0 Flash (Google AI Studio) |
| LLM (fallback) | Llama 3.3-70b via Groq |
| Web search | Tavily |
| Evaluation | RAGAS, pytest |
| Container | Docker (multi-stage build) |
| Cloud (roadmap) | GCP Cloud Run + Secret Manager |
| Database | PostgreSQL / JSON fallback |

---

## Roadmap

- [ ] Deploy to GCP Cloud Run — see [agents/GCP_DEPLOYMENT.md](agents/GCP_DEPLOYMENT.md) for full guide
- [ ] LangSmith observability tracing
- [ ] MCP server — visa calculator as MCP tool
- [ ] SMS alerts via Twilio
- [ ] USCIS case status tracker (I-765, I-539)
- [ ] PDF compliance report export

---

## Disclaimer

VisaGuard is for informational purposes only and does not constitute legal advice. Always consult your DSO or a qualified immigration attorney. Verify current policy at [studyinthestates.dhs.gov](https://studyinthestates.dhs.gov) and [uscis.gov](https://www.uscis.gov).