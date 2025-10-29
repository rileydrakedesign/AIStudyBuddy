# Data Models and Schema Changes

## New Data Models

### Saved Materials Collection (NEW)

**Purpose**: Store user-saved study materials (summaries, study guides, quotes, notes) for persistence and editing.

**Integration**: Standalone collection with references to existing user and class data.

```typescript
// backend/src/models/savedMaterial.ts

interface ISavedMaterial extends Document {
  userId: mongoose.Types.ObjectId;      // Reference to users collection
  classId: string;                      // Class identifier (from user.classes)
  type: string;                         // "summary" | "study_guide" | "quote" | "note"
  title: string;                        // User-provided or auto-generated
  content: string;                      // Markdown content
  sourceDocuments: string[];            // Array of docIds used to generate
  sourceQuery: string;                  // Original query that generated this
  isEditable: boolean;                  // Default true
  createdAt: Date;                      // Auto-generated
  updatedAt: Date;                      // Auto-generated
}

const savedMaterialSchema = new Schema<ISavedMaterial>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,                        // Index for fast userId queries
  },
  classId: {
    type: String,
    required: true,
    index: true,                        // Index for fast classId queries
  },
  type: {
    type: String,
    enum: ["summary", "study_guide", "quote", "note"],
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  sourceDocuments: {
    type: [String],
    default: [],
  },
  sourceQuery: {
    type: String,
    default: "",
  },
  isEditable: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,                     // Auto-generates createdAt, updatedAt
});

// Compound index for efficient class-scoped queries
savedMaterialSchema.index({ userId: 1, classId: 1 });

export default mongoose.model<ISavedMaterial>("SavedMaterial", savedMaterialSchema);
```

**Relationships**:
- **With Existing**: References `users._id` (foreign key) and `user.classes[].name` (classId string)
- **With New**: Standalone collection, no relationships with other new models

**Key Design Decisions**:
- **Why separate collection vs. embedding in User?** - Saved materials can grow large (100+ items per power user), embedding would bloat user documents and slow queries
- **Why classId string vs. ObjectId?** - Classes are embedded in User schema (not separate collection), so we reference by name string (matches existing pattern in `chatSession.assignedClass`)
- **Why store sourceQuery?** - Enables "regenerate" feature post-beta (re-run same query with updated documents)

## Schema Extensions (Existing Collections)

All changes are **additive only** (no breaking changes, no required fields).

### User Collection Extensions

**Existing Fields Confirmed**:
```typescript
// Already exists in user.ts:
passwordResetToken: { type: String },
passwordResetExp:   { type: Date },
passwordResetSentAt:{ type: Date },
```

**New Fields to Add**:
```typescript
// ADD to backend/src/models/user.ts

/* authentication security */
loginAttempts: {
  type: Number,
  default: 0,
  required: false,
},
loginAttemptResetAt: {
  type: Date,
  required: false,
},

/* usage tracking */
cumulativeDocumentUploads: {
  type: Number,
  default: 0,
  required: false,
  // Tracks total uploads across lifetime (doesn't decrease on delete)
  // Used for FR12.1: Free plan document count persists across deletions
},
```

**Migration Strategy**:
- Existing users without these fields: Defaults apply (`loginAttempts: 0`, `cumulativeDocumentUploads: 0`)
- No database migration script required (Mongoose handles defaults on read)
- Code checks: `user.loginAttempts ?? 0` for safety

### Document Collection Extensions

**New Fields to Add**:
```typescript
// ADD to backend/src/models/documents.ts

suggestedQueries: {
  type: [String],
  required: false,
  default: [],
  // 5 LLM-generated queries per document (FR5.1)
  // Generated during ingestion, stored for display in chat UI
},

sectionMetadata: {
  type: [{
    sectionTitle: { type: String, required: true },
    chunkIds: { type: [String], required: true },
    hierarchy: { type: Number, required: true },  // 1=chapter, 2=section, 3=subsection
  }],
  required: false,
  default: [],
  // Extracted during PDF chunking (FR6.1-FR6.2)
  // Used for hierarchical study guide organization
},

fileType: {
  type: String,
  enum: ["pdf", "docx", "pptx", "image"],
  required: false,
  default: "pdf",
  // Tracks document format for processing pipeline routing (FR14)
},
```

**Migration Strategy**:
- Existing documents: `suggestedQueries: []`, `sectionMetadata: []`, `fileType: "pdf"` (defaults)
- New uploads: Populated during ingestion (Python service)
- No re-ingestion required for existing documents (new features apply only to new uploads)
- Optional backfill: Admin script can generate suggested queries for existing docs post-beta

### Chunk Collection Extensions (Python - study_materials2)

**Note**: This collection is managed by the Python service (pymongo), not Mongoose. Schema is informal (MongoDB is schemaless), but we document expected fields.

**Existing Fields** (from Python codebase analysis):
```python
{
  "text": str,                 # Chunk content
  "embedding": List[float],    # Vector embedding (1536 dimensions for text-embedding-3-small)
  "file_name": str,            # Original document filename
  "title": str,                # Document title
  "author": str,               # Document author (if available)
  "user_id": str,              # User ObjectId as string
  "class_id": str,             # Class name
  "doc_id": str,               # Document UUID
  "page_number": int,          # PDF page number
  "is_summary": bool,          # True if this chunk is a document summary
  "chunk_hash": str,           # SHA256 hash for deduplication
}
```

**New Fields to Add**:
```python
# ADD to Python ingestion pipeline (load_data.py)

{
  "section_title": str,        # Extracted heading/section name (FR6.1)
  "section_hierarchy": int,    # Heading level 1-6 (1=H1, 2=H2, etc.) (FR6.1)
  # Defaults: "Unknown Section" and 0 if extraction fails
}
```

**Migration Strategy**:
- Existing chunks: Missing these fields (Python code checks `chunk.get("section_title", "Unknown Section")`)
- New chunks: Populated during ingestion via PyMuPDF heading extraction
- No re-embedding required (embedding is based on `text`, not metadata)
- Atlas Vector Search index unchanged (metadata fields don't affect vector index)

## Schema Integration Strategy

### Backward Compatibility Guarantees

✅ **Zero Breaking Changes**:
1. **Optional fields only** - All new fields have `required: false` or default values
2. **Existing queries work unchanged** - `User.findOne({ email })` returns user with or without new fields
3. **Existing documents readable** - Frontend/backend handle `null`/`undefined` gracefully with fallbacks

✅ **Deployment Sequence**:
1. Deploy backend with extended schemas → Existing data continues to work
2. Deploy Python with chunk extensions → Existing chunks queried without errors
3. Deploy frontend with new UI → Handles missing fields with default rendering

✅ **Rollback Safety**:
- Revert backend code → New fields ignored (MongoDB returns them, code doesn't use them)
- Revert Python code → New chunk fields ignored (queries still work)
- No data corruption risk (additive changes can't break existing documents)

### Index Management

**New Indexes** (for query performance):

```typescript
// SavedMaterial collection
savedMaterialSchema.index({ userId: 1, classId: 1 });  // Compound index for class-scoped queries
savedMaterialSchema.index({ userId: 1 });              // Single-field index for user-scoped queries
savedMaterialSchema.index({ classId: 1 });             // Single-field index for class-scoped queries
```

**Existing Indexes Preserved**:
- User collection: `email` unique index (unchanged)
- Document collection: No indexes currently (may add `userId` index for performance, non-breaking)
- ChatSession collection: `_id` unique index (unchanged)
- study_materials2 (Python): Atlas Vector Search index `PlotSemanticSearch` (unchanged)

**Index Creation Strategy**:
- MongoDB creates indexes in background (non-blocking)
- Indexes can be created post-deployment (not required for launch)
- Monitor query performance, add indexes as needed

---
