# Introduction

This document outlines the architectural approach for enhancing **Class Chat AI** with **comprehensive pre-beta refinements** spanning RAG quality, study material generation, document processing, UI/UX polish, authentication hardening, and infrastructure improvements. Its primary goal is to serve as the guiding architectural blueprint for AI-driven development of new features while ensuring seamless integration with the existing system.

## Relationship to Existing Architecture

This document supplements existing project architecture documentation (CLAUDE.md) by defining how 40+ enhancement features across 6 major themes will integrate with current systems. Where conflicts arise between new and existing patterns, this document provides guidance on maintaining consistency while implementing enhancements.

## Existing Project Analysis

### Current Project State

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

### Available Documentation

- **CLAUDE.md** - System architecture reference with service boundaries, core flows, integration surfaces, and change guardrails
- **docs/prd.md** - Comprehensive brownfield PRD detailing 40+ enhancements across 6 themes (RAG, study materials, document processing, UI/UX, auth, infrastructure)
- **docs/brief.md** - Product brief with MVP scope and vision (referenced in PRD)
- **Frontend codebase analysis** - Component structure with React hooks, Material UI design system, WebSocket client integration
- **Backend codebase analysis** - Express routes, MongoDB models, S3 upload handlers, JWT middleware, Socket.IO server
- **Python codebase analysis** - FastAPI routes, LangChain RAG pipeline, semantic router, chunking logic, embedding generation

### Identified Constraints

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

## Change Log

| Change | Date | Version | Description | Author |
|--------|------|---------|-------------|--------|
| Initial Architecture Document | 2025-10-22 | 1.0 | Brownfield enhancement architecture for pre-beta launch | Winston (Architect Agent) |

---
