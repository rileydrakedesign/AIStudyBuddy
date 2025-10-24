# Infrastructure and Deployment Integration

## Existing Infrastructure

The enhancement builds on the current deployment infrastructure **without changes** to hosting platforms or deployment processes.

### Current Deployment Architecture

**Frontend (Vercel)**:
- **Hosting**: Vercel (auto-deploy from Git)
- **Build Command**: `npm run build` (Vite production build)
- **Output Directory**: `dist/`
- **Deployment**: Automatic on push to main branch
- **Environment Variables**: Configured in Vercel dashboard

**Node Backend (Heroku)**:
- **App Name**: `class-chat-node-8a0ef9662b5a`
- **Base URL**: `https://class-chat-node-8a0ef9662b5a.herokuapp.com/`
- **Dyno Type**: Web dyno (single instance)
- **Build**: `npm run build` → TypeScript compilation to `dist/`
- **Start Command**: `node dist/index.js` (defined in Procfile)
- **Deployment**: Manual `git push heroku main`

**Python AI Service (Heroku)**:
- **App Name**: `class-chat-python-f081e08f29b8`
- **Base URL**: `https://class-chat-python-f081e08f29b8.herokuapp.com/`
- **Dyno Types**:
  - `web`: Gunicorn + Uvicorn (FastAPI server)
  - `worker`: RQ worker (document ingestion jobs)
- **Start Commands** (Procfile):
  - `web: gunicorn semantic_service:app -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT --timeout 60`
  - `worker: python worker_boot.py`
- **Deployment**: Manual `git push heroku main`

**External Services** (Unchanged):
- **MongoDB Atlas**: Database + vector search (shared across all environments)
- **AWS S3**: Document storage (bucket configured in env vars)
- **Redis**: Job queue + rate limiting (Heroku Redis addon with TLS)
- **Mailgun**: Email delivery (API-based)
- **OpenAI**: LLM generation + embeddings (API-based)

## Build Process Integration

**No changes to existing build processes**. All enhancements use the same build tooling.

### Frontend Build

**Existing Process** (Preserved):
```bash
# Development
npm run dev              # Vite dev server on localhost:5173

# Production
npm run build            # Vite build → dist/
# Vercel auto-deploys on git push
```

**New Files Included**: All new React components are automatically bundled by Vite during build.

**Bundle Size Impact**: Estimated +50KB (gzipped) for new components.

### Node Backend Build

**Existing Process** (Preserved):
```bash
# Development
npm run dev              # TypeScript watch + nodemon

# Production
npm run build            # tsc → compile to dist/
git push heroku main     # Manual deploy
# Heroku runs: npm run build && node dist/index.js
```

**New Files Included**: All new controllers, routes, models compiled by TypeScript during build.

### Python AI Service Build

**Existing Process** (Preserved):
```bash
# Development
# (No build step - Python is interpreted)

# Production
git push heroku main     # Manual deploy
# Heroku installs: pip install -r requirements.txt
# Heroku starts: gunicorn semantic_service:app ... (web) + python worker_boot.py (worker)
```

**New Files Included**: New Python modules are automatically available after deploy.

**New System Dependencies**: **Tesseract OCR** (requires buildpack - see below).

## New Dependencies to Deploy

### Python Service Dependencies

**Add to `requirements.txt`**:
```txt
# Document processing (NEW)
python-docx==0.8.11
python-pptx==0.6.21
pytesseract==0.3.10
Pillow==10.0.0
```

**System Dependency** (Tesseract OCR):

**Add Heroku Buildpack** (one-time setup):
```bash
cd backend/python_scripts
heroku buildpacks:add --index 1 https://github.com/pathwaysmedical/heroku-buildpack-tesseract -a class-chat-python-f081e08f29b8
```

**Verify Buildpack Order**:
```bash
heroku buildpacks -a class-chat-python-f081e08f29b8
# Expected output:
# 1. https://github.com/pathwaysmedical/heroku-buildpack-tesseract
# 2. heroku/python
```

## Deployment Strategy

**Phased Rollout Approach** - Deploy in phases to mitigate no-staging-environment risk.

### Phase 1: Infrastructure & Backend (Week 1-2)

**Goal**: Deploy backend changes with minimal user-facing impact.

**Steps**:
1. **Add new dependencies**:
   ```bash
   # Python: Update requirements.txt, add Tesseract buildpack
   cd backend/python_scripts
   git add requirements.txt
   git commit -m "Add DOCX, PPTX, OCR dependencies"
   git push heroku main

   # Verify dependencies installed
   heroku run "pip list | grep -E '(docx|pptx|pytesseract|Pillow)'" -a class-chat-python-f081e08f29b8
   ```

2. **Deploy Python service changes**:
   ```bash
   git add backend/python_scripts/
   git commit -m "Add centralized config, citation fix, document processors"
   git push heroku main

   # Verify Python service health
   curl https://class-chat-python-f081e08f29b8.herokuapp.com/api/v1/semantic_search -X POST -d '...'
   ```

3. **Deploy Node API changes**:
   ```bash
   git add backend/src/
   git commit -m "Add saved materials endpoints, password reset enhancements, delete account"
   git push heroku main

   # Verify Node API health
   curl https://class-chat-node-8a0ef9662b5a.herokuapp.com/api/v1/user/auth-status
   ```

4. **Run database schema validation**:
   - No migration script needed (additive schema changes)
   - Verify new fields: `db.users.findOne()` should work with or without new fields

**Rollback Trigger**: If Python or Node service fails health check, rollback immediately.

### Phase 2: Frontend Low-Risk Features (Week 3)

**Goal**: Deploy frontend changes with minimal functional impact.

**Steps**:
1. **Deploy mobile blocking, formula fixes, toast repositioning**:
   ```bash
   git add frontend/src/
   git commit -m "Add mobile blocking, fix formula rendering, reposition toasts"
   git push origin main
   # Vercel auto-deploys
   ```

2. **Manual testing checklist**: Mobile blocking, formula rendering, toast positioning

**Rollback Trigger**: If critical UX broken, rollback via Vercel dashboard.

### Phase 3: Frontend Major Features (Week 4)

**Goal**: Deploy sidebar redesign, special formatting, saved materials.

**Steps**:
1. **Deploy sidebar redesign + saved materials**:
   ```bash
   git add frontend/src/
   git commit -m "Add sidebar redesign, special response formatting, saved materials"
   git push origin main
   ```

2. **Manual testing checklist**: 29 test cases (see Testing Strategy section)

**Rollback Trigger**: If navigation broken, rollback via Vercel.

### Phase 4: Document Format Support (Week 5)

**Goal**: Deploy DOCX, PPTX, OCR support (high-risk features).

**Steps**:
1. **Enable feature flags**:
   ```bash
   heroku config:set ENABLE_OCR=true -a class-chat-python-f081e08f29b8
   ```

2. **Test new formats**: Upload DOCX, PPTX, scanned PDF

**Rollback Trigger**: Set `ENABLE_OCR=false` if ingestion fails.

## Environment Variables

### New Environment Variables (Python Service)

**Add to Heroku Config** (`class-chat-python-f081e08f29b8`):

```bash
# Centralized config (config.py)
heroku config:set ENABLE_LLM_RERANKING=false -a class-chat-python-f081e08f29b8
heroku config:set ENABLE_OCR=false -a class-chat-python-f081e08f29b8

# Multi-API-key rotation (optional - for FR19)
heroku config:set OPENAI_API_KEY_1=sk-proj-... -a class-chat-python-f081e08f29b8
heroku config:set OPENAI_API_KEY_2=sk-proj-... -a class-chat-python-f081e08f29b8
heroku config:set OPENAI_API_KEY_3=sk-proj-... -a class-chat-python-f081e08f29b8
```

**Feature Flags**:
- `ENABLE_LLM_RERANKING`: Default `false` (enable post-beta for A/B testing)
- `ENABLE_OCR`: Default `false` (enable in Phase 4)

### Updated `.env.example` Files

**Update `backend/python_scripts/.env.example`**:
```bash
# Feature Flags (NEW)
ENABLE_LLM_RERANKING=false
ENABLE_OCR=false

# Multi-API-Key Rotation (Optional - NEW)
OPENAI_API_KEY_1=your-openai-api-key-1
OPENAI_API_KEY_2=your-openai-api-key-2
OPENAI_API_KEY_3=your-openai-api-key-3
```

## Rollback Plan

**Critical Rollback Scenarios and Procedures**:

### Scenario 1: Python Service Deploy Breaks RAG Pipeline

**Symptoms**: Chat queries fail with 500 errors, citations missing, ingestion jobs stuck.

**Rollback**:
```bash
heroku rollback vXXX -a class-chat-python-f081e08f29b8
# OR
git reset --hard <previous-commit-sha>
git push heroku main --force
```

**Recovery Time**: <5 minutes.

### Scenario 2: Node API Deploy Breaks Authentication

**Symptoms**: Users can't log in, JWT errors, 401 responses.

**Rollback**:
```bash
heroku rollback vXXX -a class-chat-node-8a0ef9662b5a
```

**Recovery Time**: <5 minutes.

### Scenario 3: Frontend Deploy Breaks Navigation

**Symptoms**: Sidebar doesn't render, can't access chats/documents.

**Rollback**: Vercel dashboard → Deployments → Redeploy previous version

**Recovery Time**: <5 minutes.

### Scenario 4: Tesseract Buildpack Fails

**Symptoms**: Python deploy fails with buildpack error.

**Rollback**:
```bash
heroku buildpacks:remove https://github.com/pathwaysmedical/heroku-buildpack-tesseract -a class-chat-python-f081e08f29b8
heroku config:set ENABLE_OCR=false -a class-chat-python-f081e08f29b8
git push heroku main
```

**Recovery Time**: <10 minutes.

## Monitoring and Logging

### Existing Logging (Enhanced)

**Python Service** (Loguru):
- **Enhancement**: Structured logging with user_id, session_id context (FR16)
- **Access**: `heroku logs --tail -a class-chat-python-f081e08f29b8`

**Node Service** (Pino):
- **Enhancement**: Improved formatting, user context injection (FR16)
- **Access**: `heroku logs --tail -a class-chat-node-8a0ef9662b5a`

### Metrics to Monitor Post-Deployment

**Backend Metrics** (Heroku Metrics Dashboard):
- Response time (P95) - Target: <2s for chat
- Error rate - Target: <1%
- Memory usage - Target: <512MB
- Dyno load - Target: <70% CPU

**Application Metrics** (Custom Logging):
- Citation count per response (validate FR1.1: max 3-5 citations)
- Saved material creation rate
- Password reset completion rate
- Login attempt block rate

**OpenAI Usage** (OpenAI Dashboard):
- TPM utilization (ensure <80% of 180k limit)
- Cost per query

---
