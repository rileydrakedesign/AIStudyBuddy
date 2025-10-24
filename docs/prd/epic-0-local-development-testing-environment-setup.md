# Epic 0: Local Development & Testing Environment Setup

**Epic Goal**:
Configure a complete local development environment that connects to production services, establish smoke test suite for pre-production validation, and ensure solo developer can iterate safely without affecting production deployment.

**Integration Requirements**:
- **CRITICAL**: Configuration changes only - no production code logic modifications
- Create `.env.local` files for local development (git-ignored, not deployed)
- Configure CORS to allow local frontend → local backend communication
- Use production MongoDB Atlas and S3 (no local database/storage setup)
- Update package.json dev scripts for hot reload (nodemon/ts-node-dev for Node, uvicorn --reload for Python)
- Production deployment workflow must remain completely unchanged

**Success Criteria**:
- All three services run locally with hot reload enabled
- Local frontend (localhost) successfully communicates with local backend (CORS configured)
- Local services connect to production MongoDB and S3 without issues
- Test account works locally for full end-to-end testing (auth → upload → chat → citation)
- Production deployment remains completely unchanged (git push heroku main still works)
- DEVELOPMENT.md documents complete setup process for new developers

---

## Story 0.1: Local Development Environment Setup & Configuration

As a **developer**,
I want **a fully configured local development environment that connects to production services**,
so that **I can develop and test changes locally before deploying to production without affecting production deployment**.

**⚠️ CRITICAL CONSTRAINT**: This story involves CONFIGURATION changes only - no production code logic modifications.

### Acceptance Criteria

**Functional Requirements**:
1. Create `.env.local` files for all three services (frontend, Node backend, Python AI) with local development URLs
2. Configure CORS settings in Node backend to allow local frontend (localhost) to communicate with local backend
3. Update frontend API URLs to point to local backend during development
4. Configure all three services to use production MongoDB Atlas and production S3 (no local database instances)
5. Set up hot reload for all three services (Vite HMR, nodemon/ts-node-dev, uvicorn --reload)
6. Configure local ports to avoid conflicts (frontend, Node backend, Python service on distinct ports)
7. Create DEVELOPMENT.md documenting the complete local setup process

**Integration Verification**:
1. Start all three services locally → verify no errors, all connect to production MongoDB/S3
2. Frontend (localhost:XXXX) successfully communicates with local Node backend (CORS configured)
3. Local Node backend successfully communicates with local Python AI service
4. Test account can log in locally and use all features (auth, upload, chat, citations)
5. Hot reload verified working for all three services (make changes, verify auto-refresh/restart)

**Quality Requirements**:
6. **CRITICAL**: Local development setup is completely isolated from production deployment - no risk of accidental production changes
7. **CRITICAL**: Production deployment workflow remains unchanged (git push heroku main still works identically)
8. **CRITICAL**: Production MongoDB and S3 data is used but not corrupted by local testing
9. Local setup documented clearly enough for new developer to configure in <15 minutes
10. All local changes hot reload without manual restarts

### Integration Verification

**IV1: Local Services Startup & Communication**
- All three services start with configured commands (npm run dev, uvicorn --reload)
- Frontend (localhost:5173) loads in browser without errors
- Local Node backend (localhost:5001) connects to production MongoDB Atlas successfully
- Local Python service (localhost:8000) connects to production MongoDB and S3 successfully
- No CORS errors in browser console when frontend calls backend

**IV2: Hot Reload Verification**
- Modify React component → browser auto-refreshes (Vite HMR)
- Modify Node API route → server auto-restarts (nodemon/ts-node-dev)
- Modify Python route → service auto-reloads (uvicorn --reload)
- All hot reload mechanisms working without manual restarts

**IV3: End-to-End Local Testing with Production Services**
- Test account login works locally (JWT cookie set, no CORS errors)
- Document upload works → file uploaded to production S3 bucket
- Document ingestion works → chunks written to production MongoDB
- Chat works → retrieval from production MongoDB, response generation
- Citations work → PDF loads from production S3
- **CONFIRM**: Local testing uses production data but safely (test account only)

### Technical Notes

- **CONFIGURATION CHANGES ONLY**: No production code logic modifications
- **Files to Create**: `.env.local` for frontend, backend, and Python service
- **Files to Modify**:
  - `backend/src/app.ts` (CORS configuration - environment-based)
  - `backend/package.json` (dev script for hot reload)
  - `.gitignore` (add .env.local if not present)
- **Production Services**: Local dev uses production MongoDB Atlas, S3, and Redis (not local instances)
- **CORS Critical**: Must configure environment-based CORS to allow localhost origins in development only
- **Hot Reload Tools**:
  - Frontend: Vite HMR (built-in)
  - Node Backend: ts-node-dev or nodemon (install as dev dependency)
  - Python Service: uvicorn --reload flag
- **Safety**: Always use test account for local testing, avoid modifying production user data
- **Output**: DEVELOPMENT.md with complete setup instructions including .env.local creation, CORS configuration, and troubleshooting

### Definition of Done

- [ ] `.env.local` files created for all three services with correct local URLs
- [ ] CORS configured in Node backend (environment-based, allows localhost in development only)
- [ ] Hot reload configured and tested for all three services
- [ ] DEVELOPMENT.md created with complete setup instructions
- [ ] All three services run locally and communicate successfully
- [ ] Local services connect to production MongoDB and S3 without issues
- [ ] Test account works locally for end-to-end testing (auth → upload → chat → citation)
- [ ] `.gitignore` updated to include `.env.local` (if not already present)
- [ ] **VERIFIED**: Production deployment workflow unchanged (git push heroku main still works)
- [ ] **VERIFIED**: No production code logic changes, only configuration

---

## Story 0.2: Pre-Production Smoke Test Suite

As a **developer**,
I want **a simple smoke test checklist to validate core functionality locally**,
so that **I can verify changes work before deploying to production**.

**⚠️ CRITICAL CONSTRAINT**: Tests run locally ONLY using existing test account. ZERO modifications to production code, tests, or CI/CD.

### Acceptance Criteria

**Functional Requirements**:
1. Smoke test checklist covers core user flow: login → upload → chat → citation
2. Test executed manually using existing test account (no automation required for MVP)
3. Test validates (all in LOCAL environment):
   - Auth: Existing test user login successful
   - Upload: PDF upload → ingestion completes → document appears in UI
   - Chat: Query returns response with 1-5 citations
   - Citation: Clicking citation jumps to correct page in PDF viewer
4. Test checklist documented in DEVELOPMENT.md or separate SMOKE_TEST.md
5. Pre-production validation workflow documented: "Run smoke tests locally before git push heroku main"

**Integration Verification**:
1. Smoke test runs locally end-to-end without errors (all steps pass)
2. Test uses existing test account (no new test data creation required)
3. Test validates all three services communicate correctly in local environment

**Quality Requirements**:
4. Smoke test executes in <5 minutes (manual checklist)
5. Test results clearly documented (pass/fail for each step)
6. No automated test infrastructure required (keeps it simple for solo dev)

### Integration Verification

**IV1: Local Environment Testing**
- Run smoke test in local environment → verify all steps pass
- Test uses existing test account (already in MongoDB)
- All services (frontend, Node backend, Python AI) running locally

**IV2: Regression Detection**
- Optional: Introduce intentional bug locally → verify test catches it
- This validates the smoke test checklist is effective
- Fix bug → verify test passes again

**IV3: Pre-Production Workflow**
- Establish habit: Run smoke test locally before `git push heroku main`
- Document this workflow in DEVELOPMENT.md
- No automated enforcement needed (developer discipline)

### Technical Notes

- **NO CODE CHANGES ALLOWED**: This story creates documentation ONLY
- **Manual Checklist Approach** (recommended):
  1. Start all three services locally (see Story 0.1 documentation)
  2. Open browser to local frontend (e.g., http://localhost:5173)
  3. Login as existing test user
  4. Upload test PDF (e.g., sample lecture notes from `test-data/` folder)
  5. Wait for "Document processed" notification (WebSocket event)
  6. Navigate to chat → send query: "What are the key concepts?"
  7. Verify response includes 1-5 citations
  8. Click citation [1] → verify PDF viewer jumps to correct page
  9. Document pass/fail for each step
- **Test Data**: Uses existing test account, creates test documents (can be deleted after test)
- **Rollback Trigger**: If smoke test fails locally, do not deploy to production
- **Future Enhancement**: Could automate with Playwright later, but manual is sufficient for MVP

### Definition of Done

- [ ] Smoke test checklist documented in DEVELOPMENT.md or SMOKE_TEST.md
- [ ] Checklist covers core flow: login → upload → chat → citation
- [ ] Test executed successfully in local environment (all steps pass with existing test account)
- [ ] Pre-production validation workflow documented: "Run smoke test locally before git push heroku main"
- [ ] Optional: Smoke test catches intentional bug (validates checklist effectiveness)
- [ ] **VERIFIED**: Zero production code changes made
- [ ] **VERIFIED**: No test infrastructure added to production codebase
- [ ] **VERIFIED**: Production deployment completely unaffected

---

## Compatibility Requirements

- [x] **Configuration changes only** - No production code logic modifications
- [x] **Production deployment unchanged** - No changes to Heroku/Vercel deployment workflows
- [x] **ZERO database schema changes** - Uses existing production MongoDB schema, no migrations
- [x] **ZERO API changes** - No new endpoints, no modified contracts
- [x] **Minimal dependency changes** - Only dev dependencies (ts-node-dev or nodemon for Node backend hot reload)
- [x] **Git-ignored config files** - `.env.local` files never committed or deployed
- [x] **Environment-conditional changes** - CORS configuration only affects development, not production

---

## Risk Mitigation

**Primary Risk:** Accidentally deploying local dev configuration to production

**Mitigation:**
- `.env.local` files added to `.gitignore` (never committed)
- CORS configuration is environment-conditional (`process.env.NODE_ENV === 'development'`)
- Production deployment uses Heroku/Vercel environment variables, NOT .env.local files
- DEVELOPMENT.md explicitly states: "Local .env.local files are git-ignored and never deployed"
- Git status verification before deployment (only DEVELOPMENT.md and .gitignore should be committed)

**Secondary Risk:** Local development corrupting production MongoDB or S3 data

**Mitigation:**
- Always use designated test account for local development
- DEVELOPMENT.md documents safe testing practices: "Only test with test classes/documents"
- Test data can be deleted from production MongoDB/S3 after local testing
- Production user data remains untouched (test account isolated)

**Tertiary Risk:** CORS misconfiguration breaking production

**Mitigation:**
- CORS configuration is environment-based (development vs production)
- Production CORS only allows production Vercel URL (not localhost)
- Test production deployment after CORS changes to verify no breakage
- Heroku logs will show CORS errors if misconfigured (monitor after deployment)

**Rollback Plan:**
- If CORS breaks production: Revert `backend/src/app.ts` CORS changes, redeploy
- If .env.local accidentally committed: Remove from git history, add to .gitignore, redeploy
- If local dev breaks: Delete `.env.local` files, reconfigure from scratch using DEVELOPMENT.md
- Production services (MongoDB, S3) unaffected - only local configuration at risk

---
