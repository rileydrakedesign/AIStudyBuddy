# API Design and Integration

## API Integration Strategy

**Authentication**: All new Node API endpoints (except password reset initiation) require JWT authentication via existing `verifyToken` middleware

**Versioning**: All endpoints use `/api/v1/` prefix (existing pattern). No version bump required - all changes are backward compatible

**Error Handling**: Consistent with existing patterns:
- Node API: HTTP status codes (200, 400, 401, 422, 500) + JSON error messages
- Python API: FastAPI HTTPException with status codes + detail messages

**Request Validation**: Node API uses existing validator middleware pattern (Express-validator)

## New API Endpoints

### Node API (Express)

#### Saved Materials Endpoints

**POST /api/v1/materials/save**

**Purpose**: Save a study material (summary, study guide, quote, note) for future reference

**Authentication**: Required (JWT via verifyToken)

**Request**:
```json
{
  "classId": "CS229",
  "type": "study_guide",
  "title": "Markov Chains Study Guide",
  "content": "# Markov Chains\n\n## Key Concepts\n...",
  "sourceDocuments": ["doc-uuid-1", "doc-uuid-2"],
  "sourceQuery": "create a study guide for Markov chains"
}
```

**Response (200)**:
```json
{
  "success": true,
  "materialId": "material-uuid",
  "message": "Study material saved successfully"
}
```

**Response (400)**: Invalid classId (class not found in user.classes)

**Response (422)**: Validation error (missing required fields)

---

**GET /api/v1/materials/:classId**

**Purpose**: Retrieve all saved materials for a specific class

**Authentication**: Required (JWT via verifyToken)

**Query Parameters**:
- `type` (optional): Filter by material type ("summary" | "study_guide" | "quote" | "note")
- `limit` (optional): Pagination limit (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response (200)**:
```json
{
  "success": true,
  "materials": [
    {
      "_id": "material-uuid-1",
      "type": "study_guide",
      "title": "Markov Chains Study Guide",
      "content": "# Markov Chains...",
      "sourceDocuments": ["doc-uuid-1"],
      "sourceQuery": "create a study guide for Markov chains",
      "createdAt": "2025-10-21T12:00:00Z",
      "updatedAt": "2025-10-21T12:00:00Z"
    }
  ],
  "total": 15
}
```

**Response (400)**: Invalid classId

---

**PATCH /api/v1/materials/:materialId**

**Purpose**: Update saved material content or title

**Authentication**: Required (JWT via verifyToken)

**Request**:
```json
{
  "title": "Updated Study Guide Title",
  "content": "# Updated Content..."
}
```

**Response (200)**:
```json
{
  "success": true,
  "message": "Material updated successfully"
}
```

**Response (403)**: User does not own this material

**Response (404)**: Material not found

---

**DELETE /api/v1/materials/:materialId**

**Purpose**: Delete a saved material

**Authentication**: Required (JWT via verifyToken)

**Response (200)**:
```json
{
  "success": true,
  "message": "Material deleted successfully"
}
```

**Response (403)**: User does not own this material

**Response (404)**: Material not found

---

#### Authentication Endpoints

**DELETE /api/v1/user/delete-account**

**Purpose**: Delete user account and all associated data (cascading delete)

**Authentication**: Required (JWT via verifyToken)

**Request**:
```json
{
  "password": "user_password_for_confirmation"
}
```

**Response (200)**:
```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

**Response (401)**: Invalid password confirmation

**Response (500)**: Partial deletion failure (logged for manual cleanup)

**Implementation Note**: Deletes in this order:
1. All chat sessions for user
2. All documents (MongoDB records)
3. All chunks (study_materials2 collection)
4. All S3 files (iterate and delete)
5. All saved materials
6. User record

---

**GET /api/v1/documents/:docId/summary**

**Purpose**: Retrieve pre-generated document summary for viewer toggle

**Authentication**: Required (JWT via verifyToken)

**Response (200)**:
```json
{
  "success": true,
  "summary": "# Document Summary\n\n## Section 1...",
  "hasSummary": true
}
```

**Response (404)**: Document not found or no summary available

**Implementation Note**: Queries MongoDB chunks collection for `{ doc_id: docId, is_summary: true }`, returns first match

---

### Python AI API (FastAPI)

#### Suggested Queries Generation

**POST /api/v1/generate_suggested_queries**

**Purpose**: Generate 5 suggested queries for a newly uploaded document

**Authentication**: None (internal service-to-service call from Node API)

**Request**:
```json
{
  "doc_id": "doc-uuid",
  "user_id": "user-id",
  "text_sample": "First 2000 characters of document text..."
}
```

**Response (200)**:
```json
{
  "queries": [
    "What are the key concepts covered in this document?",
    "Explain the main theorem discussed in section 2",
    "How does this relate to Bayesian inference?",
    "Summarize the experimental results",
    "What are the practical applications mentioned?"
  ]
}
```

**Response (500)**: LLM generation failed (returns empty array as fallback)

**Implementation Note**: Uses OpenAI GPT-4o with prompt: "Generate 5 relevant questions a student might ask about this document: {text_sample}"

---

## Modified API Endpoints

All modifications are **backward compatible** (additive response fields only).

### Node API Modifications

**POST /api/v1/user/login** (MODIFIED - Rate Limiting)

**Existing Behavior Preserved**: Returns JWT token on successful login

**New Behavior**:
- Tracks `user.loginAttempts` on failed login
- Returns 429 status after 5 failed attempts within 15 minutes
- Resets `loginAttempts` on successful login or after 15-minute timeout

**Response (429)** (NEW):
```json
{
  "success": false,
  "error": "Too many login attempts. Please try password reset or wait 15 minutes."
}
```

**Implementation**: Add `rateLimitLogin` middleware before existing login controller

---

**POST /api/v1/documents/upload** (MODIFIED - Response Extension)

**Existing Response (200)** (PRESERVED):
```json
{
  "success": true,
  "docId": "doc-uuid",
  "fileName": "lecture-notes.pdf"
}
```

**New Response (200)** (EXTENDED):
```json
{
  "success": true,
  "docId": "doc-uuid",
  "fileName": "lecture-notes.pdf",
  "suggestedQueries": [
    "What are the main topics?",
    "Explain the key theorem"
  ],
  "fileType": "pdf"
}
```

**Backward Compatibility**: Existing clients ignore new fields

**Implementation**: After Python ingestion completes, call `/api/v1/generate_suggested_queries`, store in `document.suggestedQueries`, return in response

---

### Python API Modifications

**POST /api/v1/semantic_search** (MODIFIED - Response Extension)

**Existing Request (PRESERVED)**:
```json
{
  "user_id": "user-id",
  "class_name": "CS229",
  "doc_id": null,
  "user_query": "Explain Markov chains",
  "chat_history": [],
  "source": "main_app"
}
```

**New Request (OPTIONAL FIELDS)**:
```json
{
  "user_id": "user-id",
  "class_name": "CS229",
  "doc_id": null,
  "user_query": "Explain Markov chains",
  "chat_history": [],
  "source": "main_app",
  "saveAsType": "study_guide"  // OPTIONAL: "study_guide" | "summary" | null
}
```

**Existing Response (PRESERVED)**:
```json
{
  "answer": "Markov chains are...",
  "citations": [
    {
      "href": "s3-presigned-url",
      "text": "Lecture 5, Page 3",
      "docId": "doc-uuid"
    }
  ],
  "chunks": [
    {
      "chunkId": "chunk-uuid",
      "displayNumber": 1,
      "pageNumber": 3
    }
  ]
}
```

**New Response (EXTENDED)**:
```json
{
  "answer": "Markov chains are...",
  "citations": [],
  "chunks": [],
  "suggestedRelatedQueries": [
    "How do Markov chains relate to HMMs?",
    "What are the applications of Markov chains?"
  ],
  "sectionContext": "Chapter 3: Probabilistic Models"
}
```

**Backward Compatibility**: Existing clients ignore new fields

**Implementation**:
- `suggestedRelatedQueries`: Generated via LLM based on query + retrieved chunks
- `sectionContext`: Extracted from chunk metadata (`section_title` field)

---

**POST /api/v1/process_upload** (MODIFIED - File Type Routing)

**Existing Request (PRESERVED)**:
```json
{
  "user_id": "user-id",
  "class_name": "CS229",
  "s3_key": "timestamp_filename.pdf",
  "doc_id": "doc-uuid"
}
```

**New Request (EXTENDED)**:
```json
{
  "user_id": "user-id",
  "class_name": "CS229",
  "s3_key": "timestamp_filename.docx",
  "doc_id": "doc-uuid",
  "file_type": "docx"  // NEW: "pdf" | "docx" | "pptx" | "image"
}
```

**Response**: (Unchanged)

**Implementation**: Routes to appropriate processor (docx_processor, pptx_processor, ocr_processor) based on `file_type`

---
