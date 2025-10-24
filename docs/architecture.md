# Class Chat AI - Brownfield Enhancement Architecture

**Version**: 1.0
**Date**: 2025-10-22
**Author**: Winston (Architect Agent)
**Type**: Brownfield Enhancement Architecture
**Related Documents**: [PRD](prd.md), [CLAUDE.md](../CLAUDE.md)

---

## Table of Contents

1. [Introduction](#introduction)
2. [Enhancement Scope and Integration Strategy](#enhancement-scope-and-integration-strategy)
3. [Tech Stack](#tech-stack)
4. [Data Models and Schema Changes](#data-models-and-schema-changes)
5. [Component Architecture](#component-architecture)
6. [API Design and Integration](#api-design-and-integration)
7. [Source Tree](#source-tree)
8. [Infrastructure and Deployment Integration](#infrastructure-and-deployment-integration)
9. [Coding Standards](#coding-standards)
10. [Testing Strategy](#testing-strategy)
11. [Security Integration](#security-integration)

---

## Introduction

This document outlines the architectural approach for enhancing **Class Chat AI** with **comprehensive pre-beta refinements** spanning RAG quality, study material generation, document processing, UI/UX polish, authentication hardening, and infrastructure improvements. Its primary goal is to serve as the guiding architectural blueprint for AI-driven development of new features while ensuring seamless integration with the existing system.

### Relationship to Existing Architecture

This document supplements existing project architecture documentation (CLAUDE.md) by defining how 40+ enhancement features across 6 major themes will integrate with current systems. Where conflicts arise between new and existing patterns, this document provides guidance on maintaining consistency while implementing enhancements.

### Existing Project Analysis

#### Current Project State

- **Primary Purpose**: Class Chat AI — AI-powered study assistant providing document-grounded Q&A with inline citations and page-level verification
- **Current Tech Stack**:
  - **Frontend**: React 18.3.1 + Vite 5.3.4 + Material UI 6.1.9 + TailwindCSS + Socket.IO client
  - **Backend API**: Node.js 20.x + Express 4.18.2 + TypeScript (ES modules)
  - **AI Service**: Python 3.11+ with FastAPI 0.115.4 + Uvicorn + Gunicorn
  - **AI/ML Stack**: LangChain (openai, core, text-splitters, mongodb) + OpenAI (GPT-4o, text-embedding-3-small) + Semantic Router
  - **Database**: MongoDB 7.x (Atlas) with Vector Search (pymongo 4.8.0, mongoose 7.4.2)
  - **Storage**: AWS S3 (boto3 1.34.142, multer-s3)
  - **Queue/Cache**: Redis 5.0+ with RQ 1.15 for job processing
  - **Real-time**: Socket.IO 4.8.1 (bidirectional WebSocket streaming)
  - **Document Processing**: PyPDF2 3.0.1 + PyMuPDF 1.24.13
  - **Logging**: Loguru (Python), Pino (Node)
  - **Auth**: JWT + bcrypt + Google OAuth (google-auth-library 9.15.1)
  - **Email**: Mailgun.js 12.0.3

- **Architecture Style**: Three-tier microservice architecture with:
  - React SPA (Vercel) → Node API orchestration layer (Heroku) → Python AI service (Heroku)
  - JWT HTTP-only cookies for session management
  - WebSocket streaming for real-time chat responses
  - MongoDB Atlas Vector Search for semantic retrieval
  - Redis-backed job queue (RQ) for async document ingestion
  - S3-based document persistence with pre-signed URLs

- **Deployment Method**:
  - **Frontend**: Vercel (auto-deploy from Git)
  - **Node API**: Heroku dyno (`class-chat-node-8a0ef9662b5a`)
  - **Python AI**: Heroku dyno (`class-chat-python-f081e08f29b8`)
  - **No CI/CD pipeline**: Manual git push to production

#### Available Documentation

- **CLAUDE.md** - System architecture reference with service boundaries, core flows, integration surfaces, and change guardrails
- **docs/prd.md** - Comprehensive brownfield PRD detailing 40+ enhancements across 6 themes (RAG, study materials, document processing, UI/UX, auth, infrastructure)
- **docs/brief.md** - Product brief with MVP scope and vision (referenced in PRD)
- **Frontend codebase analysis** - Component structure with React hooks, Material UI design system, WebSocket client integration
- **Backend codebase analysis** - Express routes, MongoDB models, S3 upload handlers, JWT middleware, Socket.IO server
- **Python codebase analysis** - FastAPI routes, LangChain RAG pipeline, semantic router, chunking logic, embedding generation

#### Identified Constraints

- **No staging environment** - All changes deploy directly to production (high-risk deployment model)
- **Heroku 30-second timeout** - Requires keepalive patterns for long-running operations (ingestion, complex queries)
- **OpenAI rate limits** - Tier 1 at 180k TPM (currently managed via Redis bucket, multi-key rotation planned)
- **MongoDB Atlas free tier limitations** - May require upgrade for beta scale (storage and vector search throughput)
- **No automated testing infrastructure** - Manual testing checklist required before each deploy
- **JWT HTTP-only cookies as hard constraint** - Cannot be changed (security requirement, explicitly guarded in CLAUDE.md)
- **Service boundary preservation** - Frontend ↔ Node ↔ Python separation must be maintained (explicit guardrail in CLAUDE.md)
- **Redis dependency in critical paths** - Ingestion and chat generation rely on Redis (cannot be removed per CLAUDE.md guardrails)
- **WebSocket streaming requirement** - Chat UX depends on real-time streaming (currently simulated, will use Socket.IO for true streaming)
- **ES module architecture** - Backend uses ES modules with TypeScript compilation to `dist/` (not CommonJS)
- **Material UI 6.x + TailwindCSS hybrid** - UI must maintain compatibility with existing design system
- **Existing document format limitation** - Currently PDF-only (enhancement will add DOCX, PPTX, OCR support)

### Change Log

| Change | Date | Version | Description | Author |
|--------|------|---------|-------------|--------|
| Initial Architecture Document | 2025-10-22 | 1.0 | Brownfield enhancement architecture for pre-beta launch | Winston (Architect Agent) |

---

## Enhancement Scope and Integration Strategy

### Enhancement Overview

**Enhancement Type**: Comprehensive Pre-Beta Refinement (Multi-Category)

**Scope**: 40+ enhancements organized into 6 major themes:
1. **RAG & Retrieval Quality** (FR1-FR2, 8 features) - Citation clustering fix, hybrid retrieval, LLM reranking, context engineering
2. **Study Material Generation** (FR3-FR4, 8 features) - Structured formatting, context-aware scoping, saved materials persistence
3. **Document Processing** (FR5-FR7, 9 features) - Section metadata, suggested queries, multi-format support (DOCX, PPTX, OCR)
4. **UI/UX & Interface** (FR8-FR9, FR13, 11 features) - Sidebar redesign, formula rendering fixes, mobile blocking, general cleanup
5. **Authentication & Security** (FR10-FR12, 6 features) - Password reset, login limiting, email/password validators, delete account
6. **Infrastructure & Operations** (FR14-FR20, 8 features) - Logging improvements, env centralization, code cleanup, rate limiting strategy

**Integration Impact**: **Significant - Affects All Layers**

- **Frontend**: 15+ components modified/created (sidebar, chat UI, document viewer, mobile blocking, special response cards)
- **Backend (Node)**: 8+ routes/controllers modified/created (auth flows, materials CRUD, rate limiting middleware)
- **Backend (Python)**: 12+ modules modified/created (RAG pipeline, chunking, routing, generation prompts, document processors)
- **Database**: 4 collections extended with additive fields, 1 new collection (`saved_materials`)
- **Infrastructure**: Logging overhaul, centralized config, new buildpacks (Tesseract OCR)

### Integration Approach

#### Code Integration Strategy

**Principle**: **Additive enhancements respecting existing service boundaries**

**Frontend Integration**:
- **New Components**: Create isolated components for new features (sidebar components, special response cards, mobile blocking page, summary toggle)
- **Modified Components**: Extend existing components with backward-compatible props (Chat.tsx adds sidebar state, DocumentChat.tsx adds toggle)
- **Shared Context**: Add new contexts for saved materials, maintain existing AuthContext unchanged
- **Routing**: No changes to react-router-dom routes (existing `/chat`, `/upload`, `/profile` paths preserved)

**Node Backend Integration**:
- **New Routes**: Add `/api/v1/materials/*`, `/api/v1/user/delete-account`
- **Modified Routes**: Extend `/api/v1/upload` response with suggested queries, modify `/api/v1/user/login` to track attempts
- **Existing Routes Preserved**: All current endpoints maintain backward-compatible request/response schemas
- **Middleware**: Add new rate limiting middleware, preserve existing JWT auth middleware unchanged

**Python AI Integration**:
- **Modified Modules**: Refactor `semantic_search.py` (citation logic), `router.py` (follow-up detection), `load_data.py` (section metadata)
- **New Modules**: Create `config.py` (centralized env vars), `docx_processor.py`, `pptx_processor.py`, `ocr_processor.py`
- **Existing Pipeline Preserved**: RAG flow remains (retrieve → generate → stream), enhancements augment rather than replace

**Integration Pattern**: All new code follows **Strategy Pattern** for optional features (LLM reranking, OCR, summary fallback) to enable feature flags and rollback.

#### Database Integration

**Strategy**: **Additive-only schema extensions with graceful fallbacks**

**New Collections**:
- `saved_materials` - Stores user-saved study guides, summaries, quotes, notes (new collection, no migration)

**Extended Collections** (additive fields only):
- `users` - Add `cumulativeDocumentUploads`, `loginAttempts`, `loginAttemptResetAt`, `passwordResetToken`, `passwordResetTokenExp`
- `documents` - Add `suggestedQueries: [String]`, `sectionMetadata: [Object]`, `fileType: String`
- `study_materials2` (chunks) - Add `section_title: String`, `section_hierarchy: Number`

**Migration Strategy**:
- **Zero-downtime deployment**: New fields are optional, existing documents continue to work without them
- **Gradual adoption**: Newly uploaded documents get new fields, existing documents return `null` or `[]` (backend handles gracefully)
- **No re-ingestion required**: Existing PDFs work as-is, new features apply only to new uploads
- **Optional backfill script**: Can retroactively generate suggested queries for existing documents (post-beta)

**Index Implications**:
- **Existing vector search index preserved**: MongoDB Atlas `PlotSemanticSearch` index unchanged
- **New indexes**: May add index on `saved_materials.userId` and `saved_materials.classId` for query performance
- **No breaking changes**: All existing queries continue to work

#### API Integration

**Strategy**: **Backward-compatible endpoint extensions**

**New Endpoints** (additive):
```
POST   /api/v1/materials/save            # Save study material
GET    /api/v1/materials/:classId        # Get saved materials for class
PATCH  /api/v1/materials/:materialId     # Update saved material
DELETE /api/v1/materials/:materialId     # Delete saved material

DELETE /api/v1/user/delete-account       # Delete account (requires password confirmation)

GET    /api/v1/documents/:docId/summary  # Get pre-generated summary for document viewer toggle

POST   /api/v1/generate_suggested_queries # Generate suggested queries for document (Python)
```

**Modified Endpoints** (backward compatible):
```
POST /api/v1/upload
  Response BEFORE: { success: true, docId: "...", fileName: "..." }
  Response AFTER:  { success: true, docId: "...", fileName: "...", suggestedQueries: [...], fileType: "pdf" }
  ✅ Existing clients ignore new fields (backward compatible)

POST /api/v1/user/login
  Response BEFORE: { success: true, token: "...", user: {...} }
  Response AFTER:  { success: true, token: "...", user: {...} } OR { success: false, error: "Too many login attempts. Try password reset." }
  ✅ Adds 429 rate limiting, but existing success flow unchanged

POST /api/v1/semantic_search (Python)
  Request BEFORE:  { user_id, class_name, doc_id, user_query, chat_history, source }
  Request AFTER:   { ..., saveAsType?: "study_guide" | "summary" | null }
  Response BEFORE: { answer, citations: [...], chunks: [...] }
  Response AFTER:  { ..., suggestedRelatedQueries?: [...], sectionContext?: "..." }
  ✅ New fields are optional, existing clients work unchanged
```

**API Versioning**: No version bump required (all changes are additive and backward compatible). Future breaking changes would use `/api/v2/*`.

#### UI Integration

**Strategy**: **Component-level isolation with existing design system**

**Sidebar Redesign Integration**:
- **Isolation**: New sidebar components (`ClassDropdown.tsx`, `SavedMaterialsList.tsx`, `RecentChatsList.tsx`) placed in `components/shared/`
- **State Management**: Extend existing React state in `Chat.tsx` (add `selectedClass`, `sidebarView: "documents" | "chats" | "saved"`)
- **Existing Patterns**: Use Material UI Select for class dropdown, existing list rendering patterns for documents/chats
- **Responsive Behavior**: Maintain existing breakpoints (sidebar collapse at 1024px), add new responsive rules for class dropdown

**Special Response Formatting Integration**:
- **New Component**: `SpecialResponseCard.tsx` wraps existing markdown rendering with border/icon/save button
- **Conditional Rendering**: Existing `chatItem.tsx` detects response type (study_guide, summary, quote) and renders special card vs. normal message
- **Design System Consistency**: Uses Material UI icons (`MenuBook`, `Description`, `FormatQuote`), existing color palette (blue, green, purple tints)
- **Markdown Pipeline**: Reuses existing `react-markdown` + `remark-gfm` + `rehype-katex` configuration (no changes to rendering logic)

**Formula Rendering Fixes**:
- **CSS-Only Changes**: Add `overflow-x: auto; max-width: 100%;` to formula containers, wrap in error boundary for KaTeX failures
- **No KaTeX Upgrade**: Keep existing `katex@0.16.20` and `rehype-katex@7.0.1` versions (proven stable)
- **Graceful Degradation**: Show LaTeX source text if KaTeX fails to parse (existing fallback pattern)

**Mobile Blocking**:
- **App-Level Wrapper**: Add device detection in `App.tsx` (wrap router with `<MobileDetector>` component)
- **Detection Strategy**: Use `navigator.userAgent` regex + viewport width check (`window.innerWidth < 768px`)
- **Bypass for Desktop**: Blocking page never renders on desktop, existing app loads normally

### Compatibility Requirements

#### Existing API Compatibility

✅ **Preserved Contracts**:
- `/api/v1/semantic_search` request schema unchanged (new optional fields don't break existing requests)
- WebSocket event schemas (`document-ready`, `chat-response-chunk`, `connection-auth`) remain identical
- JWT cookie auth flow unchanged (same cookie name, same expiration, same validation middleware)
- S3 pre-signed URL generation unchanged (existing document downloads continue to work)

✅ **Graceful Degradation**:
- Existing frontend without new features can still consume backend APIs (new response fields ignored)
- Existing documents without suggested queries/section metadata work correctly (return `null`/`[]`)
- Existing users without new auth fields (`loginAttempts`, `passwordResetToken`) treated as zero/null

#### Database Schema Compatibility

✅ **Additive-Only Changes**:
- All new fields are optional in MongoDB schemas (no `required: true` for new fields)
- Existing queries continue to work (e.g., `db.users.findOne({ email })` returns user with or without new fields)
- No index rebuilds required for existing collections (new indexes created only for new collections)

✅ **Migration-Free Deployment**:
- Deploy backend with new schema definitions → existing data continues to work
- New documents get new fields populated → existing documents gracefully return `null`/`[]`
- No downtime for schema changes (MongoDB additive schema changes are zero-downtime)

#### UI/UX Consistency

✅ **Design System Preservation**:
- All new components use Material UI 6.1.9 components (Button, TextField, Select, Dialog, etc.)
- Color palette unchanged (existing primary blue, secondary purple, success green, error red)
- Typography hierarchy unchanged (existing H1-H6 styles, body text, captions)
- Spacing grid unchanged (Material UI's 8px `theme.spacing()` system)

✅ **Interaction Patterns**:
- Form validation maintains existing patterns (inline error messages on blur, submit button disabled until valid)
- Loading states use existing skeleton loaders and CircularProgress spinners
- Confirmation modals use existing Dialog component patterns
- Toast notifications maintain existing color coding (success = green, error = red, info = blue)

✅ **Accessibility**:
- All new components maintain WCAG AA contrast standards (4.5:1 for normal text)
- Keyboard navigation works for all new interactive elements (tab order, Enter to submit, Esc to close)
- ARIA labels present on all new form inputs and buttons
- Screen reader announcements for dynamic content (new chat message, document processed)

#### Performance Constraints

✅ **Latency Targets**:
- Citation renumbering: <100ms (execute in Python before streaming response)
- Sidebar class selection: <200ms (React state update + DOM re-render)
- LLM reranking (if enabled): <500ms additional latency (acceptable for quality improvement)
- Study guide generation: <15s for class-level summaries (existing timeout: 30s Heroku limit)

✅ **Scalability Considerations**:
- Suggested query generation: <20% increase to ingestion time (acceptable for enhanced UX)
- Section metadata extraction: Scales to 500-page documents (tested with PyMuPDF chunking)
- Multi-API-key rate limiting: Supports up to 5 keys without performance degradation (Redis overhead negligible)

✅ **Memory Constraints**:
- Code cleanup (unused imports removal): 5% reduction in backend memory footprint
- Centralized config: No memory impact (replaces scattered `os.getenv()` calls)
- New UI components: Minimal bundle size increase (<50KB additional JS after gzip)

---

## Tech Stack

### Existing Technology Stack

The enhancement will build upon the following established technology stack. All existing versions will be maintained to ensure stability and backward compatibility.

| Category | Current Technology | Version | Usage in Enhancement | Notes |
|----------|-------------------|---------|---------------------|-------|
| **Frontend Framework** | React | 18.3.1 | Core UI framework for all new components (sidebar, mobile blocking, special response cards) | Stable, no upgrade needed |
| **Frontend Build Tool** | Vite | 5.3.4 | Development server and production builds (no changes to build process) | Fast HMR for development |
| **Frontend UI Framework** | Material UI | 6.1.9 | Primary component library for new UI elements (dropdowns, dialogs, buttons) | Design system foundation |
| **Frontend Styling** | TailwindCSS | 3.4.15 | Utility classes for custom styling alongside Material UI | Hybrid approach (existing pattern) |
| **Frontend Routing** | React Router DOM | 6.25.1 | Existing routes preserved, no new routes required | Stable |
| **Frontend State** | React Hooks + Context | 18.3.1 | New SavedMaterialsContext, existing AuthContext unchanged | Built-in, no library needed |
| **Frontend WebSocket** | Socket.IO Client | 4.8.1 | Real-time chat streaming (currently simulated, will be used for true streaming) | Critical path, preserved |
| **Frontend HTTP Client** | Axios | 1.7.2 | All API calls to Node backend (new materials endpoints, auth endpoints) | Existing interceptors maintained |
| **Frontend PDF Viewer** | react-pdf + pdfjs-dist | 9.2.1 + 4.8.69 | Document viewer (extended with summary toggle) | Stable |
| **Frontend Markdown** | react-markdown | 9.0.1 | Chat message rendering, special response formatting | Existing pipeline reused |
| **Frontend Math** | KaTeX + rehype-katex | 0.16.20 + 7.0.1 | Formula rendering (fixes applied, no version upgrade) | Proven stable |
| **Frontend Form Validation** | React Hook Form + Zod | 7.53.2 + 3.23.8 | Password reset forms, email change forms | Existing pattern |
| **Backend Runtime** | Node.js | 20.x | Runtime for Express API (no changes) | Heroku-specified version |
| **Backend Framework** | Express | 4.18.2 | REST API orchestration (new routes: materials, password reset, delete account) | Stable, mature |
| **Backend Language** | TypeScript | 5.1.6 | Type-safe backend development (ES modules) | Existing compilation to dist/ |
| **Backend HTTP Logger** | Pino + pino-http | 9.6.0 + 10.4.0 | Structured logging (improved formatting in enhancement) | Fast, JSON-structured |
| **Backend Auth** | JWT + bcrypt | 9.0.1 + 5.1.0 | JWT HTTP-only cookies, password hashing (new: password reset, login limiting) | Critical path, unchanged |
| **Backend OAuth** | google-auth-library | 9.15.1 | Google OAuth integration (requires verification before beta) | Existing flow preserved |
| **Backend Email** | Mailgun.js | 12.0.3 | Email verification, password reset emails | Existing templates extended |
| **Backend MongoDB Driver** | Mongoose | 7.4.2 | MongoDB ODM for user, document, class models (extended with new fields) | Existing schemas extended |
| **Backend S3 Client** | AWS SDK v3 | 3.654.0 | S3 uploads, pre-signed URLs (extended for DOCX/PPTX) | v3 modern SDK |
| **Backend File Upload** | Multer + multer-s3 | 1.4.5-lts.1 + 3.0.1 | Multipart form handling, direct S3 uploads (new file type validation) | Existing middleware |
| **Backend WebSocket** | Socket.IO Server | 4.8.1 | WebSocket server for chat streaming | Preserved, critical path |
| **Python Runtime** | Python | 3.11+ | Runtime for FastAPI service (no changes) | Heroku-compatible |
| **Python Framework** | FastAPI | 0.115.4 | AI service API (new endpoints: suggested queries) | Modern async framework |
| **Python Server** | Uvicorn + Gunicorn | 0.23.2 + 22.0.0 | ASGI server (no changes) | Production-ready |
| **Python LLM Framework** | LangChain (multiple packages) | 0.2.x-0.3.x | RAG pipeline (extended with reranking, hybrid retrieval) | Modular, stable |
| **Python LLM Provider** | OpenAI | 1.54.0 | GPT-4o generation, text-embedding-3-small (multi-key rotation added) | API client |
| **Python Routing** | Semantic Router | 0.0.50 | Query routing (improved follow-up detection) | Existing routing logic |
| **Python PDF Processing** | PyPDF2 + PyMuPDF | 3.0.1 + 1.24.13 | PDF text extraction, chunking (extended with section metadata) | Proven stable |
| **Python MongoDB Driver** | pymongo | 4.8.0 | MongoDB connection, vector search queries (extended with new fields) | Direct driver |
| **Python S3 Client** | boto3 + botocore | 1.34.142 + 1.34.142 | S3 document retrieval (extended for new formats) | Official AWS SDK |
| **Python Job Queue** | RQ + Redis | 1.15 + 5.0+ | Async ingestion jobs (extended with new processing steps) | Existing queue preserved |
| **Python Logger** | Loguru | 0.7.3 | Structured logging (improved to capture all levels) | Easy to use, powerful |
| **Database** | MongoDB Atlas | 7.x | Primary database, vector search (extended collections) | Atlas Vector Search |
| **Cache/Queue** | Redis | 5.0+ | RQ job queue, rate limiting (new: multi-key rotation tracking) | In-memory, fast |
| **Object Storage** | AWS S3 | - | Document storage (extended for DOCX, PPTX, images) | Scalable, reliable |
| **Frontend Hosting** | Vercel | - | SPA deployment (no changes) | Auto-deploy from Git |
| **Backend Hosting** | Heroku | - | Node + Python dynos (no changes to deployment) | 30-second timeout constraint |

### New Technology Additions

The following new technologies are required to support multi-format document processing (FR14). All other enhancements use the existing stack.

| Technology | Version | Purpose | Rationale | Integration Method |
|------------|---------|---------|-----------|-------------------|
| **python-docx** | 0.8.11 | DOCX text extraction | Required for FR14.1 (DOCX file upload support). Pure-Python library with no system dependencies, proven stable for Office document parsing. | Import in new `docx_processor.py` module, called during ingestion pipeline for `.docx` files |
| **python-pptx** | 0.6.21 | PowerPoint (PPTX) text/slide extraction | Required for FR14.2 (PPTX file upload support). Extracts text from slides, notes, and shapes. Mature library (10+ years) with stable API. | Import in new `pptx_processor.py` module, called during ingestion pipeline for `.pptx` files |
| **pytesseract** | 0.3.10 | OCR wrapper for Tesseract engine | Required for FR14.3 (OCR support for scanned PDFs and images). Python wrapper for Google's Tesseract OCR engine (industry standard). | Import in new `ocr_processor.py` module, feature-flagged with `ENABLE_OCR` environment variable |
| **Pillow (PIL)** | 10.0.0 | Image processing for OCR | Required for FR14.3 (image preprocessing before OCR). Converts PDFs to images, handles image uploads. Fork of PIL, actively maintained. | Dependency of pytesseract, used to preprocess images before OCR |
| **Tesseract OCR (system)** | 5.x | OCR engine (system dependency) | Required for pytesseract to function. Must be installed via Heroku buildpack. Open-source, best-in-class OCR accuracy. | Add Heroku buildpack: `heroku buildpacks:add https://github.com/pathwaysmedical/heroku-buildpack-tesseract` |

**Justification for New Additions**:

1. **python-docx, python-pptx**: No reasonable alternative for parsing Microsoft Office formats. Pure-Python, no system dependencies, minimal risk.
2. **pytesseract + Pillow**: Industry-standard OCR stack. Tesseract is Google-developed, 80%+ accuracy on printed text. Feature-flagged to enable rollback if issues arise.
3. **Tesseract OCR (system)**: Only system-level dependency added. Heroku buildpack approach is standard for Python buildpacks (e.g., GDAL for geospatial, wkhtmltopdf for PDF generation).

**Version Compatibility**:
- All new packages compatible with Python 3.11+
- No conflicts with existing `requirements.txt` dependencies (verified no overlapping transitive dependencies)
- Pillow is commonly used alongside PyPDF2/PyMuPDF without issues

**Rollback Strategy**:
- Feature flag `ENABLE_OCR=false` disables OCR processing (pytesseract/Pillow unused)
- File type validation can reject DOCX/PPTX if processing fails (gradual rollout)
- Tesseract buildpack can be removed from Heroku if OCR proves unreliable

---

## Data Models and Schema Changes

### New Data Models

#### Saved Materials Collection (NEW)

**Purpose**: Store user-saved study materials (summaries, study guides, quotes, notes) for persistence and editing.

**Integration**: Standalone collection with references to existing user and class data.

```typescript
// backend/src/models/savedMaterial.ts

interface ISavedMaterial extends Document {
  userId: mongoose.Types.ObjectId;      // Reference to users collection
  classId: string;                      // Class identifier (from user.classes)
  type: string;                         // "summary" | "study_guide" | "quote" | "note"
  title: string;                        // User-provided or auto-generated
  content: string;                      // Markdown content
  sourceDocuments: string[];            // Array of docIds used to generate
  sourceQuery: string;                  // Original query that generated this
  isEditable: boolean;                  // Default true
  createdAt: Date;                      // Auto-generated
  updatedAt: Date;                      // Auto-generated
}

const savedMaterialSchema = new Schema<ISavedMaterial>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,                        // Index for fast userId queries
  },
  classId: {
    type: String,
    required: true,
    index: true,                        // Index for fast classId queries
  },
  type: {
    type: String,
    enum: ["summary", "study_guide", "quote", "note"],
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  sourceDocuments: {
    type: [String],
    default: [],
  },
  sourceQuery: {
    type: String,
    default: "",
  },
  isEditable: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,                     // Auto-generates createdAt, updatedAt
});

// Compound index for efficient class-scoped queries
savedMaterialSchema.index({ userId: 1, classId: 1 });

export default mongoose.model<ISavedMaterial>("SavedMaterial", savedMaterialSchema);
```

**Relationships**:
- **With Existing**: References `users._id` (foreign key) and `user.classes[].name` (classId string)
- **With New**: Standalone collection, no relationships with other new models

**Key Design Decisions**:
- **Why separate collection vs. embedding in User?** - Saved materials can grow large (100+ items per power user), embedding would bloat user documents and slow queries
- **Why classId string vs. ObjectId?** - Classes are embedded in User schema (not separate collection), so we reference by name string (matches existing pattern in `chatSession.assignedClass`)
- **Why store sourceQuery?** - Enables "regenerate" feature post-beta (re-run same query with updated documents)

### Schema Extensions (Existing Collections)

All changes are **additive only** (no breaking changes, no required fields).

#### User Collection Extensions

**Existing Fields Confirmed**:
```typescript
// Already exists in user.ts:
passwordResetToken: { type: String },
passwordResetExp:   { type: Date },
passwordResetSentAt:{ type: Date },
```

**New Fields to Add**:
```typescript
// ADD to backend/src/models/user.ts

/* authentication security */
loginAttempts: {
  type: Number,
  default: 0,
  required: false,
},
loginAttemptResetAt: {
  type: Date,
  required: false,
},

/* usage tracking */
cumulativeDocumentUploads: {
  type: Number,
  default: 0,
  required: false,
  // Tracks total uploads across lifetime (doesn't decrease on delete)
  // Used for FR12.1: Free plan document count persists across deletions
},
```

**Migration Strategy**:
- Existing users without these fields: Defaults apply (`loginAttempts: 0`, `cumulativeDocumentUploads: 0`)
- No database migration script required (Mongoose handles defaults on read)
- Code checks: `user.loginAttempts ?? 0` for safety

#### Document Collection Extensions

**New Fields to Add**:
```typescript
// ADD to backend/src/models/documents.ts

suggestedQueries: {
  type: [String],
  required: false,
  default: [],
  // 5 LLM-generated queries per document (FR5.1)
  // Generated during ingestion, stored for display in chat UI
},

sectionMetadata: {
  type: [{
    sectionTitle: { type: String, required: true },
    chunkIds: { type: [String], required: true },
    hierarchy: { type: Number, required: true },  // 1=chapter, 2=section, 3=subsection
  }],
  required: false,
  default: [],
  // Extracted during PDF chunking (FR6.1-FR6.2)
  // Used for hierarchical study guide organization
},

fileType: {
  type: String,
  enum: ["pdf", "docx", "pptx", "image"],
  required: false,
  default: "pdf",
  // Tracks document format for processing pipeline routing (FR14)
},
```

**Migration Strategy**:
- Existing documents: `suggestedQueries: []`, `sectionMetadata: []`, `fileType: "pdf"` (defaults)
- New uploads: Populated during ingestion (Python service)
- No re-ingestion required for existing documents (new features apply only to new uploads)
- Optional backfill: Admin script can generate suggested queries for existing docs post-beta

#### Chunk Collection Extensions (Python - study_materials2)

**Note**: This collection is managed by the Python service (pymongo), not Mongoose. Schema is informal (MongoDB is schemaless), but we document expected fields.

**Existing Fields** (from Python codebase analysis):
```python
{
  "text": str,                 # Chunk content
  "embedding": List[float],    # Vector embedding (1536 dimensions for text-embedding-3-small)
  "file_name": str,            # Original document filename
  "title": str,                # Document title
  "author": str,               # Document author (if available)
  "user_id": str,              # User ObjectId as string
  "class_id": str,             # Class name
  "doc_id": str,               # Document UUID
  "page_number": int,          # PDF page number
  "is_summary": bool,          # True if this chunk is a document summary
  "chunk_hash": str,           # SHA256 hash for deduplication
}
```

**New Fields to Add**:
```python
# ADD to Python ingestion pipeline (load_data.py)

{
  "section_title": str,        # Extracted heading/section name (FR6.1)
  "section_hierarchy": int,    # Heading level 1-6 (1=H1, 2=H2, etc.) (FR6.1)
  # Defaults: "Unknown Section" and 0 if extraction fails
}
```

**Migration Strategy**:
- Existing chunks: Missing these fields (Python code checks `chunk.get("section_title", "Unknown Section")`)
- New chunks: Populated during ingestion via PyMuPDF heading extraction
- No re-embedding required (embedding is based on `text`, not metadata)
- Atlas Vector Search index unchanged (metadata fields don't affect vector index)

### Schema Integration Strategy

#### Backward Compatibility Guarantees

✅ **Zero Breaking Changes**:
1. **Optional fields only** - All new fields have `required: false` or default values
2. **Existing queries work unchanged** - `User.findOne({ email })` returns user with or without new fields
3. **Existing documents readable** - Frontend/backend handle `null`/`undefined` gracefully with fallbacks

✅ **Deployment Sequence**:
1. Deploy backend with extended schemas → Existing data continues to work
2. Deploy Python with chunk extensions → Existing chunks queried without errors
3. Deploy frontend with new UI → Handles missing fields with default rendering

✅ **Rollback Safety**:
- Revert backend code → New fields ignored (MongoDB returns them, code doesn't use them)
- Revert Python code → New chunk fields ignored (queries still work)
- No data corruption risk (additive changes can't break existing documents)

#### Index Management

**New Indexes** (for query performance):

```typescript
// SavedMaterial collection
savedMaterialSchema.index({ userId: 1, classId: 1 });  // Compound index for class-scoped queries
savedMaterialSchema.index({ userId: 1 });              // Single-field index for user-scoped queries
savedMaterialSchema.index({ classId: 1 });             // Single-field index for class-scoped queries
```

**Existing Indexes Preserved**:
- User collection: `email` unique index (unchanged)
- Document collection: No indexes currently (may add `userId` index for performance, non-breaking)
- ChatSession collection: `_id` unique index (unchanged)
- study_materials2 (Python): Atlas Vector Search index `PlotSemanticSearch` (unchanged)

**Index Creation Strategy**:
- MongoDB creates indexes in background (non-blocking)
- Indexes can be created post-deployment (not required for launch)
- Monitor query performance, add indexes as needed

---

## Component Architecture

### New Components

The enhancement introduces components across all three service tiers. All new components integrate with existing architecture by following established patterns (service boundaries, REST/WebSocket communication, existing design systems).

#### Frontend Components (React)

##### Enhanced Sidebar Components

**Component: ClassDropdown** (`components/shared/ClassDropdown.tsx`)

**Responsibility**: Class selection dropdown for sidebar navigation

**Integration Points**:
- Reads user classes from `AuthContext` (existing)
- Updates parent `Chat.tsx` state with selected class
- Triggers reload of documents/chats/saved materials for selected class

**Key Interfaces**:
```typescript
interface ClassDropdownProps {
  classes: Array<{ name: string }>;
  selectedClass: string | null;
  onClassSelect: (className: string) => void;
}
```

**Dependencies**: Material UI `Select` component

**Technology Stack**: React 18.3.1 + Material UI 6.1.9 Select + TailwindCSS

---

**Component: SavedMaterialsList** (`components/shared/SavedMaterialsList.tsx`)

**Responsibility**: Display and manage saved study materials (summaries, study guides, quotes) for selected class

**Integration Points**:
- Fetches saved materials from `/api/v1/materials/:classId` (new endpoint)
- Renders material list with type icons (book, document, quote)
- Clicking material opens in editable markdown editor modal

**Key Interfaces**:
```typescript
interface SavedMaterialsListProps {
  classId: string;
  userId: string;
  onMaterialClick: (material: ISavedMaterial) => void;
}

interface ISavedMaterial {
  _id: string;
  type: "summary" | "study_guide" | "quote" | "note";
  title: string;
  content: string;
  createdAt: Date;
}
```

**Dependencies**: Material UI List, ListItem, Icon components, SaveMaterialModal

**Technology Stack**: React 18.3.1 + Material UI 6.1.9 + Axios

---

**Component: RecentChatsList** (`components/shared/RecentChatsList.tsx`)

**Responsibility**: Display recent chats across all classes with class badges

**Integration Points**:
- Fetches recent chat sessions from existing `/api/v1/chat/all-chats` endpoint
- Displays chat name + class badge (colored chip)
- Clicking chat loads chat session in main area (existing behavior)

**Key Interfaces**:
```typescript
interface RecentChatsListProps {
  userId: string;
  limit: number; // Default 10
  onChatClick: (sessionId: string) => void;
}
```

**Dependencies**: Material UI List, Chip (for class badges), existing chat loading logic

**Technology Stack**: React 18.3.1 + Material UI 6.1.9

---

##### Special Response Formatting Components

**Component: SpecialResponseCard** (`components/chat/SpecialResponseCard.tsx`)

**Responsibility**: Render study guides, summaries, and quotes with special formatting (border, icon, save button)

**Integration Points**:
- Wraps existing markdown rendering pipeline (`react-markdown` + `rehype-katex`)
- Detects response type from message metadata (type field added to chat messages)
- Provides "Save" and "Download" action buttons

**Key Interfaces**:
```typescript
interface SpecialResponseCardProps {
  type: "study_guide" | "summary" | "quote";
  content: string;
  onSave: (title: string) => void;
  onDownload: () => void;
}
```

**Dependencies**: `react-markdown`, `rehype-katex`, Material UI Button, Icon, SaveMaterialModal

**Technology Stack**: React 18.3.1 + Material UI 6.1.9 + react-markdown 9.0.1

---

**Component: SaveMaterialModal** (`components/shared/SaveMaterialModal.tsx`)

**Responsibility**: Modal dialog for saving study materials with title input

**Integration Points**:
- Displays when user clicks "Save" on SpecialResponseCard
- Calls `/api/v1/materials/save` endpoint with title + content
- Updates SavedMaterialsList after successful save

**Key Interfaces**:
```typescript
interface SaveMaterialModalProps {
  open: boolean;
  type: "study_guide" | "summary" | "quote";
  content: string;
  sourceQuery: string;
  classId: string;
  onClose: () => void;
  onSave: (title: string) => void;
}
```

**Dependencies**: Material UI Dialog, TextField, Button

**Technology Stack**: React 18.3.1 + Material UI 6.1.9 + Axios

---

##### Mobile Blocking Component

**Component: MobileBlockingPage** (`components/shared/MobileBlockingPage.tsx`)

**Responsibility**: Display mobile-not-supported message on mobile devices

**Integration Points**:
- Wraps app router in `App.tsx`
- Detects mobile via `navigator.userAgent` or viewport width
- Shows blocking page instead of app on mobile, normal app on desktop

**Key Interfaces**:
```typescript
interface MobileBlockingPageProps {
  // No props, renders static content
}
```

**Dependencies**: Material UI Typography, Button

**Technology Stack**: React 18.3.1 + Material UI 6.1.9

---

##### Document Viewer Enhancement

**Component: SummaryView** (`components/chat/SummaryView.tsx`)

**Responsibility**: Display pre-generated document summary in markdown format as alternative to PDF view

**Integration Points**:
- Triggered by toggle button in DocumentChat header
- Fetches summary from `/api/v1/documents/:docId/summary` endpoint
- Renders markdown with section jump-links

**Key Interfaces**:
```typescript
interface SummaryViewProps {
  docId: string;
  onSectionClick: (sectionId: string) => void;
}
```

**Dependencies**: `react-markdown`, existing markdown rendering pipeline

**Technology Stack**: React 18.3.1 + react-markdown 9.0.1

---

#### Backend (Node) Components

##### Saved Materials Module

**Component: materials_controllers.ts** (`controllers/materials_controllers.ts`)

**Responsibility**: CRUD operations for saved study materials

**Integration Points**:
- Uses SavedMaterial Mongoose model (new)
- Validates user owns materials before update/delete
- Handles classId validation (ensures class exists in user.classes)

**Key Interfaces**:
```typescript
POST   /api/v1/materials/save
GET    /api/v1/materials/:classId
PATCH  /api/v1/materials/:materialId
DELETE /api/v1/materials/:materialId
```

**Dependencies**: JWT auth middleware (`verifyToken`), User model, SavedMaterial model

**Technology Stack**: Express 4.18.2 + Mongoose 7.4.2 + TypeScript

---

**Component: materials_routes.ts** (`routes/materials_routes.ts`)

**Responsibility**: Route definitions for saved materials endpoints

**Integration Points**:
- Mounts on `/api/v1/materials` path
- Uses existing JWT auth middleware for all routes

**Dependencies**: Express Router, verifyToken middleware, materials_controllers.ts

---

##### Authentication Enhancement Module

**Component: user_controllers.ts** (MODIFIED)

**Responsibility**: Extended with login rate limiting and delete account functionality

**Integration Points**:
- Adds loginAttempts tracking to existing login route
- Implements delete account route (deletes user + cascading delete of all related data)
- Uses existing password verification for delete account confirmation

**Key Interfaces**:
```typescript
POST   /api/v1/user/login      // MODIFIED: Add rate limiting
DELETE /api/v1/user/delete     // NEW: Delete account
```

**Dependencies**: User model (extended with loginAttempts fields), JWT middleware, S3 client (for deleting documents)

**Technology Stack**: Express 4.18.2 + Mongoose 7.4.2 + bcrypt 5.1.0 + AWS SDK v3

---

**Component: password_reset.ts** (EXISTING - Minor Enhancements)

**Responsibility**: Password reset flow (forgot password, reset password)

**Integration Points**:
- **Already implemented**: `/api/v1/user/forgot-password`, `/api/v1/user/reset-password`, `/reset/:token` redirect
- **Enhancement needed**: Email confirmation auto-redirect (FR10.5) - modify email template to include auto-redirect JavaScript

**Key Interfaces**: (Existing routes preserved)

**Dependencies**: (Already integrated with User model, Mailgun, JWT)

---

##### Rate Limiting Middleware

**Component: rateLimitLogin.ts** (`utils/rateLimitLogin.ts`)

**Responsibility**: Middleware to enforce 5 login attempts per 15 minutes per email

**Integration Points**:
- Checks user.loginAttempts and user.loginAttemptResetAt before allowing login
- Increments loginAttempts on failed login
- Resets loginAttempts after 15 minutes or successful login

**Key Interfaces**:
```typescript
export const rateLimitLogin = async (req: Request, res: Response, next: NextFunction) => {
  // Check attempts, block if exceeded, otherwise call next()
}
```

**Dependencies**: User model (extended with loginAttempts fields)

**Technology Stack**: Express middleware pattern

---

#### Backend (Python) Components

##### Centralized Configuration Module

**Component: config.py** (`python_scripts/config.py`)

**Responsibility**: Single source of truth for all environment variables with validation

**Integration Points**:
- Imported by all Python modules (replaces scattered `os.getenv()` calls)
- Validates required env vars on startup, fails fast with clear error messages
- Provides documented defaults for optional env vars

**Key Interfaces**:
```python
# config.py exports
MONGO_CONNECTION_STRING: str  # Required
OPENAI_API_KEY: str           # Required (or OPENAI_API_KEY_1 for multi-key)
OPENAI_API_KEYS: List[str]    # Multi-key rotation (NEW)
REDIS_URL: str                # Required
AWS_ACCESS_KEY_ID: str        # Required
AWS_SECRET_ACCESS_KEY: str    # Required
S3_BUCKET_NAME: str           # Required
ENABLE_LLM_RERANKING: bool    # Feature flag (default: False)
ENABLE_OCR: bool              # Feature flag (default: False)
```

**Dependencies**: None (imported by all other Python modules)

**Technology Stack**: Pure Python (no external dependencies)

---

##### Document Processing Modules

**Component: docx_processor.py** (`python_scripts/docx_processor.py`)

**Responsibility**: Extract text from DOCX files for ingestion

**Integration Points**:
- Called by load_data.py when fileType === "docx"
- Returns extracted text in plain text or markdown format
- Handles corrupted/malformed DOCX files with graceful failure

**Key Interfaces**:
```python
def process_docx(file_path: str) -> str:
    """Extract text from DOCX file"""
    # Returns plain text extracted from document
```

**Dependencies**: load_data.py (calls this for DOCX files)

**Technology Stack**: python-docx 0.8.11

---

**Component: pptx_processor.py** (`python_scripts/pptx_processor.py`)

**Responsibility**: Extract text from PowerPoint slides for ingestion

**Integration Points**:
- Called by load_data.py when fileType === "pptx"
- Extracts text from slides, notes, and shapes
- Returns markdown-formatted text with slide numbers

**Key Interfaces**:
```python
def process_pptx(file_path: str) -> str:
    """Extract text from PPTX file"""
    # Returns markdown with slide structure
```

**Dependencies**: load_data.py

**Technology Stack**: python-pptx 0.6.21

---

**Component: ocr_processor.py** (`python_scripts/ocr_processor.py`)

**Responsibility**: OCR processing for scanned PDFs and image uploads

**Integration Points**:
- Called by load_data.py when fileType === "image" or PDF is detected as scanned
- Feature-flagged with `config.ENABLE_OCR` (can disable if unreliable)
- Preprocesses images with Pillow before OCR

**Key Interfaces**:
```python
def process_image_ocr(image_path: str) -> str:
    """Extract text from image using OCR"""
    # Returns OCR-extracted text

def process_scanned_pdf(pdf_path: str) -> str:
    """Convert PDF to images, then OCR each page"""
    # Returns combined OCR text from all pages
```

**Dependencies**: load_data.py

**Technology Stack**: pytesseract 0.3.10 + Pillow 10.0.0

---

##### RAG Pipeline Enhancements

**Component: semantic_search.py** (MODIFIED)

**Responsibility**: Enhanced with citation deduplication, hybrid retrieval, LLM reranking

**Integration Points**:
- Modifies `_renumber_citations()` function to deduplicate citations by (doc_id, page_number)
- Adds `hybrid_retrieval()` function for summary fallback when similarity < threshold
- Adds `llm_rerank()` function (feature-flagged with `config.ENABLE_LLM_RERANKING`)

**Key Interfaces**: (Existing endpoint preserved)
```python
POST /api/v1/semantic_search  # Existing endpoint, enhanced logic
```

**Dependencies**: MongoDB vector search, OpenAI client, router.py, config.py (for feature flags)

**Technology Stack**: LangChain + OpenAI + pymongo

---

**Component: router.py** (MODIFIED)

**Responsibility**: Improved follow-up query detection with second-stage LLM disambiguation

**Integration Points**:
- Adds LLM tie-breaker when multiple regex routes match
- Refines regex patterns for context-aware follow-ups (e.g., "elaborate on how this pertains to X")

**Key Interfaces**: (Existing routing logic, enhanced with LLM filter)

**Dependencies**: Semantic Router 0.0.50, config.py (for OpenAI API key)

---

**Component: load_data.py** (MODIFIED)

**Responsibility**: Extended with section metadata extraction, suggested query generation, multi-format routing

**Integration Points**:
- Adds `extract_section_metadata()` function using PyMuPDF heading detection
- Adds `generate_suggested_queries()` function calling OpenAI to create 5 queries per document
- Routes to appropriate processor (PDF, DOCX, PPTX, OCR) based on fileType

**Key Interfaces**:
```python
def extract_section_metadata(pdf_path: str) -> List[Dict]:
    """Extract section/subsection titles and hierarchies"""
    # Returns [{ "sectionTitle": str, "chunkIds": [...], "hierarchy": int }]

def generate_suggested_queries(doc_text: str, doc_id: str) -> List[str]:
    """Generate 5 suggested queries using LLM analysis"""
    # Returns ["query1", "query2", "query3", "query4", "query5"]
```

**Dependencies**: PyMuPDF, OpenAI client, MongoDB chunks collection, docx_processor.py, pptx_processor.py, ocr_processor.py, config.py

**Technology Stack**: PyMuPDF 1.24.13 + LangChain + OpenAI

---

## API Design and Integration

### API Integration Strategy

**Authentication**: All new Node API endpoints (except password reset initiation) require JWT authentication via existing `verifyToken` middleware

**Versioning**: All endpoints use `/api/v1/` prefix (existing pattern). No version bump required - all changes are backward compatible

**Error Handling**: Consistent with existing patterns:
- Node API: HTTP status codes (200, 400, 401, 422, 500) + JSON error messages
- Python API: FastAPI HTTPException with status codes + detail messages

**Request Validation**: Node API uses existing validator middleware pattern (Express-validator)

### New API Endpoints

#### Node API (Express)

##### Saved Materials Endpoints

**POST /api/v1/materials/save**

**Purpose**: Save a study material (summary, study guide, quote, note) for future reference

**Authentication**: Required (JWT via verifyToken)

**Request**:
```json
{
  "classId": "CS229",
  "type": "study_guide",
  "title": "Markov Chains Study Guide",
  "content": "# Markov Chains\n\n## Key Concepts\n...",
  "sourceDocuments": ["doc-uuid-1", "doc-uuid-2"],
  "sourceQuery": "create a study guide for Markov chains"
}
```

**Response (200)**:
```json
{
  "success": true,
  "materialId": "material-uuid",
  "message": "Study material saved successfully"
}
```

**Response (400)**: Invalid classId (class not found in user.classes)

**Response (422)**: Validation error (missing required fields)

---

**GET /api/v1/materials/:classId**

**Purpose**: Retrieve all saved materials for a specific class

**Authentication**: Required (JWT via verifyToken)

**Query Parameters**:
- `type` (optional): Filter by material type ("summary" | "study_guide" | "quote" | "note")
- `limit` (optional): Pagination limit (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response (200)**:
```json
{
  "success": true,
  "materials": [
    {
      "_id": "material-uuid-1",
      "type": "study_guide",
      "title": "Markov Chains Study Guide",
      "content": "# Markov Chains...",
      "sourceDocuments": ["doc-uuid-1"],
      "sourceQuery": "create a study guide for Markov chains",
      "createdAt": "2025-10-21T12:00:00Z",
      "updatedAt": "2025-10-21T12:00:00Z"
    }
  ],
  "total": 15
}
```

**Response (400)**: Invalid classId

---

**PATCH /api/v1/materials/:materialId**

**Purpose**: Update saved material content or title

**Authentication**: Required (JWT via verifyToken)

**Request**:
```json
{
  "title": "Updated Study Guide Title",
  "content": "# Updated Content..."
}
```

**Response (200)**:
```json
{
  "success": true,
  "message": "Material updated successfully"
}
```

**Response (403)**: User does not own this material

**Response (404)**: Material not found

---

**DELETE /api/v1/materials/:materialId**

**Purpose**: Delete a saved material

**Authentication**: Required (JWT via verifyToken)

**Response (200)**:
```json
{
  "success": true,
  "message": "Material deleted successfully"
}
```

**Response (403)**: User does not own this material

**Response (404)**: Material not found

---

##### Authentication Endpoints

**DELETE /api/v1/user/delete-account**

**Purpose**: Delete user account and all associated data (cascading delete)

**Authentication**: Required (JWT via verifyToken)

**Request**:
```json
{
  "password": "user_password_for_confirmation"
}
```

**Response (200)**:
```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

**Response (401)**: Invalid password confirmation

**Response (500)**: Partial deletion failure (logged for manual cleanup)

**Implementation Note**: Deletes in this order:
1. All chat sessions for user
2. All documents (MongoDB records)
3. All chunks (study_materials2 collection)
4. All S3 files (iterate and delete)
5. All saved materials
6. User record

---

**GET /api/v1/documents/:docId/summary**

**Purpose**: Retrieve pre-generated document summary for viewer toggle

**Authentication**: Required (JWT via verifyToken)

**Response (200)**:
```json
{
  "success": true,
  "summary": "# Document Summary\n\n## Section 1...",
  "hasSummary": true
}
```

**Response (404)**: Document not found or no summary available

**Implementation Note**: Queries MongoDB chunks collection for `{ doc_id: docId, is_summary: true }`, returns first match

---

#### Python AI API (FastAPI)

##### Suggested Queries Generation

**POST /api/v1/generate_suggested_queries**

**Purpose**: Generate 5 suggested queries for a newly uploaded document

**Authentication**: None (internal service-to-service call from Node API)

**Request**:
```json
{
  "doc_id": "doc-uuid",
  "user_id": "user-id",
  "text_sample": "First 2000 characters of document text..."
}
```

**Response (200)**:
```json
{
  "queries": [
    "What are the key concepts covered in this document?",
    "Explain the main theorem discussed in section 2",
    "How does this relate to Bayesian inference?",
    "Summarize the experimental results",
    "What are the practical applications mentioned?"
  ]
}
```

**Response (500)**: LLM generation failed (returns empty array as fallback)

**Implementation Note**: Uses OpenAI GPT-4o with prompt: "Generate 5 relevant questions a student might ask about this document: {text_sample}"

---

### Modified API Endpoints

All modifications are **backward compatible** (additive response fields only).

#### Node API Modifications

**POST /api/v1/user/login** (MODIFIED - Rate Limiting)

**Existing Behavior Preserved**: Returns JWT token on successful login

**New Behavior**:
- Tracks `user.loginAttempts` on failed login
- Returns 429 status after 5 failed attempts within 15 minutes
- Resets `loginAttempts` on successful login or after 15-minute timeout

**Response (429)** (NEW):
```json
{
  "success": false,
  "error": "Too many login attempts. Please try password reset or wait 15 minutes."
}
```

**Implementation**: Add `rateLimitLogin` middleware before existing login controller

---

**POST /api/v1/documents/upload** (MODIFIED - Response Extension)

**Existing Response (200)** (PRESERVED):
```json
{
  "success": true,
  "docId": "doc-uuid",
  "fileName": "lecture-notes.pdf"
}
```

**New Response (200)** (EXTENDED):
```json
{
  "success": true,
  "docId": "doc-uuid",
  "fileName": "lecture-notes.pdf",
  "suggestedQueries": [
    "What are the main topics?",
    "Explain the key theorem"
  ],
  "fileType": "pdf"
}
```

**Backward Compatibility**: Existing clients ignore new fields

**Implementation**: After Python ingestion completes, call `/api/v1/generate_suggested_queries`, store in `document.suggestedQueries`, return in response

---

#### Python API Modifications

**POST /api/v1/semantic_search** (MODIFIED - Response Extension)

**Existing Request (PRESERVED)**:
```json
{
  "user_id": "user-id",
  "class_name": "CS229",
  "doc_id": null,
  "user_query": "Explain Markov chains",
  "chat_history": [],
  "source": "main_app"
}
```

**New Request (OPTIONAL FIELDS)**:
```json
{
  "user_id": "user-id",
  "class_name": "CS229",
  "doc_id": null,
  "user_query": "Explain Markov chains",
  "chat_history": [],
  "source": "main_app",
  "saveAsType": "study_guide"  // OPTIONAL: "study_guide" | "summary" | null
}
```

**Existing Response (PRESERVED)**:
```json
{
  "answer": "Markov chains are...",
  "citations": [
    {
      "href": "s3-presigned-url",
      "text": "Lecture 5, Page 3",
      "docId": "doc-uuid"
    }
  ],
  "chunks": [
    {
      "chunkId": "chunk-uuid",
      "displayNumber": 1,
      "pageNumber": 3
    }
  ]
}
```

**New Response (EXTENDED)**:
```json
{
  "answer": "Markov chains are...",
  "citations": [],
  "chunks": [],
  "suggestedRelatedQueries": [
    "How do Markov chains relate to HMMs?",
    "What are the applications of Markov chains?"
  ],
  "sectionContext": "Chapter 3: Probabilistic Models"
}
```

**Backward Compatibility**: Existing clients ignore new fields

**Implementation**:
- `suggestedRelatedQueries`: Generated via LLM based on query + retrieved chunks
- `sectionContext`: Extracted from chunk metadata (`section_title` field)

---

**POST /api/v1/process_upload** (MODIFIED - File Type Routing)

**Existing Request (PRESERVED)**:
```json
{
  "user_id": "user-id",
  "class_name": "CS229",
  "s3_key": "timestamp_filename.pdf",
  "doc_id": "doc-uuid"
}
```

**New Request (EXTENDED)**:
```json
{
  "user_id": "user-id",
  "class_name": "CS229",
  "s3_key": "timestamp_filename.docx",
  "doc_id": "doc-uuid",
  "file_type": "docx"  // NEW: "pdf" | "docx" | "pptx" | "image"
}
```

**Response**: (Unchanged)

**Implementation**: Routes to appropriate processor (docx_processor, pptx_processor, ocr_processor) based on `file_type`

---

## Source Tree

### Existing Project Structure

The project follows a monorepo structure with separate frontend, backend (Node), and Python AI service directories.

```plaintext
AIStudyBuddy/
├── frontend/                       # React SPA (Vercel deployment)
│   ├── public/                     # Static assets
│   ├── src/
│   │   ├── assets/                 # Images, icons
│   │   ├── components/
│   │   │   ├── chat/               # Chat-related components
│   │   │   │   ├── chatItem.tsx
│   │   │   │   └── DocumentChat.tsx
│   │   │   ├── shared/             # Reusable components
│   │   │   │   ├── CustomizedInput.tsx
│   │   │   │   ├── Logo.tsx
│   │   │   │   └── NavigationLink.tsx
│   │   │   ├── ui/                 # UI primitives (buttons, inputs, loaders)
│   │   │   └── Header.tsx
│   │   ├── config/                 # Frontend config
│   │   ├── context/                # React Context providers
│   │   │   └── authContext.tsx
│   │   ├── helpers/                # API communication, socket client
│   │   │   ├── api-communicators.ts
│   │   │   └── socketClient.ts
│   │   ├── hooks/                  # Custom React hooks
│   │   │   └── use-toast.ts
│   │   ├── lib/                    # Utility functions
│   │   │   └── utils.ts
│   │   ├── pages/                  # Page-level components
│   │   │   ├── Chat.tsx
│   │   │   ├── DocumentChat.tsx
│   │   │   ├── ForgotPassword.tsx
│   │   │   ├── Home.tsx
│   │   │   ├── Login.tsx
│   │   │   ├── NotFound.tsx
│   │   │   ├── Profile.tsx
│   │   │   ├── ResetPassword.tsx
│   │   │   ├── Signup.tsx
│   │   │   └── Upload.tsx
│   │   ├── theme/                  # Material UI theme config
│   │   │   ├── muiTheme.ts
│   │   │   └── tokens.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── .env.local
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── backend/                        # Node.js API (Heroku deployment)
│   ├── src/
│   │   ├── config/                 # Database connection config
│   │   ├── controllers/            # Route handlers
│   │   │   ├── chat_controllers.ts
│   │   │   ├── document_controllers.ts
│   │   │   ├── download_controllers.ts
│   │   │   ├── password_reset.ts
│   │   │   ├── profile_controllers.ts
│   │   │   ├── user_confirm.ts
│   │   │   └── user_controllers.ts
│   │   ├── db/                     # MongoDB connection setup
│   │   ├── models/                 # Mongoose schemas
│   │   │   ├── chatSession.ts
│   │   │   ├── chunkModel.ts
│   │   │   ├── documents.ts
│   │   │   ├── IChunk.ts
│   │   │   └── user.ts
│   │   ├── routes/                 # Express route definitions
│   │   │   ├── chat_routes.ts
│   │   │   ├── document_routes.ts
│   │   │   ├── download_routes.ts
│   │   │   ├── index.ts
│   │   │   ├── profile_routes.ts
│   │   │   └── user_routes.ts
│   │   ├── utils/                  # Utilities (email, logger, validators, socket)
│   │   │   ├── constants.ts
│   │   │   ├── email.ts
│   │   │   ├── logger.ts
│   │   │   ├── socket_server.ts
│   │   │   ├── token_manager.ts
│   │   │   └── validators.ts
│   │   ├── app.ts                  # Express app setup
│   │   └── index.ts                # Entry point
│   ├── .env.local
│   ├── package.json
│   └── tsconfig.json
│
│   └── python_scripts/             # Python AI service (Heroku deployment)
│       ├── load_data.py            # Document ingestion, chunking, embedding
│       ├── logger_setup.py         # Loguru configuration
│       ├── redis_setup.py          # Redis connection
│       ├── router.py               # Query routing logic
│       ├── semantic_search.py      # RAG retrieval + generation
│       ├── semantic_service.py     # FastAPI app
│       ├── tasks.py                # RQ job definitions
│       ├── worker_boot.py          # RQ worker entry point
│       ├── .env.local
│       └── requirements.txt
│
├── docs/                           # Documentation
│   ├── prd.md                      # Product requirements
│   └── brief.md                    # Product brief
│
├── .bmad-core/                     # BMAD agent framework
├── .claude/                        # Claude Code configuration
├── CLAUDE.md                       # Architecture reference
└── README.md
```

### New File Organization

All new files placed directly in **existing folders** following the current flat structure. No new folders created.

```plaintext
AIStudyBuddy/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── chatItem.tsx                      # EXISTING
│   │   │   │   ├── DocumentChat.tsx                  # EXISTING
│   │   │   │   ├── SpecialResponseCard.tsx           # NEW: Study guide/summary formatting
│   │   │   │   └── SummaryView.tsx                   # NEW: Document summary toggle
│   │   │   ├── shared/
│   │   │   │   ├── CustomizedInput.tsx               # EXISTING
│   │   │   │   ├── Logo.tsx                          # EXISTING
│   │   │   │   ├── NavigationLink.tsx                # EXISTING
│   │   │   │   ├── ClassDropdown.tsx                 # NEW: Class selector
│   │   │   │   ├── SavedMaterialsList.tsx            # NEW: Saved materials
│   │   │   │   ├── RecentChatsList.tsx               # NEW: Recent chats
│   │   │   │   ├── SaveMaterialModal.tsx             # NEW: Save dialog
│   │   │   │   ├── DeleteAccountModal.tsx            # NEW: Delete confirmation
│   │   │   │   └── MobileBlockingPage.tsx            # NEW: Mobile block page
│   │   │   ├── ui/                                   # EXISTING (no changes)
│   │   │   └── Header.tsx                            # EXISTING
│   │   ├── context/
│   │   │   ├── authContext.tsx                       # EXISTING
│   │   │   └── savedMaterialsContext.tsx             # NEW: Materials state
│   │   ├── helpers/
│   │   │   ├── api-communicators.ts                  # MODIFIED: Add materials APIs
│   │   │   └── socketClient.ts                       # EXISTING
│   │   ├── hooks/
│   │   │   ├── use-toast.ts                          # EXISTING
│   │   │   └── useSavedMaterials.ts                  # NEW: Materials hook
│   │   ├── pages/
│   │   │   ├── Chat.tsx                              # MODIFIED: New sidebar
│   │   │   ├── Profile.tsx                           # MODIFIED: Delete account
│   │   │   └── ...                                   # EXISTING pages
│   │   └── App.tsx                                   # MODIFIED: Mobile detection
│
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── user_controllers.ts                   # MODIFIED: Delete account, rate limit
│   │   │   ├── password_reset.ts                     # EXISTING (email template tweak)
│   │   │   ├── materials_controllers.ts              # NEW: Materials CRUD
│   │   │   └── ...                                   # EXISTING
│   │   ├── models/
│   │   │   ├── user.ts                               # MODIFIED: New fields
│   │   │   ├── documents.ts                          # MODIFIED: New fields
│   │   │   ├── savedMaterial.ts                      # NEW: Materials schema
│   │   │   └── ...                                   # EXISTING
│   │   ├── routes/
│   │   │   ├── index.ts                              # MODIFIED: Mount materials routes
│   │   │   ├── materials_routes.ts                   # NEW: Materials routes
│   │   │   └── ...                                   # EXISTING
│   │   └── utils/
│   │       ├── email.ts                              # MODIFIED: Email templates
│   │       ├── rateLimitLogin.ts                     # NEW: Rate limit middleware
│   │       └── ...                                   # EXISTING
│
│   └── python_scripts/
│       ├── config.py                                 # NEW: Centralized env vars
│       ├── docx_processor.py                         # NEW: DOCX extraction
│       ├── pptx_processor.py                         # NEW: PPTX extraction
│       ├── ocr_processor.py                          # NEW: OCR processing
│       ├── load_data.py                              # MODIFIED: Section metadata, routing
│       ├── router.py                                 # MODIFIED: Follow-up detection
│       ├── semantic_search.py                        # MODIFIED: Citation fix, hybrid retrieval
│       ├── semantic_service.py                       # MODIFIED: Suggested queries endpoint
│       └── ...                                       # EXISTING
│
├── docs/
│   ├── architecture.md                               # NEW: This document
│   ├── prd.md                                        # EXISTING
│   └── brief.md                                      # EXISTING
```

### File Naming Conventions

**Frontend** (React/TypeScript):
- **Components**: PascalCase with `.tsx` extension (e.g., `ClassDropdown.tsx`, `SaveMaterialModal.tsx`)
- **Hooks**: camelCase with `use` prefix, `.ts` extension (e.g., `useSavedMaterials.ts`)
- **Contexts**: camelCase with `Context` suffix, `.tsx` extension (e.g., `savedMaterialsContext.tsx`)
- **Pages**: PascalCase matching route name, `.tsx` extension (e.g., `Chat.tsx`, `Profile.tsx`)

**Backend (Node/TypeScript)**:
- **Controllers**: snake_case with `_controllers.ts` suffix (e.g., `materials_controllers.ts`)
- **Routes**: snake_case with `_routes.ts` suffix (e.g., `materials_routes.ts`)
- **Models**: camelCase, `.ts` extension (e.g., `savedMaterial.ts`, `user.ts`)
- **Middleware**: camelCase descriptive name, `.ts` extension (e.g., `rateLimitLogin.ts`)

**Backend (Python)**:
- **Modules**: snake_case with `.py` extension (e.g., `config.py`, `docx_processor.py`)

### Folder Placement Rules

**Place new files in existing folders matching their type**:

✅ **Frontend**:
- Chat-related components → `components/chat/`
- Reusable components (dropdowns, modals, lists) → `components/shared/`
- Hooks → `hooks/`
- Contexts → `context/`
- API calls → `helpers/api-communicators.ts` (modify existing file)

✅ **Backend Node**:
- Controllers → `controllers/`
- Routes → `routes/`
- Models → `models/`
- Middleware/utilities → `utils/`

✅ **Backend Python**:
- All Python modules → `python_scripts/` (flat structure)

---

## Infrastructure and Deployment Integration

### Existing Infrastructure

The enhancement builds on the current deployment infrastructure **without changes** to hosting platforms or deployment processes.

#### Current Deployment Architecture

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

### Build Process Integration

**No changes to existing build processes**. All enhancements use the same build tooling.

#### Frontend Build

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

#### Node Backend Build

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

#### Python AI Service Build

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

### New Dependencies to Deploy

#### Python Service Dependencies

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

### Deployment Strategy

**Phased Rollout Approach** - Deploy in phases to mitigate no-staging-environment risk.

#### Phase 1: Infrastructure & Backend (Week 1-2)

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

#### Phase 2: Frontend Low-Risk Features (Week 3)

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

#### Phase 3: Frontend Major Features (Week 4)

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

#### Phase 4: Document Format Support (Week 5)

**Goal**: Deploy DOCX, PPTX, OCR support (high-risk features).

**Steps**:
1. **Enable feature flags**:
   ```bash
   heroku config:set ENABLE_OCR=true -a class-chat-python-f081e08f29b8
   ```

2. **Test new formats**: Upload DOCX, PPTX, scanned PDF

**Rollback Trigger**: Set `ENABLE_OCR=false` if ingestion fails.

### Environment Variables

#### New Environment Variables (Python Service)

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

#### Updated `.env.example` Files

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

### Rollback Plan

**Critical Rollback Scenarios and Procedures**:

#### Scenario 1: Python Service Deploy Breaks RAG Pipeline

**Symptoms**: Chat queries fail with 500 errors, citations missing, ingestion jobs stuck.

**Rollback**:
```bash
heroku rollback vXXX -a class-chat-python-f081e08f29b8
# OR
git reset --hard <previous-commit-sha>
git push heroku main --force
```

**Recovery Time**: <5 minutes.

#### Scenario 2: Node API Deploy Breaks Authentication

**Symptoms**: Users can't log in, JWT errors, 401 responses.

**Rollback**:
```bash
heroku rollback vXXX -a class-chat-node-8a0ef9662b5a
```

**Recovery Time**: <5 minutes.

#### Scenario 3: Frontend Deploy Breaks Navigation

**Symptoms**: Sidebar doesn't render, can't access chats/documents.

**Rollback**: Vercel dashboard → Deployments → Redeploy previous version

**Recovery Time**: <5 minutes.

#### Scenario 4: Tesseract Buildpack Fails

**Symptoms**: Python deploy fails with buildpack error.

**Rollback**:
```bash
heroku buildpacks:remove https://github.com/pathwaysmedical/heroku-buildpack-tesseract -a class-chat-python-f081e08f29b8
heroku config:set ENABLE_OCR=false -a class-chat-python-f081e08f29b8
git push heroku main
```

**Recovery Time**: <10 minutes.

### Monitoring and Logging

#### Existing Logging (Enhanced)

**Python Service** (Loguru):
- **Enhancement**: Structured logging with user_id, session_id context (FR16)
- **Access**: `heroku logs --tail -a class-chat-python-f081e08f29b8`

**Node Service** (Pino):
- **Enhancement**: Improved formatting, user context injection (FR16)
- **Access**: `heroku logs --tail -a class-chat-node-8a0ef9662b5a`

#### Metrics to Monitor Post-Deployment

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

## Coding Standards

### Existing Standards Compliance

All new code must follow the established patterns observed in the existing codebase.

### Frontend (React/TypeScript)

#### Code Style

**Import Organization**:
```typescript
// 1. React imports
import React, { useState, useEffect } from "react";

// 2. Third-party library imports (grouped)
import {
  Box,
  Button,
  Dialog,
  TextField,
} from "@mui/material";
import axios from "axios";

// 3. Local imports (hooks, contexts, helpers, components)
import { useAuth } from "../../context/authContext";
import { saveMaterial } from "../../helpers/api-communicators";
import SpecialResponseCard from "../chat/SpecialResponseCard";

// 4. CSS/asset imports
import "katex/dist/katex.min.css";
```

**Component Structure**:
```typescript
// Helper functions BEFORE component definition
function extractBlocks(message: string) {
  // Helper logic
}

// Component definition (default export)
export default function ClassDropdown({ classes, onClassSelect }: Props) {
  // 1. Hooks (useState, useEffect, custom hooks)
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const { user } = useAuth();

  // 2. Event handlers
  const handleClassChange = (className: string) => {
    setSelectedClass(className);
    onClassSelect(className);
  };

  // 3. useEffect hooks
  useEffect(() => {
    // Side effects
  }, [dependencies]);

  // 4. JSX return
  return (
    <Box>
      {/* Component UI */}
    </Box>
  );
}
```

**Naming Conventions**:
- **Components**: `PascalCase` (e.g., `ClassDropdown`, `SaveMaterialModal`)
- **Functions/Variables**: `camelCase` (e.g., `handleClassChange`, `selectedClass`)
- **Constants**: `SCREAMING_SNAKE_CASE` (e.g., `COOKIE_NAME`, `MAX_FILE_SIZE`)
- **Interfaces**: `PascalCase` with `I` prefix (e.g., `IClassDropdownProps`)

**Error Handling**:
```typescript
// Async operations with try/catch
const fetchMaterials = async () => {
  try {
    const response = await getMaterialsByClass(classId);
    setMaterials(response.materials);
  } catch (error) {
    console.error("Failed to fetch materials:", error);
    toast.error("Failed to load materials");
  }
};
```

#### Material UI Usage

**Theme Consistency**:
```typescript
import { useTheme } from "@mui/material/styles";

const theme = useTheme();
<Box sx={{
  color: theme.palette.primary.main,       // ✅ Use theme
  padding: theme.spacing(2),               // ✅ Use spacing
  borderRadius: '8px',                     // ✅ OK for custom values
}}>
```

#### TypeScript Usage

**Type Annotations**:
```typescript
// Props interfaces
interface SaveMaterialModalProps {
  open: boolean;
  type: "study_guide" | "summary" | "quote";
  content: string;
  onClose: () => void;
  onSave: (title: string) => Promise<void>;
}

// Function return types (explicit for exported functions)
export const saveMaterial = async (
  data: SaveMaterialRequest
): Promise<SaveMaterialResponse> => {
  // Implementation
};

// useState with types
const [materials, setMaterials] = useState<ISavedMaterial[]>([]);
```

**Avoid `any`**:
```typescript
// ❌ Avoid
const handleClick = (event: any) => { ... }

// ✅ Use specific types
const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => { ... }
```

### Backend (Node/TypeScript)

#### Code Style

**Controller Pattern**:
```typescript
// Export named async functions
export const saveMaterial = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { classId, type, title, content } = req.body;
    const userId = (res as any).locals.jwtData?.id;

    // Validation
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // Business logic
    const material = new SavedMaterial({
      userId,
      classId,
      type,
      title,
      content,
    });
    await material.save();

    // Response
    return res.status(200).json({
      success: true,
      materialId: material._id
    });
  } catch (error: any) {
    // Logging (use Pino logger injected via middleware)
    (req as any).log?.error(error, "saveMaterial error");
    return res.status(500).json({
      message: "Failed to save material"
    });
  }
};
```

**Error Handling**:
```typescript
// Always wrap async operations in try/catch
try {
  const result = await someAsyncOperation();
  return res.status(200).json({ result });
} catch (error: any) {
  (req as any).log?.error(error, "Operation failed");
  return res.status(500).json({ message: "Operation failed" });
}
```

**Logging**:
```typescript
// Use Pino logger (injected via pino-http middleware)
(req as any).log?.info({ userId }, "User action");
(req as any).log?.error(error, "Error context");

// NOT console.log
console.log("Debug info");  // ❌ Avoid in production code
```

### Backend (Python)

#### Code Style

**Import Organization**:
```python
# 1. Standard library imports
import os
import re
import json
from pathlib import Path
from typing import List, Tuple, Optional

# 2. Third-party imports
from fastapi import FastAPI, HTTPException
from pymongo import MongoClient
import openai

# 3. Local imports
from config import OPENAI_API_KEY, ENABLE_OCR
from logger_setup import log
from docx_processor import process_docx
```

**Function Definitions**:
```python
# Type hints for parameters and return values
def process_semantic_search(
    user_id: str,
    class_name: str,
    doc_id: str,
    user_query: str,
    chat_history: List[dict],
    source: str
) -> dict:
    """
    Process semantic search query with RAG pipeline.

    Args:
        user_id: MongoDB user ObjectId as string
        class_name: Class identifier or "null"
        doc_id: Document UUID or "null"
        user_query: User's natural language query
        chat_history: List of previous chat messages
        source: "main_app" or "chrome_extension"

    Returns:
        Dictionary with answer, citations, and chunks
    """
    # Implementation
    pass
```

**Naming Conventions**:
- **Functions**: `snake_case` (e.g., `process_semantic_search`, `extract_section_metadata`)
- **Variables**: `snake_case` (e.g., `user_query`, `section_title`)
- **Constants**: `SCREAMING_SNAKE_CASE` (e.g., `OPENAI_API_KEY`, `MAX_TOKENS`)
- **Classes**: `PascalCase` (e.g., `SearchRequest`, `DocumentProcessor`)
- **Private functions**: Leading underscore `_private_function()`

**Error Handling**:
```python
# Try/except with specific exceptions
try:
    result = risky_operation()
except ValueError as e:
    log.error(f"Invalid value: {e}")
    raise HTTPException(status_code=400, detail=str(e))
except Exception as e:
    log.exception(e)  # Logs full traceback
    raise HTTPException(status_code=500, detail="Operation failed")
```

**Logging** (Loguru):
```python
from logger_setup import log

# Structured logging with context
log.info("Processing query", user_id=user_id, query=user_query)
log.error("Failed to generate embeddings", error=str(e))
log.exception(e)  # Includes full traceback
```

**Configuration** (New Pattern with config.py):
```python
# ❌ OLD: Scattered os.getenv()
openai_key = os.getenv("OPENAI_API_KEY")
mongo_uri = os.getenv("MONGO_CONNECTION_STRING")

# ✅ NEW: Import from centralized config
from config import OPENAI_API_KEY, MONGO_CONNECTION_STRING, ENABLE_OCR

# All env vars accessed through config module
if ENABLE_OCR:
    from ocr_processor import process_image_ocr
```

### Critical Integration Rules

#### Optional Field Handling

**Mongoose Field Access**:
```typescript
// Handle optional fields gracefully
const suggestedQueries = document.suggestedQueries ?? [];
const fileType = document.fileType ?? "pdf";

// Don't assume fields exist
if (user.loginAttempts && user.loginAttempts >= 5) {
  // Rate limit logic
}
```

**Python MongoDB Field Access**:
```python
# Use dict.get() with defaults for optional fields
section_title = chunk.get("section_title", "Unknown Section")
section_hierarchy = chunk.get("section_hierarchy", 0)
```

#### Logging with User Context

**Include Context in All Logs**:

Frontend:
```typescript
console.error("Failed to fetch materials", { userId, classId, error });
```

Node:
```typescript
(req as any).log?.error({ userId, materialId, error }, "Delete material failed");
```

Python:
```python
log.error("Vector search failed", user_id=user_id, class_name=class_name, error=str(e))
```

---

## Testing Strategy

### Testing Approach for MVP

**No Automated Testing Infrastructure** - Acceptable for MVP beta launch given:
- Solo developer / small team
- No staging environment (production is test environment)
- Manual testing more practical than E2E test setup for initial launch
- Post-beta: Add automated tests based on beta feedback

**Primary Testing Method**: **Manual Testing Checklist** (comprehensive, repeatable)

**Secondary Testing Method**: **API Testing** (Postman/curl for backend verification)

### Manual Testing Checklist

**Comprehensive 29-Test Suite** (from PRD Story 2.9) - Execute before each production deploy.

#### Auth Flows (7 Tests)

1. Email/Password Signup + Verification
2. Google OAuth Signup
3. Forgot Password Flow
4. Change Email (Profile)
5. Change Password (Profile)
6. Login Rate Limiting
7. Delete Account

#### Document Management (6 Tests)

8. PDF Upload + Ingestion
9. DOCX Upload + Ingestion
10. PPTX Upload + Ingestion
11. OCR Upload (Scanned PDF/Image)
12. Unsupported Format Rejection
13. Document Deletion

#### Chat & RAG (7 Tests)

14. Class Chat with Citation Limit (max 3-5 citations)
15. Document Chat with Page-Level Citations
16. Study Guide Generation + Save + Edit + Delete
17. Summary Generation + Save
18. Quote Finding + Save
19. Follow-Up Query Context Preservation
20. No-Hit Query Refinement Suggestions

#### UI/UX (6 Tests)

21. Sidebar Class Selection
22. Recent Chats (All Classes)
23. Document Viewer Summary Toggle
24. Formula Rendering (No Layout Breaks)
25. Toast Notification Positioning
26. Mobile Access Blocking

#### Performance (3 Tests)

27. Query Response Time (<3s first token, <15s complete)
28. Ingestion Time (<2 min for 50-page PDF)
29. Sidebar Class Selection Latency (<200ms)

### API Testing (Backend Verification)

**Postman/Curl Test Suite** - Execute before deploying backend changes.

**Node API Health Checks**:
```bash
# Login
curl -X POST https://class-chat-node-8a0ef9662b5a.herokuapp.com/api/v1/user/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'

# Save material
curl -X POST https://class-chat-node-8a0ef9662b5a.herokuapp.com/api/v1/materials/save \
  -H "Cookie: auth_token=..." \
  -H "Content-Type: application/json" \
  -d '{"classId":"CS229","type":"study_guide","title":"Test","content":"# Test"}'
```

**Python API Health Checks**:
```bash
# Semantic search
curl -X POST https://class-chat-python-f081e08f29b8.herokuapp.com/api/v1/semantic_search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id":"test-user-id",
    "class_name":"CS229",
    "doc_id":null,
    "user_query":"What are Markov chains?",
    "chat_history":[],
    "source":"main_app"
  }'
```

### Regression Testing

**Critical Regression Checklist** - Execute after EVERY deploy:

- Email/password signup and login
- Google OAuth login
- PDF upload and ingestion
- Class chat with citations
- Document chat with page navigation
- WebSocket streaming
- Document deletion
- User logout

**If ANY regression test fails**: Rollback immediately.

### Future Testing Infrastructure (Post-Beta)

**Recommended for Phase 2**:

- **Frontend E2E Tests** (Playwright or Cypress): Auth flows, upload → chat → citation
- **Backend Unit Tests** (Jest): Controller logic, rate limiting, citation renumbering
- **Python Unit Tests** (pytest): Citation deduplication, section extraction, processors
- **Integration Tests**: Node → Python API calls, MongoDB schema validation
- **Load Testing** (k6): Concurrent user queries, ingestion queue stress

---

## Security Integration

### Existing Security Architecture Preserved

All enhancements maintain the current security model. **No breaking changes to authentication or authorization**.

#### Authentication Layer (Unchanged)

**JWT HTTP-Only Cookies** (Critical Constraint from CLAUDE.md):
- **Token Generation**: `createToken(id, email, "7d")` - 7-day expiration
- **Token Storage**: HTTP-only signed cookies (prevents XSS access)
- **Token Verification**: `verifyToken` middleware extracts JWT from cookie, validates signature
- **Session Management**: Stateless (JWT contains user ID + email)

**Cookie Configuration**:
```typescript
res.cookie(COOKIE_NAME, token, {
  httpOnly: true,        // Prevents JavaScript access (XSS protection)
  signed: true,          // Requires cookie-parser secret for tampering detection
  sameSite: 'strict',    // CSRF protection
  secure: process.env.NODE_ENV === 'production', // HTTPS-only in production
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});
```

**OAuth Integration**:
- Google OAuth via `google-auth-library` (existing)
- OAuth users bypass password requirements
- FR20: Requires Google app verification before beta (remove "unverified app" warning)

#### Authorization Layer (Unchanged)

**Resource Ownership Validation**:
```typescript
// Existing pattern (preserved in all new endpoints)
export const deleteMaterial = async (req, res) => {
  const userId = res.locals.jwtData?.id;  // From JWT
  const material = await SavedMaterial.findById(req.params.materialId);

  // Authorization check
  if (!material || material.userId.toString() !== userId) {
    return res.status(403).json({ message: "Forbidden" });
  }

  // Proceed with deletion
};
```

**Applied to**:
- Documents (user can only view/delete own documents)
- Chat sessions (user can only view own chats)
- Saved materials (user can only edit/delete own materials) **[NEW]**
- User data (user can only modify own profile, delete own account) **[NEW]**

### New Security Features

#### 1. Login Rate Limiting (FR11)

**Purpose**: Prevent brute-force password attacks

**Implementation**:
```typescript
// backend/src/utils/rateLimitLogin.ts (NEW)
export const rateLimitLogin = async (req: Request, res: Response, next: NextFunction) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) return next(); // Don't reveal if email exists

  const now = Date.now();
  const resetTime = user.loginAttemptResetAt?.getTime() || 0;
  const attempts = user.loginAttempts || 0;

  // Reset counter after 15 minutes
  if (now - resetTime > 15 * 60 * 1000) {
    user.loginAttempts = 0;
    user.loginAttemptResetAt = new Date();
    await user.save();
    return next();
  }

  // Block after 5 attempts
  if (attempts >= 5) {
    return res.status(429).json({
      message: "Too many login attempts. Please try password reset or wait 15 minutes."
    });
  }

  return next();
};
```

**Security Properties**:
- **No email enumeration**: Returns generic message for non-existent emails
- **Time-based reset**: Attempts reset after 15 minutes
- **Database-backed**: Survives server restarts

#### 2. Enhanced Input Validation (FR12)

**Password Strength Validation** (Existing - Enhanced):
```typescript
const passwordValidator = body("password")
  .isLength({ min: 8 })
  .withMessage("Password must be at least 8 characters")
  .matches(/[A-Za-z]/)
  .withMessage("Password must contain at least one letter")
  .matches(/\d/)
  .withMessage("Password must contain at least one number");
```

**Email Validation** (Existing):
```typescript
const emailValidator = body("email")
  .trim()
  .isEmail()
  .withMessage("Valid email is required")
  .normalizeEmail();  // Prevents email case variation attacks
```

#### 3. Password Reset Security (FR10 - Already Implemented)

**Token-Based Reset Flow**:
```typescript
// 1. Generate reset token (cryptographically random)
import crypto from 'crypto';
const resetToken = crypto.randomBytes(32).toString('hex');
user.passwordResetToken = resetToken;
user.passwordResetExp = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
await user.save();

// 2. Send reset email (link with token)
const resetLink = `${FRONTEND_URL}/reset-password?token=${resetToken}`;

// 3. Validate token on reset
const user = await User.findOne({
  passwordResetToken: token,
  passwordResetExp: { $gt: new Date() }, // Token not expired
});
```

**Security Properties**:
- **Cryptographically random tokens**: 32-byte random (not guessable)
- **Time-limited**: 1-hour expiration
- **Single-use**: Token deleted after successful reset
- **No email enumeration**: Always returns 200
- **Rate limiting**: 60-second cooldown between reset emails

#### 4. Account Deletion Security (FR13)

**Cascading Delete with Authorization**:
```typescript
export const deleteAccount = async (req: Request, res: Response) => {
  const userId = res.locals.jwtData?.id;
  const { password } = req.body;

  const user = await User.findById(userId);
  if (!user) return res.status(401).json({ message: "Unauthorized" });

  // Require password confirmation (prevent accidental deletion)
  const isValid = await compare(password, user.password);
  if (!isValid) return res.status(401).json({ message: "Invalid password" });

  // Cascading delete (all user data)
  try {
    // 1. Delete chat sessions
    await ChatSession.deleteMany({ userId });

    // 2. Delete documents (MongoDB)
    const docs = await Document.find({ userId });
    await Document.deleteMany({ userId });

    // 3. Delete chunks (study_materials2 collection)
    await mongoClient.db().collection('study_materials2').deleteMany({ user_id: userId.toString() });

    // 4. Delete S3 files
    for (const doc of docs) {
      await s3.send(new DeleteObjectCommand({ Bucket: AWS_S3_BUCKET_NAME, Key: doc.s3Key }));
    }

    // 5. Delete saved materials
    await SavedMaterial.deleteMany({ userId });

    // 6. Delete user
    await user.deleteOne();

    return res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    (req as any).log?.error({ userId, error }, "Partial account deletion failure");
    return res.status(500).json({ message: "Account deletion failed. Please contact support." });
  }
};
```

**Security Properties**:
- **Password confirmation required**: Prevents unauthorized deletion
- **Cascading delete**: All user data removed (GDPR compliance)
- **Audit logging**: Deletion attempts logged with user context

### Data Protection

#### Sensitive Data Handling

**Passwords**:
- **Hashing**: bcrypt with 10 rounds (existing)
- **Storage**: Hashed passwords only (never plaintext)
- **Transmission**: HTTPS only

**Email Addresses**:
- **Normalization**: Lowercased, trimmed
- **Verification Required**: Email verification before account activation
- **Change Notification**: Old email notified when email changed

**API Keys** (OpenAI, AWS):
- **Storage**: Environment variables only (never committed to git)
- **Transmission**: Server-to-server only (never exposed to frontend)
- **Rotation**: Multi-key rotation for OpenAI (FR19)

**Documents**:
- **Encryption at rest**: S3 server-side encryption (AES-256) - verify enabled
- **Access control**: S3 pre-signed URLs (time-limited, user-scoped)
- **Deletion**: Permanent deletion from S3 on document delete

#### Database Security

**MongoDB Atlas**:
- **Authentication**: Username/password (from `MONGO_CONNECTION_STRING`)
- **Network isolation**: IP whitelist (Atlas dashboard configuration)
- **Encryption in transit**: TLS connection (`mongodb+srv://`)
- **Encryption at rest**: Atlas default (AES-256) - verify enabled

**Redis**:
- **Authentication**: TLS connection (`REDIS_TLS_URL`)
- **Network isolation**: Heroku Redis add-on (private network)

### API Security

#### Rate Limiting

**Current Implementation**: Login rate limiting only (FR11)

**Post-Beta Recommendations**:
- Global rate limiting: 100 requests/minute per IP
- Endpoint-specific limits:
  - `/api/v1/chat/*`: 20 requests/minute per user
  - `/api/v1/documents/upload`: 10 uploads/hour per user

#### CORS Configuration

**Existing Configuration**:
```typescript
app.use(cors({
  origin: process.env.CLIENT_ORIGIN, // https://app.classchatai.com
  credentials: true,                 // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

#### HTTPS Enforcement

**Production Deployment**:
- **Frontend (Vercel)**: HTTPS enforced by default
- **Backend (Heroku)**: HTTPS enforced by Heroku router
- **Cookie secure flag**: Enabled in production

### Frontend Security

#### XSS Prevention

**React Default Protection**: JSX auto-escapes user input

**Markdown Rendering** (Special Case):
```typescript
<ReactMarkdown
  remarkPlugins={[remarkGfm, remarkMath]}
  rehypePlugins={[rehypeKatex]}
  components={{
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
  }}
>
  {content}
</ReactMarkdown>
```

**Safe Patterns**:
- `rel="noopener noreferrer"` on external links (prevents tabnabbing)
- No `eval()` or `new Function()`
- No inline event handlers (`onclick`, `onerror`)

#### CSRF Prevention

**SameSite Cookies** (Primary Defense):
```typescript
res.cookie(COOKIE_NAME, token, {
  sameSite: 'strict',  // Cookie only sent for same-site requests
});
```

### Logging & Monitoring for Security

#### User Context Logging (FR16)

**Node API**:
```typescript
// JWT middleware injects userId into logger
(req as any).log = base.child({ userId: decoded.id });

// All logs include user context
(req as any).log?.warn({ action: "login_failed", email }, "Failed login attempt");
```

**Python AI**:
```python
# All RAG operations log user_id
log.info("Processing query", user_id=user_id, query=user_query)
```

#### Security Event Logging

**Log the Following**:
- Failed login attempts (email, timestamp)
- Password reset requests
- Account deletions
- Document uploads (userId, fileType, fileSize)
- Rate limit triggers

**Example**:
```typescript
(req as any).log?.warn({
  event: "rate_limit_triggered",
  userId,
  endpoint: "/api/v1/user/login",
  attempts: user.loginAttempts
}, "User rate limited");
```

### Security Checklist (Pre-Launch)

**Before Beta Launch** - Verify all security configurations:

- [ ] **JWT_SECRET** is strong (64+ characters, random) in production
- [ ] **COOKIE_SECRET** is strong (64+ characters, random) in production
- [ ] **HTTPS enforced** on all services
- [ ] **CORS origin whitelist** contains only production frontend URL
- [ ] **MongoDB Atlas IP whitelist** configured (if applicable)
- [ ] **S3 bucket** is private (not public-read)
- [ ] **S3 encryption at rest** enabled
- [ ] **MongoDB encryption at rest** enabled
- [ ] **Google OAuth app verification** completed (FR20)
- [ ] **Password validators** enforced on all password endpoints
- [ ] **Rate limiting** enabled for login endpoint
- [ ] **User context logging** working in production
- [ ] **No hardcoded secrets** in codebase
- [ ] **All `.env` files in `.gitignore`**

---

## Conclusion

This architecture document provides the comprehensive blueprint for implementing 40+ pre-beta enhancements to Class Chat AI. All enhancements follow the **additive integration** principle, maintaining backward compatibility with existing systems while delivering significant improvements across RAG quality, study material generation, document processing, UI/UX, authentication, and infrastructure.

**Key Architectural Principles**:
1. **Service Boundary Preservation**: Frontend ↔ Node ↔ Python separation maintained (CLAUDE.md guardrail)
2. **Zero Breaking Changes**: Additive-only schema extensions, backward-compatible APIs
3. **Phased Deployment**: 4-phase rollout mitigates no-staging-environment risk
4. **Feature Flags**: Enable/disable risky features (LLM reranking, OCR) without code deploys
5. **Security-First**: Rate limiting, password confirmation, cascading deletes, user context logging

**Next Steps**:
1. Review and approve this architecture document
2. Begin Phase 1 implementation (Infrastructure & Backend)
3. Execute manual testing checklist before each phase deployment
4. Monitor metrics post-deployment (citations, performance, errors)
5. Collect beta user feedback for post-beta improvements

---

**Document Status**: Draft 1.0 - Ready for Review

**Author**: Winston (Architect Agent)
**Date**: 2025-10-22
