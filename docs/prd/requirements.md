# Requirements

## Functional Requirements

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

## Non-Functional Requirements

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

## Compatibility Requirements

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
