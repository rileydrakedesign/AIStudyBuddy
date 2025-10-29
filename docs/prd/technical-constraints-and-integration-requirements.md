# Technical Constraints and Integration Requirements

## Existing Technology Stack

**Languages & Runtimes**:
- Node.js 20.x (Backend API)
- Python 3.11+ (AI Service)
- TypeScript (Backend with ES modules)
- JavaScript/JSX (Frontend with React 18.3.1)

**Frameworks**:
- **Frontend**: React 18.3.1 + Vite 5.3.4
- **Backend API**: Express.js 4.18.2 (TypeScript)
- **AI Service**: FastAPI 0.115.4 + Uvicorn 0.23.2 + Gunicorn 22.0.0
- **AI/ML**: LangChain + OpenAI (GPT-4.1-nano, text-embedding-3-small)

**Database & Storage**:
- **Primary DB**: MongoDB Atlas with Vector Search (PlotSemanticSearch index)
- **Object Storage**: AWS S3 (boto3 3.34.142)
- **Cache/Queue**: Redis 5.0+ with TLS support, RQ 1.15 for job queue

**Infrastructure**:
- **Frontend Hosting**: Vercel (auto-deploy from Git)
- **Backend Hosting**: Heroku (class-chat-node-8a0ef9662b5a, class-chat-python-f081e08f29b8)
- **Deployment**: Manual git push (no CI/CD pipeline currently)

**External Dependencies**:
- **OpenAI API**: GPT-4.1-nano for generation, text-embedding-3-small for vectors (180k TPM limit)
- **Mailgun**: Email verification and notifications (mailgun.js 12.0.3)
- **Google OAuth**: google-auth-library 9.15.1 (requires app verification)
- **AWS S3**: Document storage with multer-s3 for uploads

**Key Constraints**:
- No CI/CD pipeline (all deploys direct to production)
- Heroku 30-second timeout (requires keepalive in long-running operations)
- MongoDB free tier limits on Atlas (may require upgrade for beta scale)
- OpenAI tier 1 rate limits (180k TPM, managed via Redis bucket)
- TLS required for Redis in production (Heroku Redis)

## Integration Approach

### Database Integration Strategy

**MongoDB Schema Extensions** (Additive Only):

**1. New Collection: `saved_materials`**
```javascript
{
  _id: ObjectId,
  userId: ObjectId,           // Reference to users collection
  classId: String,            // Class identifier
  type: String,               // "summary" | "study_guide" | "quote" | "note"
  title: String,              // User-provided or auto-generated
  content: String,            // Markdown content
  sourceDocuments: [String],  // Array of docIds used to generate
  sourceQuery: String,        // Original query that generated this
  isEditable: Boolean,        // Default true
  createdAt: Date,
  updatedAt: Date
}
```

**2. Extended Collection: `documents`**
```javascript
// Existing fields preserved
{
  userId, className, fileName, s3Key, docId, isProcessing, uploadedAt,

  // NEW FIELDS (additive):
  suggestedQueries: [String],        // 5 LLM-generated queries
  sectionMetadata: [{                // Extracted during chunking
    sectionTitle: String,
    chunkIds: [String],              // Chunks in this section
    hierarchy: Number                // 1 = chapter, 2 = section, 3 = subsection
  }],
  fileType: String                   // "pdf" | "docx" | "pptx"
}
```

**3. Extended Collection: `study_materials2` (chunks)**
```javascript
// Existing fields preserved
{
  text, embedding, file_name, title, author, user_id, class_id, doc_id,
  page_number, is_summary, chunk_hash,

  // NEW FIELDS (additive):
  section_title: String,             // Extracted section name
  section_hierarchy: Number,         // Heading level (1-6)
  suggested_query_embedding: Array   // If this chunk is a suggested query
}
```

**4. Extended Collection: `users`**
```javascript
// Existing fields preserved
{
  name, email, password, authProvider, googleId, picture, emailVerified,
  emailToken, emailTokenExp, plan, chatRequestCount, chatRequestResetAt, classes,

  // NEW FIELDS (additive):
  cumulativeDocumentUploads: Number, // Tracks total uploads (doesn't decrease on delete)
  loginAttempts: Number,             // Failed login counter
  loginAttemptResetAt: Date,         // When to reset loginAttempts to 0
  passwordResetToken: String,        // UUID for password reset
  passwordResetTokenExp: Date        // Expiration timestamp
}
```

**Migration Strategy**:
- Existing documents without new fields will default to `null` or `[]`
- Backend code will handle missing fields gracefully (e.g., `suggestedQueries ?? []`)
- Re-ingestion NOT required for existing documents (new features work only for newly uploaded docs)
- Optional: Admin script to backfill suggested queries for existing documents

### API Integration Strategy

**New Endpoints** (additive):
```
POST   /api/v1/materials/save           # Save study material
GET    /api/v1/materials/:classId       # Get saved materials for class
PATCH  /api/v1/materials/:materialId    # Update saved material
DELETE /api/v1/materials/:materialId    # Delete saved material

POST   /api/v1/user/forgot-password     # Initiate password reset
POST   /api/v1/user/reset-password      # Complete password reset
DELETE /api/v1/user/delete-account      # Delete account

GET    /api/v1/documents/:docId/summary # Get native summary for toggle
```

**Modified Endpoints** (backward compatible):
```
POST /api/v1/upload
  Response adds: { suggestedQueries: [...], fileType: "pdf" }

POST /api/v1/user/login
  Now tracks loginAttempts, returns 429 if exceeded

POST /api/v1/profile/update-email
  Now sends verification email
```

**Python API Changes**:

**Modified Endpoint** (response schema extended):
```
POST /api/v1/semantic_search
  Request adds optional: { saveAsType: "study_guide" | "summary" | null }
  Response adds: {
    suggestedRelatedQueries: [...],  # If user wants more ideas
    sectionContext: String            # Section name if FR6 implemented
  }
```

**New Endpoint**:
```
POST /api/v1/generate_suggested_queries
  Request: { doc_id: String, user_id: String, text_sample: String }
  Response: { queries: [String, String, ...] }  # 5 suggested queries
```

### Code Organization and Standards

**File Structure Approach** (Follows Existing Patterns):

**Backend (Node)**:
```
backend/src/
  controllers/
    materials_controllers.ts    # NEW: Saved materials CRUD
    password_reset.ts           # MODIFIED: Add reset logic
    user_controllers.ts         # MODIFIED: Add delete account
  routes/
    materials_routes.ts         # NEW: /api/v1/materials/*
  models/
    savedMaterial.ts            # NEW: Mongoose schema
    user.ts                     # MODIFIED: Add new fields
  middleware/
    rateLimitLogin.ts           # NEW: Login attempt tracking
```

**Backend (Python)**:
```
backend/python_scripts/
  config.py                     # NEW: Centralized env vars
  document_processors/
    docx_processor.py           # NEW: DOCX text extraction
    pptx_processor.py           # NEW: PPTX text extraction
    ocr_processor.py            # NEW: Tesseract OCR wrapper
  semantic_search.py            # MODIFIED: Citation logic, reranking
  router.py                     # MODIFIED: Improved follow-up detection
  load_data.py                  # MODIFIED: Section metadata extraction
```

**Frontend**:
```
frontend/src/
  components/
    sidebar/                    # NEW: Sidebar redesign components
    chat/
      SpecialResponseCard.tsx   # NEW: Special formatting
    mobile/
      MobileBlockingPage.tsx    # NEW: Mobile blocking
  contexts/
    SavedMaterialsContext.tsx   # NEW: Saved materials state
  hooks/
    useSavedMaterials.ts        # NEW: Custom hook for materials API
  pages/
    Chat.tsx                    # MODIFIED: Integrate new sidebar
    Profile.tsx                 # MODIFIED: Password reset, delete account
```

**Naming Conventions**:
- **React Components**: PascalCase (`SavedMaterialsList.tsx`)
- **Hooks**: camelCase with `use` prefix (`useSavedMaterials.ts`)
- **API Routes**: kebab-case (`/api/v1/saved-materials`)
- **Database Fields**: camelCase (`suggestedQueries`, `sectionMetadata`)
- **Python Functions**: snake_case (`extract_section_metadata`)
- **Environment Variables**: SCREAMING_SNAKE_CASE (`OPENAI_TPM_LIMIT`)

### Deployment and Operations

**Build Process Integration**:

**No Changes to Existing Build**:
- Frontend: `npm run build` → Vite production build → Vercel auto-deploy
- Node Backend: `npm run build` → TypeScript compile to `dist/` → Heroku web dyno
- Python Service: No build step (Python interpreted) → Heroku web + worker dynos

**New Dependencies to Add**:

**Frontend** (`frontend/package.json`):
```json
{
  "@tanstack/react-query": "^5.0.0"  // Optional: Caching for saved materials
}
```

**Backend Python** (`backend/python_scripts/requirements.txt`):
```
python-docx==0.8.11          # DOCX text extraction
python-pptx==0.6.21          # PPTX text extraction
pytesseract==0.3.10          # OCR wrapper
Pillow==10.0.0               # Image processing for OCR
```

**System Dependencies** (Heroku Buildpacks):
- Add Tesseract OCR buildpack: `heroku buildpacks:add https://github.com/pathwaysmedical/heroku-buildpack-tesseract`

**Deployment Strategy**:

**Phased Rollout Plan**:

**Phase 1: Infrastructure & Backend** (Week 1-2)
1. Deploy Python service changes (citation fix, section metadata, suggested queries)
2. Deploy Node API changes (new endpoints, password reset)
3. Run database migration script (add new fields to existing collections)
4. Verify backend via Postman/curl tests before frontend deploy

**Phase 2: Frontend Core** (Week 3)
1. Deploy mobile blocking page (low-risk, isolated)
2. Deploy formula rendering fixes (CSS-only changes)
3. Deploy toast notification repositioning (minimal JS changes)

**Phase 3: Frontend Major Features** (Week 4)
1. Deploy sidebar redesign (high complexity, test thoroughly)
2. Deploy special response formatting
3. Deploy saved materials UI

**Phase 4: New Document Formats** (Week 5)
1. Deploy DOCX/PPTX support
2. Deploy OCR functionality
3. Monitor ingestion queue for errors

**Rollback Plan**:
- Heroku: `heroku rollback vXXX` to previous release
- Vercel: Rollback via dashboard to previous deployment
- Database: Additive schema changes don't require rollback (missing fields handled gracefully)

### Monitoring and Logging

**Logging Enhancements**:

**Python Service** (`logger_setup.py` modifications):
- Centralized config for log levels (respects DEBUG, INFO, WARNING, ERROR)
- JSON format in production for structured logging
- Context injection for user_id and session_id in all log entries

**Node Service** (`backend/src/utils/logger.ts` modifications):
- Pino logger with structured format
- Middleware to inject user_id into all logs
- Pretty-print in development, JSON in production

**Metrics to Track**:
- Citation count per response (validate FR1.1 working)
- Saved material creation rate (measure feature adoption)
- Password reset completion rate (measure flow success)
- Document format distribution (PDF vs DOCX vs PPTX usage)
- Login attempt block rate (measure brute force attempts)

### Configuration Management

**Centralized Config** (`backend/python_scripts/config.py` - NEW FILE):
- Get required environment variables with fail-fast validation
- Get optional environment variables with documented defaults
- Feature flags for risky features (ENABLE_LLM_RERANKING, ENABLE_OCR)
- All services import from centralized config (no scattered `os.getenv()` calls)

## Risk Assessment and Mitigation

**Technical Risks**:

**Risk 1: Citation Renumbering Logic Complexity**
- **Impact**: High - Core value prop depends on clean citations
- **Probability**: Medium - Logic touches regex parsing and chunk deduplication
- **Mitigation**:
  - Unit tests for citation renumbering function with edge cases
  - Manual testing with 10+ diverse documents before deploy
  - Rollback plan: Revert to old citation logic if issues detected in beta

**Risk 2: DOCX/PPTX/OCR Ingestion Failures**
- **Impact**: Medium - New formats may have parsing errors, but PDF still works
- **Probability**: High - Document formats are unpredictable (corrupted files, unusual encodings)
- **Mitigation**:
  - Wrap each processor in try/except with graceful failure messages
  - Add file format validation before ingestion
  - Monitor ingestion queue for stuck jobs
  - Feature flag: `ENABLE_OCR` allows disabling if too flaky

**Risk 3: Saved Materials Storage Costs**
- **Impact**: Medium - MongoDB storage grows with saved materials
- **Probability**: Medium - Power users may save 50+ items
- **Mitigation**:
  - No limit for free tier (per user requirements)
  - Monitor MongoDB storage metrics weekly during beta
  - Plan for MongoDB Atlas tier upgrade if needed

**Risk 4: LLM Reranking Latency**
- **Impact**: Medium - Could push response times beyond 15s target
- **Probability**: Low - Adds ~500ms based on testing assumptions
- **Mitigation**:
  - Feature flag (`ENABLE_LLM_RERANKING`) allows A/B testing
  - Track response time metrics per query route
  - Disable reranking for follow-up queries (lower latency requirement)

**Integration Risks**:

**Risk 5: Sidebar Redesign Breaks Existing Navigation**
- **Impact**: High - Users cannot access chats/documents if sidebar broken
- **Probability**: Low - React component well-isolated
- **Mitigation**:
  - Feature flag for sidebar (toggle between old/new via localStorage)
  - Manual testing checklist covering all sidebar interactions
  - Staged rollout: 10% of users first, monitor error rates

**Risk 6: Password Reset Email Deliverability**
- **Impact**: High - Users locked out if email doesn't arrive
- **Probability**: Low - Mailgun is reliable, but spam filters unpredictable
- **Mitigation**:
  - Test password reset emails to Gmail, Outlook, Yahoo before launch
  - Add "Didn't receive email?" help text with resend button
  - Monitor Mailgun delivery logs for bounce rates

**Deployment Risks**:

**Risk 7: No Staging Environment = Production Testing**
- **Impact**: Critical - Bugs discovered by beta users instead of internal QA
- **Probability**: High - No automated tests, no staging safety net
- **Mitigation**:
  - Comprehensive manual testing checklist
  - Deploy in phases (backend first, frontend incrementally)
  - Assign beta testers priority support channel for rapid bug reports
  - Keep rollback commands ready

**Risk 8: OpenAI Rate Limit Exhaustion During Beta**
- **Impact**: High - Service becomes unusable if rate limits hit frequently
- **Probability**: Medium - Beta users may cluster usage (exam periods)
- **Mitigation**:
  - Implement multi-API-key rotation before beta launch
  - Monitor OpenAI usage dashboard daily during beta
  - Set up alerts for 80% TPM utilization
  - Communicate expected response times to beta users

---
