# Local Development Setup Guide

**Last Updated**: 2025-10-24
**Status**: Complete and Verified

This guide provides step-by-step instructions for setting up and running Class Chat AI locally for development.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [CRITICAL FIRST STEP: Verify .gitignore](#critical-first-step-verify-gitignore)
3. [Environment Configuration](#environment-configuration)
4. [HTTPS Certificate Setup (Optional)](#https-certificate-setup-optional)
5. [Starting All Services](#starting-all-services)
6. [Startup Sequence](#startup-sequence)
7. [Testing Local Setup](#testing-local-setup)
8. [Troubleshooting](#troubleshooting)
9. [Safe Testing Practices](#safe-testing-practices)
10. [What's DISABLED in Local Development](#whats-disabled-in-local-development)
11. [Redis Usage in Local Development](#redis-usage-in-local-development)
12. [Local Logging System](#local-logging-system)
13. [CI/CD Pipeline & Deployment Workflow](#cicd-pipeline--deployment-workflow)
14. [Quick Reference](#quick-reference)

---

## Prerequisites

Before setting up the local development environment, ensure you have the following installed:

### Required Software

- **Node.js**: Version 20.x
  ```bash
  node --version  # Should show v20.x.x
  ```

- **Python**: Version 3.11 or higher with Anaconda
  ```bash
  python --version  # Should show Python 3.11+
  conda --version   # Should show conda version
  ```

- **Git**: For version control
  ```bash
  git --version
  ```

### Conda Environment

The Python service requires a conda environment named `study_buddy`:

```bash
# Check if environment exists
conda env list  # Should show 'study_buddy'

# If not present, create it:
conda create -n study_buddy python=3.11
conda activate study_buddy
cd backend/python_scripts
pip install -r requirements.txt
```

### Redis Server

**REQUIRED**: The Python AI service requires a local Redis server for OpenAI API rate limiting.

```bash
# macOS - Install Redis via Homebrew
brew install redis

# Start Redis service
brew services start redis

# Verify Redis is running
redis-cli ping  # Should return "PONG"

# Check Redis is on default port
redis-cli info | grep tcp_port  # Should show "tcp_port:6379"
```

**Why Required:**
- Python service uses Redis for OpenAI token bucket rate limiting (TPM limit enforcement)
- Story 0.6 introduced local Redis for streaming state management
- Connects to `redis://localhost:6379/0` (database 0)

**Note:** Node backend does NOT use Redis - only the Python service requires it.

### Production Access

Local development uses **PRODUCTION services** with the following credentials already configured in `.env.local` files:

- MongoDB Atlas (production database)
- AWS S3 (production object storage)
- Redis (production queue)
- OpenAI API (production key)

⚠️ **IMPORTANT**: You must use test accounts only (e.g., `dev-test@example.com`) and follow [Safe Testing Practices](#safe-testing-practices).

---

## CRITICAL FIRST STEP: Verify .gitignore

**⚠️ SECURITY CRITICAL**: Before making any changes, verify that `.env.local` files are properly git-ignored.

### Verification Steps

1. **Check `.gitignore` contains required patterns**:
   ```bash
   cat .gitignore | grep -E "\.env"
   ```
   Expected output should include:
   ```
   .env
   .env.local
   .env.*.local
   frontend/.env.local
   backend/.env.local
   backend/python_scripts/.env.local
   ```

2. **Verify no `.env.local` files in git history**:
   ```bash
   git log --all --full-history -- **/.env.local
   ```
   Expected: No output (files never committed)

3. **Verify no `.env.local` files currently staged**:
   ```bash
   git status | grep -E "\.env\.local"
   ```
   Expected: No output (all properly ignored)

### ✅ Current Status

All verification checks pass. The `.gitignore` is properly configured with comprehensive patterns for:
- Environment files (`.env`, `.env.local`, `.env.*.local`)
- HTTPS certificates (`*.pem`, `*.key`, `*.crt`)
- Python artifacts (`__pycache__/`, `*.pyc`, `venv/`)
- Build artifacts (`dist/`, `build/`, `*.log`)
- OS/IDE artifacts (`.DS_Store`, `.vscode/`, `.idea/`)

---

## Environment Configuration

Local development uses three separate `.env.local` files that are **already configured** on your machine. This section documents their contents for reference.

### Frontend (`frontend/.env.local`)

```bash
# Backend API URL (HTTPS requires certificates - see HTTPS setup)
VITE_API_URL=https://localhost:3000/api/v1

# WebSocket URL (wss for HTTPS, ws for HTTP)
VITE_WS_URL=wss://localhost:3000

# Google OAuth DISABLED for local dev (empty value)
VITE_GOOGLE_CLIENT_ID=
```

**Status**: ✅ Complete - No changes needed

### Backend Node (`backend/.env.local`)

```bash
# Environment Configuration
NODE_ENV=development
LOG_LEVEL=debug
PORT=3000
CLIENT_ORIGIN=https://localhost:5173

# Python Service URL (local)
PYTHON_API_URL=http://localhost:8000

# Production Database (use test accounts only!)
MONGO_CONNECTION_STRING=mongodb+srv://[credentials]

# Production AWS S3 (prefix uploads with "TEST - ")
AWS_ACCESS_KEY=[key]
AWS_SECRET=[secret]
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=study-buddy-uploads

# Production Auth Secrets
JWT_SECRET=[secret]
COOKIE_SECRET=[secret]
GOOGLE_CLIENT_ID=[id]

# Email DISABLED for local development
EMAIL_ENABLED=false
MAILGUN_API_KEY=[key]
MAILGUN_DOMAIN=mail.classchatai.com

# Backend URL (for Python to call back)
BACKEND_URL=http://localhost:3000
```

**Status**: ✅ Complete - All variables configured

### Backend Python (`backend/python_scripts/.env.local`)

```bash
# Environment Configuration
NODE_ENV=development
LOG_LEVEL=DEBUG

# Production Database (MUST match Node's connection string)
MONGO_CONNECTION_STRING=mongodb+srv://[credentials]

# Production OpenAI
OPENAI_API_KEY=[key]
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_TPM_LIMIT=180000

# Production AWS S3 (MUST match Node's S3)
AWS_ACCESS_KEY=[key]
AWS_SECRET=[secret]
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=study-buddy-uploads

# Local Redis (Story 0.6 - using local Redis for streaming and rate limiting)
REDIS_URL=redis://localhost:6379/0

# Production Redis (commented out for local dev - UNCOMMENT for prod testing)
# REDIS_URL=rediss://[credentials]
# REDIS_SSL_VERIFY=false
# REDIS_SSL_CA_DATA=-----BEGIN CERTIFICATE-----
# [... certificate data ...]
# -----END CERTIFICATE-----

# Backend Node URL (local)
BACKEND_URL=http://localhost:3000
BACKEND_URL_DEV=http://localhost:3000
```

**Status**: ✅ Complete - All variables configured

---

## HTTPS Certificate Setup (Optional)

The frontend is configured to use HTTPS by default. You have two options:

### Option 1: Generate HTTPS Certificates (Recommended)

Use [mkcert](https://github.com/FiloSottile/mkcert) to generate trusted localhost certificates:

```bash
# Install mkcert (macOS)
brew install mkcert

# Install local CA
mkcert -install

# Generate certificates in project root
cd /Users/rileydrake/Desktop/AIStudyBuddy
mkcert localhost

# Rename files (if needed)
# mkcert creates: localhost.pem, localhost-key.pem
```

The certificates are already git-ignored in `.gitignore`.

### Option 2: Disable HTTPS

If you prefer to use HTTP:

1. **Update `frontend/vite.config.ts`**:
   ```typescript
   export default defineConfig({
     server: {
       port: 5173,
       // Comment out or remove the https section:
       // https: {
       //   key: fs.readFileSync('localhost-key.pem'),
       //   cert: fs.readFileSync('localhost.pem'),
       // },
     },
     // ...
   });
   ```

2. **Update `frontend/.env.local`**:
   ```bash
   # Change from https/wss to http/ws:
   VITE_API_URL=http://localhost:3000/api/v1
   VITE_WS_URL=ws://localhost:3000
   ```

3. **Update `backend/.env.local`**:
   ```bash
   # Change CLIENT_ORIGIN to http:
   CLIENT_ORIGIN=http://localhost:5173
   ```

---

## Starting All Services

Local development requires **three terminals** running simultaneously. Start services in the order shown below.

### Terminal 1: Python AI Service (Start First)

```bash
# Navigate to Python scripts directory
cd /Users/rileydrake/Desktop/AIStudyBuddy/backend/python_scripts

# Activate conda environment
conda activate study_buddy

# Start FastAPI service with hot reload
uvicorn semantic_service:app --reload --host 0.0.0.0 --port 8000
```

**Expected Output**:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process using WatchFiles
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

### Terminal 2: Node Backend (Start Second)

```bash
# Navigate to backend directory
cd /Users/rileydrake/Desktop/AIStudyBuddy/backend

# Start Node backend with hot reload
npm run dev
```

**Expected Output**:
```
[0] Starting compilation in watch mode...
[1] Server running on https://localhost:3000
[1] ✅ WebSocket server ready – detailed auth logging enabled
[0] Found 0 errors. Watching for file changes.
```

### Terminal 3: Frontend (Start Last)

```bash
# Navigate to frontend directory
cd /Users/rileydrake/Desktop/AIStudyBuddy/frontend

# Start Vite dev server
npm run dev
```

**Expected Output**:
```
VITE v5.3.4  ready in 432 ms

➜  Local:   https://localhost:5173/
➜  Network: use --host to expose
➜  press h to show help
```

---

## Startup Sequence

### Order Matters

Start services in this exact order to avoid connection errors:

1. **Python Service (port 8000)** - Must start first
   - Node backend calls Python service for chat/ingestion
   - If Python isn't running, document uploads will fail

2. **Node Backend (port 3000)** - Start second
   - Frontend calls Node backend for all API requests
   - Node calls Python service
   - If Node isn't running, frontend will show "Failed to fetch" errors

3. **Frontend (port 5173)** - Start last
   - Browser interface
   - Calls Node backend via HTTPS

### Port Summary

| Service | Port | Protocol | URL |
|---------|------|----------|-----|
| Frontend (Vite) | 5173 | HTTPS | https://localhost:5173 |
| Backend Node | 3000 | HTTPS | https://localhost:3000 |
| Python AI | 8000 | HTTP | http://localhost:8000 |
| Python API Docs | 8000 | HTTP | http://localhost:8000/docs |

---

## Testing Local Setup

### 1. Service Health Checks

**Python Service**:
```bash
curl http://localhost:8000/docs
# Should return FastAPI Swagger UI HTML
```

**Node Backend**:
```bash
# Check logs in Terminal 2
# Should show: "Server running on https://localhost:3000"
# Should show: "✅ WebSocket server ready"
```

**Frontend**:
```bash
# Open browser to: https://localhost:5173
# Should load login page
# Check browser console (F12) - should have NO CORS errors
```

### 2. CORS Verification

Open browser dev tools (F12) → Console tab:

✅ **Expected**: No CORS errors
❌ **If you see CORS errors**: Check that CLIENT_ORIGIN is set in `backend/.env.local`

### 3. End-to-End Flow Test

**Login**:
1. Navigate to https://localhost:5173
2. Login with test account (e.g., `dev-test@example.com`)
3. Email verification is SKIPPED (EMAIL_ENABLED=false)
4. Check Application tab → Cookies → `auth_token` should be set

**Document Upload**:
1. Click "Upload" or navigate to upload page
2. Select a test PDF file
3. **IMPORTANT**: Prefix filename with "TEST - " for easy cleanup
4. Click upload
5. Wait for "Document processed" toast notification
6. Check browser console for "document-ready" WebSocket event

**Chat Query**:
1. Navigate to chat page
2. Select the test document
3. Send query: "What are the key concepts?"
4. Response should stream with inline citations (e.g., [1], [2])
5. Citations should appear in reference list below

**Citation Navigation**:
1. Click a citation number (e.g., [1])
2. PDF viewer should open to the correct page
3. Document should load from production S3

### 4. Hot Reload Verification

**Frontend Hot Reload**:
```bash
# Edit frontend/src/components/Header.tsx
# Add a comment: // Test hot reload
# Save file
# Expected: Browser auto-refreshes immediately
```

**Backend Hot Reload**:
```bash
# Edit backend/src/controllers/user_controllers.ts
# Add a comment: // Test hot reload
# Save file
# Expected: Terminal 2 shows [nodemon] restarting, server restarts
```

**Python Hot Reload**:
```bash
# Edit backend/python_scripts/semantic_service.py
# Add a comment: # Test hot reload
# Save file
# Expected: Terminal 1 shows "INFO: Reloading...", service restarts
```

---

## Troubleshooting

### "Failed to fetch" Error

**Cause**: Backend not running or wrong port

**Fix**:
1. Verify Node backend running on port 3000 (check Terminal 2)
2. Check `VITE_API_URL` in `frontend/.env.local` matches backend URL
3. Restart backend: `npm run dev` in `backend/` directory

### "WebSocket connection failed"

**Cause**: `CLIENT_ORIGIN` not set or incorrect

**Fix**:
1. Verify `backend/.env.local` has `CLIENT_ORIGIN=https://localhost:5173`
2. Verify value matches frontend URL (http vs https)
3. Restart backend after adding CLIENT_ORIGIN

### "HTTPS certificate error"

**Cause**: HTTPS enabled but no certificates

**Fix**:
- **Option 1**: Generate certificates with mkcert (see [HTTPS Certificate Setup](#https-certificate-setup-optional))
- **Option 2**: Disable HTTPS in `vite.config.ts` and update `.env.local` files to use `http://` and `ws://`

### "Document upload succeeds but never completes"

**Cause**: Python service not running

**Fix**:
1. Check Terminal 1 - Python service should be running on port 8000
2. Verify `PYTHON_API_URL=http://localhost:8000` in `backend/.env.local`
3. Test Python service: `curl http://localhost:8000/docs`

### "Chat query fails with Python unavailable"

**Cause**: Python service not running or incorrect URL

**Fix**:
1. Verify Python service running: `curl http://localhost:8000/docs`
2. Check `PYTHON_API_URL` in `backend/.env.local`
3. Restart Python service (Terminal 1)

### "conda activate study_buddy fails"

**Cause**: Conda environment doesn't exist

**Fix**:
```bash
# Create conda environment
conda create -n study_buddy python=3.11

# Activate and install dependencies
conda activate study_buddy
cd backend/python_scripts
pip install -r requirements.txt
```

### Port Already in Use

**Cause**: Service already running or port occupied

**Fix**:
```bash
# Find process using port (macOS/Linux)
lsof -i :5173  # Frontend
lsof -i :3000  # Backend Node
lsof -i :8000  # Python
lsof -i :6379  # Redis

# Kill process
kill -9 <PID>
```

### "Redis connection failed" or Python service crashes on startup

**Cause**: Redis server not running

**Symptoms**:
- Python service fails to start with `redis.exceptions.ConnectionError`
- Logs show: `[RedisTLS] Connection init failed`
- Chat queries fail with 500 errors

**Fix**:
```bash
# Check if Redis is running
redis-cli ping  # Should return "PONG"

# If not running, start Redis
brew services start redis

# Verify Redis is on correct port
redis-cli info | grep tcp_port  # Should show "tcp_port:6379"

# Restart Python service after Redis is running
```

**Verify connection:**
```bash
# Check Python is connecting to local Redis
cd backend/python_scripts
grep REDIS_URL .env.local  # Should show: redis://localhost:6379/0
```

---

## Safe Testing Practices

⚠️ **CRITICAL**: Local development uses **PRODUCTION services** (MongoDB, S3, OpenAI).
⚠️ **NOTE**: Redis uses LOCAL server (localhost:6379) - NOT production.

### Test Account Usage

**Always use**:
- Test account email: `dev-test@example.com` (or similar test accounts)
- Never modify production user data
- Create test-specific classes and documents only

**Never use**:
- Real user accounts
- Production data for testing

### Data Management

**Document Uploads**:
- **Prefix all test uploads** with "TEST - " (e.g., "TEST - sample.pdf")
- Creates test data that's easy to identify and clean up
- Delete test documents after testing

**Test Classes**:
- Use test-specific class names (e.g., "TEST - Demo Class")
- Avoid modifying production classes
- Clean up test classes after development session

**Cleanup**:
```bash
# After testing, delete test data:
# 1. Login to https://localhost:5173
# 2. Navigate to test classes
# 3. Delete test documents (prefixed with "TEST - ")
# 4. Delete test classes
```

### API Cost Management

**OpenAI API**:
- ⚠️ API costs apply to all queries!
- Keep test queries short and focused
- Monitor usage: https://platform.openai.com/usage
- Limit testing to necessary cases

**Avoid**:
- Long documents for testing (use short PDFs)
- Repeated large queries
- Production-scale load testing

### Database Safety

**MongoDB Atlas**:
- Reads/writes to production database
- Use test accounts only
- Verify you're logged in as test account before making changes
- Check browser console for userId in API calls

**Redis**:
- Shared with production
- Document ingestion jobs go to production queue
- Be careful with upload volume

**AWS S3**:
- Uploads go to production bucket
- Files are prefixed with userId and classId
- Test uploads are real S3 costs (minimal)
- Clean up test files after development

---

## What's DISABLED in Local Development

### Email Verification (Mailgun)

**Status**: DISABLED (`EMAIL_ENABLED=false` in `backend/.env.local`)

**Impact**:
- No signup confirmation emails sent
- No password reset emails sent
- Email verification step is skipped during signup
- Users are automatically verified

**Workaround**:
- Use existing test accounts
- Cannot test email flows locally
- Email features must be tested in staging/production

### Google OAuth

**Status**: DISABLED (no `GOOGLE_CLIENT_SECRET` in `backend/.env.local`)

**Impact**:
- "Sign in with Google" button is hidden (`VITE_GOOGLE_CLIENT_ID` is empty)
- OAuth flow cannot be tested locally
- Google Cloud Console restricts localhost origins

**Workaround**:
- Use email/password login only
- OAuth must be tested in staging/production with verified domain

---

## Redis Usage in Local Development

### Python Service Only

The Python AI service uses **local Redis** for:
1. **OpenAI Token Bucket Rate Limiting** - Enforces TPM (tokens per minute) limits
2. **Stream State Management** (Story 0.6) - Planned for WebSocket streaming

**Configuration:**
- Connects to: `redis://localhost:6379/0` (database 0)
- Connection code: `backend/python_scripts/redis_setup.py`
- Usage code: `backend/python_scripts/semantic_search.py` (lines 190-220)

**Token Bucket Implementation:**
```python
# semantic_search.py:190-205
def reserve_tokens(tokens_needed: int) -> tuple[bool, int]:
    """Counter-based minute bucket using INCRBY + EXPIRE 70s."""
    key = "openai:tpm:counter"
    pipe = r.pipeline()
    pipe.incrby(key, tokens_needed)
    pipe.expire(key, 70)
    used_after, _ = pipe.execute()
    return (used_after <= TPM_LIMIT, used_after)
```

### Node Backend Does NOT Use Redis

**Important:** The Node backend does NOT use Redis despite having `REDIS_URL` in `.env.local`.

**Verified:**
- No Redis package in `backend/package.json`
- No Redis imports in `backend/src/**/*.ts`
- `REDIS_URL` environment variable is unused (legacy configuration)

**Why the unused variable exists:**
- Historical artifact from earlier architecture
- Safe to ignore - does not affect functionality

---

## Local Logging System

### ⚠️ Critical: Logs Are Ephemeral

**Local development logs only go to terminal stdout** - they do NOT persist to files.

**What This Means:**
- Logs **disappear when terminal closes**
- No persistent log files created
- No log aggregation in local dev
- Cannot review logs after stopping services

### Current Logging Implementation

**Node Backend (`backend/src/utils/logger.ts`):**
```typescript
// Pino logger with pretty-print in development
const logger = pino({
  level: process.env.LOG_LEVEL || "info",  // Default: "info", local dev uses "debug"
  transport: !isProduction ? {
    target: "pino-pretty",  // Colorized, human-readable output
    options: {
      colorize: true,
      translateTime: "yyyy-mm-dd HH:MM:ss.SSS"
    }
  } : undefined  // Production: JSON to stdout for Heroku
});
```

**Python Backend (`backend/python_scripts/logger_setup.py`):**
```python
# Loguru logger with colorized output
if is_production:
    logger.add(sys.stdout, level=LOG_LEVEL, serialize=True)  # JSON
else:
    logger.add(
        sys.stdout,
        level=LOG_LEVEL,  # Default: "INFO", local dev uses "DEBUG"
        colorize=True,
        format="<green>{time}</green> | <level>{level}</level> | ..."
    )
```

### Log Levels

| Service | Development | Production |
|---------|-------------|------------|
| Node Backend | `LOG_LEVEL=debug` | `LOG_LEVEL=info` |
| Python Service | `LOG_LEVEL=DEBUG` | `LOG_LEVEL=INFO` |

### Viewing Logs

**Local Development:**
```bash
# Logs appear in the terminal where each service is running
# Terminal 1: Python service logs
# Terminal 2: Node backend logs
# Terminal 3: Frontend logs (Vite dev server)
```

**Production (Heroku):**
```bash
# Persistent logs accessible via Heroku CLI
heroku logs --tail --app class-chat-node
heroku logs --tail --app class-chat-python

# Search logs
heroku logs --app class-chat-node --grep "error"

# View recent logs (default: 100 lines)
heroku logs --app class-chat-node -n 500
```

### Preserving Local Logs (Optional)

If you need persistent local logs, redirect stdout to files:

```bash
# Terminal 1: Python Service with log file
cd backend/python_scripts
conda activate study_buddy
uvicorn semantic_service:app --reload --host 0.0.0.0 --port 8000 2>&1 | tee python.log

# Terminal 2: Node Backend with log file
cd backend
npm run dev 2>&1 | tee node.log

# Terminal 3: Frontend with log file
cd frontend
npm run dev 2>&1 | tee frontend.log
```

**Log file location:** Same directory where command is run
**Note:** Logs are still ephemeral if service crashes - only successful runs are saved

---

## CI/CD Pipeline & Deployment Workflow

### Development Workflow

The recommended workflow for making changes follows a structured approach:

```
Feature Branch → Local Testing → Pull Request → CI Validation → Merge to Main → Deploy
```

#### Step 1: Create Feature Branch

```bash
# Create and switch to a new feature branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/bug-description
```

#### Step 2: Local Development & Testing

1. **Make your changes** in the feature branch
2. **Test locally** following the [Testing Local Setup](#testing-local-setup) guide
3. **Verify all three services** start without errors
4. **Test end-to-end functionality**:
   - Login works
   - Document upload works
   - Chat queries work
   - Citations work

#### Step 3: Commit Your Changes

```bash
# Stage your changes
git add .

# Commit with descriptive message
git commit -m "feat: Add new feature description"
# Or: git commit -m "fix: Fix bug description"

# Push to remote
git push origin feature/your-feature-name
```

#### Step 4: Create Pull Request

1. Go to GitHub repository
2. Click "New Pull Request"
3. Select your feature branch → main
4. Fill in PR description with:
   - What changed
   - Why it changed
   - How to test it
5. Submit the pull request

#### Step 5: CI Pipeline Validation

**Automated checks run automatically on every pull request**:

✅ **Frontend Build & Lint**
- Installs dependencies (`npm ci`)
- Runs ESLint (`npm run lint`)
- Builds TypeScript (`npm run build`)

✅ **Backend Build**
- Installs dependencies (`npm ci`)
- Builds TypeScript (`npm run build`)

✅ **Python Syntax Check**
- Installs Python dependencies
- Validates Python syntax (`python -m py_compile`)

**Status**: All checks must pass before merge

**View CI results**:
- Go to the Pull Request on GitHub
- Click "Checks" tab
- Review any failures and fix them

#### Step 6: Code Review

- Wait for code review approval (if team has reviewers)
- Address any feedback
- Push updates to the same branch

#### Step 7: Merge to Main

Once CI passes and reviews are approved:

```bash
# Option 1: Merge via GitHub UI (recommended)
# Click "Merge pull request" button on GitHub

# Option 2: Merge via command line
git checkout main
git pull origin main
git merge --no-ff feature/your-feature-name
git push origin main
```

#### Step 8: Deploy to Production

**Automatic Deployment** (if configured):
- Vercel auto-deploys frontend from `main` branch
- Heroku can be configured to auto-deploy from `main`

**Manual Deployment** (current setup):

```bash
# After merging to main, deploy to Heroku
git checkout main
git pull origin main

# Deploy Node backend
git push heroku-node main

# Deploy Python service
git push heroku-python main
```

### Production Deployment Commands

#### Heroku Deployment

**Node Backend**:
```bash
# Deploy from main branch
git push heroku-node main

# View deployment logs
heroku logs --tail --app class-chat-node

# Check config variables
heroku config --app class-chat-node
```

**Python Service**:
```bash
# Deploy from main branch
git push heroku-python main

# View deployment logs
heroku logs --tail --app class-chat-python

# Check config variables
heroku config --app class-chat-python
```

**Force Push** (only if necessary, e.g., diverged branches):
```bash
# ⚠️ Use with caution - overwrites remote history
git push heroku-node main --force
git push heroku-python main --force
```

#### Vercel Deployment

**Frontend** (Auto-deploys from GitHub):
- Pushes to `main` automatically trigger Vercel deployment
- View deployment status at https://vercel.com/dashboard
- Environment variables configured in Vercel dashboard

### CI/CD Configuration

**Location**: `.github/workflows/ci.yml`

**Triggers**:
- On pull request to `main`
- On push to `main`

**Jobs**:
1. `frontend` - Frontend build and lint checks
2. `backend` - Backend TypeScript compilation
3. `python` - Python syntax validation

**Modifying CI Pipeline**:

To add new checks, edit `.github/workflows/ci.yml`:

```yaml
# Example: Add frontend tests
- name: Run frontend tests
  working-directory: frontend
  run: npm test
```

### Environment Variables

**Local Development**:
- Stored in `.env.local` files (git-ignored)
- See [Environment Configuration](#environment-configuration)

**Production (Heroku)**:
- Set via Heroku Config Vars
```bash
# Set variable
heroku config:set VARIABLE_NAME=value --app class-chat-node

# Get all variables
heroku config --app class-chat-node

# Unset variable
heroku config:unset VARIABLE_NAME --app class-chat-node
```

**Production (Vercel)**:
- Set via Vercel Dashboard
- Go to Project Settings → Environment Variables

### Deployment Checklist

Before deploying to production:

- [ ] ✅ All CI checks pass on GitHub
- [ ] ✅ Pull request reviewed and approved
- [ ] ✅ Merged to `main` branch
- [ ] ✅ Local testing completed successfully
- [ ] ✅ No `.env.local` files in commit
- [ ] ✅ No sensitive data in commit
- [ ] ✅ Database migrations complete (if applicable)
- [ ] ✅ Heroku environment variables up to date

After deployment:

- [ ] ✅ Verify production services are running
- [ ] ✅ Test login on production
- [ ] ✅ Test core functionality
- [ ] ✅ Monitor error logs for issues

### Rollback Procedure

If a deployment causes issues:

**Heroku Rollback**:
```bash
# View recent releases
heroku releases --app class-chat-node

# Rollback to previous release
heroku rollback --app class-chat-node

# Or rollback to specific version
heroku rollback v69 --app class-chat-node
```

**Vercel Rollback**:
- Go to Vercel Dashboard → Deployments
- Find previous working deployment
- Click "Promote to Production"

### Branch Naming Conventions

Use descriptive branch names:

- `feature/` - New features (e.g., `feature/add-citation-export`)
- `fix/` - Bug fixes (e.g., `fix/cors-error-localhost`)
- `refactor/` - Code refactoring (e.g., `refactor/lazy-mailgun-init`)
- `docs/` - Documentation updates (e.g., `docs/update-readme`)
- `test/` - Test additions (e.g., `test/add-integration-tests`)

### Commit Message Guidelines

Follow conventional commits:

```bash
# Format
<type>: <description>

# Types
feat:     # New feature
fix:      # Bug fix
refactor: # Code refactoring
docs:     # Documentation changes
test:     # Test additions/updates
chore:    # Maintenance tasks

# Examples
git commit -m "feat: Add document export functionality"
git commit -m "fix: Resolve CORS error on localhost HTTPS"
git commit -m "refactor: Implement lazy initialization for Mailgun client"
```

---

## Quick Reference

### Start All Services (Copy-Paste)

```bash
# Terminal 1: Python Service
cd /Users/rileydrake/Desktop/AIStudyBuddy/backend/python_scripts && conda activate study_buddy && uvicorn semantic_service:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: Node Backend
cd /Users/rileydrake/Desktop/AIStudyBuddy/backend && npm run dev

# Terminal 3: Frontend
cd /Users/rileydrake/Desktop/AIStudyBuddy/frontend && npm run dev
```

### Test URLs

| Service | URL | Notes |
|---------|-----|-------|
| Frontend | https://localhost:5173 | Main application |
| Backend API | https://localhost:3000 | Not browseable (API only) |
| Python API Docs | http://localhost:8000/docs | FastAPI Swagger UI |
| Python Health | http://localhost:8000 | FastAPI root |

### Stop All Services

Press `Ctrl+C` in each terminal to stop services.

### Common Commands

```bash
# Check conda environments
conda env list

# Activate Python environment
conda activate study_buddy

# Install Python dependencies
pip install -r backend/python_scripts/requirements.txt

# Install Node dependencies
cd backend && npm install
cd frontend && npm install

# Redis commands
redis-cli ping                    # Check if Redis is running
brew services start redis         # Start Redis (macOS)
brew services stop redis          # Stop Redis (macOS)
redis-cli info | head -20         # View Redis server info
redis-cli keys "openai:tpm:*"     # View token bucket keys

# Check running processes
lsof -i :5173  # Frontend
lsof -i :3000  # Backend
lsof -i :8000  # Python
lsof -i :6379  # Redis
```

### Configuration Files

| File | Purpose | Status |
|------|---------|--------|
| `frontend/.env.local` | Frontend environment variables | ✅ Complete |
| `backend/.env.local` | Node backend environment variables | ✅ Complete |
| `backend/python_scripts/.env.local` | Python service environment variables | ✅ Complete |
| `.gitignore` | Ignore patterns for version control | ✅ Comprehensive |
| `DEVELOPMENT.md` | This guide | ✅ Complete |

### Architecture Documentation

For deeper understanding of the system architecture:

- **System Overview**: `CLAUDE.md` (project root)
- **Coding Standards**: `docs/architecture/coding-standards.md`
- **Tech Stack**: `docs/architecture/tech-stack.md`
- **Source Tree**: `docs/architecture/source-tree.md`
- **Configuration Summary**: `docs/LOCAL-DEV-CONFIGURATION-SUMMARY.md`

---

## Production Deployment Isolation

⚠️ **IMPORTANT**: Local development setup is completely isolated from production deployment.

### Git Isolation

**What's Git-Ignored**:
- All `.env.local` files (never committed)
- HTTPS certificates (`*.pem`, `*.key`, `*.crt`)
- Build artifacts (`dist/`, `node_modules/`)
- Python artifacts (`__pycache__/`, `*.pyc`, `venv/`)

**What's Committed**:
- `.env.example` files (templates only, no credentials)
- Source code
- `package.json` and `requirements.txt`
- Configuration files (`vite.config.ts`, `tsconfig.json`, etc.)

### Deployment Workflow Unchanged

**Heroku Deployment**:
```bash
git push heroku main
# Uses Heroku environment variables (NOT .env.local)
# Procfile unchanged
# Production build process unchanged
```

**Vercel Deployment** (Frontend):
- Uses Vercel environment variables (NOT .env.local)
- Auto-deploys from Git
- Production build process unchanged

### Environment Variable Sources

| Environment | Source | Notes |
|-------------|--------|-------|
| **Local Dev** | `.env.local` files | Git-ignored, local only |
| **Heroku (Backend)** | Heroku Config Vars | Set via `heroku config:set` |
| **Vercel (Frontend)** | Vercel Environment Variables | Set via Vercel dashboard |

---

**End of Local Development Setup Guide**

*Last updated: 2025-10-24*
*For issues or questions, contact: rileydrakedesign@gmail.com*
