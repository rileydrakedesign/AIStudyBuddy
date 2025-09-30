# claude.md

**Purpose**
Reference for Claude code agents working on **Class Chat AI**. Captures confirmed architecture, responsibilities, and safe-change guardrails. Avoids assumptions.

---

## 1) System Overview

* **Product**: Class Chat AI — study assistant that answers questions from user-uploaded materials with inline citations and document references.
* **Frontend**: React + Vite + Material UI; realtime **WebSockets** for streaming responses.
* **Backend API**: Node.js / Express (auth, REST, orchestration).
* **AI Service**: Python **FastAPI** (RAG with LangChain + OpenAI GPT-4o).
* **Vector Store**: MongoDB **Atlas Vector Search**.
* **Object Storage**: AWS **S3** (documents).
* **Queue/State**: **Redis** (used for **ingestion** and **chat generation**).
* **Hosting**: Vercel (frontend), Heroku (Node + FastAPI).

---

## 2) Deployments (production)

* **Node API (Heroku)**
  App: `class-chat-node-8a0ef9662b5a`
  Base URL: `https://class-chat-node-8a0ef9662b5a.herokuapp.com/`

* **Python AI (Heroku)**
  App: `class-chat-python-f081e08f29b8`
  Base URL: `https://class-chat-python-f081e08f29b8.herokuapp.com/`

*(Frontend is deployed on Vercel; project repo root: `AIStudyBuddy`.)*

---

## 3) Auth & Session

* **Mechanism**: **JWT** in **HTTP-only cookies** (set/validated by Node API).

---

## 4) Core Flows

### 4.1 Upload → Ingest → Index

1. User uploads document(s) via the frontend.
2. **Node API** handles the upload route and **triggers ingestion** on the **Python FastAPI** service.
3. **Python** performs **chunking and embedding**, writes vectors/metadata to **MongoDB Atlas Vector Search**.
4. **Redis** participates in ingestion (job/state).

### 4.2 Class-Scoped Chat (multi-document)

1. Frontend initiates a chat scoped to a class.
2. **Node API** coordinates with **Python** for retrieval/generation.
3. **Redis** participates in **chat generation**.
4. Response streams to the frontend over **WebSockets** with **inline citations** and **reference list**.

### 4.3 Document-Scoped Chat

* Same as above, but retrieval is constrained to a single document; citation clicks jump to the source page in the document viewer.

---

## 5) Services & Responsibilities

### 5.1 Frontend (Vercel)

* UI for classes, uploads, chat.
* Renders streaming tokens over **WebSockets**.
* Displays inline citations; clicking a citation jumps to the exact page in the document viewer.

### 5.2 Node API (Heroku)

* Auth (JWT HTTP-only cookies).
* REST endpoints for user/class/document operations.
* **Upload route** → **calls FastAPI** to start ingestion.
* Orchestrates chat generation with the Python service.
* Uses **Redis** in ingestion/chat paths.

### 5.3 Python AI (Heroku)

* **Ingestion**: **chunking + embedding** (triggered by Node).
* **RAG**: retrieval against **MongoDB Atlas Vector Search**; generation with **OpenAI GPT-4o**.
* Participates in **chat generation**, using **Redis**.

---

## 6) Data & Storage

* **MongoDB Atlas Vector Search**: vectorized chunks + metadata for retrieval.
* **AWS S3**: original uploaded documents (at rest).
* **Redis**: queues/state for ingestion and chat generation.

---

## 7) Integration Surfaces (what is known)

> Endpoint paths and exact payload schemas are defined in the codebase. Use those definitions directly.

* **Frontend ↔ Node API**

  * Auth via JWT cookies.
  * Document/class CRUD, chat initiation.
  * Streaming consumption over **WebSockets**.

* **Node API ↔ Python AI**

  * **Ingestion trigger** (upload route in Node → FastAPI).
  * Chat generation coordination.
  * **Redis** used across these flows.

* **Python AI ↔ MongoDB Atlas / S3 / Redis**

  * Writes embeddings and reads for retrieval (Atlas).
  * Reads/writes documents to S3 as applicable.
  * Uses Redis for ingestion/chat jobs/state.

---

## 8) Guardrails for Code Changes

1. **Do not change service boundaries** (Frontend ↔ Node ↔ Python) without explicit approval.
2. **Keep ingestion in Python**; it is triggered by **Node → FastAPI**.
3. **Preserve JWT HTTP-only cookie auth** semantics handled by Node.
4. **Do not remove or bypass Redis** usage in **ingestion** or **chat generation** paths.
5. **Keep streaming over WebSockets** intact for chat UX.
6. **Respect existing request/response contracts**; modify only with coordinated changes across caller/callee.

---

## 9) Repository Map (starting points)

> The agent has full code access. Use these directories/files to locate concrete contracts, schemas, and logic.

* `frontend/` — chat UI, upload UI, citation rendering, WebSocket client, document viewer.
* `backend/` — Express routes (auth, upload, class/doc CRUD, chat orchestration), JWT cookie handling, calls to FastAPI, Redis integration.
* **Python service directory** — FastAPI app, ingestion pipeline (chunking/embedding), RAG retrieval/generation, Redis integration.

---

## 10) Known/Unspecified in this doc

* Exact endpoint paths, payload shapes, error codes, and streaming message formats.
* Redis queue names and job schemas.
* Detailed MongoDB index definitions and document metadata fields.
* Specific encryption settings and operational runbooks.

Use the repository code to source these details when implementing changes.
