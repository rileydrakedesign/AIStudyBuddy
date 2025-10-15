# Class Chat AI Brownfield Enhancement PRD

## Intro Project Analysis and Context

### Analysis Source

- **Source**: Comprehensive existing project documentation found at:
  - `/docs/brief.md` (Product brief with MVP scope)
  - `/docs/architecture.md` (Brownfield architecture document v1.0)
  - `/CLAUDE.md` (Agent reference guide)
  - `/ROUGH_FIXES.md` (Enhancement list - raw format)

### Existing Project Overview

#### Current Project State

**Product**: Class Chat AI - AI-powered study assistant providing document-grounded Q&A with inline citations

**Current Phase**: Pre-launch MVP undergoing refinement based on internal testing before beta launch (target Q1 2026)

**Architecture**:
- **Frontend**: React 18 + Vite + Material UI (Vercel deployment)
- **Backend API**: Node.js/Express with TypeScript (Heroku: `class-chat-node-8a0ef9662b5a`)
- **AI Service**: Python FastAPI with LangChain + OpenAI GPT-4.1-nano (Heroku: `class-chat-python-f081e08f29b8`)
- **Data Layer**: MongoDB Atlas (vector search), AWS S3 (documents), Redis (queues + rate limiting)
- **Real-time**: Socket.IO WebSocket for streaming responses and document processing updates

**Core Capabilities**:
- User authentication (JWT + Google OAuth), email verification
- Class-based document organization
- PDF upload → chunking → embedding → MongoDB Atlas vector search
- Multi-document class chat with semantic search and inline citations
- Document-scoped chat with page-level citation jumps
- Specialized query modes: Q&A, study guides, summaries, quote extraction
- Real-time streaming responses via WebSockets
- Freemium usage limits (25 chats/month free tier)

### Available Documentation Analysis

✅ **Available Documentation**:
- Tech Stack Documentation (architecture.md - complete tech stack table)
- Source Tree/Architecture (architecture.md - comprehensive file structure + module organization)
- Coding Standards (architecture.md - patterns documented)
- API Documentation (architecture.md - complete endpoint catalog)
- External API Documentation (architecture.md - OpenAI, Mailgun, Google OAuth, AWS S3)
- Technical Debt Documentation (architecture.md - P0-P3 issues cataloged, ROUGH_FIXES.md raw list)
- Product Brief (brief.md - comprehensive MVP scope, success metrics, vision)

**Status**: Comprehensive brownfield documentation exists. No need to run document-project task.

### Enhancement Scope Definition

**Enhancement Type**:
- ✅ New Feature Addition (suggested queries, study guide improvements, context-aware generation)
- ✅ Major Feature Modification (RAG pipeline improvements, citation fixes, streaming overhaul)
- ✅ Performance/Scalability Improvements (logging, rate limiting, memory optimization)
- ✅ UI/UX Overhaul (sidebar redesign, mobile blocking, formula rendering, general cleanup)
- ✅ Bug Fix and Stability Improvements (email confirmation, password validators, follow-up queries)

**Enhancement Description**:

This PRD covers **comprehensive pre-beta refinements** across the entire Class Chat AI stack, addressing 40+ identified improvements organized into six major themes:

1. **RAG & Retrieval Quality** - Citation clustering fix, hybrid retrieval with fallback, LLM reranking, context engineering
2. **Study Material Generation** - Structured formatting, context-aware scoping, suggested queries from documents
3. **Document Processing** - Section/subsection metadata, native summaries, multi-format support (DOCX, PPT, OCR)
4. **UI/UX & Interface** - Sidebar redesign with class tabs, formula rendering fixes, mobile blocking, general cleanup
5. **Authentication & Security** - Password reset, login attempt limiting, delete account, email/password change validators
6. **Infrastructure & Operations** - Logging improvements, env var centralization, code cleanup, rate limiting strategy

**Impact Assessment**:
- **Significant Impact** (substantial existing code changes across all layers)
  - Frontend: Chat UI, document viewer, navigation sidebar
  - Backend: Auth flows, chat orchestration, rate limiting
  - Python AI: RAG pipeline, chunking, routing, generation, prompts
  - Infrastructure: Logging, configuration, Redis usage

### Goals and Background Context

**Goals**:
- Resolve all P0 (critical) and P1 (high priority) issues blocking beta launch
- Improve retrieval quality and citation UX to validate core value proposition
- Enhance study material generation to differentiate from generic AI chatbots
- Implement authentication/security best practices for public launch readiness
- Establish observability infrastructure (logging, metrics) for beta feedback analysis
- Optimize performance and reduce operational costs before scaling
- Create polished, production-ready UX that encourages user adoption and retention

**Background Context**:

Class Chat AI is a fully functional pre-launch MVP that has been internally tested and is preparing for beta launch to a small test group. The ROUGH_FIXES.md document represents accumulated findings from internal testing, technical debt identified during development, and planned enhancements informed by the product vision.

The system currently works end-to-end (signup → upload → ingestion → chat → citations → verification), but several UX pain points, technical debt items, and missing features have been identified that could impact beta user perception and feedback quality. This PRD systematically addresses these issues to ensure the beta launch showcases the product's full potential and generates actionable validation of the core value proposition (verifiable AI answers from personal documents).

The enhancements are scoped to maintain the existing architecture (React + Node + Python FastAPI + MongoDB + S3 + Redis) while improving quality, polish, and production readiness. No major architectural changes (e.g., Graph RAG migration) are included in this PRD—those are reserved for post-beta Phase 2.

### Change Log

| Change | Date | Version | Description | Author |
|--------|------|---------|-------------|--------|
| Initial PRD | 2025-10-14 | 1.0 | Brownfield enhancement PRD for pre-beta launch | John (PM Agent) |

---

## Requirements

### Functional Requirements

**FR1: Citation Quality & Presentation**
- FR1.1: The system shall limit in-text citations to a maximum of 3-5 unique sources per answer, consolidating redundant chunk references
- FR1.2: Citation numbering shall match actual unique sources used, not total chunks retrieved
- FR1.3: Citations shall be renumbered sequentially and validated against response content before display
- FR1.4: The citation clustering issue (e.g., `[1][2][3][4][5][13][15][17]...`) shall be resolved through deduplication logic

**FR2: Enhanced Retrieval & Fallback Mechanisms**
- FR2.1: The system shall implement hybrid retrieval combining semantic search with document summary fallback when similarity scores are below threshold
- FR2.2: When no relevant chunks are found, the system shall provide query refinement suggestions tailored to the user's specific query structure
- FR2.3: Document summaries (`is_summary=True` chunks) shall be excluded from semantic search for specific factual questions
- FR2.4: The system shall feed document summaries to the generation agent when direct retrieval confidence is below configurable threshold (e.g., <0.5 similarity)
- FR2.5: LLM-based reranking shall be added as optional post-processing step to improve result relevance (configurable via feature flag)

**FR3: Structured Study Material Generation**
- FR3.1: Study guides shall follow strict Q&A structure with consistent markdown formatting (headings: Key Concepts, Definitions, Formulas, Practice Questions)
- FR3.2: Study guide generation shall support context-aware scoping (e.g., "study guide for Markov chains" retrieves only relevant sections, not full class summaries)
- FR3.3: Summaries, study guides, and quote extractions shall be rendered with special formatting distinct from normal chat responses (similar to ChatGPT's "deep research" mode)
- FR3.4: Each specialized response type shall have visual indicators (icons, borders, or backgrounds) differentiating it from general Q&A

**FR4: Saved Study Materials & Persistence**
- FR4.1: Users shall be able to save generated summaries, study guides, quotes, and notes as persistent documents within a class
- FR4.2: Saved materials shall appear in the sidebar under the selected class with appropriate type indicators
- FR4.3: Saved materials shall be editable by users (markdown editor for text modifications)
- FR4.4: The system shall track saved material metadata (creation date, source documents, query used to generate)
- FR4.5: Users shall be able to delete saved materials with confirmation prompt

**FR5: Suggested Queries from Documents**
- FR5.1: During document ingestion, the system shall generate 5 suggested queries per document using LLM analysis of content
- FR5.2: Suggested queries shall be stored as metadata and embedded alongside chunks
- FR5.3: The chat interface shall display suggested queries when a user selects a class or document (e.g., "Try asking about..." section)
- FR5.4: Suggested queries shall be retrievable via semantic search or aggregated for class-level suggestions

**FR6: Section/Subsection Metadata for Chunking**
- FR6.1: During PDF chunking, the system shall extract and store section/subsection identifiers (headings, chapter numbers) for each chunk
- FR6.2: Section metadata shall support semantic clustering (grouping related sections) or markdown-based chapter extraction
- FR6.3: Study guide generation shall use section metadata to organize content hierarchically
- FR6.4: Document summaries shall include section-level structure (table of contents style)

**FR7: Native Document Summaries in Viewer**
- FR7.1: The document chat page shall include a toggle to switch between PDF view and markdown-formatted summary view
- FR7.2: Summary view shall display pre-generated document summary with navigation (sections as jump links)
- FR7.3: The toggle shall maintain state (summary vs. PDF) when switching between documents in a session

**FR8: Sidebar UI Redesign**
- FR8.1: The sidebar shall include a class dropdown selector at the top
- FR8.2: When a class is selected, the sidebar shall display tabs/sections for: Documents, Chats, Saved Materials (summaries/study guides/quotes/notes)
- FR8.3: A separate "Recent Chats" section shall display recent chats across all classes with class identifiers (badges or labels)
- FR8.4: The sidebar shall be responsive and maintain state (selected class, expanded sections) across navigation
- FR8.5: All screen sizes shall be supported with responsive layout adjustments (mobile blocked separately per FR13)

**FR9: General UI/UX Cleanup**
- FR9.1: The UI shall use softer edges, smooth animations, clean icons, and bubble-based chat design (modern messaging app aesthetic)
- FR9.2: Formula rendering via KaTeX shall display correctly without layout breaks or red error text
- FR9.3: The document chat window shall maintain fixed size regardless of formula length (overflow with scroll)
- FR9.4: Toast notifications shall be repositioned to avoid blocking navigation elements

**FR10: Enhanced Authentication & Security**
- FR10.1: The system shall implement password reset flow (forgot password link → email with reset token → new password form)
- FR10.2: Login attempts shall be rate-limited (max 5 attempts per 15 minutes per email, then prompt for password reset)
- FR10.3: Profile page email changes shall require email verification (send confirmation to new email address)
- FR10.4: Profile page password changes shall require current password validation and new password strength check
- FR10.5: Email confirmation link shall auto-redirect to chat page on success (with fallback "Go to Chat" link if redirect fails)
- FR10.6: Mobile email confirmation page shall display confirmation message without chat page access (desktop-only enforcement)

**FR11: Delete Account Functionality**
- FR11.1: Users shall be able to delete their account from the profile page
- FR11.2: Account deletion shall trigger confirmation modal with "Are you sure?" message
- FR11.3: Upon confirmation, the system shall delete all user data (user record, classes, documents, chunks, chats, S3 files)
- FR11.4: Deleted user emails shall be blocked from re-registration (optional: soft delete with email blocklist)

**FR12: Usage Limits & Plan Management**
- FR12.1: Free plan document count shall persist across deletions (only chat count resets monthly)
- FR12.2: The system shall track cumulative document uploads separately from active document count
- FR12.3: Free tier limits shall be enforced with clear messaging when limits are reached

**FR13: Mobile Access Blocking**
- FR13.1: The web app shall detect mobile devices via user agent or viewport size
- FR13.2: Mobile users shall see a dedicated page with message "Please use a desktop browser for the best experience" and link to desktop instructions
- FR13.3: The blocking page shall be visually polished with branding and helpful messaging (not a generic error)

**FR14: Additional Document Format Support**
- FR14.1: The system shall support DOCX file uploads with text extraction
- FR14.2: The system shall support PowerPoint (PPTX) file uploads with text/slide extraction
- FR14.3: The system shall support OCR for scanned PDFs and image uploads (handwritten notes, photos of textbooks)
- FR14.4: File type validation shall reject unsupported formats with clear error messages

**FR15: Improved Follow-Up Query Handling**
- FR15.1: The routing logic shall correctly identify follow-up queries with specific context (e.g., "elaborate on how this pertains to X")
- FR15.2: If multiple regex routers match, a second-stage semantic router or LLM filter shall disambiguate
- FR15.3: Follow-up queries shall reuse chunk references from the previous assistant message as context

**FR16: Logging & Observability**
- FR16.1: Python logger shall capture all log levels (debug, info, warning, error) correctly
- FR16.2: Node logger formatting shall be improved with consistent structure and readability
- FR16.3: All log entries shall include user ID and session ID (when available) for easy debugging
- FR16.4: Logs shall use a searchable format compatible with Heroku logging or external log aggregation tools

**FR17: Environment Variable Centralization**
- FR17.1: Python service shall use centralized `config.py` module for all `os.getenv` calls
- FR17.2: Config module shall validate required environment variables on startup and fail fast with clear error messages
- FR17.3: Default values shall be documented in config module with comments explaining each variable

**FR18: Code Cleanup & Optimization**
- FR18.1: Unused imports shall be removed across backend (Node and Python) to reduce memory footprint
- FR18.2: Code linting shall be run to identify and fix unused variables, dead code, and style inconsistencies
- FR18.3: Regex patterns in quote finder shall be refined to handle edge cases correctly

**FR19: Advanced Rate Limiting Strategy**
- FR19.1: The system shall support multiple OpenAI API keys (2-3 projects under same billing org)
- FR19.2: Redis bucket shall track token usage per API key and auto-switch to next key when approaching TPM limit
- FR19.3: Rate limiting logic shall distribute load across keys to maximize throughput
- FR19.4: OpenAI account tier shall be verified and rate limits increased if needed before beta launch

**FR20: Google OAuth Verification**
- FR20.1: Google OAuth app shall be verified with Google before beta launch
- FR20.2: OAuth flow shall not display "unverified app" warning to users
- FR20.3: Verification process shall be documented in deployment runbook

### Non-Functional Requirements

**NFR1: Performance**
- NFR1.1: Citation renumbering logic shall execute in <100ms to avoid noticeable latency
- NFR1.2: Sidebar UI updates (class selection, tab switching) shall render in <200ms
- NFR1.3: LLM-based reranking (if enabled) shall not increase response time by more than 500ms
- NFR1.4: Study guide generation shall complete within 15 seconds for typical class-level summaries

**NFR2: Scalability**
- NFR2.1: Suggested query generation shall not significantly increase ingestion time (target: <20% increase)
- NFR2.2: Section metadata extraction shall scale to 500-page documents without timeout
- NFR2.3: Multi-API-key rate limiting shall support up to 5 API keys without performance degradation

**NFR3: Reliability**
- NFR3.1: Email confirmation flow shall have 99% success rate (auto-redirect + fallback link)
- NFR3.2: Account deletion shall be atomic (all-or-nothing) to prevent partial data orphans
- NFR3.3: Password reset tokens shall expire after 1 hour and be single-use only

**NFR4: Usability**
- NFR4.1: Sidebar class dropdown shall support keyboard navigation (arrow keys, Enter to select)
- NFR4.2: Formula rendering shall gracefully degrade (show LaTeX source if KaTeX fails)
- NFR4.3: Error messages for unsupported file formats shall include list of supported formats

**NFR5: Maintainability**
- NFR5.1: Centralized config module shall be documented with example `.env` file
- NFR5.2: Logging improvements shall follow consistent format (JSON structured logs for production)
- NFR5.3: Code cleanup shall reduce total backend LOC by at least 5% (removing dead code)

**NFR6: Security**
- NFR6.1: Password reset tokens shall be cryptographically random (UUID v4 or equivalent)
- NFR6.2: Login attempt rate limiting shall prevent brute force attacks (max 5 attempts per 15min per IP + email combination)
- NFR6.3: Account deletion shall require re-authentication (password confirmation) to prevent accidental deletion

**NFR7: Compatibility**
- NFR7.1: All UI enhancements shall maintain compatibility with existing browser support (Chrome, Firefox, Safari, Edge latest versions)
- NFR7.2: DOCX/PPTX processing shall handle common Microsoft Office versions (2013+)
- NFR7.3: OCR functionality shall achieve >80% accuracy on printed text, >60% on clear handwriting

### Compatibility Requirements

**CR1: Existing API Compatibility**
- The `/api/v1/semantic_search` endpoint contract shall remain unchanged (same request/response schema) to avoid breaking frontend integration
- New query routing logic and retrieval improvements shall be transparent to the Node API orchestration layer
- WebSocket event schemas (`document-ready`, connection auth) shall remain backward compatible

**CR2: Database Schema Compatibility**
- New fields added to MongoDB collections (suggested queries, section metadata, saved materials) shall be additive only (no breaking schema changes)
- Existing chunks without section metadata shall gracefully fall back to "Unknown Section" or be re-ingested
- User model changes (cumulative document count, login attempt tracking) shall not require data migration for existing users

**CR3: UI/UX Consistency**
- New sidebar design shall preserve existing Material UI theme and component styling
- Special response formatting (study guides, summaries) shall use existing markdown rendering pipeline (react-markdown + remark/rehype plugins)
- Toast notification repositioning shall maintain existing notification patterns (success/error color coding)

**CR4: Integration Compatibility**
- OpenAI API integration shall remain compatible with current model versions (gpt-4.1-nano, text-embedding-3-small)
- AWS S3 bucket structure shall support new file types (DOCX, PPTX) without reorganizing existing PDFs
- Redis queue schemas (RQ job payloads) shall be versioned to support gradual rollout of new ingestion features

---

## User Interface Enhancement Goals

### Integration with Existing UI

The Class Chat AI frontend is currently built with **React 18 + Vite + Material UI v6** with a component-based architecture. The existing design system uses:

- **UI Framework**: Material UI 6.1.9 with custom theme (primary color scheme established)
- **Component Library**: Mix of Material UI components and Radix UI primitives
- **Styling Approach**: TailwindCSS for utility classes + Material UI's styling system
- **Layout Pattern**: Left sidebar navigation + main content area + (optional) right document viewer
- **State Management**: React hooks and context (AuthContext for global auth state)

**Current UI Patterns to Preserve**:
- JWT-based auth with HTTP-only cookies (AuthContext manages login state)
- Material UI theme consistency (colors, typography, spacing)
- Existing loading states (skeleton loaders, spinners)
- Toast notifications for user feedback (currently using default positioning)
- Markdown rendering pipeline (react-markdown with syntax highlighting, KaTeX math)

**Design System Constraints**:
- Must maintain existing color palette and branding (ClassChat AI blue/purple theme)
- Must use Material UI components where available (Button, TextField, Dropdown, etc.)
- Must preserve existing responsive breakpoints (though mobile will be blocked)

### Modified/New Screens and Views

**1. Enhanced Sidebar**

**Current State**: Simple vertical list of classes, separate sections for documents and chats

**New Design**:
- Class dropdown selector at top (Material UI Select with autocomplete for 10+ classes)
- Sections for selected class: Documents, Chats, Saved Materials (collapsible accordions)
- Recent Chats (All) section showing recent chats across all classes with class badges
- Softer border radius (8px), smooth animations (300ms ease-in-out), hover states

**Interaction Requirements**:
- Clicking document opens document viewer in right panel
- Clicking chat loads chat session in main area
- Clicking saved material opens in editable view (markdown editor)
- Recent chats show class badge (small colored chip with class code)

---

**2. Chat Interface with Special Response Formatting**

**New Design**:

**Study Guide Response** (special formatting):
- Blue border + book icon (Material UI `MenuBook`)
- Subtle background tint (blue at 5% opacity)
- Save and Download action buttons below content

**Summary Response** (special formatting):
- Green border + document icon (Material UI `Description`)
- Subtle background tint (green at 5% opacity)
- Save and Download action buttons below content

**Quote Response** (special formatting):
- Purple border + quote icon (Material UI `FormatQuote`)
- Subtle background tint (purple at 5% opacity)
- Save and Download action buttons below content

**Visual Differentiation**:
- Creates visual hierarchy (user immediately recognizes study guide vs. normal answer)
- Save button triggers modal: "Save as..." with name input

---

**3. Document Viewer with Summary Toggle**

**New Design**:
- Toggle buttons in header: [📄 PDF | 📝 Summary]
- Summary view renders markdown with jump-links to sections
- Toggle maintains state (PDF vs Summary) when switching documents

**Interaction**:
- Click "Summary" → markdown summary displays
- Click "PDF" → PDF viewer displays
- Clicking section in summary scrolls to that section (within summary view)

---

**4. Profile Page Enhancements**

**New Design**:
- Email change button (triggers verification flow)
- Password change button (requires current password)
- Delete Account button (red, bottom of page)

**Delete Account Flow**:
1. Click "Delete Account" → Modal appears
2. Modal: "Are you sure? This action cannot be undone. All your classes, documents, and chats will be permanently deleted."
3. Input field: "Type DELETE to confirm"
4. Button: "Permanently Delete Account" (disabled until "DELETE" typed)

---

**5. Mobile Blocking Page**

**Design**:
- Class Chat AI logo at top
- 📱 icon with "Mobile Not Supported Yet" heading
- Explanation text: "Class Chat AI requires a desktop browser for the best experience. Please visit on your laptop or desktop computer."
- "Learn More" and "Email Me a Link" buttons

**Implementation**:
- Detect mobile via `navigator.userAgent` or viewport width <768px
- Show blocking page instead of router (wrap `App.tsx` in device check)

---

**6. Formula Rendering Fixes**

**Fix**:
- Wrap formula rendering in error boundary (show LaTeX source if KaTeX fails)
- Apply `overflow-x: auto` to formula containers with `max-width: 100%`
- Document chat window CSS: `max-height: calc(100vh - 200px); overflow-y: auto;` (fixed height)

---

**7. Toast Notification Repositioning**

**Fix**:
- Reposition to bottom-right (Material UI Snackbar `anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}`)
- Adjust z-index to ensure visibility above other elements

### UI Consistency Requirements

**Visual Consistency**:
- All new UI elements shall use existing Material UI theme tokens
- Color palette shall remain unchanged (primary blue, secondary purple, success green, error red)
- Typography shall follow existing hierarchy (H1-H6, body text, captions)
- Spacing shall use Material UI's 8px grid system (theme.spacing())

**Interaction Consistency**:
- All form inputs shall validate on blur and show inline error messages
- Loading states shall use existing skeleton loaders or Material UI CircularProgress
- Confirmation modals shall use existing dialog component patterns
- Keyboard navigation shall work for all interactive elements (tab order, Enter to submit, Esc to close)

**Accessibility Requirements**:
- All new UI elements shall have proper ARIA labels
- Color contrast shall meet WCAG AA standards (4.5:1 for normal text)
- Focus indicators shall be visible for keyboard navigation
- Screen reader announcements for dynamic content (new chat message, document processed)

**Responsive Behavior** (Desktop Only):
- Sidebar shall collapse to icon-only on narrow desktop screens (1024px-1280px)
- Main content area shall expand to fill available space
- Document viewer shall stack below chat on medium screens (1024px-1440px)
- All layouts shall support 1280x720 minimum resolution

---

## Technical Constraints and Integration Requirements

### Existing Technology Stack

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

### Integration Approach

#### Database Integration Strategy

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

#### API Integration Strategy

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

#### Code Organization and Standards

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

#### Deployment and Operations

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

#### Monitoring and Logging

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

#### Configuration Management

**Centralized Config** (`backend/python_scripts/config.py` - NEW FILE):
- Get required environment variables with fail-fast validation
- Get optional environment variables with documented defaults
- Feature flags for risky features (ENABLE_LLM_RERANKING, ENABLE_OCR)
- All services import from centralized config (no scattered `os.getenv()` calls)

### Risk Assessment and Mitigation

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

## Epic and Story Structure

### Epic Approach

**Epic Structure Decision**: **Single comprehensive epic** with logically sequenced stories

**Rationale**:
This brownfield enhancement represents a **cohesive pre-beta refinement effort** rather than multiple unrelated features. All 6 enhancement themes share common goals (beta launch readiness, UX polish, production stability) and touch interconnected systems (RAG pipeline, UI components, auth flows).

A single epic approach provides:
- **Unified vision**: All stories contribute to "Production-Ready Beta Launch"
- **Dependency management**: Stories can reference shared infrastructure (logging, config, UI patterns)
- **Coherent release**: Beta launch happens when epic completes, not piecemeal
- **Team alignment**: Everyone works toward same milestone

---

## Epic 1: Pre-Beta Production Readiness - Class Chat AI Enhancements

**Epic Goal**:
Deliver a polished, production-ready Class Chat AI MVP for beta launch with all critical bugs resolved, UX refined, RAG quality improved, authentication hardened, and infrastructure optimized for observability and scale.

**Integration Requirements**:
- All changes must maintain backward compatibility with existing user data (no breaking schema changes)
- Deployment must follow phased approach (backend → low-risk frontend → high-risk frontend) to mitigate no-staging-environment risk
- Each story must include verification that existing functionality remains intact (regression testing focus)
- Feature flags required for high-risk features (LLM reranking, OCR) to enable rapid rollback

**Success Criteria**:
- All P0 (critical) and P1 (high) issues from ROUGH_FIXES.md resolved
- Beta launch checklist 100% complete (manual testing, Google OAuth verified, logs structured)
- No regressions in core flows (signup → upload → chat → citation → verification)
- Performance targets met (response times, ingestion times, UI interactions)

---

### Story 1.1: Infrastructure Foundation - Logging, Config, and Code Cleanup

As a **developer**,
I want **centralized configuration, improved logging, and clean codebase**,
so that **I can debug issues quickly during beta and maintain code quality**.

#### Acceptance Criteria

**Functional Requirements**:
1. Python service uses centralized `config.py` for all environment variables
2. Python logger captures all log levels (debug, info, warning, error) correctly
3. Node logger uses consistent structured format with improved readability
4. All log entries include `user_id` and `session_id` when available
5. Unused imports removed from backend (Node and Python)
6. Code linting identifies and fixes unused variables, dead code

**Integration Verification**:
1. Existing MongoDB connection continues to work with centralized config
2. Existing OpenAI API calls continue to work with config module
3. Log output is parseable by Heroku log aggregation (JSON format in production)
4. No performance degradation from logging changes

**Quality Requirements**:
5. Config module validates required env vars on startup and fails fast with clear errors
6. Log format includes timestamp, level, user_id, session_id, message (consistent structure)
7. Backend LOC reduced by at least 5% (removing dead code)

#### Integration Verification

**IV1: Existing Functionality Verification**
- MongoDB queries execute successfully using `config.MONGO_CONNECTION_STRING`
- OpenAI embeddings and generation calls work using `config.OPENAI_API_KEY`
- Redis connection establishes using `config.REDIS_URL`

**IV2: Integration Point Verification**
- Heroku logs show structured JSON format in production environment
- Local development logs show pretty-printed format for readability
- All API endpoints log requests with user_id context (test with authenticated user)

**IV3: Performance Impact Verification**
- Baseline response time measured before changes
- Post-deployment response time within 5% of baseline (logging overhead negligible)
- Memory usage reduced due to removed imports (measure via Heroku metrics)

#### Technical Notes

- **Integration Approach**: Create `config.py` as single source of truth, refactor all `os.getenv()` calls to import from config
- **Existing Pattern Reference**: Follow architecture.md logging patterns (Pino for Node, Loguru for Python)
- **Key Constraints**: Must not break existing environment variable names (backward compatible)

#### Definition of Done

- [ ] Centralized config module created and all services use it
- [ ] Python logger captures all levels, Node logger uses structured format
- [ ] User/session IDs present in 100% of relevant log entries
- [ ] Unused imports removed, code linting clean
- [ ] Deployed to Heroku, logs verified in production
- [ ] No regressions in existing API functionality

---

### Story 1.2: Authentication Hardening - Password Reset, Login Limiting, Delete Account

As a **user**,
I want **secure password reset, brute-force protection, and account deletion**,
so that **I can recover access if locked out and maintain control over my data**.

#### Acceptance Criteria

**Functional Requirements**:
1. Password reset flow implemented (forgot password → email with token → reset form)
2. Login attempts rate-limited to max 5 per 15 minutes per email
3. Profile page email changes require verification email to new address
4. Profile page password changes require current password validation
5. Email confirmation link auto-redirects to chat page on success
6. Mobile email confirmation shows confirmation message without chat access
7. Delete account functionality with confirmation modal
8. Account deletion removes all user data (user, classes, docs, chunks, S3 files)

**Integration Verification**:
1. Mailgun sends password reset emails successfully
2. Password reset tokens expire after 1 hour and are single-use only
3. Login attempt counter resets after 15 minutes
4. Deleted user email is blocked from re-registration

**Quality Requirements**:
5. Password reset tokens are cryptographically random (UUID v4)
6. Account deletion is atomic (all-or-nothing transaction)
7. Delete account requires password re-entry before confirmation

#### Integration Verification

**IV1: Existing Auth Functionality Verification**
- JWT-based login/signup continues to work unchanged
- Google OAuth flow continues to work unchanged
- Existing email verification flow remains functional

**IV2: Email Integration Verification**
- Password reset emails arrive within 1 minute (test across email providers)
- Email change verification emails arrive and update user record correctly
- All emails use existing Mailgun configuration and templates

**IV3: Data Deletion Verification**
- MongoDB user record deleted
- All classes associated with user deleted
- All documents (MongoDB records) deleted
- All chunks (study_materials2 collection) deleted
- All S3 files for user deleted
- All chat sessions deleted

#### Technical Notes

- **Integration Approach**:
  - Add `passwordResetToken`, `passwordResetTokenExp`, `loginAttempts`, `loginAttemptResetAt` to User model
  - Create `/api/v1/user/forgot-password` and `/api/v1/user/reset-password` endpoints
  - Add `/api/v1/user/delete-account` endpoint with transaction logic
- **Existing Pattern Reference**: Follow email verification pattern in `user_confirm.ts` for password reset
- **Rollback Considerations**: If account deletion fails midway, log error and mark account for manual cleanup

#### Definition of Done

- [ ] Password reset flow end-to-end tested
- [ ] Login attempt limiting blocks after 5 failures, unblocks after 15 minutes
- [ ] Email change requires verification, old email receives notification
- [ ] Password change requires current password, validates strength
- [ ] Email confirmation auto-redirects to chat (desktop) or shows mobile message
- [ ] Delete account removes all data, verified in MongoDB + S3
- [ ] No regressions in existing auth flows

---

### Story 1.3: RAG Quality - Citation Clustering Fix & Retrieval Improvements

As a **student**,
I want **clean, accurate citations (max 3-5 per answer) and better retrieval quality**,
so that **I can trust the AI's sources and verify information easily**.

#### Acceptance Criteria

**Functional Requirements**:
1. In-text citations limited to max 3-5 unique sources per answer
2. Citation numbering matches actual unique sources used, not total chunks
3. Citations renumbered sequentially and validated against response content
4. Citation clustering bug resolved (no more `[1][2][3][4][5][13][15]...`)
5. Hybrid retrieval: semantic search + summary fallback when similarity below threshold
6. Query refinement suggestions provided when no relevant chunks found
7. Document summaries excluded from semantic search for specific questions
8. LLM-based reranking available via feature flag `ENABLE_LLM_RERANKING`

**Integration Verification**:
1. Existing semantic search continues to work with new citation logic
2. Chat history and chunk references maintained in MongoDB correctly
3. Frontend citation rendering displays new format correctly

**Quality Requirements**:
4. Citation renumbering executes in <100ms
5. LLM reranking (if enabled) adds max 500ms latency
6. Query refinement suggestions are contextual, not generic

#### Integration Verification

**IV1: Existing RAG Pipeline Verification**
- MongoDB vector search returns results correctly
- OpenAI generation produces answers with inline citations
- Chunk deduplication logic works (no duplicate pages)

**IV2: Citation Integration Verification**
- Frontend parses renumbered citations and renders as clickable links
- Citation metadata matches chunks returned in response
- Document download URLs (S3 pre-signed) work correctly

**IV3: Retrieval Quality Verification**
- Test with 10 diverse queries (factual, conceptual, quote-finding)
- Verify max 3-5 citations in each response
- Verify summary fallback triggers when no chunks found
- Verify refinement suggestions appear for no-hit scenarios

#### Technical Notes

- **Integration Approach**:
  - Modify `_renumber_citations()` in `semantic_search.py`
  - Add chunk deduplication by `(doc_id, citation_number)` before citation assignment
  - Implement summary fallback in `process_semantic_search()`
  - Add LLM reranking as optional post-processing step
- **Existing Pattern Reference**: Current citation logic in `get_file_citation()` and `_renumber_citations()`
- **Testing Focus**: Edge cases (duplicate chunks, no-hit, very long answers with many sources)

#### Definition of Done

- [ ] Upload 5 test documents, query each, verify max 3-5 citations per response
- [ ] No citation clustering (no `[1][2][3][4][5]...` patterns)
- [ ] Summary fallback works (query irrelevant topic, get summary instead of "no results")
- [ ] Query refinement suggestions appear for no-hit scenarios
- [ ] LLM reranking feature flag works (enable → improved results, disable → faster responses)
- [ ] No regressions in existing chat functionality

---

### Story 1.4: Document Processing - Section Metadata, Suggested Queries, Multi-Format Support

As a **student**,
I want **better document organization, helpful query suggestions, and support for Word/PowerPoint files**,
so that **I can upload all my study materials and get started quickly**.

#### Acceptance Criteria

**Functional Requirements**:
1. Section/subsection metadata extracted during PDF chunking
2. Section metadata stored with each chunk (`section_title`, `section_hierarchy`)
3. 5 suggested queries generated per document during ingestion
4. Suggested queries stored in document metadata and displayed in chat UI
5. DOCX file uploads supported with text extraction
6. PPTX file uploads supported with text/slide extraction
7. OCR supported for scanned PDFs and image uploads
8. File type validation rejects unsupported formats with clear errors

**Integration Verification**:
1. Existing PDF ingestion continues to work with new metadata extraction
2. MongoDB chunk schema handles new fields
3. Document model handles new `suggestedQueries` and `fileType` fields
4. S3 upload supports new file types

**Quality Requirements**:
5. Suggested query generation adds <20% to ingestion time
6. Section metadata extraction scales to 500-page documents
7. OCR accuracy >80% on printed text, >60% on clear handwriting

#### Integration Verification

**IV1: Existing Ingestion Pipeline Verification**
- PDF chunking and embedding continues to work
- RQ job queue processes ingestion jobs correctly
- WebSocket `document-ready` event fires when processing completes

**IV2: New Format Integration Verification**
- DOCX text extraction produces clean markdown
- PPTX slide extraction preserves structure
- OCR processes scanned PDF and returns searchable text

**IV3: Metadata Storage Verification**
- Section metadata appears in MongoDB chunks
- Suggested queries appear in document metadata
- Frontend receives suggested queries in upload response

#### Technical Notes

- **Integration Approach**:
  - Modify `load_data.py` to extract headings using PyMuPDF or regex
  - Add `generate_suggested_queries()` function calling OpenAI
  - Create `docx_processor.py`, `pptx_processor.py`, `ocr_processor.py` modules
  - Add file type detection in upload route
- **Existing Pattern Reference**: Current PDF chunking in `load_data.py`
- **Rollback Considerations**: Feature flags `ENABLE_OCR` and file type validation allow disabling new formats

#### Definition of Done

- [ ] Upload PDF, verify section metadata extracted and stored in chunks
- [ ] Upload PDF, verify 5 suggested queries generated and displayed in UI
- [ ] Upload DOCX, verify ingestion completes and text is searchable
- [ ] Upload PPTX, verify ingestion completes and slide text is searchable
- [ ] Upload scanned PDF or image, verify OCR extracts text (if `ENABLE_OCR=true`)
- [ ] Upload unsupported format, verify clear error message
- [ ] No regressions in existing PDF ingestion

---

### Story 1.5: Study Material Generation - Formatting, Context Awareness, and Persistence

As a **student**,
I want **well-formatted study guides, context-aware generation, and ability to save materials**,
so that **I can create reusable study resources and access them later**.

#### Acceptance Criteria

**Functional Requirements**:
1. Study guides follow strict Q&A structure with markdown headings
2. Study guide generation supports context-aware scoping
3. Summaries, study guides, and quotes rendered with special formatting
4. Each response type has visual indicators (icons, borders, backgrounds)
5. Users can save generated materials (summaries, study guides, quotes)
6. Saved materials appear in sidebar under selected class
7. Saved materials are editable via markdown editor
8. Saved materials track metadata (creation date, source docs, query)
9. Users can delete saved materials with confirmation

**Integration Verification**:
1. Existing study guide generation route continues to work
2. MongoDB `saved_materials` collection stores new saves correctly
3. Frontend renders special formatting using existing markdown pipeline

**Quality Requirements**:
4. Study guide generation completes within 15s for class-level summaries
5. Save operation completes within 1s
6. Markdown editor supports syntax highlighting and preview mode

#### Integration Verification

**IV1: Existing Generation Functionality Verification**
- Study guide generation route produces output
- Summary generation works for document and class scopes
- Quote finding returns verbatim quotes with citations

**IV2: Saved Materials Integration Verification**
- Save button triggers API call to `/api/v1/materials/save`
- MongoDB `saved_materials` collection receives new document
- Sidebar queries and displays saved materials for selected class
- Edit modal loads saved material content and allows updates

**IV3: Special Formatting Verification**
- Study guide response has blue border + book icon
- Summary response has green border + document icon
- Quote response has purple border + quote icon
- Save button appears on all special responses

#### Technical Notes

- **Integration Approach**:
  - Modify study guide prompt in `prompts.json` to enforce strict structure
  - Add context filtering to retrieval
  - Create `SpecialResponseCard.tsx` component for formatted rendering
  - Create `SaveMaterialModal.tsx` for save dialog
  - Add `/api/v1/materials/*` routes in Node backend
  - Create `savedMaterial.ts` Mongoose model
- **Existing Pattern Reference**: Chat message rendering in `chatItem.tsx`
- **Testing Focus**: Context-aware scoping (verify "Markov chains" doesn't return entire class summary)

#### Definition of Done

- [ ] Generate study guide, verify strict Q&A structure
- [ ] Generate context-aware study guide, verify only relevant content returned
- [ ] Study guide response has special formatting (border, icon, save button)
- [ ] Click save button, enter title, verify material saved to MongoDB
- [ ] Saved material appears in sidebar under correct class
- [ ] Edit saved material, verify changes persist
- [ ] Delete saved material, verify removed from MongoDB and sidebar
- [ ] No regressions in existing chat functionality

---

### Story 1.6: UI/UX Polish - Sidebar Redesign, Formula Fixes, Mobile Blocking

As a **student**,
I want **intuitive navigation, clean design, and proper mobile handling**,
so that **I can focus on studying without UI frustrations**.

#### Acceptance Criteria

**Functional Requirements**:
1. Sidebar includes class dropdown selector at top
2. Sidebar displays Documents, Chats, and Saved Materials for selected class
3. "Recent Chats" section shows chats across all classes with class badges
4. Sidebar is responsive and maintains state across navigation
5. UI uses softer edges, animations, clean icons, bubble chat design
6. Formula rendering displays correctly without layout breaks
7. Document chat window maintains fixed size regardless of formula length
8. Toast notifications repositioned to bottom-right
9. Mobile devices show blocking page with helpful message

**Integration Verification**:
1. Existing class/document/chat data loads correctly in new sidebar
2. Class switching updates main content area
3. Formula rendering uses existing KaTeX pipeline

**Quality Requirements**:
4. Sidebar class selection renders in <200ms
5. Formula rendering gracefully degrades (shows LaTeX source if KaTeX fails)
6. Mobile blocking page displays on all mobile devices

#### Integration Verification

**IV1: Existing Navigation Verification**
- Clicking document in sidebar opens document viewer
- Clicking chat in sidebar loads chat session
- Class data fetched from MongoDB and displayed correctly

**IV2: Sidebar State Verification**
- Selected class persists when navigating between chat and document viewer
- Expanded/collapsed sidebar sections maintain state
- Recent chats list updates when new chat created

**IV3: Mobile Blocking Verification**
- Access app from iPhone Safari, verify blocking page appears
- Access app from Android Chrome, verify blocking page appears
- Access app from desktop, verify normal app loads

#### Technical Notes

- **Integration Approach**:
  - Create `ClassDropdown.tsx`, `SavedMaterialsList.tsx`, `RecentChatsList.tsx` components
  - Modify `Chat.tsx` to integrate new sidebar structure
  - Add mobile detection in `App.tsx`
  - Update CSS for softer edges, formula overflow
  - Reposition toast notifications (Material UI Snackbar)
- **Existing Pattern Reference**: Current sidebar in `Chat.tsx`
- **Testing Focus**: Responsive behavior at different screen sizes

#### Definition of Done

- [ ] Sidebar displays class dropdown with all user classes
- [ ] Selecting class shows Documents, Chats, Saved Materials for that class
- [ ] Recent Chats section shows recent chats with class badges
- [ ] Sidebar state persists when switching between chat and document viewer
- [ ] UI has softer edges, smooth animations, clean icons
- [ ] Upload math-heavy PDF, verify formulas render without breaking layout
- [ ] Document chat window stays fixed size with long formulas
- [ ] Toast notifications appear at bottom-right
- [ ] Access from mobile, verify blocking page appears
- [ ] No regressions in existing navigation or UI functionality

---

### Story 1.7: Document Viewer Enhancement - Native Summary Toggle

As a **student**,
I want **quick access to document summaries in the viewer**,
so that **I can review key points without reading the entire PDF**.

#### Acceptance Criteria

**Functional Requirements**:
1. Document chat page includes toggle buttons: [📄 PDF | 📝 Summary]
2. Summary view displays pre-generated markdown-formatted summary
3. Toggle maintains state when switching between documents in a session

**Integration Verification**:
1. Existing PDF viewer (react-pdf) continues to work
2. Summary fetched from MongoDB (is_summary=True chunk for doc_id)
3. Summary view uses existing markdown rendering pipeline

**Quality Requirements**:
4. Toggle switch renders in <100ms
5. Summary loads within 1s

#### Integration Verification

**IV1: Existing Document Viewer Verification**
- PDF viewer displays documents correctly
- Page navigation works (clicking citations jumps to pages)

**IV2: Summary Retrieval Verification**
- MongoDB query fetches summary chunk correctly
- Summary text rendered as markdown with proper formatting
- No summary available shows helpful message

**IV3: Toggle State Verification**
- Toggle state persists when switching between documents
- Toggle state resets when leaving document viewer and returning

#### Technical Notes

- **Integration Approach**:
  - Add toggle buttons to `DocumentChat.tsx` header
  - Create `SummaryView.tsx` component for markdown rendering
  - Add state variable `viewMode: "pdf" | "summary"` to track toggle
  - Fetch summary via new endpoint `/api/v1/documents/:docId/summary`
- **Existing Pattern Reference**: PDF viewer in `DocumentChat.tsx`
- **Testing Focus**: Toggle behavior with multiple documents in quick succession

#### Definition of Done

- [ ] Toggle buttons appear in document viewer header
- [ ] Click "Summary" → markdown summary displays
- [ ] Click "PDF" → PDF viewer displays
- [ ] Toggle state persists when switching between documents
- [ ] Documents without summaries show helpful message
- [ ] No regressions in existing PDF viewer or citation navigation

---

### Story 1.8: Follow-Up Query Routing & Rate Limiting Strategy

As a **student and system administrator**,
I want **accurate follow-up query detection and robust rate limiting**,
so that **I can have natural conversations and the system scales reliably**.

#### Acceptance Criteria

**Functional Requirements**:
1. Follow-up routing correctly identifies queries with specific context
2. If multiple regex routers match, second-stage semantic router or LLM filter disambiguates
3. Follow-up queries reuse chunk references from previous assistant message
4. System supports 2-3 OpenAI API keys with auto-switching
5. Redis bucket tracks token usage per API key
6. Rate limiting distributes load across keys to maximize throughput

**Integration Verification**:
1. Existing follow-up routing continues to work for basic queries
2. New routing handles complex follow-ups
3. Multiple API keys configured in environment variables
4. Redis tracks separate counters for each API key

**Quality Requirements**:
5. Multi-API-key switching adds <50ms overhead
6. Rate limiting prevents 429 errors from OpenAI

#### Integration Verification

**IV1: Existing Routing Verification**
- Basic follow-up queries work ("elaborate on this")
- Quote finding route works correctly
- General Q&A route works correctly

**IV2: Multi-API-Key Integration Verification**
- Environment variables support `OPENAI_API_KEY_1`, `OPENAI_API_KEY_2`, `OPENAI_API_KEY_3`
- Redis keys track usage per API key
- System switches to key2 when key1 approaches 80% TPM limit
- All keys work for both embedding and generation calls

**IV3: Follow-Up Routing Verification**
- Test query: "elaborate on how this pertains to machine learning" → routes to follow_up
- Test query: "find a quote about derivatives" → routes to quote_finding
- Ambiguous queries trigger LLM tie-breaker

#### Technical Notes

- **Integration Approach**:
  - Modify `router.py` to add second-stage LLM filter for ambiguous matches
  - Add regex pattern refinements for specific follow-up contexts
  - Create API key rotation logic in `semantic_search.py`
  - Modify `reserve_tokens()` to track usage per key
- **Existing Pattern Reference**: Current routing in `router.py`
- **Testing Focus**: Stress test with burst traffic to trigger key switching

#### Definition of Done

- [ ] Test 10 follow-up queries with specific context, verify correct routing
- [ ] Test ambiguous queries, verify LLM tie-breaker logs appear
- [ ] Configure 2 API keys, verify auto-switching when key1 approaches limit
- [ ] Monitor OpenAI usage dashboard, verify load distributed across keys
- [ ] No 429 rate limit errors during stress testing
- [ ] No regressions in existing query routing

---

### Story 1.9: Beta Launch Readiness - Google OAuth, Final Testing, Documentation

As a **product owner and beta tester**,
I want **verified Google OAuth, comprehensive testing, and clear documentation**,
so that **beta launch is smooth and users have a great first experience**.

#### Acceptance Criteria

**Functional Requirements**:
1. Google OAuth app verified with Google
2. OAuth flow does not display "unverified app" warning
3. Verification process documented in deployment runbook
4. Manual testing checklist 100% complete (all 29 test cases pass)
5. Deployment runbook updated with all new environment variables
6. Beta launch communication drafted

**Integration Verification**:
1. Google OAuth flow works end-to-end (signup, login)
2. All P0/P1 issues from ROUGH_FIXES.md resolved
3. Performance targets met (response times, ingestion times)

**Quality Requirements**:
4. All critical user flows tested
5. No console errors in frontend
6. All Heroku logs show structured format

#### Integration Verification

**IV1: Google OAuth Verification**
- Test signup with Google → no "unverified app" warning appears
- Test login with Google → JWT cookie issued correctly
- Verify Google Cloud Console shows "Verified" status

**IV2: End-to-End Flow Verification**
- Execute full manual testing checklist
- All test cases pass without critical errors
- Performance measurements within targets

**IV3: Documentation Verification**
- Deployment runbook lists all required environment variables
- Rollback procedure documented and tested
- Beta communication templates ready for send

#### Technical Notes

**Manual Testing Checklist** (Comprehensive - 29 Test Cases):

**Auth Flows (7 tests)**:
1. Signup with email/password → verify email → login
2. Signup with Google OAuth → verify no warning → login
3. Forgot password → receive email → reset → login
4. Change email → verify new email → login
5. Change password → logout → login with new password
6. Login attempt limiting → fail 5 times → blocked → wait 15min → retry
7. Delete account → confirm → verify all data removed

**Document Management (6 tests)**:
8. Upload PDF → verify ingestion → query content
9. Upload DOCX → verify ingestion → query content
10. Upload PPTX → verify ingestion → query content
11. Upload scanned PDF (OCR) → verify ingestion → query content
12. Upload unsupported format → verify error message
13. Delete document → verify chunks removed from MongoDB

**Chat & RAG (7 tests)**:
14. Class chat → verify max 3-5 citations
15. Document chat → verify page-level citations → click citation → jump to page
16. Generate study guide → verify special formatting → save → edit → delete
17. Generate summary → verify special formatting → save
18. Find quote → verify verbatim text → save
19. Follow-up query ("elaborate on X") → verify context preserved
20. No-hit query → verify refinement suggestions appear

**UI/UX (6 tests)**:
21. Sidebar → select class → verify docs/chats/saved materials display
22. Sidebar → recent chats → verify class badges
23. Document viewer → toggle PDF/Summary → verify state persists
24. Formula rendering → upload math PDF → verify no layout breaks
25. Toast notifications → trigger success/error → verify bottom-right positioning
26. Mobile access → verify blocking page appears

**Performance (3 tests)**:
27. Measure query response time (first token, full response)
28. Measure ingestion time (50-page, 200-page documents)
29. Measure sidebar class selection latency

#### Definition of Done

- [ ] Google OAuth verification complete
- [ ] Manual testing checklist 100% complete (all 29 test cases pass)
- [ ] Deployment runbook updated with new env vars and rollback procedure
- [ ] Beta communication drafted and ready to send
- [ ] All P0/P1 issues resolved
- [ ] Performance targets met (documented measurements)
- [ ] Production logs clean (no errors for 24h period)

---

## Epic Summary

**Total Stories**: 9 stories sequenced for incremental delivery

**Story Dependencies**:
- 1.1 (Infrastructure) → All stories (logging enables debugging)
- 1.2 (Auth) → Independent (can run parallel with 1.3-1.4)
- 1.3 (RAG) → 1.5 (Study Materials depend on citation fixes)
- 1.4 (Document Processing) → 1.5 (Suggested queries, section metadata)
- 1.5 (Study Materials) → 1.6 (Special formatting needs saved materials)
- 1.6 (UI/UX) → 1.7 (Sidebar needed for summary toggle context)
- 1.7 (Document Viewer) → Independent
- 1.8 (Routing & Rate Limiting) → Independent (can run parallel)
- 1.9 (Beta Readiness) → All stories complete (final validation)

**Estimated Timeline**: 5-6 weeks (assuming 2-person team, 1 frontend + 1 full-stack)
- Week 1: Stories 1.1, 1.2 (Infrastructure + Auth)
- Week 2: Stories 1.3, 1.8 (RAG improvements + Routing)
- Week 3: Story 1.4 (Document Processing - multi-format support)
- Week 4: Stories 1.5, 1.7 (Study Materials + Document Viewer)
- Week 5: Story 1.6 (UI/UX - high complexity)
- Week 6: Story 1.9 (Testing + Launch Prep)

**Risk Mitigation**:
- Stories sequenced to enable early rollback (infrastructure first)
- Feature flags for high-risk items (LLM reranking, OCR)
- Comprehensive testing checklist in Story 1.9
- Phased deployment within each story (backend → frontend)

**Critical Path**: 1.1 → 1.3 → 1.4 → 1.5 → 1.6 → 1.9 (must complete in order)

**Parallel Opportunities**: 1.2, 1.7, 1.8 can run alongside critical path

---

*🤖 Generated with [Claude Code](https://claude.com/claude-code)*

*Co-Authored-By: Claude <noreply@anthropic.com>*
