# Coding Standards

## Existing Standards Compliance

All new code must follow the established patterns observed in the existing codebase.

## Frontend (React/TypeScript)

### Code Style

**Import Organization**:
```typescript
// 1. React imports
import React, { useState, useEffect } from "react";

// 2. Third-party library imports (grouped)
import {
  Box,
  Button,
  Dialog,
  TextField,
} from "@mui/material";
import axios from "axios";

// 3. Local imports (hooks, contexts, helpers, components)
import { useAuth } from "../../context/authContext";
import { saveMaterial } from "../../helpers/api-communicators";
import SpecialResponseCard from "../chat/SpecialResponseCard";

// 4. CSS/asset imports
import "katex/dist/katex.min.css";
```

**Component Structure**:
```typescript
// Helper functions BEFORE component definition
function extractBlocks(message: string) {
  // Helper logic
}

// Component definition (default export)
export default function ClassDropdown({ classes, onClassSelect }: Props) {
  // 1. Hooks (useState, useEffect, custom hooks)
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const { user } = useAuth();

  // 2. Event handlers
  const handleClassChange = (className: string) => {
    setSelectedClass(className);
    onClassSelect(className);
  };

  // 3. useEffect hooks
  useEffect(() => {
    // Side effects
  }, [dependencies]);

  // 4. JSX return
  return (
    <Box>
      {/* Component UI */}
    </Box>
  );
}
```

**Naming Conventions**:
- **Components**: `PascalCase` (e.g., `ClassDropdown`, `SaveMaterialModal`)
- **Functions/Variables**: `camelCase` (e.g., `handleClassChange`, `selectedClass`)
- **Constants**: `SCREAMING_SNAKE_CASE` (e.g., `COOKIE_NAME`, `MAX_FILE_SIZE`)
- **Interfaces**: `PascalCase` with `I` prefix (e.g., `IClassDropdownProps`)

**Error Handling**:
```typescript
// Async operations with try/catch
const fetchMaterials = async () => {
  try {
    const response = await getMaterialsByClass(classId);
    setMaterials(response.materials);
  } catch (error) {
    console.error("Failed to fetch materials:", error);
    toast.error("Failed to load materials");
  }
};
```

### Material UI Usage

**Theme Consistency**:
```typescript
import { useTheme } from "@mui/material/styles";

const theme = useTheme();
<Box sx={{
  color: theme.palette.primary.main,       // ✅ Use theme
  padding: theme.spacing(2),               // ✅ Use spacing
  borderRadius: '8px',                     // ✅ OK for custom values
}}>
```

### TypeScript Usage

**Type Annotations**:
```typescript
// Props interfaces
interface SaveMaterialModalProps {
  open: boolean;
  type: "study_guide" | "summary" | "quote";
  content: string;
  onClose: () => void;
  onSave: (title: string) => Promise<void>;
}

// Function return types (explicit for exported functions)
export const saveMaterial = async (
  data: SaveMaterialRequest
): Promise<SaveMaterialResponse> => {
  // Implementation
};

// useState with types
const [materials, setMaterials] = useState<ISavedMaterial[]>([]);
```

**Avoid `any`**:
```typescript
// ❌ Avoid
const handleClick = (event: any) => { ... }

// ✅ Use specific types
const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => { ... }
```

## Backend (Node/TypeScript)

### Code Style

**Controller Pattern**:
```typescript
// Export named async functions
export const saveMaterial = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { classId, type, title, content } = req.body;
    const userId = (res as any).locals.jwtData?.id;

    // Validation
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // Business logic
    const material = new SavedMaterial({
      userId,
      classId,
      type,
      title,
      content,
    });
    await material.save();

    // Response
    return res.status(200).json({
      success: true,
      materialId: material._id
    });
  } catch (error: any) {
    // Logging (use Pino logger injected via middleware)
    (req as any).log?.error(error, "saveMaterial error");
    return res.status(500).json({
      message: "Failed to save material"
    });
  }
};
```

**Error Handling**:
```typescript
// Always wrap async operations in try/catch
try {
  const result = await someAsyncOperation();
  return res.status(200).json({ result });
} catch (error: any) {
  (req as any).log?.error(error, "Operation failed");
  return res.status(500).json({ message: "Operation failed" });
}
```

**Logging**:
```typescript
// Use Pino logger (injected via pino-http middleware)
(req as any).log?.info({ userId }, "User action");
(req as any).log?.error(error, "Error context");

// NOT console.log
console.log("Debug info");  // ❌ Avoid in production code
```

## Backend (Python)

### Code Style

**Import Organization**:
```python
# 1. Standard library imports
import os
import re
import json
from pathlib import Path
from typing import List, Tuple, Optional

# 2. Third-party imports
from fastapi import FastAPI, HTTPException
from pymongo import MongoClient
import openai

# 3. Local imports
from config import OPENAI_API_KEY, ENABLE_OCR
from logger_setup import log
from docx_processor import process_docx
```

**Function Definitions**:
```python
# Type hints for parameters and return values
def process_semantic_search(
    user_id: str,
    class_name: str,
    doc_id: str,
    user_query: str,
    chat_history: List[dict],
    source: str
) -> dict:
    """
    Process semantic search query with RAG pipeline.

    Args:
        user_id: MongoDB user ObjectId as string
        class_name: Class identifier or "null"
        doc_id: Document UUID or "null"
        user_query: User's natural language query
        chat_history: List of previous chat messages
        source: "main_app" or "chrome_extension"

    Returns:
        Dictionary with answer, citations, and chunks
    """
    # Implementation
    pass
```

**Naming Conventions**:
- **Functions**: `snake_case` (e.g., `process_semantic_search`, `extract_section_metadata`)
- **Variables**: `snake_case` (e.g., `user_query`, `section_title`)
- **Constants**: `SCREAMING_SNAKE_CASE` (e.g., `OPENAI_API_KEY`, `MAX_TOKENS`)
- **Classes**: `PascalCase` (e.g., `SearchRequest`, `DocumentProcessor`)
- **Private functions**: Leading underscore `_private_function()`

**Error Handling**:
```python
# Try/except with specific exceptions
try:
    result = risky_operation()
except ValueError as e:
    log.error(f"Invalid value: {e}")
    raise HTTPException(status_code=400, detail=str(e))
except Exception as e:
    log.exception(e)  # Logs full traceback
    raise HTTPException(status_code=500, detail="Operation failed")
```

**Logging** (Loguru):
```python
from logger_setup import log

# Structured logging with context
log.info("Processing query", user_id=user_id, query=user_query)
log.error("Failed to generate embeddings", error=str(e))
log.exception(e)  # Includes full traceback
```

**Configuration** (New Pattern with config.py):
```python
# ❌ OLD: Scattered os.getenv()
openai_key = os.getenv("OPENAI_API_KEY")
mongo_uri = os.getenv("MONGO_CONNECTION_STRING")

# ✅ NEW: Import from centralized config
from config import OPENAI_API_KEY, MONGO_CONNECTION_STRING, ENABLE_OCR

# All env vars accessed through config module
if ENABLE_OCR:
    from ocr_processor import process_image_ocr
```

## Critical Integration Rules

### Optional Field Handling

**Mongoose Field Access**:
```typescript
// Handle optional fields gracefully
const suggestedQueries = document.suggestedQueries ?? [];
const fileType = document.fileType ?? "pdf";

// Don't assume fields exist
if (user.loginAttempts && user.loginAttempts >= 5) {
  // Rate limit logic
}
```

**Python MongoDB Field Access**:
```python
# Use dict.get() with defaults for optional fields
section_title = chunk.get("section_title", "Unknown Section")
section_hierarchy = chunk.get("section_hierarchy", 0)
```

### Logging with User Context

**Include Context in All Logs**:

Frontend:
```typescript
console.error("Failed to fetch materials", { userId, classId, error });
```

Node:
```typescript
(req as any).log?.error({ userId, materialId, error }, "Delete material failed");
```

Python:
```python
log.error("Vector search failed", user_id=user_id, class_name=class_name, error=str(e))
```

---
