# Component Architecture

## New Components

The enhancement introduces components across all three service tiers. All new components integrate with existing architecture by following established patterns (service boundaries, REST/WebSocket communication, existing design systems).

### Frontend Components (React)

#### Enhanced Sidebar Components

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

#### Special Response Formatting Components

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

#### Mobile Blocking Component

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

#### Document Viewer Enhancement

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

### Backend (Node) Components

#### Saved Materials Module

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

#### Authentication Enhancement Module

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

#### Rate Limiting Middleware

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

### Backend (Python) Components

#### Centralized Configuration Module

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

#### Document Processing Modules

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

#### RAG Pipeline Enhancements

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
