# Project Brief: Class Chat AI

## Executive Summary

**Class Chat AI** is an AI-powered study assistant currently in pre-launch MVP state that enables students to upload course materials (PDFs) and receive accurate answers to their questions with inline citations linking directly to source content. Built on a modern RAG (Retrieval Augmented Generation) architecture with MongoDB Atlas Vector Search and OpenAI GPT-4o, the system is fully functional end-to-end with user authentication, class-based document organization, real-time streaming responses via WebSockets, and precise citation tracking.

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

