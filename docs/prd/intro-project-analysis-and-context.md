# Intro Project Analysis and Context

## Analysis Source

- **Source**: Comprehensive existing project documentation found at:
  - `/docs/brief.md` (Product brief with MVP scope)
  - `/docs/architecture.md` (Brownfield architecture document v1.0)
  - `/CLAUDE.md` (Agent reference guide)
  - `/ROUGH_FIXES.md` (Enhancement list - raw format)

## Existing Project Overview

### Current Project State

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

## Available Documentation Analysis

✅ **Available Documentation**:
- Tech Stack Documentation (architecture.md - complete tech stack table)
- Source Tree/Architecture (architecture.md - comprehensive file structure + module organization)
- Coding Standards (architecture.md - patterns documented)
- API Documentation (architecture.md - complete endpoint catalog)
- External API Documentation (architecture.md - OpenAI, Mailgun, Google OAuth, AWS S3)
- Technical Debt Documentation (architecture.md - P0-P3 issues cataloged, ROUGH_FIXES.md raw list)
- Product Brief (brief.md - comprehensive MVP scope, success metrics, vision)

**Status**: Comprehensive brownfield documentation exists. No need to run document-project task.

## Enhancement Scope Definition

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

## Goals and Background Context

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

## Change Log

| Change | Date | Version | Description | Author |
|--------|------|---------|-------------|--------|
| Initial PRD | 2025-10-14 | 1.0 | Brownfield enhancement PRD for pre-beta launch | John (PM Agent) |

---
