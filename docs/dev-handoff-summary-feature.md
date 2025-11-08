# Dev Handoff: Document Summary Feature (Story 0.3)

## Status: IN PROGRESS - BLOCKED

**Date**: 2025-11-03
**Previous Dev**: Claude Agent
**Issue**: 404 error when fetching document summaries

---

## Objective

Implement the PDF/Summary toggle feature in DocumentChat component that allows users to switch between viewing the PDF and viewing an AI-generated summary of the document.

**Story Reference**: `docs/stories/0.3.content-display-enhancements.md`

---

## Current State

### ✅ Completed
1. **Toggle UI (Frontend)**: Successfully implemented PDF/Summary toggle buttons in DocumentChat component
   - Material UI ToggleButtonGroup with PDF and Summary buttons
   - View mode state management (defaults to "pdf")
   - Toggle state resets to PDF when switching documents
   - Conditional rendering to show/hide PDF viewer vs summary view

2. **Backend API Infrastructure**: Created complete backend endpoint
   - Model: `backend/src/models/studyMaterial.ts`
   - Controller: `backend/src/controllers/document_controllers.ts` (getDocumentSummary function)
   - Route: `backend/src/routes/document_routes.ts` (GET /:docId/summary)
   - Frontend API helper: `frontend/src/helpers/api-communicators.ts` (getDocumentSummary function)

3. **Frontend Summary Display**: Implemented summary fetching and rendering
   - Fetches summary when user switches to Summary view
   - Loading state with Loader component
   - Error handling with user-friendly messages
   - ReactMarkdown rendering for formatted summary display

### ❌ Current Issue

**Problem**: GET request to `/api/v1/documents/:docId/summary` returns 404 "Summary not found for this document"

**Error in console**:
```
Failed to load resource: the server responded with a status of 404 (Not Found)
GET https://localhost:3000/api/v1/documents/6907fa46596f451e8232b10f/summary
```

---

## Database Schema Investigation

### Documents Collection (`test.documents`)
```javascript
{
  _id: ObjectId("6907fa46596f451e8232b10f"),  // MongoDB ObjectId
  userId: ObjectId("..."),
  fileName: "example.pdf",
  docId: "uuid-string",  // UUID generated with randomUUID()
  s3Key: "...",
  className: "...",
  // ... other fields
}
```

### Study Materials Collection (`study_buddy_demo.study_materials2`)

**Sample Summary Document** (from `SAMPLE_SUMMARY.md`):
```javascript
{
  _id: ObjectId("683e84b6b6ce6d44d6bd55b2"),
  text: "SUMMARY: This document serves as...",  // ⚠️ field is 'text', not 'content'
  embedding: Array(1536),
  file_name: "1748927275777_160A_textbook.pdf",
  title: "Introduction to Stochastic Processes with R",
  author: "Robert P. Dobrow",
  user_id: "682eac03cf4b75663049cd7a",  // ⚠️ String, not ObjectId
  class_id: "test",
  doc_id: "683e8337f1e5a2d59f8ac5ce",  // ⚠️ String, references documents._id
  level: "section",
  is_summary: true,
  page_number: 3,
  parent_id: "1e275754-08d6-4e99-a90b-caa45ee0cc19"
}
```

**Key Schema Insights**:
- `user_id`: Stored as **string** (not ObjectId)
- `doc_id`: Stored as **string** (not ObjectId), references the document's MongoDB `_id` (not UUID `docId`)
- `text`: The actual summary content (not `content`)
- `is_summary`: Boolean flag set to `true` for summaries

---

## Files Modified

### Backend

1. **`backend/src/models/studyMaterial.ts`** (CREATED)
   - Mongoose model for study_materials2 collection
   - Schema fields: `user_id` (string), `doc_id` (string), `is_summary` (boolean), `text` (string)
   - Collection: "study_materials2"

2. **`backend/src/controllers/document_controllers.ts`** (MODIFIED)
   - Added `getDocumentSummary` controller function (lines 364-437)
   - Handles both MongoDB _id and UUID docId for document lookup
   - Queries study_materials2 for summaries
   - Returns summary content with timestamps

3. **`backend/src/routes/document_routes.ts`** (MODIFIED)
   - Added route: `GET /:docId/summary` (line 115)
   - Protected with `verifyToken` middleware
   - Calls `getDocumentSummary` controller

### Frontend

4. **`frontend/src/components/chat/DocumentChat.tsx`** (MODIFIED)
   - Added imports: ToggleButtonGroup, ToggleButton, ReactMarkdown, getDocumentSummary
   - Added state: `viewMode`, `summaryContent`, `summaryLoading`, `summaryError`
   - Added useEffect to fetch summary when switching to summary view
   - Added ToggleButtonGroup in PDF controls header
   - Added conditional rendering for PDF vs Summary view
   - Summary view styled with ReactMarkdown

5. **`frontend/src/helpers/api-communicators.ts`** (MODIFIED)
   - Added `getDocumentSummary` API function
   - Endpoint: `/documents/${docId}/summary`

---

## Current Implementation Details

### Controller Query (document_controllers.ts:411-415)
```typescript
const summary = await StudyMaterial.findOne({
  user_id: userId,  // user_id is a string in DB
  doc_id: document._id.toString(),  // doc_id references the document's MongoDB _id
  is_summary: true,
});
```

### Response Format (document_controllers.ts:423-430)
```typescript
return res.status(200).json({
  success: true,
  summary: {
    content: summary.text,  // field is 'text' in DB, not 'content'
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
  },
});
```

### Frontend Expected Response
```typescript
{
  success: true,
  summary: {
    content: string,  // Maps to DB 'text' field
    createdAt: Date,
    updatedAt: Date
  }
}
```

---

## Known Issues & Questions

### Issue 1: 404 Error
Despite the query using the correct field names (`user_id`, `doc_id`, `is_summary`), the endpoint returns 404.

**Debugging Added**:
- Logging in controller to trace document lookup and summary search
- Check `req.log` output to see where the query fails

**Possible Causes**:
1. No summary exists in DB for the test document
2. Data type mismatch (despite using strings)
3. Database connection issue (wrong database?)
4. Field name still incorrect

### Question 1: Response Field Naming
Current implementation maps DB field `text` to API response field `content`:
```typescript
summary: {
  content: summary.text,  // Mapping 'text' → 'content'
}
```

**User comment**: "the field is not summary.text, it is just text. Why are you appending a summary first"

**Clarification Needed**:
- Should the API return `text` instead of `content`?
- Should the response structure be `{ text: summary.text }` instead of `{ content: summary.text }`?
- Or is this referring to accessing the field from the query result?

---

## Reference Code

### How Summaries are Created (Python)
`backend/python_scripts/load_data.py:421-433`
```python
if summary_text:
    summary_meta = {
        "file_name":  file_name,
        "title":      file_name,
        "author":     "Unknown",
        "user_id":    user_id,      # String
        "class_id":   class_name,
        "doc_id":     doc_id,       # String (MongoDB _id)
        "is_summary": True,
        "page_number": None,
    }
    MongoDBAtlasVectorSearch.from_texts(
        [summary_text], embeddings, metadatas=[summary_meta], collection=collection
    )
```

### How Summaries are Deleted
`backend/src/controllers/document_controllers.ts:310-312`
```typescript
const db = mongoose.connection.useDb("study_buddy_demo");
const studyMaterialsCollection = db.collection("study_materials2");
await studyMaterialsCollection.deleteMany({ doc_id: documentId });
```

### Existing Chunk Model
`backend/src/models/chunkModel.ts:6-22`
```typescript
const chunkSchema = new Schema<IChunk>({
  text: { type: String },
  embedding: { type: [Number] },
  file_name: { type: String },
  title: { type: String },
  author: { type: String },
  user_id: { type: String },      // String, not ObjectId
  class_id: { type: String },
  doc_id: { type: String },       // String, not ObjectId
  is_summary: { type: Boolean },
  page_number: { type: Number },
}, {
  collection: "study_materials2",
});
```

---

## Next Steps (Suggestions - Not Assumptions)

1. **Verify Data Exists**: Check if the test document actually has a summary in the database
   - Query MongoDB directly: `db.study_materials2.findOne({ doc_id: "6907fa46596f451e8232b10f", is_summary: true })`
   - If no summary exists, upload a new document and wait for processing to complete

2. **Check Backend Logs**: Review the debug logging output to see:
   - Was the document found? (check "Found document, searching for summary" log)
   - Was the summary found? (check "Summary search result" log with `found: true/false`)

3. **Verify Database Connection**: Ensure the query is hitting the correct database
   - Check if `mongoose.connection.useDb("study_buddy_demo")` is connecting properly
   - Verify the StudyMaterial model is using the correct database

4. **Consider Direct Collection Query**: If Mongoose model isn't working, try raw collection query:
   ```typescript
   const db = mongoose.connection.useDb("study_buddy_demo");
   const studyMaterialsCollection = db.collection("study_materials2");
   const summary = await studyMaterialsCollection.findOne({
     user_id: userId,
     doc_id: document._id.toString(),
     is_summary: true,
   });
   ```

5. **Clarify Response Structure**: Confirm with stakeholders whether API should return:
   - `{ content: summary.text }` (current implementation)
   - `{ text: summary.text }` (direct field mapping)

6. **Test with Known Good Data**: Use the sample document from SAMPLE_SUMMARY.md:
   - doc_id: "683e8337f1e5a2d59f8ac5ce"
   - user_id: "682eac03cf4b75663049cd7a"
   - Verify this specific query works

---

## Build & Run

### Backend
```bash
cd /Users/rileydrake/Desktop/AIStudyBuddy/backend
npm run dev  # Compiles TS and runs with nodemon
```

### Frontend
```bash
cd /Users/rileydrake/Desktop/AIStudyBuddy/frontend
npm run dev  # Runs Vite dev server on port 5173
```

---

## Testing Checklist

- [ ] Verify summary exists in DB for test document
- [ ] Check backend logs for query results
- [ ] Test with sample document from SAMPLE_SUMMARY.md
- [ ] Confirm response structure with frontend requirements
- [ ] Test toggle functionality after summary loads
- [ ] Verify ReactMarkdown renders summary correctly
- [ ] Test error handling (no summary found)
- [ ] Test loading states

---

## Additional Context

- **Story Completion**: PDF/Summary toggle UI is complete and functional. Only the summary data fetching is blocked.
- **No Schema Changes Allowed**: User explicitly stated "DO NOT EDIT ANY SCHEMAS IN THE CONTROLLERS"
- **Study Guide Features Deferred**: Story 0.3 includes special formatting for study guides/summaries/quotes, but user requested to skip these features for now

---

## Contact/Questions

For questions about:
- Database schema: Check `SAMPLE_SUMMARY.md` and `backend/python_scripts/load_data.py`
- Existing patterns: See `deleteDocument` function (uses raw collection query)
- Model definition: See `backend/src/models/chunkModel.ts`

---

*🤖 Generated with [Claude Code](https://claude.com/claude-code)*

*Co-Authored-By: Claude <noreply@anthropic.com>*
