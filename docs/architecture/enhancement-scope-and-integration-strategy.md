# Enhancement Scope and Integration Strategy

## Enhancement Overview

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

## Integration Approach

### Code Integration Strategy

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

### Database Integration

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

### API Integration

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

### UI Integration

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

## Compatibility Requirements

### Existing API Compatibility

✅ **Preserved Contracts**:
- `/api/v1/semantic_search` request schema unchanged (new optional fields don't break existing requests)
- WebSocket event schemas (`document-ready`, `chat-response-chunk`, `connection-auth`) remain identical
- JWT cookie auth flow unchanged (same cookie name, same expiration, same validation middleware)
- S3 pre-signed URL generation unchanged (existing document downloads continue to work)

✅ **Graceful Degradation**:
- Existing frontend without new features can still consume backend APIs (new response fields ignored)
- Existing documents without suggested queries/section metadata work correctly (return `null`/`[]`)
- Existing users without new auth fields (`loginAttempts`, `passwordResetToken`) treated as zero/null

### Database Schema Compatibility

✅ **Additive-Only Changes**:
- All new fields are optional in MongoDB schemas (no `required: true` for new fields)
- Existing queries continue to work (e.g., `db.users.findOne({ email })` returns user with or without new fields)
- No index rebuilds required for existing collections (new indexes created only for new collections)

✅ **Migration-Free Deployment**:
- Deploy backend with new schema definitions → existing data continues to work
- New documents get new fields populated → existing documents gracefully return `null`/`[]`
- No downtime for schema changes (MongoDB additive schema changes are zero-downtime)

### UI/UX Consistency

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

### Performance Constraints

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
