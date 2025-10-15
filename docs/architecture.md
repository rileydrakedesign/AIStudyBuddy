# Class Chat AI - Brownfield Architecture Document

## Introduction

This document captures the **CURRENT STATE** of the Class Chat AI codebase, including technical implementation details, architectural patterns, known technical debt, and real-world constraints. It serves as a reference for AI agents and developers working on enhancements to the system.

**Project Status:** Pre-launch MVP undergoing refinement based on internal testing

### Document Scope

Comprehensive documentation of the entire system architecture as currently implemented, with focus on:
- RAG/retrieval pipeline and citation mechanisms
- Chat streaming and WebSocket infrastructure
- Redis-based rate limiting and job queue management
- Document ingestion and processing workflows
- Current deployment constraints and operational patterns

### Change Log

| Date       | Version | Description                    | Author           |
| ---------- | ------- | ------------------------------ | ---------------- |
| 2025-10-14 | 1.0     | Initial brownfield analysis    | Winston (Claude) |

---

## Quick Reference - Key Files and Entry Points

### Critical Files for Understanding the System

**Node.js Backend (Heroku):**
- **Main Entry**: `backend/src/index.ts` (HTTPS/HTTP server setup, WebSocket initialization, MongoDB connection)
- **Application Core**: `backend/src/app.ts` (Express app with middleware, routes, error handling)
- **Configuration**: `backend/.env` (not in repo), local SSL certs for dev
- **Chat Logic**: `backend/src/controllers/chat_controllers.ts` (chat session management, message handling, free tier limits)
- **Socket Server**: `backend/src/utils/socket_server.ts` (WebSocket auth, document-ready events)
- **User Model**: `backend/src/models/user.ts` (JWT auth, Google OAuth, email verification, usage limits)
- **Token Management**: `backend/src/utils/token_manager.ts` (OpenAI rate limiting coordination with Redis)
- **Logging**: `backend/src/utils/logger.ts` (Pino logger with pretty-print)

**Python AI Service (Heroku):**
- **Main Entry**: `backend/python_scripts/semantic_service.py` (FastAPI app with request UUID middleware)
- **Ingestion Pipeline**: `backend/python_scripts/load_data.py` (PDF parsing, chunking, embedding, summary generation)
- **RAG Search**: `backend/python_scripts/semantic_search.py` (semantic search, routing, generation, ~1100 lines)
- **Query Router**: `backend/python_scripts/router.py` (regex-based routing with LLM tie-breaker)
- **Task Queue**: `backend/python_scripts/tasks.py` (RQ job enqueue for ingestion)
- **Redis Setup**: `backend/python_scripts/redis_setup.py` (TLS-aware Redis client)
- **Logging**: `backend/python_scripts/logger_setup.py` (Loguru with contextualization)

**Frontend (Vercel):**
- **Main Entry**: `frontend/src/main.tsx` (React root, auth context provider)
- **Primary Chat UI**: `frontend/src/pages/Chat.tsx` (class chat, session management, ~1469 lines)
- **Document Chat**: `frontend/src/components/chat/DocumentChat.tsx` (document-scoped chat with PDF viewer)
- **Chat Item**: `frontend/src/components/chat/chatItem.tsx` (message rendering, citations, markdown)
- **Auth Context**: `frontend/src/context/authContext.tsx` (JWT cookie-based auth state)
- **Socket Client**: `frontend/src/helpers/socketClient.ts` (Socket.io client initialization)

### Key Configuration Files

- `backend/package.json` - Node 20.x, Express, Socket.io, Mongoose, AWS SDK, Pino
- `backend/python_scripts/requirements.txt` - FastAPI, LangChain, OpenAI, PyMuPDF, Redis/RQ
- `frontend/package.json` - React 18, Vite, MUI, react-pdf, Socket.io-client
- `backend/Procfile` - Heroku process definition (web + worker)
- `backend/python_scripts/Procfile` - Python worker process

---

## High Level Architecture

### Technical Summary

**Product**: Class Chat AI - AI-powered study assistant providing document-grounded Q&A with inline citations

**Architecture Style**: Multi-tier RAG-based application with real-time streaming
- **Frontend**: React SPA with WebSocket streaming
- **API Gateway**: Node.js/Express (auth, orchestration, WebSocket management)
- **AI Processing**: Python FastAPI (RAG pipeline, LangChain, OpenAI)
- **Data Layer**: MongoDB Atlas (vector search), AWS S3 (documents), Redis (queues + rate limiting)

### Actual Tech Stack (from package.json/requirements.txt)

| Category                | Technology                    | Version/Notes                                                        |
| ----------------------- | ----------------------------- | -------------------------------------------------------------------- |
| **Runtime (Node)**      | Node.js                       | 20.x (Heroku)                                                        |
| **Runtime (Python)**    | Python                        | 3.11+ (Heroku)                                                       |
| **Frontend Framework**  | React                         | 18.3.1 with Vite 5.3.4 build tool                                    |
| **UI Libraries**        | Material UI                   | 6.1.9 + Radix UI components + TailwindCSS                            |
| **Backend Framework**   | Express.js                    | 4.18.2 (TypeScript with ES modules)                                  |
| **AI Service**          | FastAPI                       | 0.115.4 + Uvicorn 0.23.2 + Gunicorn 22.0.0                           |
| **LLM Stack**           | LangChain + OpenAI            | GPT-4.1-nano for generation, text-embedding-3-small for vectors      |
| **Database**            | MongoDB Atlas                 | Vector search enabled (PlotSemanticSearch index)                     |
| **Vector Store**        | MongoDB Atlas Vector Search   | Integrated with LangChain                                            |
| **Object Storage**      | AWS S3                        | boto3 3.34.142                                                       |
| **Cache/Queue**         | Redis                         | 5.0+ with TLS support, RQ 1.15 for job queue                         |
| **Real-time**           | Socket.IO                     | 4.8.1 (server + client)                                              |
| **Authentication**      | JWT + Google OAuth            | jsonwebtoken 9.0.1, google-auth-library 9.15.1, HTTP-only cookies   |
| **Email**               | Mailgun.js                    | 12.0.3 (verification emails)                                         |
| **Logging (Node)**      | Pino                          | 9.6.0 with pino-http 10.4.0, pino-pretty 13.0.0                      |
| **Logging (Python)**    | Loguru                        | 0.7.3 with contextualization                                         |
| **Security**            | Helmet.js                     | 8.1.0 + CORS + bcrypt 5.1.0                                          |
| **PDF Processing**      | PyMuPDF + PyPDF2              | PyMuPDF 1.24.13, PyPDF2 3.0.1                                        |
| **Document Rendering**  | react-pdf (PDF.js)            | 9.2.1, pdfjs-dist 4.8.69                                             |
| **Markdown Rendering**  | react-markdown                | 9.0.1 with remark-gfm, remark-math, rehype-katex                     |
| **HTTP Client**         | Axios                         | 1.8.4 (Node), 1.7.2 (Frontend)                                       |
| **File Upload**         | Multer + multer-s3            | 1.4.5-lts.1 (direct S3 uploads)                                      |
| **Deployment**          | Heroku (backend) + Vercel (frontend) | No CI/CD pipeline - manual deploys to production environment |

### Repository Structure Reality Check

- **Type**: Monorepo with `/frontend`, `/backend`, `/backend/python_scripts`
- **Package Manager**: npm (Node), pip (Python)
- **Notable Patterns**:
  - Backend uses TypeScript ES modules (`.js` imports despite `.ts` sources)
  - Python scripts live inside `/backend` directory (shared Heroku deployment)
  - Local development uses self-signed SSL certs (`localhost.pem`, `localhost-key.pem`) for WebSocket testing
  - Production routing handled by Heroku SSL termination (plain HTTP inside dyno)

---

## Source Tree and Module Organization

### Project Structure (Actual)

```
AIStudyBuddy/
├── backend/
│   ├── src/
│   │   ├── index.ts                    # Main server entry (HTTPS/HTTP + WebSocket init)
│   │   ├── app.ts                      # Express app setup (middleware, routes)
│   │   ├── controllers/
│   │   │   ├── chat_controllers.ts     # Chat session CRUD, generation, free tier limits
│   │   │   ├── user_controllers.ts     # Signup, login, Google OAuth
│   │   │   ├── document_controllers.ts # Upload orchestration, S3 handling
│   │   │   ├── profile_controllers.ts  # Profile updates, email/password change
│   │   │   ├── password_reset.ts       # Password reset flow
│   │   │   └── user_confirm.ts         # Email confirmation handling
│   │   ├── routes/
│   │   │   ├── index.ts                # Route aggregation
│   │   │   ├── user_routes.ts          # /signup, /login, /google-auth, /logout
│   │   │   ├── chat_routes.ts          # /chat/* endpoints
│   │   │   └── document_routes.ts      # /upload, /documents
│   │   ├── models/
│   │   │   ├── user.ts                 # User schema (auth, plan, usage limits)
│   │   │   ├── chatSession.ts          # Chat session + message schema
│   │   │   ├── documents.ts            # Document metadata schema
│   │   │   └── chunkModel.ts           # MongoDB chunk schema
│   │   ├── utils/
│   │   │   ├── socket_server.ts        # WebSocket JWT auth, document-ready events
│   │   │   ├── logger.ts               # Pino logger configuration
│   │   │   ├── token_manager.ts        # OpenAI rate limiting (Redis coordination)
│   │   │   ├── email.ts                # Mailgun email sending
│   │   │   ├── validators.ts           # Express-validator rules
│   │   │   └── constants.ts            # Shared constants (cookie name, etc.)
│   │   └── db/
│   │       └── connection.ts           # MongoDB connection helper
│   ├── python_scripts/
│   │   ├── semantic_service.py         # FastAPI main app (2 endpoints + middleware)
│   │   ├── semantic_search.py          # RAG pipeline: routing, retrieval, generation (~1100 LOC)
│   │   ├── router.py                   # Query route detection (regex + LLM tie-breaker)
│   │   ├── load_data.py                # PDF ingestion: chunking, embedding, summary (~466 LOC)
│   │   ├── tasks.py                    # RQ job enqueue helper
│   │   ├── redis_setup.py              # TLS-aware Redis client
│   │   ├── logger_setup.py             # Loguru logger with contextualization
│   │   ├── prompts.json                # Route-specific system prompts
│   │   ├── requirements.txt            # Python dependencies
│   │   ├── Procfile                    # Worker process definition
│   │   └── worker_boot.py              # RQ worker entry point
│   ├── package.json                    # Node dependencies
│   ├── Procfile                        # Heroku web process
│   └── tsconfig.json                   # TypeScript config (ES modules)
├── frontend/
│   ├── src/
│   │   ├── main.tsx                    # React entry point
│   │   ├── App.tsx                     # Router setup
│   │   ├── pages/
│   │   │   ├── Chat.tsx                # Main chat UI (~1469 LOC)
│   │   │   ├── Login.tsx               # Login page
│   │   │   ├── Signup.tsx              # Signup page
│   │   │   ├── Upload.tsx              # Document upload page
│   │   │   ├── Profile.tsx             # User profile management
│   │   │   ├── ForgotPassword.tsx      # Password reset request
│   │   │   └── ResetPassword.tsx       # Password reset confirmation
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── chatItem.tsx        # Message bubble rendering, citations, markdown
│   │   │   │   └── DocumentChat.tsx    # Document-scoped chat with PDF viewer
│   │   │   ├── Header.tsx              # Top navigation bar
│   │   │   └── ui/                     # Shared UI components (buttons, inputs, loaders)
│   │   ├── context/
│   │   │   └── authContext.tsx         # JWT auth state management
│   │   └── helpers/
│   │       ├── api-communicators.ts    # Axios API wrappers
│   │       └── socketClient.ts         # Socket.io client initialization
│   ├── package.json                    # Frontend dependencies
│   └── vite.config.ts                  # Vite build configuration
├── docs/
│   ├── brief.md                        # Product brief (comprehensive MVP documentation)
│   └── architecture.md                 # THIS FILE
├── CLAUDE.md                           # Claude agent reference guide
├── ROUGH_FIXES.md                      # Known issues and planned improvements
├── UI_STYLE_GUIDE.md                   # Design system documentation
├── localhost.pem / localhost-key.pem   # Local dev SSL certificates (NOT in repo)
└── README.md                           # Project overview
```

### Key Modules and Their Purpose

**Authentication & User Management:**
- `backend/src/controllers/user_controllers.ts` - Signup, login, JWT issuance, Google OAuth flow
- `backend/src/models/user.ts` - User schema with email verification, password reset, plan/usage tracking
- `frontend/src/context/authContext.tsx` - Client-side auth state (cookie-based JWT)

**Document Upload & Ingestion:**
- `backend/src/controllers/document_controllers.ts` - Multer-S3 upload, triggers Python ingestion via HTTP POST
- `backend/python_scripts/load_data.py` - Producer-consumer PDF parsing (PyMuPDF), chunking (MarkdownHeaderTextSplitter + SemanticChunker), embedding (async batch), MongoDB insertion, summary generation
- `backend/python_scripts/tasks.py` - RQ job enqueue (2-hour timeout, 7-day failure retention)

**Chat & RAG Pipeline:**
- `backend/src/controllers/chat_controllers.ts` - Session management, free tier limits (25/month), calls Python semantic search via Axios, handles retry versioning
- `backend/python_scripts/semantic_search.py` - **CRITICAL MODULE**:
  - Query routing (regex + LLM tie-breaker)
  - MongoDB vector search with MMR reranking
  - Context assembly with token budgeting
  - Multi-mode handling (summary, study guide, quote finding, follow-up, general Q&A)
  - OpenAI rate limiting via Redis token bucket
  - Citation renumbering and validation
  - Graceful error handling (context overflow, no-hit, LLM errors)
- `backend/python_scripts/router.py` - Route detection (follow_up, quote_finding, generate_study_guide, summary, general_qa)

**Real-Time & Streaming:**
- `backend/src/utils/socket_server.ts` - Socket.io with JWT auth middleware, document-ready events from MongoDB change stream
- `frontend/src/pages/Chat.tsx` - Simulated typewriter effect (2ms interval), manages WebSocket connection for document processing updates

**Rate Limiting & Concurrency:**
- `backend/python_scripts/redis_setup.py` - TLS-aware Redis client (honors REDIS_TLS_URL)
- `backend/src/utils/token_manager.ts` - OpenAI TPM tracking (currently placeholder, full implementation in Python service)
- `backend/python_scripts/semantic_search.py` - `reserve_tokens()` and `try_acquire_tokens()` for embedding and generation rate limiting

---

## Data Models and Storage

### MongoDB Collections

**1. User Collection (`test.users`)**
- **Schema**: See `backend/src/models/user.ts`
- **Key Fields**:
  - `name`, `email`, `password` (bcrypt hashed, optional for Google OAuth users)
  - `authProvider`: "credentials" | "google"
  - `googleId`, `picture` (for Google OAuth)
  - `emailVerified`, `emailToken`, `emailTokenExp` (Mailgun verification flow)
  - `plan`: "free" | "premium"
  - `chatRequestCount`, `chatRequestResetAt` (monthly usage tracking)
  - `classes`: Array of class objects with `{name, _id}`

**2. Chat Session Collection (`test.chatSessions`)**
- **Schema**: See `backend/src/models/chatSession.ts`
- **Key Fields**:
  - `userId`: Reference to user
  - `sessionName`: Display name
  - `messages`: Array of `{role, content, citation, chunkReferences, versions, currentVersion, reaction}`
  - `assignedClass`, `assignedDocument`: Scope tracking
  - `source`: "main_app" | "chrome_extension"
  - `ephemeral`: Boolean (auto-created sessions for doc chat)

**3. Document Collection (`test.documents`)**
- **Schema**: See `backend/src/models/documents.ts`
- **Key Fields**:
  - `userId`, `className`, `fileName`, `s3Key`
  - `docId`: String ID
  - `isProcessing`: Boolean (triggers WebSocket event when flipped to false)
  - `uploadedAt`: Timestamp

**4. Vector Chunks Collection (`study_buddy_demo.study_materials2`)**
- **Purpose**: Stores chunked document text with embeddings for vector search
- **Key Fields**:
  - `text`: Chunk content
  - `embedding`: Float array (1536 dimensions for text-embedding-3-small)
  - `file_name`, `title`, `author`
  - `user_id`, `class_id`, `doc_id`
  - `page_number`: Integer (page location)
  - `is_summary`: Boolean (true for doc-level summaries)
  - `chunk_hash`: SHA1 for deduplication
- **Indexes**:
  - Vector search index: `PlotSemanticSearch` (on `embedding` field)
  - Unique index: `(doc_id, chunk_hash)` for cross-run deduplication

### AWS S3 Storage

**Bucket**: Configured via `AWS_S3_BUCKET_NAME` env var

**Key Structure**: User-uploaded PDFs stored with original filename as S3 key

**Access Patterns**:
- **Upload**: Multer-S3 direct upload from Node API
- **Ingestion**: Python service downloads via boto3 for processing
- **Download**: Pre-signed URL generation for user downloads

### Redis Usage

**Purpose**: Job queue + rate limiting (TLS-enabled in production)

**Key Patterns**:
1. **Ingestion Queue** (`ingest` queue via RQ):
   - Job function: `load_data.load_pdf_data`
   - Timeout: 2 hours
   - Failure retention: 7 days
   - Worker process: Separate Heroku dyno running `rq worker ingest`

2. **OpenAI Rate Limiting** (`openai:tpm:counter` key):
   - Counter-based minute bucket (INCRBY + EXPIRE 70s)
   - TPM limit: 180,000 tokens/minute (configurable via `OPENAI_TPM_LIMIT`)
   - Guards embedding and generation calls
   - Implements backoff with max 10s wait

---

## API Design and Integration

### Node API Endpoints (Backend)

**Authentication Routes** (`/api/v1/user/`)
- `POST /signup` - Email/password registration, sends verification email
- `POST /login` - Email/password login, issues JWT cookie
- `POST /google-auth` - Google OAuth token exchange
- `POST /logout` - Clears JWT cookie
- `GET /auth-status` - Verifies JWT, returns user data
- `POST /verify-email` - Confirms email token
- `POST /resend-verification` - Resends verification email
- `POST /forgot-password` - Initiates password reset flow
- `POST /reset-password` - Completes password reset

**Chat Routes** (`/api/v1/chat/`)
- `POST /new` - Create new chat session
- `GET /all-chats` - Get user's chat sessions (filtered by source)
- `POST /` - Send message, get AI response
- `DELETE /:chatSessionId` - Delete specific chat
- `DELETE /` - Delete all user's chats
- `PATCH /:sessionId/message/:msgIndex/reaction` - Set like/dislike reaction

**Document Routes** (`/api/v1/`)
- `POST /upload` - Upload PDF to S3, trigger ingestion (calls Python API)
- `GET /documents/:className` - List documents for a class
- `DELETE /document/:docId` - Delete document and associated chunks
- `DELETE /class/:classId` - Delete class and all documents
- `GET /download` - Generate pre-signed S3 URL for download

**Profile Routes** (`/api/v1/profile/`)
- `POST /update-email` - Change email (requires verification)
- `POST /update-password` - Change password (requires current password)

### Python API Endpoints (AI Service)

**Semantic Search** (`POST /api/v1/semantic_search`)
- **Request Body**:
  ```json
  {
    "user_id": "string",
    "class_name": "string | null",
    "doc_id": "string | null",
    "user_query": "string",
    "chat_history": [{"role": "user|assistant", "content": "string"}],
    "source": "main_app | chrome_extension"
  }
  ```
- **Response**: Streaming JSON (keepalive bytes every 10s, final JSON payload)
  ```json
  {
    "message": "string (generated answer)",
    "citation": [{"href": "string", "text": "string", "docId": "string"}],
    "chats": "array (updated chat history)",
    "chunks": [{"_id": "string", "chunkNumber": 1, "text": "string", "pageNumber": 1, "docId": "string"}],
    "chunkReferences": [{"chunkId": "string", "displayNumber": 1, "pageNumber": 1}]
  }
  ```
- **Special Statuses**:
  - `status: "no_hit"` - No relevant chunks found, includes refinement suggestions
  - `status: "needs_context"` - Quote finding requires more specificity
  - `status: "busy"` - Rate limit hit, retry suggested
  - `status: "llm_error"` - OpenAI API error, retryable

**Process Upload** (`POST /api/v1/process_upload`)
- **Request Body**:
  ```json
  {
    "user_id": "string",
    "class_name": "string",
    "s3_key": "string",
    "doc_id": "string"
  }
  ```
- **Response**: `202 Accepted`
  ```json
  {
    "message": "Job queued",
    "doc_id": "string",
    "job_id": "string (RQ job ID)"
  }
  ```

### WebSocket Events (Socket.io)

**Client → Server:**
- `connection` - Authenticated via JWT in cookie or `auth.token`

**Server → Client:**
- `document-ready` - Emitted when `isProcessing` flips to `false`
  ```json
  {
    "docId": "string",
    "fileName": "string",
    "className": "string"
  }
  ```

### External API Dependencies

**OpenAI API**
- **Generation**: GPT-4.1-nano (configurable via `OPENAI_CHAT_MODEL`)
- **Embeddings**: text-embedding-3-small
- **Rate Limiting**: 180,000 TPM (tier 1), managed via Redis bucket
- **Error Handling**: Retries on transient errors, graceful fallback on context overflow

**Mailgun API**
- **Purpose**: Email verification, password reset
- **Configuration**: `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_FROM`
- **Templates**: Inline HTML in `backend/src/utils/email.ts`

**Google OAuth API**
- **Configuration**: `GOOGLE_CLIENT_ID`
- **Flow**: Frontend sends token → backend verifies with `google-auth-library` → creates/updates user → issues JWT
- **Known Issue**: Requires app verification before production (noted in brief.md)

**AWS S3 API**
- **Operations**: Upload (multer-s3), Download (boto3), Pre-signed URLs
- **Configuration**: `AWS_ACCESS_KEY`, `AWS_SECRET`, `AWS_REGION`, `AWS_S3_BUCKET_NAME`

---

## RAG Pipeline Deep Dive (Critical for Enhancements)

### Query Routing (`backend/python_scripts/router.py`)

**Mechanism**: Ordered regex patterns with LRU-cached LLM tie-breaker

**Routes Detected**:
1. `follow_up` - "elaborate", "tell me more", "expand on", "what do you mean"
2. `quote_finding` - "find/give/provide quote" patterns
3. `generate_study_guide` - "study guide", "make/generate guide"
4. `summary` - "summary", "summarize", "tl;dr", "overview"
5. `general_qa` - Fallback for all other queries

**Tie-Breaking**: If multiple regex patterns match, uses GPT-4.1-nano to select best route (cached)

### Retrieval Configuration (Per-Route Tuning)

**`ROUTE_CONFIG` in `semantic_search.py`:**

| Route                 | k  | numCandidates | temperature | max_output_tokens |
| --------------------- | -- | ------------- | ----------- | ----------------- |
| general_qa            | 12 | 1000          | 0.2         | 700               |
| follow_up             | 10 | 1000          | 0.2         | 700               |
| quote_finding         | 20 | 1200          | 0.0         | 400               |
| generate_study_guide  | 8  | 800           | 0.3         | 1200              |
| summary               | 8  | 800           | 0.2         | 600               |

**Notes**:
- `k` = number of chunks returned after deduplication
- `numCandidates` = MongoDB vector search candidate pool size
- All configurable via environment variables (e.g., `RAG_K`, `RAG_CANDIDATES`)

### Embedding & Vector Search

**Embedding Strategy**:
- **Model**: text-embedding-3-small (1536 dimensions)
- **Batching**: Async batch embedding (80 texts/batch, concurrency=2) for ingestion
- **Rate Limiting**: Token bucket with 10s max wait before "busy" response

**Vector Search**:
- **Index**: `PlotSemanticSearch` on `study_materials2.embedding`
- **Filters**: `{user_id, class_id?, doc_id?, is_summary: false}` for specific queries
- **Deduplication**: By `(doc_id, page_number)` tuple to avoid redundant chunks from same page
- **MMR Reranking**: Optional diversity reranking (λ=0.7) if tokens available

**Citation Generation**:
- File-level citations with S3 download URLs
- `[N]` in-text citations renumbered to match chunk order
- Quote route validates verbatim text matches in selected chunks

### Context Assembly & Prompt Construction

**Prompt Skeleton** (uniform across routes):
```
### ROLE
You are an expert study assistant...

### TASK INSTRUCTIONS
{route_rules}  # Route-specific prompt from prompts.json

### CITATION GUIDELINES
{citing}  # Bracket citation format instructions

### CONTEXT CHUNKS
<chunk id='1'>
{chunk text}
</chunk>
...

### USER QUESTION
{input}

### CLARIFY / NO-HIT LOGIC
If context cannot fully answer but a single, precise follow-up would enable an answer, ask that question.
If nothing is relevant, reply exactly with NO_HIT_MESSAGE.

### ANSWER REQUIREMENTS
Respond only with information directly addressing the user question derived from the context above.
```

**Token Budgeting**:
- `MAX_PROMPT_TOKENS = 8000` (safe ceiling for gpt-4.1-nano)
- Estimates: `est_tokens(text) = len(text) * 0.25`
- Reserves: `prompt_tokens + history_tokens + estimated_output_tokens`
- Waits up to 10s for token availability, returns "busy" if exhausted

### Special Query Modes

**1. Document Summary (`mode="doc_summary"`)**
- Fetches pre-computed summary chunk (`is_summary=True`)
- Condenses via `condense_summary()` prompt with user query for formatting hints
- Skips retrieval, returns single summary chunk

**2. Class Summary (`mode="class_summary"`)**
- Fetches all document summaries for class
- Concatenates with separator `\n\n---\n\n`
- Condenses via `condense_class_summaries()` if over token limit
- Returns aggregated summary

**3. Study Guide (`route="generate_study_guide" or mode="study_guide"`)**
- Uses summary chunks (doc or class level)
- Applies `generate_study_guide()` prompt with strict markdown structure:
  ```
  # Study Guide
  ## Key Concepts
  ## Important Definitions
  ## Essential Formulas / Diagrams (omit if N/A)
  ## Practice Questions
  ```

**4. Follow-Up (`route="follow_up"`)**
- Reuses chunk references from previous assistant message
- No new retrieval, uses existing context
- Lower k=10 for efficiency

**5. Quote Finding (`route="quote_finding"`)**
- Strips boilerplate "find a quote" phrases from query
- Requires ≥3 meaningful tokens or returns "needs_context" status
- Post-validates quotes are verbatim from selected chunks (regex match)
- Filters out non-verbatim lines before returning

### Error Handling & Graceful Degradation

**No-Hit Scenarios**:
- If `chunk_array` is empty after retrieval → returns refinement suggestions
- If LLM returns `NO_HIT_MESSAGE` → treats as no-hit, provides suggestions

**Refinement Suggestions**:
```python
[
  "Ask about a specific key term, e.g. "Define entropy in Chapter 2".",
  "Refer to a section number, e.g. "Summarise Section 3.4".",
  "Break the question into a smaller part, e.g. "List the main theorems first"."
]
```

**Context Overflow**:
- Catches `context_length_exceeded` error code
- Returns custom message based on mode (class summary, study guide, or generic)

**Transient LLM Errors**:
- Catches `RateLimitError`, `APIConnectionError`, `Timeout`, `APIStatusError`
- Returns "The model or server is unavailable... please **Try again**" with `retryable: true`

---

## Infrastructure and Deployment

### Current Deployment Architecture

**Production Environment**: All deployed to production, no staging environment

**Frontend (Vercel)**
- **URL**: `https://app.classchatai.com` (configured via `CLIENT_ORIGIN` env var)
- **Build**: Vite production build (`npm run build`)
- **Deployment**: Manual push to Vercel (no CI/CD)
- **Environment Variables**: Set in Vercel dashboard

**Node Backend (Heroku)**
- **App**: `class-chat-node`
- **URL**: `https://class-chat-node.herokuapp.com`
- **Dyno Type**: Web dyno (assumed standard/hobby tier)
- **Process**: `node dist/index.js` (compiled from TypeScript)
- **Deployment**: Manual `git push heroku` (no CI/CD)
- **SSL**: Heroku SSL termination (HTTP inside dyno, trust proxy enabled)

**Python AI Service (Heroku)**
- **App**: `class-chat-python`
- **URL**: `https://class-chat-python.herokuapp.com`
- **Dyno Types**:
  - Web: Gunicorn + Uvicorn workers for FastAPI
  - Worker: RQ worker for ingestion queue
- **Deployment**: Manual `git push heroku` from `backend/python_scripts` (no CI/CD)

**MongoDB Atlas**
- **Cluster**: Free tier or shared cluster (exact tier unknown)
- **Vector Search**: Enabled with `PlotSemanticSearch` index
- **Connection**: Via connection string in env vars

**Redis**
- **Type**: TLS-enabled (honors `REDIS_TLS_URL` env var)
- **Provider**: Likely Heroku Redis or external Redis Cloud
- **Usage**: RQ job queue + OpenAI rate limiting

**AWS S3**
- **Region**: Configured via `AWS_REGION`
- **Bucket**: Single bucket for all user documents
- **Access**: IAM credentials in env vars

### Local Development Setup

**Prerequisites**:
1. Node.js 20.x
2. Python 3.11+
3. MongoDB (local or Atlas connection string)
4. Redis (local or remote)
5. Self-signed SSL certificate for local HTTPS (required for WebSocket testing)

**SSL Certificate Generation** (macOS/Linux):
```bash
# Generate self-signed cert (if not present)
openssl req -x509 -out localhost.pem -keyout localhost-key.pem \
  -days 365 -newkey rsa:2048 -nodes -sha256 \
  -subj '/CN=localhost' -extensions EXT -config <( \
   printf "[dn]\nCN=localhost\n[req]\ndistinguished_name = dn\n[EXT]\nsubjectAltName=DNS:localhost\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth")
```

**Backend Setup**:
```bash
cd backend
npm install
# Create .env with required vars (see .env.example or ask team)
npm run dev  # Runs tsc --watch + nodemon
```

**Python Service Setup**:
```bash
cd backend/python_scripts
pip install -r requirements.txt
# Ensure .env or environment variables are set
uvicorn semantic_service:app --reload  # Web service
rq worker ingest  # Worker (separate terminal)
```

**Frontend Setup**:
```bash
cd frontend
npm install
# Create .env with VITE_API_URL pointing to local backend
npm run dev  # Vite dev server on localhost:5173
```

**Known Local Dev Issues**:
1. **SSL Certificate Trust**: Browser may warn about self-signed cert, must manually trust
2. **WebSocket Connection**: Requires HTTPS locally (hence SSL cert requirement)
3. **CORS**: `CLIENT_ORIGIN` must match frontend dev URL (e.g., `http://localhost:5173`)

### Environment Variables (Critical)

**Node Backend** (`.env` in `/backend`):
```
NODE_ENV=production|development
PORT=3000
JWT_SECRET=...
COOKIE_SECRET=...
MONGO_CONNECTION_STRING=mongodb+srv://...
CLIENT_ORIGIN=https://app.classchatai.com
PYTHON_API_URL=https://class-chat-python.herokuapp.com
AWS_ACCESS_KEY=...
AWS_SECRET=...
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=...
MAILGUN_API_KEY=...
MAILGUN_DOMAIN=...
MAILGUN_FROM=noreply@classchatai.com
GOOGLE_CLIENT_ID=...
REDIS_URL=redis://... (or REDIS_TLS_URL for production)
```

**Python Service** (`.env` in `/backend/python_scripts`):
```
MONGO_CONNECTION_STRING=mongodb+srv://...
AWS_ACCESS_KEY=...
AWS_SECRET=...
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=...
OPENAI_API_KEY=...
OPENAI_CHAT_MODEL=gpt-4.1-nano
OPENAI_TPM_LIMIT=180000
REDIS_URL=redis://... (or REDIS_TLS_URL for production)
BACKEND_URL=https://class-chat-node.herokuapp.com/api/v1
MAX_PROMPT_TOKENS=8000
SIMILARITY_THRESHOLD=0.0  # Currently unused (no gating by similarity score)
RAG_K=12
RAG_CANDIDATES=1000
RAG_TEMP_GENERAL=0.2
# ... (per-route overrides for k, candidates, temp, max_tokens)
```

**Frontend** (`.env` in `/frontend`):
```
VITE_API_URL=https://class-chat-node.herokuapp.com/api/v1
```

### Deployment Process (Manual)

**Current Reality**: All deployments are done directly to production via manual `git push` commands. **There is no CI/CD pipeline, no staging environment, and no automated testing before production deployment.**

**Node Backend**:
```bash
cd backend
npm run build  # Compile TypeScript to dist/
git push heroku main  # Deploy to Heroku
heroku logs --tail  # Monitor deployment
```

**Python Service**:
```bash
cd backend/python_scripts
git push heroku main  # Deploy both web and worker dynos
heroku logs --tail --dyno=worker  # Monitor worker
```

**Frontend**:
```bash
cd frontend
npm run build  # Vite production build
# Vercel auto-deploys from Git (if connected) or manual deploy via Vercel CLI
vercel --prod
```

**Rollback Strategy**:
- Heroku: `heroku rollback` to previous release
- Vercel: Rollback via Vercel dashboard to previous deployment
- **Risk**: No automated tests, issues discovered post-deployment

---

## Technical Debt and Known Issues

### Critical Technical Debt

**1. No CI/CD Pipeline**
- **Impact**: All changes deployed directly to production without automated testing
- **Risk**: High risk of production outages from untested code
- **Mitigation**: Manual testing before deploy, ability to rollback via Heroku/Vercel
- **Location**: Entire deployment infrastructure

**2. Simulated Streaming (Not True OpenAI Streaming)**
- **Impact**: Adds latency (~1-3s) before streaming starts, full response generated before display
- **Current Implementation**: `frontend/src/pages/Chat.tsx:486-504` - typewriter effect with 2ms interval
- **Desired**: Direct OpenAI streaming via FastAPI `StreamingResponse` → Socket.io → React UI
- **Complexity**: Requires refactoring Python generation chain to use streaming mode

**3. Logging Issues**
- **Python Logger**: Non-info log levels not being captured properly (`backend/python_scripts/logger_setup.py`)
- **Node Logger**: Formatting could be improved, missing user/session IDs in many log entries
- **Impact**: Difficult to debug production issues without comprehensive logs
- **Fix Required**: Centralize user_id/session_id context injection in all log statements

**4. Environment Variable Management**
- **Issue**: `os.getenv` calls scattered throughout Python service, no centralized config
- **Impact**: Hard to audit what env vars are required, easy to miss in new deployments
- **Location**: Throughout `backend/python_scripts/*.py`
- **Fix**: Create `config.py` with centralized env var loading and validation

**5. Unused Imports / Code Cleanup**
- **Impact**: Increased memory footprint, slower startup, harder to understand codebase
- **Location**: Backend especially (Node and Python)
- **Priority**: Medium (performance optimization opportunity)

### Known Bugs (from ROUGH_FIXES.md)

**High Priority**:

**1. Citation Clustering Issue**
- **Symptom**: Massive number of in-text citations like `[1][2][3][4][5][13][15][17][19][20][21][24][25][26][27][28][29]`
- **Expected**: Max 3 citations per answer ideally
- **Location**: `backend/python_scripts/semantic_search.py:979-1012` (citation renumbering logic)
- **Root Cause**: Citation numbering not collapsing redundant chunk references
- **Impact**: UX degradation, citations hard to use

**2. Email Confirmation Link Issues**
- **Symptom**: Link doesn't auto-reload when clicked, especially on different devices
- **Expected**: Auto-redirect to chat page after confirmation
- **Location**: `backend/src/controllers/user_confirm.ts`, frontend email confirmation page
- **Workaround**: Add explicit "Go to Chat" link on confirmation page

**3. Markdown Formula Rendering**
- **Symptom**: Formulas load in red or expand doc chat screen unexpectedly
- **Location**: `frontend/src/components/chat/chatItem.tsx` - react-markdown + rehype-katex rendering
- **Impact**: Poor UX for math-heavy documents (STEM use cases)

**4. Password Validator Toast Errors on Login Page**
- **Symptom**: Signup password validator errors thrown to login page too
- **Impact**: Minor UX issue (validators satisfied for existing accounts anyway)
- **Location**: Frontend validation logic

**Medium Priority**:

**5. Follow-Up Query Handling**
- **Symptom**: "Elaborate on this" works, but "elaborate on how this pertains to X" sometimes fails
- **Location**: `backend/python_scripts/router.py` - follow_up route detection
- **Impact**: User must rephrase to get follow-up behavior

**6. Document Chat Window Expansion**
- **Symptom**: Long formulas cause doc chat window to expand beyond intended size
- **Expected**: Doc chat window should stay fixed size always
- **Location**: `frontend/src/components/chat/DocumentChat.tsx` CSS constraints

**7. Mobile UI Not Blocked**
- **Symptom**: Mobile users can access web app but UX is broken
- **Expected**: Block web app entirely on mobile, serve "go to browser" message
- **Location**: Frontend routing or root component

**Low Priority**:

**8. Summaries in Specific Question Retrieval**
- **Issue**: Document summaries (`is_summary=True`) should be excluded from semantic search for specific questions
- **Current**: Filter applied: `{"is_summary": False}` in specific/quote/general routes
- **Status**: Already implemented correctly, may need verification

**9. Rate Limiting Edge Cases**
- **Issue**: OpenAI rate limiting needs refinement - consider multiple API keys under different projects
- **Current**: Redis bucket with 180k TPM limit, 10s max wait
- **Enhancement**: Auto-switch to 2nd/3rd API key when approaching limit

### Workarounds and Gotchas

**1. Heroku 30-Second Timeout**
- **Workaround**: Streaming keepalive bytes every 10s in `semantic_search` endpoint
- **Location**: `backend/python_scripts/semantic_service.py:49-91`
- **Reason**: Long-running RAG searches can exceed 30s idle timeout

**2. MongoDB Change Stream for Document Processing**
- **Mechanism**: Watches `documents` collection for `isProcessing: false` updates
- **Location**: `backend/src/utils/socket_server.ts:101-115`
- **Gotcha**: Requires MongoDB replica set (Atlas free tier supports this)

**3. JWT in HTTP-Only Cookies**
- **Why**: Prevents XSS attacks (JWT not accessible via JavaScript)
- **Gotcha**: Must send cookies with `credentials: true` in Axios/fetch requests
- **Location**: `frontend/src/helpers/api-communicators.ts` - Axios default config

**4. Self-Signed Cert for Local Development**
- **Why**: WebSocket over HTTPS requires valid cert, even locally
- **Gotcha**: Browser will warn about untrusted certificate, must manually accept
- **Location**: `backend/src/index.ts:28-52` - TLS handling

**5. TypeScript ES Module Imports**
- **Pattern**: `.js` extensions in import statements despite `.ts` source files
- **Example**: `import app from "./app.js"` in `index.ts`
- **Reason**: TypeScript compiler outputs ES modules, Node requires `.js` in imports

**6. Redis TLS Requirement in Production**
- **Why**: Heroku Redis requires TLS connections
- **Handling**: `backend/python_scripts/redis_setup.py` detects `REDIS_TLS_URL` and enables TLS
- **Gotcha**: Local Redis doesn't need TLS, must handle both cases

**7. Chat Session Retry Versioning**
- **Feature**: "Retry" button on assistant messages creates alternate versions
- **Storage**: `versions[]` array on message object, `currentVersion` index
- **Gotcha**: UI collapses consecutive assistant messages into single bubble with version switcher
- **Location**: `frontend/src/pages/Chat.tsx:786-807` - `collapseRetries()` function

---

## Integration Points and Dependencies

### Frontend ↔ Node API

**Communication**: Axios HTTP + Socket.io WebSocket

**Authentication Flow**:
1. User signs up → Node sets JWT in HTTP-only cookie (`COOKIE_NAME="auth_token"`)
2. All subsequent requests include cookie automatically
3. JWT middleware verifies token on protected routes (`res.locals.jwtData.id`)

**Key Axios Configuration**:
```typescript
axios.defaults.withCredentials = true;
axios.defaults.baseURL = import.meta.env.VITE_API_URL;
```

**WebSocket Authentication**:
- JWT extracted from cookie or `socket.handshake.auth.token`
- Cookie may be signed (starts with `s:`), unsign via `cookie-signature`
- Verify JWT, attach `socket.data.userId`
- User joins room by `userId` for targeted events

### Node API ↔ Python AI Service

**Communication**: Axios HTTP (synchronous for chat, async for ingestion via RQ)

**Upload Flow**:
1. Node receives PDF upload → saves to S3 via multer-s3
2. Node POSTs to `{PYTHON_API_URL}/api/v1/process_upload` with `{user_id, class_name, s3_key, doc_id}`
3. Python enqueues RQ job → returns 202 Accepted
4. Worker processes job asynchronously
5. On completion, Python updates MongoDB `isProcessing: false`
6. Node's WebSocket change stream detects update → emits `document-ready` to frontend

**Chat Flow**:
1. Node receives chat message via POST `/api/v1/chat/`
2. Node assembles request payload with chat history
3. Node POSTs to `{PYTHON_API_URL}/api/v1/semantic_search`
4. Python streams keepalive bytes (10s interval) until search completes
5. Python returns final JSON with answer, citations, chunks
6. Node updates MongoDB chat session with response
7. Node returns response to frontend

**Error Handling**:
- Node wraps Python API calls in try/catch
- HTTP errors from Python propagated as 500 with generic message
- Python returns structured error payloads with `status` field for client handling

### Python AI ↔ External Services

**OpenAI API**:
- **Embeddings**: Async batch calls (80 texts/batch, concurrency=2)
- **Generation**: Synchronous LangChain `ChatOpenAI.invoke()`
- **Rate Limiting**: Redis token bucket (acquire before all calls)
- **Error Handling**: Retries on transient errors, graceful fallback on context overflow

**MongoDB Atlas**:
- **Connection**: `pymongo.MongoClient` with connection string
- **Vector Search**: Aggregation pipeline with `$vectorSearch` stage
- **Indexes**: `PlotSemanticSearch` on `embedding` field (must be created in Atlas UI)
- **Change Streams**: Node backend watches `documents` collection (not Python service)

**AWS S3**:
- **Upload**: Node backend (multer-s3)
- **Download for Ingestion**: Python service (boto3)
- **Pre-signed URLs**: Node backend (for user downloads)

**Redis**:
- **RQ Job Queue**: Python service enqueues, worker processes
- **Rate Limiting**: Python service (token bucket)
- **TLS Handling**: `redis_setup.py` detects `REDIS_TLS_URL` and configures SSL context

---

## Security & Compliance

### Authentication & Authorization

**JWT Implementation**:
- **Secret**: Configured via `JWT_SECRET` env var
- **Storage**: HTTP-only cookies (name: `auth_token`, signed with `COOKIE_SECRET`)
- **Expiration**: 7 days (configurable)
- **Payload**: `{id: userId, email}`
- **Verification**: Every protected route checks JWT via middleware

**Google OAuth Flow**:
1. Frontend receives Google token from OAuth popup
2. Frontend POSTs token to `/api/v1/user/google-auth`
3. Backend verifies token with `google-auth-library.OAuth2Client.verifyIdToken()`
4. Backend finds or creates user with `googleId`
5. Backend issues JWT cookie (same as email/password login)

**Password Security**:
- **Hashing**: bcrypt with default salt rounds (10)
- **Storage**: Only hashed password in MongoDB
- **Validation**: Signup requires 8+ characters, at least one number, one uppercase, one lowercase

**Email Verification**:
- **Token**: Random UUID stored in `emailToken` field with 24-hour expiration
- **Delivery**: Mailgun email with verification link
- **Confirmation**: Link with token → backend verifies and sets `emailVerified: true`

### Data Security

**Document Access Control**:
- **Scoping**: All MongoDB queries include `user_id` filter
- **S3 Keys**: Include user ID in path to prevent cross-user access (NOT CURRENTLY IMPLEMENTED - uses filename only)
- **Pre-signed URLs**: Generated on-demand with 1-hour expiration

**Sensitive Data Handling**:
- **Env Vars**: Secrets stored in Heroku config vars (not committed to Git)
- **Logging**: Avoid logging passwords, tokens, or API keys
- **Error Messages**: Generic errors to frontend (no stack traces in production)

### Security Headers

**Helmet.js Configuration**:
- HSTS enabled: 1 year max age, preload
- Content Security Policy: Default (restrictive)
- XSS Protection: Enabled
- Referrer Policy: Default

**CORS Policy**:
```javascript
cors({
  origin: process.env.CLIENT_ORIGIN,  // Single origin (Vercel frontend)
  credentials: true,  // Allow cookies
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"]
})
```

### Known Security Gaps

**1. S3 Key Structure**
- **Current**: Uses filename only, no user ID in path
- **Risk**: Potential for filename collisions across users (unlikely but possible)
- **Fix**: Prefix S3 keys with `{userId}/{filename}`

**2. Rate Limiting**
- **Current**: Free tier chat limits (25/month) enforced at application level
- **Gap**: No request rate limiting (e.g., signup spam, brute force login)
- **Fix**: Add express-rate-limit middleware for auth endpoints

**3. Email Verification Not Enforced**
- **Current**: Users can access app without verifying email
- **Risk**: Spam accounts, invalid email addresses in DB
- **Fix**: Block access to protected routes until `emailVerified: true`

**4. Google OAuth App Verification**
- **Status**: Not yet verified with Google (required before public launch)
- **Impact**: Users see "unverified app" warning during OAuth flow
- **Fix**: Complete Google OAuth verification process

---

## Testing Strategy

### Current Test Coverage

**Reality**: There are **no automated tests** in this project currently.

**Unit Tests**: None
**Integration Tests**: None
**E2E Tests**: None

**Testing Approach**: Manual testing in production environment before each feature release.

### Manual Testing Checklist (Current Process)

**Pre-Deployment**:
1. Test signup flow (email/password + Google OAuth)
2. Test email verification link
3. Test login flow
4. Upload test PDF, verify ingestion completes
5. Test class chat with uploaded document
6. Test document chat with page-level citations
7. Test special query types (study guide, summary, quote finding)
8. Test citation click-through
9. Test chat session management (create, select, delete)
10. Verify WebSocket connection for document processing updates

**Known Pain Points**:
- Manual testing is time-consuming and error-prone
- Regression bugs can slip through
- No automated way to verify edge cases (e.g., rate limiting, error handling)

### Recommended Testing Strategy (For Future Implementation)

**Unit Tests** (Priority: High):
- `backend/src/controllers/` - Test each controller function in isolation
- `backend/python_scripts/router.py` - Test route detection logic
- `backend/python_scripts/semantic_search.py` - Test individual helper functions (citation renumbering, token estimation, etc.)
- Frontend components - Test UI components with React Testing Library

**Integration Tests** (Priority: High):
- Node → Python API calls (mock Python responses)
- Python → MongoDB queries (use test database)
- Frontend → Node API (mock Node responses)
- WebSocket event flow (mock Socket.io)

**E2E Tests** (Priority: Medium):
- Full user journey: signup → upload → chat → citation click
- Use Playwright or Cypress for browser automation

**Tools**:
- Jest (Node backend unit tests)
- pytest (Python service unit tests)
- React Testing Library (Frontend component tests)
- Playwright or Cypress (E2E tests)

---

## Performance Characteristics

### Response Time Targets (from brief.md)

**Upload & Ingestion**:
- Document upload: Supports PDFs up to 50MB
- Ingestion time: 2-5 minutes for typical 50-200 page documents
- Chunking: Parallel page processing with producer-consumer pattern

**Chat Response**:
- First token: 2-3 seconds (target)
- Full response streaming: 10-15 seconds for typical queries (target)
- **Current Reality**: Simulated streaming adds 1-3s latency before typewriter effect starts

**WebSocket**:
- Connection stability: Must maintain persistent connection for document processing updates
- Keepalive: Python streams bytes every 10s to prevent Heroku 30s timeout

### Actual Performance Bottlenecks

**1. Simulated Streaming Latency**
- **Impact**: 1-3 second delay before response appears (full generation happens server-side first)
- **Location**: `frontend/src/pages/Chat.tsx:486-504`
- **Fix**: Implement true OpenAI streaming

**2. MongoDB Vector Search Latency**
- **Impact**: Can take 1-2 seconds for large `numCandidates` (1000+)
- **Tuning**: Reduce `numCandidates` for faster searches (at cost of recall)
- **Location**: `backend/python_scripts/semantic_search.py:619`

**3. Redis Token Bucket Backoff**
- **Impact**: Up to 10s wait if OpenAI rate limit hit
- **Frequency**: Rare under normal load, more common during bursts
- **Location**: `backend/python_scripts/semantic_search.py:177-188`

**4. Ingestion Pipeline**
- **Impact**: Large PDFs (200+ pages) can take 5-10 minutes
- **Bottleneck**: Embedding API calls (even with async batching)
- **Optimization**: Parallel page parsing helps, but embedding is sequential per batch

### Metrics & Monitoring

**Current State**: Basic logging to stdout (Heroku logs), no structured metrics

**Logged Metrics** (structured JSON via `[METRICS]` tag):
- Ingestion: pages_total, pages_empty, chunks_produced, chunks_inserted, duplicates_skipped, embed_latency_ms_total, insert_retries_total, total_chars, max_chunk_chars
- RAG: route, mode, k, numCandidates, temperature, hits_raw, hits_unique, embed_ms, search_ms, mmr_applied, mmr_ms, chunks_used, context_chars, generate_ms, answer_chars, status
- Summarization: doc_id, method (single vs map_reduce), input_chars, summary_chars

**Gaps**:
- No centralized metrics dashboard (Datadog, New Relic, etc.)
- No alerting on error rates or performance degradation
- No user behavior analytics (query types, citation click-through, session duration)

**Recommendations**:
- Add structured logging with request IDs throughout stack
- Set up Heroku add-on (Papertrail, Logentries) or external service (Datadog)
- Track key business metrics (DAU, queries/user, citation clicks, free-to-paid conversion)

---

## Known Issues Summary (from ROUGH_FIXES.md)

### P0 (Critical - Blocking Launch)

1. **Citation Clustering** - Too many redundant in-text citations
2. **Email Confirmation Flow** - Auto-reload and navigation issues
3. **Google OAuth Verification** - App not verified, shows warning to users

### P1 (High - UX Impact)

4. **Markdown Formula Rendering** - Math displays incorrectly or breaks layout
5. **Mobile UI** - Not blocked, provides broken experience
6. **Simulated Streaming** - Adds latency, not true OpenAI streaming

### P2 (Medium - Enhancement Opportunities)

7. **Follow-Up Query Handling** - Some specific follow-ups not routed correctly
8. **Document Chat Window** - Expands with long formulas
9. **Password Validators** - Toast errors shown on wrong page
10. **Login Attempt Limiting** - No brute force protection
11. **Password Reset** - May be partially implemented, needs verification
12. **Logging Improvements** - Python non-info levels, Node formatting, user/session IDs
13. **Environment Variable Centralization** - `os.getenv` scattered everywhere

### P3 (Low - Future Enhancements)

14. **Study Guide Context Awareness** - "study guide for Markov chains" in class context pulls full class summaries
15. **Suggested Queries** - Generate from document content (5 questions per doc)
16. **Onboarding Walkthrough** - React Joyride implementation
17. **Delete Account** - Not implemented
18. **Rate Limiting Strategy** - Multi-API-key rotation
19. **Additional Document Formats** - DOCX, PowerPoint, OCR for handwritten/images
20. **Graph RAG** - Migrate from vector-only to graph-based knowledge representation
21. **LLM-Based Reranking** - Improve retrieval precision
22. **User Memory/Knowledge Tracking** - Adaptive explanations based on user understanding

---

## Appendix - Useful Commands and Scripts

### Local Development

**Start Node Backend**:
```bash
cd backend
npm run dev  # TypeScript watch + nodemon auto-restart
```

**Start Python Service**:
```bash
cd backend/python_scripts
uvicorn semantic_service:app --reload --port 8000  # Web service
# Separate terminal:
rq worker ingest  # Job queue worker
```

**Start Frontend**:
```bash
cd frontend
npm run dev  # Vite dev server
```

### Build Commands

**Node Backend**:
```bash
npm run build  # tsc → dist/
node dist/index.js  # Manual run
```

**Python Service**:
```bash
gunicorn semantic_service:app -w 4 -k uvicorn.workers.UvicornWorker  # Production server
```

**Frontend**:
```bash
npm run build  # Vite → dist/
npm run preview  # Preview production build locally
```

### Database Operations

**MongoDB Connection**:
```bash
mongosh "mongodb+srv://..." --username <user>
use study_buddy_demo
db.study_materials2.find({user_id: "..."}).limit(5)  # View chunks
db.study_materials2.deleteMany({doc_id: "..."})  # Delete doc chunks
```

**Redis Inspection**:
```bash
redis-cli -h <host> -p <port> --tls  # Connect to Redis
KEYS openai:tpm:*  # View rate limit keys
LRANGE rq:queue:ingest 0 -1  # View job queue
```

### Heroku Commands

**Logs**:
```bash
heroku logs --tail --app class-chat-node  # Node backend
heroku logs --tail --app class-chat-python  # Python service
heroku logs --tail --dyno=worker --app class-chat-python  # Worker only
```

**Config Vars**:
```bash
heroku config --app class-chat-node  # View all env vars
heroku config:set KEY=value --app class-chat-node  # Set var
heroku config:unset KEY --app class-chat-node  # Remove var
```

**Dyno Management**:
```bash
heroku ps --app class-chat-node  # View running dynos
heroku ps:restart --app class-chat-node  # Restart all dynos
heroku ps:scale worker=1 --app class-chat-python  # Scale worker dyno
```

**Rollback**:
```bash
heroku releases --app class-chat-node  # View release history
heroku rollback v123 --app class-chat-node  # Rollback to specific release
```

### Debugging and Troubleshooting

**Common Issues**:

**1. WebSocket Connection Fails**:
- Check CORS origin matches frontend URL exactly
- Verify JWT cookie is being sent (check Network tab → WS handshake headers)
- Confirm SSL cert trusted for local dev (browser warning)
- Test: `wscat -c wss://localhost:3000 -H "Cookie: auth_token=..."`

**2. Document Processing Stuck**:
- Check RQ worker logs: `heroku logs --tail --dyno=worker --app class-chat-python`
- View job queue: Redis `LRANGE rq:queue:ingest 0 -1`
- Check MongoDB `isProcessing` field: `db.documents.find({isProcessing: true})`
- Manually trigger: `heroku run python -c "from load_data import load_pdf_data; load_pdf_data(...)" --app class-chat-python`

**3. OpenAI Rate Limit Errors**:
- Check Redis bucket: `GET openai:tpm:counter`
- View current TPM setting: `heroku config:get OPENAI_TPM_LIMIT`
- Increase limit if under-utilizing tier: `heroku config:set OPENAI_TPM_LIMIT=300000`

**4. MongoDB Vector Search Returns No Results**:
- Verify index exists: Atlas UI → Indexes → `PlotSemanticSearch`
- Check filter matches: Ensure `user_id`, `class_id`, `doc_id` exactly match database values
- Test query: `db.study_materials2.aggregate([{$vectorSearch: {...}}])`

**5. Frontend Cannot Reach Backend**:
- Check `VITE_API_URL` env var matches actual backend URL
- Verify CORS: `curl -H "Origin: https://app.classchatai.com" https://class-chat-node.herokuapp.com/api/v1/user/auth-status`
- Test cookie: Login → inspect → Application → Cookies → verify `auth_token` exists

---

## Additional Notes for AI Agents

### Where to Start for Common Tasks

**Adding a New Route/Endpoint**:
1. Node: Add route in `backend/src/routes/`, controller in `backend/src/controllers/`
2. Python: Add endpoint in `backend/python_scripts/semantic_service.py`
3. Frontend: Add API wrapper in `frontend/src/helpers/api-communicators.ts`
4. Update this doc with new endpoint details

**Modifying RAG Behavior**:
1. Routing logic: `backend/python_scripts/router.py`
2. Retrieval params: `ROUTE_CONFIG` in `backend/python_scripts/semantic_search.py`
3. Prompts: `backend/python_scripts/prompts.json`
4. Generation logic: `backend/python_scripts/semantic_search.py` (main `process_semantic_search` function)

**Fixing Citations**:
1. Citation generation: `backend/python_scripts/semantic_search.py:229-259` (`get_file_citation`)
2. In-text citation formatting: `backend/python_scripts/semantic_search.py:845-863` (prompt skeleton)
3. Citation renumbering: `backend/python_scripts/semantic_search.py:979-1012` (`_renumber_citations`)
4. Frontend rendering: `frontend/src/components/chat/chatItem.tsx`

**Improving Streaming**:
1. Remove typewriter simulation: `frontend/src/pages/Chat.tsx:486-504`
2. Add FastAPI `StreamingResponse` in `backend/python_scripts/semantic_service.py`
3. Update LangChain to use `.stream()` instead of `.invoke()`
4. Frontend: Replace Axios with `fetch` + `ReadableStream` reader

**Adding Tests**:
1. Create `backend/src/__tests__/` for Jest tests
2. Create `backend/python_scripts/tests/` for pytest
3. Add `npm test` and `pytest` commands to CI (when CI created)
4. See "Testing Strategy" section for recommended structure

### Constraints to Respect

**DO NOT**:
- Remove Redis usage from ingestion or chat generation paths (critical for concurrency)
- Change JWT to localStorage (security requirement: HTTP-only cookies)
- Skip email verification flow (required for production)
- Bypass OpenAI rate limiting (will hit API limits and cause 429 errors)
- Deploy without testing citation behavior (core value prop)
- Modify WebSocket auth without thorough testing (easy to break)

**ALWAYS**:
- Check ROUGH_FIXES.md for known issues before starting new work
- Update this architecture doc when making significant changes
- Preserve backward compatibility with existing API contracts
- Consider free tier usage limits in new features (25 chats/month)

---

**End of Document**
