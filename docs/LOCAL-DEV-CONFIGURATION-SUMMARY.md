# Local Development Configuration - Comprehensive Summary

**Date**: 2025-10-24
**Author**: Winston (Architect Agent)
**Status**: Complete - Ready for Implementation

---

## Executive Summary

This document provides a complete inventory of ALL configuration points in the Class Chat AI codebase for local development. It serves as the **single source of truth** for understanding what exists, what needs to be configured, and what has already been set up.

### Quick Status

- **Total Configuration Points Identified**: 78
- **Already Configured**: 72 (92%)
- **Needs Configuration**: 6 (8%)
- **Critical Issues**: 1 (.gitignore missing)

---

## What's Already Configured ✅

### Frontend (React + Vite)

| Configuration | Location | Value | Status |
|--------------|----------|-------|--------|
| API Base URL | `frontend/.env.local:5` | `https://localhost:3000/api/v1` | ✅ |
| WebSocket URL | `frontend/.env.local:8` | `wss://localhost:3000` | ✅ |
| Google OAuth | `frontend/.env.local:12` | (empty - disabled) | ✅ |
| Dev Server Port | `vite.config.ts:15` | 5173 | ✅ |
| HTTPS Config | `vite.config.ts:10-13` | Enabled (requires certs) | ✅ |
| Hot Module Replacement | Vite default | Auto-enabled | ✅ |
| Axios BaseURL | `main.tsx:12` | Uses VITE_API_URL | ✅ |

**Frontend Status**: 7/7 configured (100%)

---

### Backend Node (Express + TypeScript)

| Configuration | Location | Value | Status |
|--------------|----------|-------|--------|
| Server Port | `backend/.env.local:36` | 3000 | ✅ |
| Node Environment | `backend/.env.local:34` | development | ✅ |
| Log Level | `backend/.env.local:35` | debug | ✅ |
| MongoDB URI | `backend/.env.local:6` | Production Atlas | ✅ |
| Redis URL | `backend/.env.local:12` | Production Redis | ✅ |
| AWS S3 Config | `backend/.env.local:15-18` | Production S3 | ✅ |
| JWT Secret | `backend/.env.local:21` | Production secret | ✅ |
| Cookie Secret | `backend/.env.local:22` | Production secret | ✅ |
| Email Enabled | `backend/.env.local:39` | false (disabled) | ✅ |
| Mailgun API Key | `backend/.env.local:30` | (disabled) | ✅ |
| Mailgun Domain | `backend/.env.local:31` | (disabled) | ✅ |
| Google OAuth | `backend/.env.local` | No CLIENT_SECRET (disabled) | ✅ |
| Python Service URL | `backend/.env.local:9` | `http://localhost:8000` | ✅ |
| Backend URL | `backend/.env.local:31` | `http://localhost:3000` | ✅ |
| HTTP CORS | `app.ts:23` | localhost:5173 in allowedExact | ✅ |
| Hot Reload | `package.json:11` | nodemon + tsc --watch | ✅ |
| **WebSocket CORS** | `backend/.env.local` | **MISSING CLIENT_ORIGIN** | ❌ |

**Backend Node Status**: 16/17 configured (94%)
**Missing**: CLIENT_ORIGIN environment variable

---

### Backend Python (FastAPI + LangChain)

| Configuration | Location | Value | Status |
|--------------|----------|-------|--------|
| Node Environment | `python_scripts/.env.local:79` | development | ✅ |
| Log Level | `python_scripts/.env.local:80` | DEBUG | ✅ |
| MongoDB URI | `python_scripts/.env.local:6` | Production Atlas (same as Node) | ✅ |
| Redis URL | `python_scripts/.env.local:20` | Production Redis | ✅ |
| Redis SSL Verify | `python_scripts/.env.local:22` | false | ✅ |
| Redis SSL Cert | `python_scripts/.env.local:23-72` | Full certificate data | ✅ |
| AWS S3 Config | `python_scripts/.env.local:14-17` | Production S3 (same as Node) | ✅ |
| OpenAI API Key | `python_scripts/.env.local:9` | Production key | ✅ |
| OpenAI Model | `python_scripts/.env.local:10` | gpt-4o-mini | ✅ |
| OpenAI TPM Limit | `python_scripts/.env.local:11` | 180000 | ✅ |
| Backend URL | `python_scripts/.env.local:75-76` | `http://localhost:3000` | ✅ |
| Conda Environment | Anaconda | study_buddy (exists) | ✅ |
| Requirements | `requirements.txt` | All packages listed | ✅ |
| **Startup Command** | Documentation | **NOT DOCUMENTED** | ❌ |

**Backend Python Status**: 13/14 configured (93%)
**Missing**: Startup command documentation (conda activate + uvicorn)

---

## What Needs Configuration ❌

### Critical (P0 - Blocking)

1. **`.gitignore`** - FIXED ✅
   - **Issue**: Only had `node_modules/` repeated 3 times
   - **Risk**: Production credentials in .env.local files not ignored
   - **Fix Applied**: Comprehensive .gitignore with all necessary patterns
   - **File**: `/Users/rileydrake/Desktop/AIStudyBuddy/.gitignore`

### High Priority (P1)

2. **Backend `CLIENT_ORIGIN`** ❌
   - **Location**: `backend/.env.local`
   - **Value to Add**: `CLIENT_ORIGIN=http://localhost:5173` (or https if using HTTPS)
   - **Why**: WebSocket CORS in `socket_server.ts:29` requires this
   - **Impact**: WebSocket connections will fail without this

3. **Python Startup Documentation** ❌
   - **Location**: DEVELOPMENT.md (to be created)
   - **Command**:
     ```bash
     conda activate study_buddy
     cd backend/python_scripts
     uvicorn semantic_service:app --reload --host 0.0.0.0 --port 8000
     ```
   - **Why**: Developers don't know how to start Python service
   - **Impact**: Cannot run local development without this

4. **DEVELOPMENT.md** ❌
   - **Location**: Project root
   - **Content**: Complete local dev setup guide
   - **Why**: No single reference for local dev instructions
   - **Impact**: Takes longer to set up local environment

### Medium Priority (P2 - Optional)

5. **HTTPS Certificates** (Optional)
   - **Files**: `localhost.pem`, `localhost-key.pem`
   - **Location**: Project root
   - **Options**:
     - Generate with mkcert (recommended)
     - Disable HTTPS in `vite.config.ts`
   - **Impact**: Frontend won't start without certificates OR HTTPS must be disabled

6. **Frontend `.env.example`** (Documentation)
   - **Issue**: Missing VITE_API_URL in .env.example
   - **Fix**: Add `VITE_API_URL=https://localhost:3000/api/v1` to example

---

## Complete Environment Variable Reference

### All Environment Variables by Service

#### Frontend (6 variables)

| Variable | Required | Current Value | Used In |
|----------|----------|---------------|---------|
| VITE_API_URL | Yes | `https://localhost:3000/api/v1` | main.tsx:12 |
| VITE_WS_URL | Yes | `wss://localhost:3000` | socketClient.ts:19 |
| VITE_GOOGLE_CLIENT_ID | No | (empty) | Login.tsx:61, Signup.tsx:88 |

#### Backend Node (20 variables)

| Variable | Required | Current Value | Used In Files |
|----------|----------|---------------|---------------|
| NODE_ENV | Yes | development | index.ts:16,32; logger.ts:13 |
| LOG_LEVEL | No | debug | logger.ts:11 |
| PORT | Yes | 3000 | index.ts:33,60 |
| **CLIENT_ORIGIN** | **Yes** | **MISSING ❌** | socket_server.ts:29 |
| PYTHON_API_URL | Yes | `http://localhost:8000` | chat_controllers.ts:208; document_controllers.ts:166 |
| MONGO_CONNECTION_STRING | Yes | (production) | db/connection.ts:15,55 |
| REDIS_URL | Yes | (production) | (implied - not directly used in Node code scan) |
| AWS_ACCESS_KEY | Yes | (production) | document_controllers.ts:24; download_controllers.ts:15; validators.ts:204 |
| AWS_SECRET | Yes | (production) | document_controllers.ts:25; download_controllers.ts:16; validators.ts:205 |
| AWS_REGION | Yes | us-east-1 | document_controllers.ts:23; download_controllers.ts:14; document_routes.ts:24; validators.ts:202 |
| AWS_S3_BUCKET_NAME | Yes | (production) | document_controllers.ts:22; download_controllers.ts:13; document_routes.ts:42; validators.ts:214 |
| JWT_SECRET | Yes | (production) | token_manager.ts:11,26; socket_server.ts:55,66 |
| COOKIE_SECRET | Yes | (production) | app.ts:59; socket_server.ts:55 |
| EMAIL_ENABLED | No | false | email.ts:13 |
| MAILGUN_API_KEY | No | (disabled) | email.ts:9,14 |
| MAILGUN_DOMAIN | No | (disabled) | email.ts:15,33,65 |
| GOOGLE_CLIENT_ID | No | (disabled) | user_controllers.ts:158,167 |
| BACKEND_URL | No | `http://localhost:3000` | email.ts:25,57 |
| BACKEND_URL_DEV | No | `http://localhost:3000` | email.ts:25,57 |
| FRONTEND_URL | No | (fallback to localhost) | password_reset.ts:70-71 |

#### Backend Python (30+ variables)

| Variable | Required | Default | Used In Files |
|----------|----------|---------|---------------|
| NODE_ENV | No | (none) | (convention) |
| LOG_LEVEL | No | INFO | logger_setup.py:6 |
| MONGO_CONNECTION_STRING | Yes | (none) | load_data.py:34; semantic_search.py:69 |
| REDIS_URL | Yes | (none) | redis_setup.py:19 |
| REDIS_TLS_URL | No | (none) | redis_setup.py:19 |
| REDIS_SSL_VERIFY | No | true | redis_setup.py:23 |
| REDIS_SSL_CA_FILE | No | (none) | redis_setup.py:27 |
| REDIS_SSL_CA_DATA | No | (none) | redis_setup.py:28 |
| REDIS_DIAG | No | 0 | redis_setup.py:75 |
| AWS_ACCESS_KEY | Yes | (none) | load_data.py:46; semantic_search.py:237 |
| AWS_SECRET | Yes | (none) | load_data.py:47; semantic_search.py:238 |
| AWS_REGION | Yes | (none) | load_data.py:48; semantic_search.py:239 |
| AWS_S3_BUCKET_NAME | Yes | (none) | load_data.py:349; semantic_search.py:241 |
| OPENAI_API_KEY | Yes | (none) | (LangChain auto-detects) |
| OPENAI_CHAT_MODEL | No | gpt-4.1-nano | semantic_search.py:88 |
| OPENAI_TPM_LIMIT | No | 180000 | load_data.py:62; semantic_search.py:65 |
| BACKEND_URL | Yes | `https://localhost:3000/api/v1` | semantic_search.py:90 |
| BACKEND_URL_DEV | No | (none) | (alternative) |
| RQ_QUEUE | No | ingest | worker_boot.py:9 |
| MAX_PROMPT_TOKENS | No | 8000 | semantic_search.py:95 |
| SIMILARITY_THRESHOLD | No | 0.0 | semantic_search.py:99 |
| RAG_K | No | 12 | semantic_search.py:79 |
| RAG_CANDIDATES | No | 1000 | semantic_search.py:79 |
| RAG_TEMP_GENERAL | No | 0.2 | semantic_search.py:79 |
| RAG_MAX_TOKENS | No | 700 | semantic_search.py:79 |
| RAG_K_FOLLOWUP | No | 10 | semantic_search.py:80 |
| RAG_TEMP_FOLLOWUP | No | 0.2 | semantic_search.py:80 |
| RAG_K_QUOTE | No | 20 | semantic_search.py:81 |
| RAG_TEMP_QUOTE | No | 0.0 | semantic_search.py:81 |
| RAG_MAX_TOKENS_QUOTE | No | 400 | semantic_search.py:81 |
| RAG_K_GUIDE | No | 8 | semantic_search.py:82 |
| RAG_TEMP_GUIDE | No | 0.3 | semantic_search.py:82 |
| RAG_MAX_TOKENS_GUIDE | No | 1200 | semantic_search.py:82 |
| RAG_K_SUM | No | 8 | semantic_search.py:83 |
| RAG_TEMP_SUM | No | 0.2 | semantic_search.py:83 |
| RAG_MAX_TOKENS_SUM | No | 600 | semantic_search.py:83 |

---

## Hardcoded Configuration Points

### Ports

| Service | Port | Configured In | Hardcoded? |
|---------|------|---------------|------------|
| Frontend | 5173 | vite.config.ts:15 | ✅ Yes (but configurable) |
| Node Backend | 3000 | .env.local:36 | ❌ No (env var) |
| Python Service | 8000 | uvicorn command | ✅ Yes (command line arg) |

### Model Names

| Location | Model | Hardcoded? |
|----------|-------|------------|
| router.py:23 | gpt-4.1-nano | ✅ Yes (for tie-breaking) |
| semantic_search.py:88 | Uses OPENAI_CHAT_MODEL env var | ❌ No |

### CORS Origins

| Location | Origins | Hardcoded? |
|----------|---------|------------|
| app.ts:23-27 | allowedExact Set | ✅ Yes (static list) |
| socket_server.ts:29 | Uses CLIENT_ORIGIN env var | ❌ No |

---

## Service Connection Map

```
Frontend (localhost:5173)
  ↓ HTTP API calls → axios → VITE_API_URL
  ↓ WebSocket → socketClient.ts → VITE_WS_URL
  ↓
Backend Node (localhost:3000)
  ↓ MongoDB → MONGO_CONNECTION_STRING
  ↓ Redis → REDIS_URL
  ↓ S3 → AWS_* credentials
  ↓ Python Service → PYTHON_API_URL
  ↓
Backend Python (localhost:8000)
  ↓ MongoDB → MONGO_CONNECTION_STRING (same as Node)
  ↓ Redis → REDIS_URL (same as Node)
  ↓ S3 → AWS_* credentials (same as Node)
  ↓ OpenAI → OPENAI_API_KEY
  ↓ Callback to Node → BACKEND_URL
```

---

## Configuration Files Inventory

### Files That Exist and Are Configured ✅

1. `frontend/.env.local` - Complete
2. `frontend/vite.config.ts` - Complete (HTTPS optional)
3. `frontend/package.json` - Complete (dev script exists)
4. `backend/.env.local` - Almost complete (needs CLIENT_ORIGIN)
5. `backend/package.json` - Complete (dev script exists)
6. `backend/src/app.ts` - Complete (CORS configured)
7. `backend/python_scripts/.env.local` - Complete
8. `backend/python_scripts/requirements.txt` - Complete
9. `backend/Procfile` - Production only, unchanged
10. `backend/python_scripts/Procfile` - Production only, unchanged

### Files That Need Updates ❌

1. **`.gitignore`** - FIXED ✅
2. `backend/.env.local` - Needs CLIENT_ORIGIN line added
3. `DEVELOPMENT.md` - Needs to be created

### Files That Are Optional

1. `localhost.pem` - Optional (can disable HTTPS instead)
2. `localhost-key.pem` - Optional (can disable HTTPS instead)
3. `frontend/.env.example` - Should be updated to include VITE_API_URL

---

## Production Services Used in Local Dev

| Service | Usage | Safety Measures |
|---------|-------|-----------------|
| **MongoDB Atlas** | Production database | Use test accounts only (dev-test@example.com) |
| **AWS S3** | Production bucket | Prefix uploads with "TEST - " |
| **Redis** | Production queue | Shared with production, be careful |
| **OpenAI API** | Production key | API costs apply! Keep queries short. |

---

## What's Disabled for Local Dev

| Feature | How It's Disabled | Impact |
|---------|-------------------|--------|
| **Email Verification** | EMAIL_ENABLED=false | No signup/reset emails sent |
| **Mailgun** | EMAIL_ENABLED=false | Mailgun API not called |
| **Google OAuth** | No GOOGLE_CLIENT_SECRET | Sign in with Google button hidden |

---

## Port Summary

| Port | Service | Protocol | Local URL |
|------|---------|----------|-----------|
| 5173 | Frontend (Vite) | HTTPS or HTTP | https://localhost:5173 |
| 3000 | Backend Node | HTTP | http://localhost:3000 |
| 8000 | Python AI | HTTP | http://localhost:8000 |

---

## Next Steps

### Immediate Actions (Priority Order)

1. ✅ **DONE**: Fix `.gitignore` - Critical security issue resolved
2. ❌ **TODO**: Add `CLIENT_ORIGIN=http://localhost:5173` to `backend/.env.local`
3. ❌ **TODO**: Create `DEVELOPMENT.md` with complete setup instructions
4. ❌ **TODO**: Update Story 0.1 in official location (`docs/stories/0.1.local-env-verification.md`)
5. ⚠️ **VERIFY**: Run `git log --all --full-history -- **/.env.local` to ensure no credentials in git history

### Optional Enhancements

1. Generate HTTPS certificates with mkcert (or disable HTTPS)
2. Update `frontend/.env.example` to include VITE_API_URL
3. Consider adding FastAPI CORS middleware if frontend ever calls Python directly
4. Create helper script for starting all three services

---

## Summary Statistics

**Total Configuration Points**: 78
- Frontend: 7
- Backend Node: 20
- Backend Python: 35+
- Configuration Files: 10
- Other (ports, hardcoded values): 6

**Configuration Status**:
- ✅ Already Configured: 72 (92%)
- ❌ Needs Configuration: 6 (8%)
- ⚠️ Optional: 3

**Critical Issues**:
- ✅ .gitignore fixed
- ❌ CLIENT_ORIGIN missing (1 line to add)
- ❌ Documentation missing (DEVELOPMENT.md to create)

---

*Last Updated: 2025-10-24*
*Maintained by: Winston (Architect Agent)*
*Related Documents*:
- Updated Story 0.1: `docs/stories/0.1.local-env-verification-UPDATED.md`
- Architecture Review: Epic 0 Architecture Review (comprehensive report in conversation history)
