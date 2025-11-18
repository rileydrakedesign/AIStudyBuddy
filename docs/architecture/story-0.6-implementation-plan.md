# Story 0.6: Step-by-Step Implementation Plan

**Purpose**: Break down implementation into reviewable steps with clear checkpoints.

**Created**: 2025-11-14
**Status**: Ready for Implementation

---

## Implementation Approach

**Strategy**: Implement in 4 phases with review checkpoints after each phase.

**Review Points**:
- After each phase, we'll test the changes in isolation
- Only proceed to next phase after successful review
- Each phase can be rolled back independently

---

## Phase 1: Python Token Streaming (Isolated Backend Work)

### Overview
Add async streaming function to Python service. Existing sync function stays unchanged.

### Steps

#### Step 1.1: Add TokenStreamingCallback Class
**File**: `backend/python_scripts/semantic_search.py`
**Location**: Add near top of file (after imports, around line 120)

```python
from langchain_core.callbacks import AsyncCallbackHandler
import asyncio

class TokenStreamingCallback(AsyncCallbackHandler):
    """LangChain async callback handler for token streaming."""

    def __init__(self):
        self.queue = asyncio.Queue()

    async def on_llm_new_token(self, token: str, **kwargs):
        """Called for each new token from OpenAI."""
        await self.queue.put({"type": "token", "content": token})

    async def on_llm_end(self, response, **kwargs):
        """Called when LLM completes."""
        await self.queue.put({"type": "done"})

    async def on_llm_error(self, error: Exception, **kwargs):
        """Called on LLM errors."""
        await self.queue.put({"type": "error", "message": str(error)})
```

**Review Checkpoint**: Verify class compiles, no syntax errors

---

#### Step 1.2: Create stream_semantic_search() Function
**File**: `backend/python_scripts/semantic_search.py`
**Location**: Add after `process_semantic_search()` function (around line 1127)

**Key Points**:
- REUSE all existing helper functions
- COPY logic from `process_semantic_search()` for:
  - Token reservation
  - Route detection
  - Vector search
  - Citation generation
- NEW: Async streaming with callback
- NEW: SSE format output

**Implementation**: See detailed code in story document (lines 127-238)

**Review Checkpoint**:
- Function compiles
- No syntax errors
- Imports correct (asyncio, AsyncCallbackHandler)

---

#### Step 1.3: Add Streaming Endpoint
**File**: `backend/python_scripts/semantic_service.py`
**Location**: After existing `/api/v1/semantic_search` endpoint (around line 105)

```python
@app.post("/api/v1/semantic_search_stream")
async def semantic_search_stream_endpoint(
    user_id: str = Body(...),
    class_name: str | None = Body(None),
    doc_id: str | None = Body(None),
    user_query: str = Body(...),
    chat_history: list = Body([]),
    source: str = Body("main_app")
):
    """New streaming endpoint (async)."""
    return await stream_semantic_search(
        user_id,
        class_name or "null",
        doc_id or "null",
        user_query,
        chat_history,
        source
    )
```

**Review Checkpoint**: Endpoint defined, imports correct

---

#### Step 1.4: Local Testing
**Test Command**:
```bash
# Start Python service
cd backend/python_scripts
python -m uvicorn semantic_service:app --reload --port 8000

# Test streaming endpoint (in another terminal)
curl -N http://localhost:8000/api/v1/semantic_search_stream \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test123",
    "class_name": null,
    "doc_id": null,
    "user_query": "What is photosynthesis?",
    "chat_history": [],
    "source": "main_app"
  }'
```

**Expected Output**:
```
data: {"type": "token", "content": "Photosynthesis"}
data: {"type": "token", "content": " is"}
data: {"type": "token", "content": " the"}
...
data: {"type": "done", "citations": [...], "chunkReferences": [...]}
```

**Review Checkpoint**:
- ✅ Streaming works (see tokens arriving)
- ✅ SSE format correct (`data: {...}\n\n`)
- ✅ Citations received at end
- ✅ No errors in Python logs

---

### Phase 1 Review Questions
1. Does the streaming endpoint respond?
2. Do we see tokens arriving progressively (not all at once)?
3. Are citations included at the end?
4. Does the existing `/api/v1/semantic_search` endpoint still work?

**Decision Point**: Only proceed to Phase 2 if all tests pass.

---

## Phase 2: Node WebSocket Proxy (Backend → Frontend Bridge)

### Overview
Modify Node backend to consume Python SSE stream and emit WebSocket events.

### Steps

#### Step 2.1: Import WebSocket Server
**File**: `backend/src/controllers/chat_controllers.ts`
**Location**: Top of file (line 1)

```typescript
import { io } from '../utils/socket_server.js';
```

**Review Checkpoint**: Import resolves, no errors

---

#### Step 2.2: Replace Blocking POST with Streaming
**File**: `backend/src/controllers/chat_controllers.ts`
**Location**: Replace lines 260-267

**Current Code** (REMOVE):
```typescript
const responseFromPython = await axios.post(
  semanticSearchEndpoint,
  requestData,
  { headers: { 'X-Request-ID': (req as any).id } }
);
const resultMessage = responseFromPython.data;
```

**New Code** (ADD):
```typescript
const streamEndpoint = `${pythonApiUrl}/api/v1/semantic_search_stream`;

let fullResponse = "";
let citations = null;
let chunkReferences = [];
let streamError = null;

const pythonStream = await axios.post(streamEndpoint, requestData, {
  responseType: 'stream',
  headers: { 'X-Request-ID': (req as any).id }
});

const userRoom = userId.toString();

pythonStream.data.on('data', (chunk: Buffer) => {
  const text = chunk.toString();
  const lines = text.split('\n').filter(line => line.trim().startsWith('data:'));

  lines.forEach(line => {
    try {
      const jsonStr = line.replace('data:', '').trim();
      if (!jsonStr) return;

      const event = JSON.parse(jsonStr);

      if (event.type === 'token') {
        io.to(userRoom).emit('chat-stream-token', {
          sessionId: chatSession._id.toString(),
          token: event.content
        });
        fullResponse += event.content;

      } else if (event.type === 'done') {
        citations = event.citations;
        chunkReferences = event.chunkReferences;

      } else if (event.type === 'error') {
        streamError = event.message;
      }
    } catch (parseError) {
      (req as any).log.warn({ err: parseError, line }, "Failed to parse SSE event");
    }
  });
});
```

**Review Checkpoint**: Code compiles, TypeScript happy

---

#### Step 2.3: Handle Stream Completion
**File**: `backend/src/controllers/chat_controllers.ts`
**Location**: After the `data` event handler

```typescript
pythonStream.data.on('end', async () => {
  if (streamError) {
    io.to(userRoom).emit('chat-stream-error', {
      sessionId: chatSession._id.toString(),
      error: streamError
    });
    return res.status(500).json({ message: streamError });
  }

  // Build chunk references
  const chunkReferences = (citations || []).map((cit, idx) => ({
    chunkId: cit._id || `chunk-${idx}`,
    displayNumber: idx + 1,
    pageNumber: cit.pageNumber ?? null,
    docId: cit.docId ?? null,
  }));

  // Update citation text if single-document chat
  if (chatSession.assignedDocument && citations && Array.isArray(citations)) {
    try {
      let doc = await Document.findOne({ docId: chatSession.assignedDocument });
      if (!doc) doc = await Document.findById(chatSession.assignedDocument);
      if (doc) {
        citations = citations.map((cit) => ({ ...cit, text: doc.fileName }));
      }
    } catch (docError) {
      (req as any).log.warn({ err: docError }, "Error fetching document for citation");
    }
  }

  // Handle retry vs new message
  if (retry === true) {
    const lastIdx = chatSession.messages.length - 2;
    if (lastIdx >= 0 && chatSession.messages[lastIdx].role === "assistant") {
      const prevMsg = chatSession.messages[lastIdx];
      if (!prevMsg.versions) prevMsg.versions = [prevMsg.content];
      prevMsg.versions.push(fullResponse);
      prevMsg.currentVersion = prevMsg.versions.length - 1;
      prevMsg.content = fullResponse;
      prevMsg.citation = citations;
      prevMsg.chunkReferences = chunkReferences;
    } else {
      chatSession.messages.push({
        content: fullResponse,
        role: "assistant",
        citation: citations,
        chunkReferences: chunkReferences,
      });
    }
  } else {
    chatSession.messages.push({
      content: fullResponse,
      role: "assistant",
      citation: citations,
      chunkReferences: chunkReferences,
    });
  }

  await chatSession.save();

  // Increment free tier count only after success
  if (shouldIncrementCount) {
    currentUser.chatRequestCount += 1;
    await currentUser.save();
  }

  // Emit completion
  io.to(userRoom).emit('chat-stream-complete', {
    sessionId: chatSession._id.toString(),
    citations: citations,
    chunkReferences: chunkReferences
  });

  return res.status(200).json({
    chatSessionId: chatSession._id,
    messages: chatSession.messages,
    assignedClass: chatSession.assignedClass,
    assignedDocument: chatSession.assignedDocument,
  });
});

pythonStream.data.on('error', (error) => {
  (req as any).log.error({ err: error }, "Python stream error");
  io.to(userRoom).emit('chat-stream-error', {
    sessionId: chatSession._id.toString(),
    error: error.message
  });
  return res.status(500).json({ message: "Stream failed" });
});
```

**Review Checkpoint**: Code compiles

---

#### Step 2.4: Move Free Tier Increment
**File**: `backend/src/controllers/chat_controllers.ts`
**Location**: Lines 157-179

**Current** (line 177):
```typescript
currentUser.chatRequestCount += 1;
await currentUser.save();
```

**Change to**:
```typescript
let shouldIncrementCount = false;
if (currentUser.plan === "free") {
  // ... existing reset logic ...

  if (currentUser.chatRequestCount >= 25) {
    return res.status(403).json({
      message: "Free plan limit reached (25 chats/month). Upgrade to premium for unlimited chats.",
    });
  }

  shouldIncrementCount = true;  // ← Defer until stream completes
}
```

**Review Checkpoint**:
- Variable `shouldIncrementCount` defined
- Increment removed from line 177
- Increment added in `stream.on('end')` handler

---

#### Step 2.5: Remove Old MongoDB Save
**File**: `backend/src/controllers/chat_controllers.ts`
**Location**: Line 335

**Delete this line**:
```typescript
await chatSession.save();  // ← DELETE (now happens in stream.on('end'))
```

**Review Checkpoint**: Old save removed, new save in stream.on('end')

---

#### Step 2.6: Testing with WebSocket Inspector

**Tools**:
- Browser DevTools → Network → WS tab
- Or: `wscat -c ws://localhost:5000 --header "Cookie: auth-token=..."`

**Test Flow**:
1. Start Node backend: `npm run dev`
2. Send chat request via Postman/curl
3. Monitor WebSocket events in DevTools

**Expected Events**:
```json
// Event 1: chat-stream-token (multiple times)
{
  "sessionId": "...",
  "token": "Photosynthesis"
}

// Event 2: chat-stream-complete (once)
{
  "sessionId": "...",
  "citations": [...],
  "chunkReferences": [...]
}
```

**Review Checkpoint**:
- ✅ WebSocket events emitted
- ✅ Tokens arrive progressively
- ✅ Complete event arrives with citations
- ✅ MongoDB saves AFTER stream completes

---

### Phase 2 Review Questions
1. Are WebSocket events being emitted?
2. Do tokens arrive one at a time (not all at once)?
3. Does MongoDB save only after completion?
4. Does free tier counter increment only after success?

**Decision Point**: Only proceed to Phase 3 if all tests pass.

---

## Phase 3: Frontend WebSocket Consumption (User-Facing)

### Overview
Replace simulated streaming with real WebSocket listeners.

### Steps

#### Step 3.1: Remove Simulated Streaming
**File**: `frontend/src/pages/Chat.tsx`
**Location**: Lines 483-500

**Delete this entire block**:
```typescript
if (typeIntervalRef.current) {
  clearInterval(typeIntervalRef.current);
}

typeIntervalRef.current = setInterval(() => {
  i += 1;
  setPartialAssistantMessage(fullText.substring(0, i));

  if (i >= fullText.length) {
    if (typeIntervalRef.current) {
      clearInterval(typeIntervalRef.current);
      typeIntervalRef.current = null;
    }
    setChatMessages([...updatedWithoutLast, finalAssistantMsg]);
    setPartialAssistantMessage("");
    setIsGenerating(false);
  }
}, 2);
```

**Review Checkpoint**: Code removed, no syntax errors

---

#### Step 3.2: Add WebSocket Listeners
**File**: `frontend/src/pages/Chat.tsx`
**Location**: Inside `handleSubmit` function, after line 440 (after sendChatRequest)

**Replace the deleted code with**:
```typescript
// Setup WebSocket listeners
const socket = initializeSocket();

const handleToken = (data: { sessionId: string; token: string }) => {
  if (data.sessionId === currentChatSessionId) {
    setPartialAssistantMessage(prev => prev + data.token);
  }
};

const handleComplete = (data: {
  sessionId: string;
  citations: any[];
  chunkReferences: any[];
}) => {
  if (data.sessionId === currentChatSessionId) {
    // Finalize message
    const finalMessage = {
      role: "assistant" as const,
      content: partialAssistantMessage,
      citation: data.citations,
      chunkReferences: data.chunkReferences
    };

    setChatMessages(prev => [...prev, finalMessage]);
    setPartialAssistantMessage("");
    setIsGenerating(false);

    // Update session state
    setChatSessions((prev) => {
      const updatedSessions = prev.map((session) =>
        session._id === currentChatSessionId
          ? {
              ...session,
              messages: [...session.messages, finalMessage],
              updatedAt: new Date().toISOString(),
            }
          : session
      );
      updatedSessions.sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });
      return updatedSessions;
    });

    // Cleanup listeners
    socket.off('chat-stream-token', handleToken);
    socket.off('chat-stream-complete', handleComplete);
    socket.off('chat-stream-error', handleError);
    streamListenersRef.current = null;
  }
};

const handleError = (data: { sessionId: string; error: string }) => {
  if (data.sessionId === currentChatSessionId) {
    toast.error("Stream interrupted. Please retry.");
    setIsGenerating(false);

    // Cleanup listeners
    socket.off('chat-stream-token', handleToken);
    socket.off('chat-stream-complete', handleComplete);
    socket.off('chat-stream-error', handleError);
    streamListenersRef.current = null;
  }
};

// Store listeners for cleanup
streamListenersRef.current = { token: handleToken, complete: handleComplete, error: handleError };

socket.on('chat-stream-token', handleToken);
socket.on('chat-stream-complete', handleComplete);
socket.on('chat-stream-error', handleError);

// The sendChatRequest triggers the stream, response comes via WebSocket
```

**Review Checkpoint**: Code compiles, TypeScript happy

---

#### Step 3.3: Add Listener Cleanup
**File**: `frontend/src/pages/Chat.tsx`
**Location**: Add new useEffect near other effects (around line 370)

**Add listener ref** (near top of component, around line 115):
```typescript
const streamListenersRef = useRef<{
  token: (data: any) => void;
  complete: (data: any) => void;
  error: (data: any) => void;
} | null>(null);
```

**Add cleanup effect**:
```typescript
// Cleanup WebSocket listeners on unmount
useEffect(() => {
  return () => {
    if (streamListenersRef.current) {
      const socket = initializeSocket();
      socket.off('chat-stream-token', streamListenersRef.current.token);
      socket.off('chat-stream-complete', streamListenersRef.current.complete);
      socket.off('chat-stream-error', streamListenersRef.current.error);
    }
  };
}, []);
```

**Review Checkpoint**: Cleanup added, no memory leaks

---

#### Step 3.4: Browser Testing

**Test Steps**:
1. Start frontend: `npm run dev`
2. Open browser DevTools → Console + Network (WS tab)
3. Send a chat message
4. Observe:
   - Tokens appear progressively in UI
   - No simulated delay (immediate as tokens arrive)
   - Citations appear after completion
   - Auto-scroll works

**Review Checkpoint**:
- ✅ Tokens display progressively
- ✅ No `setInterval` delays
- ✅ Citations render correctly
- ✅ Auto-scroll works
- ✅ isGenerating state correct
- ✅ No console errors

---

### Phase 3 Review Questions
1. Do tokens appear progressively in the UI?
2. Are citations displayed after stream completes?
3. Does auto-scroll work?
4. Any memory leaks? (check with React StrictMode)

**Decision Point**: Only proceed to Phase 4 if all tests pass.

---

## Phase 4: Integration Testing (Full E2E)

### Test Suite 1: Core Functionality
| Test | Steps | Expected Result |
|------|-------|----------------|
| Normal query | Send "What is photosynthesis?" | Tokens stream, citations appear |
| Follow-up | Send "Tell me more" | Reuses chunks, streams response |
| Quote finding | Send "Find a quote about X" | Streams verbatim quotes |
| Retry | Click retry button | New stream, version history works |
| Document chat | Select doc, send message | Page citations work |

### Test Suite 2: Error Handling
| Test | Steps | Expected Result |
|------|-------|----------------|
| Network error | Kill Python service mid-stream | Error toast, retry option |
| Free tier limit | Send 26th chat as free user | Rejected with 403 |
| Invalid query | Send empty message | Validation error |

### Test Suite 3: Performance
| Test | Target | How to Measure |
|------|--------|----------------|
| TTFT | <2 seconds | Time from submit to first token |
| Memory leaks | No leaks | Chrome DevTools Memory profiler |
| Concurrent users | No cross-talk | 2+ users streaming simultaneously |

---

## Rollback Plan

If issues found in any phase:

```bash
# Rollback Phase 1 (Python)
git checkout HEAD -- backend/python_scripts/semantic_search.py
git checkout HEAD -- backend/python_scripts/semantic_service.py

# Rollback Phase 2 (Node)
git checkout HEAD -- backend/src/controllers/chat_controllers.ts

# Rollback Phase 3 (Frontend)
git checkout HEAD -- frontend/src/pages/Chat.tsx
```

---

## Success Criteria

### Must Pass Before Deployment
- [ ] All 4 phases complete
- [ ] All test suites pass
- [ ] TTFT < 2 seconds
- [ ] No memory leaks
- [ ] Free tier accounting correct
- [ ] All existing features work (citations, retry, reactions, etc.)

---

## Next Steps

**Ready to begin?** Let's start with **Phase 1: Python Token Streaming**.

I'll implement Step 1.1 (TokenStreamingCallback class) and we'll review before proceeding.

**Confirm to start Phase 1?**
