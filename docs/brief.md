# Project Brief: Class Chat AI

## Executive Summary

**Class Chat AI** is an AI-powered study assistant currently in pre-launch MVP state that enables students to upload course materials (PDFs) and receive accurate answers to their questions with inline citations linking directly to source content. Built on a modern RAG (Retrieval Augmented Generation) architecture with MongoDB Atlas Vector Search and OpenAI, the system is fully functional end-to-end with user authentication, class-based document organization, and precise citation tracking.

The product addresses the challenge students face navigating large volumes of study materials by transforming passive document storage into an active Q&A system. Target users are college and university students who need quick, verifiable answers sourced from their own uploaded course documents. The system supports both class-scoped chat (multi-document retrieval) and document-scoped chat (single-document focus with page-level citation jumps).

**Current Phase:** The MVP is undergoing refinement based on internal testing before initial beta launch to a small test group. The go-to-market strategy follows a phased approach: tester feedback → iterative refinement → public MVP launch → social media promotion and outreach → freemium model with conversion optimization through usage limits.

---

## Problem Statement

**Current State & Pain Points:**

Students accumulate large collections of course materials—textbooks, lecture slides, supplementary readings, study notes—organized by class. When working on assignments, studying for exams, or trying to understand concepts, they need to quickly locate specific information across this corpus. Traditional search tools fall short:

- **Keyword search (Ctrl+F) only works for exact matches:** Students searching for "machine learning bias" won't find sections discussing "algorithmic fairness" or "model discrimination"
- **No cross-document capability:** Finding where a concept is discussed across lecture slides, textbook chapters, and supplementary readings requires opening each file individually
- **No verification mechanism for AI answers:** Students using ChatGPT or Claude for study help have no way to verify answers against their actual course materials
- **Manual page-hunting:** Even when students find the right document, locating the specific page or section is tedious

**Impact of the Problem:**

- **Slow information retrieval:** Students waste time opening multiple files, scrolling, and keyword searching when they need quick answers or concept locations
- **Missed context:** Information scattered across multiple documents (e.g., concept introduced in lecture, expanded in textbook) requires manual cross-referencing
- **AI hallucination risk:** Students using generic AI tools have no way to ground-truth answers against their course-specific materials
- **Cognitive overhead:** Switching between study/work mode and "document hunting" mode breaks concentration and workflow

**Why Existing Solutions Fall Short:**

- **Generic AI chatbots (ChatGPT, Claude):** Provide answers but no way to verify against student's actual course materials; risk of hallucinations; no source tracing
- **PDF search:** Limited to exact keyword matching within single documents; no semantic understanding of queries like "what causes X?" or "explain Y"
- **Document viewers:** Can display documents but don't answer questions or connect information across files
- **Search across folders:** File system search finds document names, not content; no intelligent understanding of queries

**The Core Need:**

Students need an **intelligent navigation layer** over their course materials—something that functions like a semantic "Ctrl+F" across their entire class corpus, instantly pinpointing where concepts are discussed and providing verifiable answers grounded in their actual documents. The tool should work whether students are asking conceptual questions ("explain gradient descent"), seeking definitions, generating study materials, or simply trying to locate where a topic is covered.

**Urgency & Importance:**

Students are already adopting AI tools for studying, but using them in a way that risks hallucinations and lacks course-specific accuracy. There's a clear opportunity to capture this behavior by offering what students are actually seeking: fast, verifiable, document-grounded answers that accelerate learning rather than replace it.

---

## Proposed Solution

**Core Concept & Approach:**

Class Chat AI provides an intelligent navigation and Q&A layer over students' course materials through a RAG-based (Retrieval Augmented Generation) architecture. Students organize documents by class, then interact with their materials through natural language queries. The system performs semantic search across the document corpus, retrieves relevant passages, and generates answers grounded in the actual content—with inline citations linking directly to source locations.

**Key Capabilities:**

1. **Class-Scoped Multi-Document Chat**
   - Query across all documents in a class (textbook, lectures, notes, etc.)
   - Semantic search finds relevant content even when query terms don't exactly match document language
   - Citations show which documents contain the information, allowing students to quickly pinpoint sources

2. **Document-Scoped Chat with Page-Level Navigation**
   - Focus on a single document for deep exploration
   - Citations are clickable and jump directly to the specific page in a side-by-side document viewer
   - Enables quick verification and context review

3. **Specialized Query Types**
   - **General Q&A:** Answer conceptual questions, definitions, explanations
   - **Study Guide Generation:** Structured summaries organized by topics
   - **Summary Generation:** High-level overviews of documents or sections
   - **Quote Extraction:** Find and cite specific passages
   - Each query type uses specialized routing to structure responses appropriately

4. **Real-Time Streaming Responses**
   - WebSocket-based streaming delivers tokens as they're generated
   - Users see answers forming in real-time rather than waiting for full completion
   - Citations populate alongside answer text
   - Streaming is simulated as of now which adds latency
   - Aim to add direct chat streaming from openAI into workflow

**Key Differentiators:**

- **Grounded in user's actual materials:** Unlike ChatGPT, answers come from the student's specific course documents
- **Verifiable with inline citations:** Every claim links to source content, allowing instant verification
- **Semantic understanding:** Goes beyond keyword matching to understand conceptual queries
- **Multi-document semantic search:** Finds information across entire class corpus, not just single files
- **Purpose-built for student workflows:** Organized by classes, optimized for study use cases

**Why This Solution Will Succeed:**

Students are already using AI for studying but face a trust gap—they can't verify whether ChatGPT's answers align with their course materials. Class Chat AI closes this gap by combining the conversational convenience of modern AI with document-grounded retrieval and verification. The solution meets students where they already are (using AI assistants) but makes it reliable, verifiable, and course-specific.

**Key Assumptions Requiring Validation:**

- Students value verification enough to adopt a specialized tool vs. using ChatGPT directly
- Class-based organization aligns with student mental models (vs. topic-based, exam-based, or other structures)
- Multi-document search provides sufficient value to justify upload friction
- Specialized query modes (study guides, summaries) deliver meaningful differentiation
- Citation click-through and verification behavior will validate the core value proposition

**High-Level Vision:**

Transform how students interact with course materials—from passive storage and manual searching to an intelligent assistant that helps them navigate, understand, and verify information across their entire academic corpus.

---

## Target Users

**Primary User Segment: College & University Students**

**Demographic/Firmographic Profile:**
- **Education Level:** Undergraduate and graduate students (ages 18-30)
- **Geography:** Initially US-based, English-speaking students
- **Academic Context:** Students in reading-heavy disciplines (STEM, humanities, social sciences, business) with substantial document-based coursework
- **Technical Profile:** Comfortable with web applications, cloud storage, and AI tools; likely already using ChatGPT or similar tools for studying

**Current Behaviors & Workflows:**
- Upload course materials to cloud storage (Google Drive, Dropbox) or keep locally organized by semester/class
- Use Ctrl+F or PDF reader search to find specific information within documents
- Increasingly using ChatGPT or Claude for study help, concept explanations, and assignment support
- Toggle between multiple PDF viewers, browser tabs, and note-taking apps while studying
- Manually track sources and page numbers for citations when needed for assignments

**Specific Needs & Pain Points:**
- **Fast information retrieval:** Need to quickly find where concepts are discussed across multiple course documents without manual searching
- **AI answer verification:** Want to use AI for studying but need to verify answers against actual course materials to avoid hallucinations
- **Cross-document discovery:** Need to see how topics connect across lecture slides, textbook chapters, and supplementary readings
- **Study efficiency:** Under time pressure (exams, assignments, part-time work) and need tools that accelerate rather than replace learning
- **Trust and accuracy:** Academic consequences of using incorrect information create need for verifiable, grounded answers

**Goals They're Trying to Achieve:**
- Understand course concepts deeply and efficiently
- Locate specific information quickly during assignments or exam prep
- Verify that AI-generated explanations align with course-specific materials
- Create effective study materials (guides, summaries, flashcards) from course documents
- Manage large volumes of reading materials without feeling overwhelmed

**Validation Notes:**
- Beta testing will reveal actual user segments and whether this profile is accurate
- Usage patterns will show whether students primarily use class-scoped or doc-scoped chat
- Feature adoption will indicate whether study guide/summary generation resonates or if Q&A dominates

---

## Goals & Success Metrics

**Business Objectives**

- **Launch to beta testers by [Q1 2026]** with functional MVP and gather structured feedback via Google Forms
- **Achieve 80%+ beta tester satisfaction** on core value proposition (verifiable AI answers from personal documents)
- **Validate freemium conversion model** by testing different usage limits and identifying optimal free-to-paid conversion rate (target: 5-10% conversion within 3 months post-public launch)
- **Establish product-market fit** through beta feedback showing students would recommend to peers and use consistently
- **Build initial user base of 100-500 students** within 3 months of public MVP launch through social media and targeted outreach

**User Success Metrics**

- **Documents uploaded per user:** Indicates engagement depth and whether multi-document value is realized (target: average 5+ documents per class)
- **Queries per user session:** Measures active usage and tool utility (target: average 3+ queries per session)
- **Return usage rate:** Weekly active users / Monthly active users ratio (target: 40%+ showing habit formation)
- **Citation click-through rate:** Percentage of citations clicked for verification (validates core value prop)
- **Session duration:** Time spent using the tool per session (indicates engagement quality)
- **Feature adoption:** Distribution of usage across general Q&A, study guides, summaries, and doc chat

**Key Performance Indicators (KPIs)**

- **Monthly Active Users (MAU):** Total unique users actively querying documents each month
- **Document Upload Rate:** Documents uploaded per user per week (early indicator of engagement)
- **Query Success Rate:** Percentage of queries that return relevant results above similarity threshold (technical quality metric)
- **User Retention:** Day 1, Day 7, Day 30 retention rates post-signup
- **Net Promoter Score (NPS):** User likelihood to recommend (post-beta testing metric)
- **Free-to-Paid Conversion Rate:** Percentage of free users upgrading to paid tier (post-launch business metric)
- **Average Revenue Per User (ARPU):** Revenue generated per paying user (post-monetization metric)

---

## MVP Scope

**Core Features (Must Have)**

- **User Authentication & Account Management:** JWT-based authentication with HTTP-only cookies; email verification via Mailgun; user profile management (email/password changes); Google OAuth signup/login
  - *Rationale:* Security and user identity are foundational; Google OAuth reduces signup friction

- **Class & Document Organization:** Create classes; upload PDF documents to classes; organize documents by class structure; delete documents and classes
  - *Rationale:* Core organizational model that enables multi-document chat; PDFs are the primary document type students use

- **Document Ingestion & Processing:** Automatic chunking and embedding of uploaded PDFs; MongoDB Atlas Vector Search indexing; S3 storage for original documents; Redis-managed ingestion workflow
  - *Rationale:* RAG architecture foundation; must work reliably before launch

- **Class-Scoped Multi-Document Chat:** Query across all documents in a class; semantic search with similarity thresholds; inline citations showing source documents; streaming responses via WebSockets
  - *Rationale:* Primary value proposition for cross-document navigation

- **Document-Scoped Chat with Page Navigation:** Single-document Q&A mode; clickable citations that jump to specific pages in side-by-side document viewer; page-level source verification
  - *Rationale:* Enables deep exploration and verification within specific documents

- **Specialized Query Routing:** General Q&A, study guide generation, summary generation, quote extraction with appropriate response formatting for each type
  - *Rationale:* Differentiates from generic chatbots; addresses specific student workflows

- **Usage Limits & Freemium Infrastructure:** Track document upload limits; track monthly chat query limits; enforce free tier restrictions; support for future paid tier upgrades
  - *Rationale:* Business model foundation; enables conversion optimization post-launch

- **Mobile Blocking:** Block web app access on mobile devices with "use desktop browser" message
  - *Rationale:* Mobile experience not optimized for MVP; prevents poor UX that could hurt perception

**Out of Scope for MVP**

- Additional document formats beyond PDF (DOCX, PowerPoint, handwritten/OCR)
- Graph RAG or advanced RAG architectures (current: vector search only)
- LLM-based reranking or multi-stage retrieval
- User memory/knowledge tracking across sessions
- React Joyride onboarding walkthrough
- Advanced rate limiting with multiple OpenAI API key rotation
- Cross-class querying
- Mobile-optimized responsive design
- Advanced analytics dashboard for users
- Team/collaboration features
- Flashcard generation (distinct from study guides)
- Browser extension or integrations with external tools

**MVP Success Criteria**

The MVP will be considered successful and ready for public launch when:

- **Core flows work end-to-end:** Signup → email verification → class creation → document upload → ingestion complete → query with citations → verify in document viewer
- **Citation quality is acceptable:** Excessive citation clustering issue (e.g., [1][2][3][4][5]...) is resolved or mitigated
- **Retrieval quality meets threshold:** Query success rate >70% (queries returning relevant results above similarity threshold)
- **Low-hit scenarios handled gracefully:** When similarity is below threshold, system provides helpful guidance for query refinement rather than generic responses
- **Critical bugs resolved:** Email confirmation flow, document chat clearing between switches, formula rendering in markdown, toast notification placement
- **Performance is acceptable:** Response streaming feels real-time; document uploads complete reliably; no frequent timeout errors
- **Beta feedback is positive:** >75% of beta testers report the tool solves their problem and they would use it regularly

---

## Post-MVP Vision

**Phase 2 Features**

Based on initial user feedback and items identified in current roadmap (ROUGH_FIXES.md), Phase 2 priorities include:

- **Enhanced Retrieval Quality:**
  - Implement LLM-based reranking to improve result relevance
  - Add hybrid semantic + summary retrieval with fallback mechanisms
  - Improve low-confidence query handling with suggested query refinements
  - Exclude document summaries from specific question searches to improve precision

- **Improved Study Material Generation:**
  - Structured study guide formatting with strict Q&A structure
  - Dedicated flashcard generation with spaced repetition export
  - Context-aware generation (e.g., "generate study guide for Markov chains" scoped appropriately)
  - Special response formatting similar to ChatGPT's "deep research" mode

- **Advanced Document Processing:**
  - Support for DOCX, PowerPoint, and other common document formats
  - OCR capability for handwritten notes and scanned documents
  - Store section/subsection metadata during chunking for better study guide organization
  - Native document summaries accessible via toggle in doc chat interface

- **UX & Interface Refinements:**
  - Redesigned UI with softer edges, animations, clean icons, bubble-based chat
  - Side panel for clickable in-text citations (class chat mode)
  - Narrower left navigation sidebar
  - Fixed formula rendering and markdown processing
  - Toast notification repositioning (avoid blocking navigation)

- **Authentication & Account Features:**
  - Password reset flow
  - Login attempt limiting with reset link
  - Delete account functionality with confirmation

**Long-term Vision (1-2 Years)**

- **Graph RAG Architecture:** Transition from pure vector search to graph-based knowledge representation, enabling better relationship tracking between concepts across documents
- **User Knowledge Memory:** Agent-based system that tracks user understanding over time and adapts explanations accordingly
- **Agentic RAG System:** Multi-agent architecture with specialized agents for different query types and retrieval strategies
- **Mobile Native Experience:** Dedicated mobile apps (iOS/Android) optimized for on-the-go studying
- **Collaborative Features:** Share classes, documents, or study guides with classmates; group study sessions
- **Advanced Analytics:** Show students which topics they've covered, knowledge gaps, study time distribution
- **Integration Ecosystem:** Browser extensions, LMS integrations (Canvas, Blackboard), sync with note-taking apps

**Expansion Opportunities**

- **Enterprise/Institutional:** Offer to universities as a campus-wide tool; integrate with university library systems and course management platforms
- **Vertical Expansion:** Adapt for professional certification prep, medical students (board exam prep), law students (case law navigation)
- **Content Partnerships:** Partner with textbook publishers to offer pre-indexed textbooks or study materials
- **API Platform:** Enable third-party developers to build on Class Chat AI's RAG infrastructure
- **Multi-Language Support:** Expand beyond English to serve international student markets
- **Study Group Features:** Facilitate peer learning with shared document libraries and collaborative Q&A

---

## Technical Considerations

**Platform Requirements**

- **Target Platforms:** Web application (desktop browsers)
- **Browser/OS Support:**
  - Chrome, Firefox, Safari, Edge (latest versions)
  - Desktop/laptop only for MVP (mobile explicitly blocked)
  - Minimum screen resolution: 1280x720 for optimal side-by-side document viewer experience
- **Performance Requirements:**
  - Document upload: Support PDFs up to 50MB
  - Query response time: First token within 2-3 seconds; full response streaming complete within 10-15 seconds for typical queries
  - Document ingestion: Complete chunking and embedding within 2-5 minutes for typical course documents (50-200 pages)
  - WebSocket connection stability for real-time streaming

**Technology Stack (As Built)**

**Frontend:**
- **Framework:** React 18 + Vite
- **UI Libraries:** Material UI, Radix UI components, TailwindCSS
- **State Management:** React hooks and context
- **Document Rendering:** react-pdf (PDF.js), pdfjs-dist
- **Real-time Communication:** Socket.IO client (WebSockets)
- **Markdown Rendering:** react-markdown with remark-gfm, remark-math, rehype-katex for formula support
- **Syntax Highlighting:** react-syntax-highlighter, lowlight/refractor
- **Hosting:** Vercel

**Backend (Node API):**
- **Runtime:** Node.js 20.x
- **Framework:** Express.js with TypeScript
- **Authentication:** JWT (jsonwebtoken) with HTTP-only cookies, bcrypt for password hashing, Google OAuth (google-auth-library)
- **File Upload:** Multer with multer-s3 for direct S3 uploads
- **Email:** Mailgun.js for email verification and notifications
- **Real-time:** Socket.IO for WebSocket streaming
- **HTTP Client:** Axios for Python service communication
- **Logging:** Pino with pino-http and pino-pretty
- **Security:** Helmet.js for security headers, CORS configuration
- **Hosting:** Heroku (class-chat-node-8a0ef9662b5a)

**Backend (Python AI Service):**
- **Framework:** FastAPI
- **AI/ML:** LangChain, OpenAI API (GPT-4o for generation)
- **Vector Store:** MongoDB Atlas Vector Search
- **Embeddings:** OpenAI text-embedding models
- **Queue/State:** Redis for ingestion and chat generation workflows
- **Object Storage:** AWS S3 via boto3
- **Hosting:** Heroku (class-chat-python-f081e08f29b8)

**Data & Infrastructure:**
- **Database:** MongoDB Atlas (vector search enabled)
- **Object Storage:** AWS S3 (document storage)
- **Cache/Queue:** Redis (ingestion jobs, chat generation state)
- **Authentication:** JWT in HTTP-only cookies

**Repository Structure**
- **Monorepo:** `/frontend`, `/backend`, `/backend/python_scripts`
- **Frontend:** Vite-based React app with component-based architecture
- **Node Backend:** Express routes organized by domain (auth, classes, documents, chat)
- **Python Service:** FastAPI app with semantic search and RAG logic

**Service Architecture**
- **Frontend ↔ Node API:** REST + WebSockets
- **Node API ↔ Python AI:** HTTP/REST for orchestration
- **Python AI ↔ MongoDB/S3/Redis:** Direct connections for data operations

**Integration Requirements**
- **OpenAI API:** GPT-4o for generation, text-embedding for vectors
- **MongoDB Atlas:** Vector search index configuration
- **AWS S3:** Bucket policies for document storage and retrieval
- **Mailgun:** Email sending service for verification and notifications
- **Redis:** Pub/sub and job queue configuration
- **Google OAuth:** OAuth 2.0 client credentials (requires app verification before production)

**Security/Compliance**
- **Authentication:** JWT tokens in HTTP-only cookies (not localStorage) to prevent XSS attacks
- **Password Security:** Bcrypt hashing with appropriate salt rounds
- **File Upload Security:** File type validation (PDF only for MVP), size limits enforced
- **API Security:** Helmet.js security headers, CORS restricted to known origins
- **Data Privacy:** User documents stored in isolated S3 paths; MongoDB queries scoped by user ID
- **Rate Limiting:** Currently relies on OpenAI API limits; future: implement Redis-based rate limiting with API key rotation

**Known Technical Debt & Improvement Areas**
- **Streaming Implementation:** Currently simulated streaming adds latency; need to implement direct OpenAI streaming into workflow
- **Logging:** Python logger needs non-info log level fixes; Node logger formatting improvements; add user/session IDs to all logs
- **Environment Config:** Centralize `os.getenv` usage in Python service
- **Code Cleanup:** Remove unused imports especially in backend to reduce memory footprint
- **Error Handling:** Improve regex on quote finder; better handling of markdown formula edge cases

---

## Constraints & Assumptions

**Constraints**

- **Budget:**
  - Bootstrap/self-funded MVP
  - Operating costs: OpenAI API usage, MongoDB Atlas, AWS S3 storage, Heroku hosting, Mailgun email
  - Monthly burn rate estimate: [To be calculated]
  - Cost optimization critical: freemium model must balance free usage with API costs
  - Limited budget for paid marketing; relying on organic social media and targeted outreach

- **Timeline:**
  - Beta launch: [Q1 2026] (target TBD)
  - MVP refinement phase: Ongoing based on internal testing
  - Public launch: Post-beta feedback integration (timeline dependent on feedback volume and critical bug resolution)
  - Iterative development cycles driven by user feedback rather than fixed roadmap dates

- **Resources:**
  - Small founding team (2 co-founders)
  - No dedicated QA or testing team (internal testing only pre-beta)
  - Limited design resources (using Material UI and pre-built components)
  - Development capacity constrained by founder availability

- **Technical:**
  - **OpenAI API rate limits:** Current tier limits request volume; need monitoring and potential multi-key rotation strategy for scale
  - **Heroku free tier limitations:** May need paid dyno upgrades as user base grows
  - **MongoDB Atlas free tier:** Vector search performance and storage limits may require tier upgrade
  - **Document format support:** Limited to PDFs for MVP due to parsing complexity
  - **Mobile support:** Not feasible for MVP; desktop-only experience required for side-by-side document viewer
  - **Browser compatibility:** Dependent on PDF.js, WebSocket, and modern JS features; older browsers not supported

**Key Assumptions**

- Students are willing to upload their course documents to a cloud-based service (trust/privacy not a blocker)
- The class-based organization model will feel natural to target users
- PDF-only support is sufficient for MVP (covers majority of student document use cases)
- Desktop-only usage is acceptable for initial launch (students primarily study on laptops)
- Email verification is sufficient for account security (no phone verification needed)
- OpenAI GPT-4o quality and cost balance will remain favorable (no major price increases or quality degradation)
- MongoDB Atlas vector search provides adequate performance and accuracy for semantic retrieval
- WebSocket streaming provides meaningful UX benefit over request-response patterns
- Citation click-through behavior will validate the core value proposition
- Freemium model with usage limits can drive conversion without excessive churn
- Social media and organic outreach will generate sufficient initial user base (no paid ads required immediately)
- Beta testers will provide actionable, honest feedback rather than politeness-driven responses
- The technical stack is stable enough to avoid major architectural changes post-launch
- ROUGH_FIXES issues can be resolved without significant rewrites or architectural changes

---

## Risks & Open Questions

**Key Risks**

- **User Acquisition Risk:** Organic social media and outreach may not generate sufficient user base; students may not discover or try the tool without paid marketing or institutional partnerships
  - *Impact:* High - Without users, cannot validate product-market fit or achieve sustainability

- **Freemium Conversion Risk:** Free tier usage may consume API costs without converting to paid subscriptions at sufficient rates; usage limits may be too restrictive (causing churn) or too generous (causing unsustainable costs)
  - *Impact:* High - Business model viability depends on healthy conversion economics

- **AI Cost Volatility:** OpenAI API pricing changes or rate limit reductions could significantly impact unit economics; dependence on single AI provider creates vendor lock-in risk
  - *Impact:* High - Could force pricing changes, feature limitations, or architectural redesign

- **Retrieval Quality Issues:** Known issues with citation clustering, low-hit scenarios, and semantic search precision may hurt user trust; students may abandon tool if answers feel unreliable
  - *Impact:* High - Core value proposition depends on answer quality and verifiability

- **Competitive Risk:** Large players (OpenAI, Google, Microsoft) could add document-grounded chat to existing products; established study tools could add RAG features; market may commoditize quickly
  - *Impact:* Medium-High - First-mover advantage limited if incumbents move quickly

- **Trust & Privacy Concerns:** Students may hesitate to upload course materials due to copyright concerns, academic integrity policies, or data privacy; institutional resistance to third-party tools
  - *Impact:* Medium - Could limit adoption particularly in certain universities or disciplines

- **Seasonality Risk:** Student usage may spike during exam periods and drop significantly during breaks; cash flow and engagement metrics may be highly cyclical
  - *Impact:* Medium - Complicates retention metrics and revenue predictability

- **Technical Debt Accumulation:** Known issues in ROUGH_FIXES may compound; simulated streaming, logging problems, and code cleanup needs could slow feature development
  - *Impact:* Medium - Maintenance burden increases over time if not addressed

- **Scalability Bottlenecks:** Current architecture may not scale efficiently; MongoDB Atlas, Heroku, and OpenAI rate limits could require expensive upgrades or rewrites as user base grows
  - *Impact:* Medium - Success could paradoxically create technical crisis

**Open Questions**

- **Product Validation:**
  - Will citation click-through rates be high enough to validate the verification value proposition?
  - Do students primarily use class-scoped (multi-doc) or document-scoped (single-doc) chat?
  - Which specialized query types (study guides, summaries, quotes) get actual usage vs. just general Q&A?
  - Is the class-based organization model intuitive, or do students want different structures?

- **Business Model:**
  - What usage limits create optimal free-to-paid conversion without excessive churn?
  - What pricing tiers and features will students actually pay for?
  - What's the acceptable Customer Acquisition Cost (CAC) to Lifetime Value (LTV) ratio?
  - How do we balance API costs with free tier generosity?

- **Go-to-Market:**
  - Which channels (Reddit, Discord, TikTok, Instagram, university groups) will drive highest quality user acquisition?
  - Should we pursue institutional partnerships (university licenses) or focus on B2C?
  - How do we leverage beta testers for word-of-mouth growth?
  - What's the minimum viable user base to achieve product-market fit signals?

- **Technical Architecture:**
  - Is current vector search sufficient, or should we prioritize Graph RAG migration?
  - Should we implement multi-model support (Anthropic, local models) to reduce OpenAI dependence?
  - What's the actual performance profile (response times, costs per query, infrastructure scaling)?
  - How do we optimize embedding and retrieval costs without sacrificing quality?

- **User Behavior:**
  - How many documents do students upload per class on average?
  - How frequently do students return to the tool (daily, weekly, exam-only)?
  - Do students trust AI-generated answers enough to rely on them for assignments/exams?
  - What percentage of students verify citations vs. trusting answers blindly?

**Areas Needing Further Research**

- **Competitive Landscape Analysis:** Deep dive into existing study tools, document Q&A solutions, and AI-powered education products; identify differentiation opportunities and threats
- **User Research:** Conduct structured interviews with target users (college students) to validate problem statement, solution fit, and willingness to pay
- **Cost Modeling:** Calculate detailed unit economics (cost per query, cost per user, cost per document) to inform freemium tier design and pricing strategy
- **Market Sizing:** Estimate TAM/SAM for US college students; analyze penetration rates of similar tools; project realistic user growth curves
- **Legal/Compliance Review:** Research copyright implications of document indexing; understand academic integrity policies at target universities; review data privacy requirements (FERPA, GDPR if international)
- **Technical Performance Baseline:** Measure actual response times, ingestion times, query success rates, and error rates in current system to establish improvement targets

---

## Next Steps

**Immediate Actions**

1. **Resolve Critical Pre-Beta Bugs**
   - Fix excessive citation clustering issue ([1][2][3][4][5]... problem)
   - Implement proper email confirmation flow with auto-redirect
   - Fix document chat clearing when switching between documents
   - Resolve formula rendering issues in markdown
   - Adjust toast notification positioning to avoid blocking navigation
   - Verify Google OAuth integration and complete app verification process

2. **Complete MVP Feature Gaps**
   - Implement password reset flow
   - Add login attempt limiting with reset link
   - Implement delete account functionality with confirmation
   - Ensure proper handling of low-hit queries (query refinement suggestions)
   - Test and optimize document ingestion reliability

3. **Establish Analytics & Monitoring**
   - Implement user behavior tracking (document uploads, query types, citation clicks, session duration)
   - Set up error logging with user/session IDs
   - Create dashboard for monitoring query success rates, response times, API costs
   - Establish baseline performance metrics before beta launch

4. **Prepare Beta Launch Materials**
   - Design Google Form for structured beta feedback collection
   - Create onboarding instructions/documentation for beta testers
   - Develop beta tester recruitment outreach (email, social posts)
   - Define beta success criteria and exit conditions

5. **Cost & Unit Economics Analysis**
   - Calculate current cost per query, cost per user, cost per document
   - Model freemium tier usage limits based on cost constraints
   - Estimate monthly burn rate at various user scales (10, 50, 100, 500 users)
   - Define pricing strategy for paid tier

---

## PM Handoff

This Project Brief provides the full context for **Class Chat AI**. The system is a pre-launch MVP documenting an existing, functional AI-powered study assistant built on RAG architecture. Key context for next steps:

**Current State:**
- Fully functional end-to-end (auth → upload → ingestion → chat → citations)
- Undergoing refinement based on internal testing
- Known bugs and improvements documented in ROUGH_FIXES.md
- Architecture stable (React + Node + Python FastAPI + MongoDB + S3 + Redis)

**Immediate Priorities:**
- Resolve critical bugs listed in "Immediate Actions" above
- Prepare for beta launch with small test group
- Establish analytics to measure success metrics defined in Goals & Success Metrics
- Validate key assumptions through beta feedback (citation value, org model, freemium conversion)

**Key Questions to Resolve:**
- Beta launch timeline (currently [Q1 2026] placeholder)
- Freemium tier limits and pricing strategy
- User acquisition channels and approach
- Which Phase 2 features to prioritize based on feedback

**Recommended Next Conversation:**
Start by reviewing the MVP Scope and Risks & Open Questions sections to prioritize the immediate bug fixes and feature gaps. Then establish the analytics infrastructure to ensure beta launch generates actionable data for validation.

---

*🤖 Generated with [Claude Code](https://claude.com/claude-code)*

*Co-Authored-By: Claude <noreply@anthropic.com>*

