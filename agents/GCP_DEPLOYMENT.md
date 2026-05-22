# GCP Cloud Run Deployment Guide

Deploy the VisaGuard agents service (LangGraph + Gemini) to Google Cloud Run.

## Architecture

```
Internet
    ↓
Vercel (React frontend)
    ↓
Render (Node.js backend)          ← current production
    ↓
GCP Cloud Run (Python agents)     ← this guide
    ├── LangGraph 4-agent pipeline
    ├── Gemini 2.0 Flash
    └── Tavily web search
```

## Why Cloud Run

- **Serverless** — scales to zero when not in use (free tier: 2M requests/month)
- **Containerized** — same Docker image runs locally and in production
- **Secure** — Secret Manager for API keys, IAM for access control
- **Google-scale** — same infrastructure Google uses internally

## Prerequisites

```bash
# Install Google Cloud CLI
# https://cloud.google.com/sdk/docs/install

gcloud auth login
gcloud config set project visaguard-497120
```

## Step 1 — Store secrets in Secret Manager

```bash
# Enable Secret Manager API
gcloud services enable secretmanager.googleapis.com

# Store API keys as secrets (never in environment variables or code)
echo -n "your-gemini-key" | gcloud secrets create GEMINI_API_KEY --data-file=-
echo -n "your-tavily-key" | gcloud secrets create TAVILY_API_KEY --data-file=-
echo -n "your-groq-key"   | gcloud secrets create GROQ_API_KEY   --data-file=-

# Verify secrets were created
gcloud secrets list
```

## Step 2 — Build and push Docker image

```bash
# Enable required APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

# Navigate to agents directory
cd agents

# Build image using Cloud Build (no local Docker needed)
gcloud builds submit --tag gcr.io/visaguard-497120/visaguard-agents .

# Or build locally if you have Docker installed
docker build -t gcr.io/visaguard-497120/visaguard-agents .
docker push gcr.io/visaguard-497120/visaguard-agents
```

## Step 3 — Deploy to Cloud Run

```bash
gcloud run deploy visaguard-agents \
  --image gcr.io/visaguard-497120/visaguard-agents \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3 \
  --set-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest,TAVILY_API_KEY=TAVILY_API_KEY:latest,GROQ_API_KEY=GROQ_API_KEY:latest"
```

## Step 4 — Update backend to use Cloud Run URL

After deployment, Cloud Run gives you a URL like:
```
https://visaguard-agents-xxxx-uc.a.run.app
```

Update Render environment variable:
```
AGENTS_URL=https://visaguard-agents-xxxx-uc.a.run.app
```

## Step 5 — Verify deployment

```bash
# Check service status
gcloud run services describe visaguard-agents --region us-central1

# Test health endpoint
curl https://visaguard-agents-xxxx-uc.a.run.app/health

# View logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=visaguard-agents" --limit 50
```

## Security best practices implemented

| Practice | Implementation |
|---|---|
| Secrets management | GCP Secret Manager (not env vars) |
| Non-root container | `appuser` in Dockerfile |
| Health checks | `/health` endpoint + Docker HEALTHCHECK |
| IAM | Service account with minimal permissions |
| Container scanning | Cloud Build vulnerability scanning |

## Free tier limits

| Resource | Free tier | VisaGuard usage |
|---|---|---|
| Cloud Run requests | 2M/month | ~1,000/month |
| Cloud Run compute | 360,000 vCPU-seconds | Well within limit |
| Secret Manager | 6 versions free | 3 secrets |
| Cloud Build | 120 min/day | ~5 min/deploy |

## Cost estimate

At typical usage (1,000 requests/month): **$0/month** — well within free tier.

## CI/CD Integration

Add to `.github/workflows/test.yml` for automatic deployment on push:

```yaml
- name: Deploy to Cloud Run
  if: github.ref == 'refs/heads/main'
  run: |
    gcloud run deploy visaguard-agents \
      --image gcr.io/visaguard-497120/visaguard-agents \
      --region us-central1 \
      --platform managed
  env:
    GCLOUD_SERVICE_KEY: ${{ secrets.GCLOUD_SERVICE_KEY }}
```