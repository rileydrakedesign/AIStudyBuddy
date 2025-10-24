# Tech Stack

## Existing Technology Stack

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

## New Technology Additions

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
