# Security Policy

## Overview

VisaGuard implements multiple layers of security to protect user data and API resources.

---

## Security Controls Implemented

### 1. Rate Limiting
**File:** `backend/server.js`
**Package:** `express-rate-limit`

Two-tier rate limiting protects against abuse and API credit exhaustion:

| Limiter | Window | Max Requests | Applies To |
|---|---|---|---|
| General | 15 minutes | 100 requests | All routes |
| Chat | 1 minute | 10 requests | `/api/chat` only |

When exceeded, returns:
```json
{ "error": "Too many requests — please wait 15 minutes" }
```

**Why:** Prevents attackers from draining Groq API credits (~$0.001/request)
and protects against brute force attacks.

---

### 2. HTTP Security Headers
**File:** `backend/server.js`
**Package:** `helmet`

Helmet.js automatically adds 11 protective HTTP headers:

| Header | Protection |
|---|---|
| `X-Frame-Options: SAMEORIGIN` | Prevents clickjacking |
| `X-Content-Type-Options: nosniff` | Prevents MIME sniffing |
| `X-XSS-Protection: 1; mode=block` | Blocks reflected XSS |
| `Strict-Transport-Security` | Forces HTTPS |
| `Referrer-Policy: no-referrer` | Prevents data leakage |
| `X-DNS-Prefetch-Control: off` | Prevents DNS prefetching |
| `X-Permitted-Cross-Domain-Policies` | Blocks Flash/PDF attacks |
| `Origin-Agent-Cluster` | Process isolation |
| `Cross-Origin-Embedder-Policy` | Prevents cross-origin embedding |
| `Cross-Origin-Opener-Policy` | Window isolation |
| `Cross-Origin-Resource-Policy` | Resource access control |

---

### 3. Input Validation
**File:** `backend/server.js`, `backend/routes/alerts.js`
**Package:** `zod`

All API endpoints validate input shape before processing:

**Chat endpoint (`/api/chat`):**
```
messages: array of {role: user|assistant|system, content: 1-4000 chars}
         max 50 messages per request
system:  optional string, max 2000 chars
```

**Alerts endpoint (`/api/alerts/register`):**
```
email:     valid email format required
visaType:  must be one of: opt|stem|h1b|cpt|j1
authStart: must match YYYY-MM-DD format
authEnd:   must match YYYY-MM-DD format
```

Invalid requests are rejected immediately with descriptive errors:
```json
{ "error": "Invalid request", "details": ["role: Invalid enum value"] }
```

**Why:** Prevents injection attacks, crashes from unexpected data types,
and ensures data integrity in the database.

---

### 4. Secret Management
**Files:** `.env`, `.gitignore`

- All API keys stored in `.env` (never committed to git)
- `.gitignore` explicitly excludes `.env` and `.env.local`
- `.env.example` provides template without real values
- No secrets hardcoded in source code

**Production:** Secrets managed via environment variables in Render/Vercel dashboards.

**Future:** Migrate to GCP Secret Manager for centralized secret rotation.

---

### 5. Authentication
**Provider:** Supabase Auth

- JWT-based sessions with automatic refresh
- Google OAuth 2.0 support
- Email OTP as passwordless alternative
- Row Level Security (RLS) on all database tables
- Users can only read/write their own data

**RLS Policy example:**
```sql
create policy "Users can read own data"
  on public.user_visa_data for select
  using (auth.uid() = user_id);
```

---

## Threat Model

| Threat | Likelihood | Impact | Control |
|---|---|---|---|
| API credit exhaustion | High | Medium | Rate limiting |
| Clickjacking | Low | Medium | Helmet X-Frame-Options |
| XSS injection | Medium | High | Helmet + Zod validation |
| SQL injection via dates | Low | High | Zod regex validation |
| Secret key exposure | Low | Critical | .gitignore + env vars |
| Unauthorized data access | Medium | High | Supabase RLS |
| Brute force login | Medium | High | Supabase Auth built-in |

---

## Reporting a Vulnerability

This is a personal hobby project. If you find a security issue, please open a GitHub issue with the label `security`.

---

## Planned Security Improvements

- [ ] GCP Secret Manager integration
- [ ] Content Security Policy (CSP) headers
- [ ] API key rotation strategy
- [ ] LangSmith observability for AI agent monitoring
- [ ] Adversarial test cases in eval pipeline