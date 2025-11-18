# Story 0.6: Real OpenAI Streaming - Architecture Investigation

**Story**: Real OpenAI Streaming Implementation - Brownfield Addition
**Investigation Date**: 2025-11-10 (Updated: 2025-11-14)
**Investigator**: Winston (Architecture Agent)
**Status**: COMPREHENSIVE ANALYSIS COMPLETE + SIMPLIFIED SUMMARY

---

## Executive Summary

**TL;DR**: Replace simulated character-by-character streaming with real OpenAI token streaming. This is a **straightforward 1:1 replacement**, not over-engineering.

**Current**: Frontend receives full response (3-5s wait), then simulates typing with `setInterval` (2ms/char)
**New**: Frontend receives tokens in real-time via WebSocket (1-2s to first token)
**UX Impact**: IDENTICAL progressive text appearance, but with real tokens

**Implementation**:
- **4 files modified** (~490 lines total)
- **100+ files unchanged** (all existing features preserved)
- **2 timing bugs fixed** (MongoDB save, free tier counter)

This document provides a comprehensive architectural investigation of **all files** that require changes to implement Story 0.6: Real OpenAI Streaming via WebSocket. The investigation traces the complete data flow from frontend through Node backend to Python FastAPI, documenting current implementation patterns, integration points, and required modifications.

**Key Finding**: This is a **3-layer brownfield integration** requiring coordinated changes across:
- **Frontend**: React WebSocket consumption (1 file)
- **Node Backend**: SSE-to-WebSocket proxy (2 files)
- **Python AI Service**: Async streaming with LangChain callbacks (2 files)

**Architectural Complexity**: Medium-High
- Existing WebSocket infrastructure can be reused (socket_server.ts)
- Existing Redis client can be extended for stream state management
- New async patterns required in Python (asyncio.Queue + LangChain callbacks)
- Careful state management required in Node (accumulate full response before MongoDB write)

---

## 1. Current Architecture Overview

### 1.1 System Architecture

```
┌─────────────┐          ┌──────────────┐          ┌──────────────┐
│   React     │          │     Node     │          │   Python     │
│  Frontend   │◄────────►│   Backend    │◄────────►│   FastAPI    │
│  (Vercel)   │ WebSocket│  (Express)   │   HTTP   │   (Heroku)   │
└─────────────┘          └──────────────┘          └──────────────┘
       │                        │                          │
       │                        │                          │
       ▼                        ▼                          ▼
  Socket.IO            MongoDB + Redis           MongoDB + Redis
   Client               + Socket.IO                + S3 + OpenAI
```

### 1.2 Current Chat Flow (Blocking POST)

**Current Implementation** (synchronous, with simulated streaming):

1. **Frontend** (`Chat.tsx:433-517`)
   - User submits message via `handleSubmit()`
   - Blocking POST to `/api/v1/chat/new`
   - Receives full response (3-5 seconds)
   - **Simulates** streaming with `setInterval` (2ms per character)
   - Lines 487-500: Character-by-character display

2. **Node Backend** (`chat_controllers.ts:141-349`)
   - `generateChatCompletion` controller
   - Auth check + free tier rate limiting (lines 148-180)
   - Session bookkeeping (lines 182-238)
   - **Blocking** POST to Python `/api/v1/semantic_search` (lines 260-267)
   - Waits for full response
   - Saves to MongoDB (line 335)
   - Returns full response to frontend

3. **Python FastAPI** (`semantic_service.py:64-104`)
   - `/api/v1/semantic_search` endpoint
   - Keepalive wrapper around synchronous processing (10s intervals)
   - Calls `process_semantic_search()` in thread pool
   - Returns full JSON response after completion

4. **Python RAG Pipeline** (`semantic_search.py:450-1126`)
   - `process_semantic_search()` main entry point
   - Route detection (line 485)
   - Vector search with MongoDB Atlas (lines 620-660)
   - **Synchronous** LangChain call (lines 928-936)
   - Returns full response with citations

### 1.3 Existing WebSocket Infrastructure

**Good News**: WebSocket infrastructure already exists and is production-ready!

- **Socket.IO Server** (`socket_server.ts:26-98`)
  - JWT authentication middleware (lines 36-75)
  - User-specific rooms: `socket.join(uid)` (line 91)
  - Already emitting `document-ready` events (lines 109-114)

- **Socket.IO Client** (`socketClient.ts:1-42`)
  - Singleton pattern with auto-reconnect (lines 5-11)
  - Cookie-based auth (line 20)
  - Diagnostic logging for debugging

- **Frontend Integration** (`Chat.tsx:185-217`)
  - Socket initialized on mount (line 188)
  - Already listening for `document-ready` events (line 191)
  - Socket cleanup handled

**Key Insight**: We can **reuse** this infrastructure by adding 3 new WebSocket events:
- `chat-stream-token`
- `chat-stream-complete`
- `chat-stream-error`

---

## 2. Files Requiring Changes

### 2.1 Python AI Service (2 files)

#### 2.1.1 `backend/python_scripts/semantic_search.py` ⭐ **MAJOR CHANGES**

**Current State**:
- Line 450-1126: `process_semantic_search()` - synchronous function
- Line 114-117: `get_llm()` returns non-streaming ChatOpenAI
- Line 928-936: Blocking LangChain chain invocation

**Required Changes**:

1. **Add Async Streaming Callback Handler** (NEW class)
   ```python
   class TokenStreamingCallback(AsyncCallbackHandler):
       def __init__(self):
           self.queue = asyncio.Queue()

       async def on_llm_new_token(self, token: str, **kwargs):
           await self.queue.put({"type": "token", "content": token})

       async def on_llm_end(self, response, **kwargs):
           await self.queue.put({"type": "done"})

       async def on_llm_error(self, error: Exception, **kwargs):
           await self.queue.put({"type": "error", "message": str(error)})
   ```

2. **Add New Streaming Function** (NEW)
   ```python
   async def stream_semantic_search(
       user_id: str,
       class_name: str | None,
       doc_id: str | None,
       user_query: str,
       chat_history: list,
       source: str
   ) -> StreamingResponse:
       # Token reservation BEFORE streaming
       # Retrieval (same as existing)
       # Setup streaming callback
       # Yield tokens via SSE format
       # Send citations after [DONE]
   ```

3. **Integration Points**:
   - **Imports**: Add `asyncio`, `AsyncCallbackHandler` from `langchain_core.callbacks`
   - **Redis Integration**: Lines 190-220 show existing token reservation pattern - reuse this
   - **Route Detection**: Line 485 - reuse existing `detect_route()` from `router.py`
   - **MongoDB Search**: Lines 620-660 - reuse existing `perform_semantic_search()`
   - **Citation Generation**: Lines 260-283 - reuse existing `get_file_citation()`
   - **Prompt Loading**: Lines 435-445 - reuse existing `load_prompts()`

4. **Critical Sections to Preserve**:
   - Lines 190-220: Token reservation logic (Redis `reserve_tokens()`)
   - Lines 260-283: File citation generation
   - Lines 620-660: MongoDB vector search
   - Lines 1004-1036: Citation renumbering logic

**Estimated Lines**: +250 new lines (callback handler + streaming function)

---

#### 2.1.2 `backend/python_scripts/semantic_service.py` ⭐ **MINOR CHANGES**

**Current State**:
- Line 64-104: `/api/v1/semantic_search` endpoint (synchronous with keepalive wrapper)

**Required Changes**:

1. **Add New Streaming Endpoint** (NEW route)
   ```python
   @app.post("/api/v1/semantic_search_stream")
   async def semantic_search_stream_endpoint(req: SearchRequest):
       return await stream_semantic_search(
           req.user_id,
           req.class_name or "null",
           req.doc_id or "null",
           req.user_query,
           req.chat_history,
           req.source
       )
   ```

2. **Keep Existing Endpoint** (backward compatibility)
   - Lines 64-104: Preserve for legacy clients

**Integration Points**:
- Import new `stream_semantic_search` from `semantic_search.py`
- Reuse existing `SearchRequest` Pydantic model (lines 54-60)

**Estimated Lines**: +10 new lines

---

### 2.2 Node Backend (2 files)

#### 2.2.1 `backend/src/controllers/chat_controllers.ts` ⭐ **MAJOR CHANGES**

**Current State**:
- Line 141-349: `generateChatCompletion` controller
- Line 260-267: Blocking POST to Python (waits for full response)
- Line 335: MongoDB save after receiving full response

**Required Changes**:

1. **Import WebSocket Server** (line 1)
   ```typescript
   import { io } from '../utils/socket_server.js';
   ```

2. **Replace Blocking POST with Streaming Proxy** (lines 260-335)
   - Change to `responseType: 'stream'` for axios
   - Parse SSE events from Python: `data: {"type": "token", "content": "..."}\n\n`
   - Emit WebSocket events to user's room: `io.to(userRoom).emit('chat-stream-token', ...)`
   - Accumulate full response in memory (`fullResponse` variable)
   - Only save to MongoDB after stream completes (inside `stream.on('end')`)

3. **Move Free Tier Increment** (line 177)
   - Current: Increments BEFORE streaming starts
   - New: Increment ONLY after successful `chat-stream-complete`
   - Add `shouldIncrementCount` flag (defer increment until stream completes)

4. **Add WebSocket Event Emissions**:
   ```typescript
   // During streaming
   io.to(userRoom).emit('chat-stream-token', {
     sessionId: chatSession._id.toString(),
     token: event.content
   });

   // After stream completes
   io.to(userRoom).emit('chat-stream-complete', {
     sessionId: chatSession._id.toString(),
     citations: citations,
     chunkReferences: chunkReferences
   });

   // On error
   io.to(userRoom).emit('chat-stream-error', {
     sessionId: chatSession._id.toString(),
     error: error.message
   });
   ```

**Integration Points**:
- **WebSocket Server**: Use existing `io` from `socket_server.ts:21`
- **User Rooms**: Emit to `userId.toString()` room (same pattern as document-ready)
- **MongoDB Models**: Use existing `ChatSession` model (lines 3, 187-224)
- **Retry Logic**: Preserve existing retry mechanism (lines 300-333)
- **Citation Update**: Preserve document citation text update (lines 282-297)

**Critical Sections to Preserve**:
- Lines 148-180: Auth + free tier checks
- Lines 182-238: Session bookkeeping
- Lines 282-297: Citation text update for single-document chats
- Lines 300-333: Retry logic (versions array)

**Estimated Lines**: +150 modified/new lines (replace blocking POST with streaming proxy)

---

#### 2.2.2 `backend/src/utils/socket_server.ts` ⭐ **NO CHANGES REQUIRED**

**Current State**:
- Lines 21-98: Full WebSocket server with JWT auth
- Line 91: User room join: `socket.join(uid)`
- Lines 101-115: Document-ready event emission

**Analysis**:
- ✅ **Ready to use as-is**
- ✅ JWT authentication already implemented (lines 36-75)
- ✅ User-specific rooms already configured (line 91)
- ✅ `io` instance already exported (line 21)

**No changes needed** - just import `io` in `chat_controllers.ts`

---

### 2.3 Frontend (1 file)

#### 2.3.1 `frontend/src/pages/Chat.tsx` ⭐ **MAJOR CHANGES**

**Current State**:
- Lines 487-500: Simulated streaming with `setInterval` (2ms per character)
- Line 105: `typeIntervalRef` for simulated streaming
- Lines 126: `socketRef` already exists
- Lines 185-217: Socket initialization already implemented

**Required Changes**:

1. **Remove Simulated Streaming** (DELETE lines 487-500)
   ```typescript
   // DELETE THIS ENTIRE BLOCK:
   typeIntervalRef.current = setInterval(() => {
     i += 1;
     setPartialAssistantMessage(fullText.substring(0, i));
     if (i >= fullText.length) {
       clearInterval(typeIntervalRef.current);
       setChatMessages([...updatedWithoutLast, finalAssistantMsg]);
       setPartialAssistantMessage("");
       setIsGenerating(false);
     }
   }, 2);
   ```

2. **Add WebSocket Listeners** (replace handleSubmit logic)
   ```typescript
   const handleSubmit = async () => {
     // ... existing message setup ...

     const socket = initializeSocket();

     const handleToken = (data: { sessionId: string; token: string }) => {
       if (data.sessionId === currentChatSessionId) {
         setPartialAssistantMessage(prev => prev + data.token);
       }
     };

     const handleComplete = (data: { sessionId: string; citations: any[]; chunkReferences: any[] }) => {
       if (data.sessionId === currentChatSessionId) {
         const finalMessage = {
           role: "assistant" as const,
           content: partialAssistantMessage,
           citation: data.citations,
           chunkReferences: data.chunkReferences
         };
         setChatMessages(prev => [...prev, finalMessage]);
         setPartialAssistantMessage("");
         setIsGenerating(false);
         // Cleanup listeners
         socket.off('chat-stream-token', handleToken);
         socket.off('chat-stream-complete', handleComplete);
         socket.off('chat-stream-error', handleError);
       }
     };

     const handleError = (data: { sessionId: string; error: string }) => {
       if (data.sessionId === currentChatSessionId) {
         toast.error("Stream interrupted. Please retry.");
         setIsGenerating(false);
         // Cleanup listeners
       }
     };

     socket.on('chat-stream-token', handleToken);
     socket.on('chat-stream-complete', handleComplete);
     socket.on('chat-stream-error', handleError);

     // Trigger streaming via HTTP POST (response comes via WebSocket)
     await sendChatRequest(content, currentChatSessionId, selectedClass, activeDocId);
   };
   ```

3. **Add Cleanup on Unmount** (NEW useEffect)
   ```typescript
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

4. **Store Listener Refs** (NEW ref)
   ```typescript
   const streamListenersRef = useRef<{
     token: (data: any) => void;
     complete: (data: any) => void;
     error: (data: any) => void;
   } | null>(null);
   ```

**Integration Points**:
- **Socket Client**: Use existing `initializeSocket()` from `socketClient.ts:5`
- **State Management**: Reuse existing `partialAssistantMessage` state (line 104)
- **Toast Notifications**: Use existing `toast` import (line 25)
- **API Call**: Use existing `sendChatRequest()` from `api-communicators.ts`

**Critical Sections to Preserve**:
- Lines 1-100: All existing imports and type definitions
- Lines 185-217: Socket initialization for document-ready events
- Lines 433-480: Message submission logic (just replace streaming part)

**Estimated Lines**: -30 deleted (simulated streaming), +80 new (WebSocket listeners + cleanup)

---

#### 2.3.2 `frontend/src/helpers/socketClient.ts` ⭐ **NO CHANGES REQUIRED**

**Current State**:
- Lines 5-11: Singleton pattern with auto-reconnect
- Line 19: Socket.IO client configured with cookies

**Analysis**:
- ✅ **Ready to use as-is**
- ✅ Singleton pattern already implemented
- ✅ Cookie authentication already configured
- ✅ Auto-reconnect already handled

**No changes needed** - just import and use `initializeSocket()` in Chat.tsx

---

### 2.4 Configuration Files (3 files)

#### 2.4.1 `backend/.env.example` ⭐ **MINOR ADDITIONS**

**Required Changes**: Add streaming configuration variables (lines 21+)

```bash
# Streaming Configuration (add after line 38)
STREAM_TIMEOUT_MS=60000          # WebSocket timeout for chat streaming (60 seconds)
STREAM_KEEPALIVE_MS=10000        # Keepalive interval for long-running streams
ENABLE_STREAMING=true            # Feature flag for gradual rollout
```

**Estimated Lines**: +3 new lines

---

#### 2.4.2 `backend/python_scripts/.env.example` ⭐ **MINOR ADDITIONS**

**Required Changes**: Add streaming configuration (lines 16+)

```bash
# Streaming Configuration (add after OPENAI_TPM_LIMIT)
OPENAI_STREAMING_ENABLED=true   # Enable token streaming from OpenAI
STREAM_CHUNK_SIZE=1              # Tokens per emission (1 = real-time, 5 = batched)
STREAM_MAX_DURATION_S=120        # Max streaming duration before force-stop
```

**Estimated Lines**: +3 new lines

---

#### 2.4.3 `frontend/.env.example` ⭐ **NO CHANGES REQUIRED**

**Analysis**:
- ✅ `VITE_WS_URL` already exists (used by Socket.IO client)
- ✅ No new frontend environment variables needed

---

### 2.5 Infrastructure Files (0 changes)

#### 2.5.1 `backend/python_scripts/redis_setup.py` ⭐ **NO CHANGES**

**Current State**: Lines 1-83 - TLS-aware Redis client setup

**Analysis**:
- ✅ Redis client already configured and working
- ✅ Can be extended for stream state management
- ✅ Existing token reservation pattern (semantic_search.py:190-220) can be reused

**No changes needed** - existing Redis client supports streaming state keys

---

#### 2.5.2 `backend/python_scripts/config.py` ⭐ **NO CHANGES**

**Current State**: Lines 1-213 - Centralized configuration

**Analysis**:
- ✅ All required configs already present:
  - `OPENAI_CHAT_MODEL` (line 127)
  - `OPENAI_API_KEY` (line 88)
  - Redis configs (lines 101-107)
  - RAG configs (lines 130-145)

**Optional**: Could add new streaming configs, but not strictly required (can use defaults)

---

#### 2.5.3 `backend/python_scripts/router.py` ⭐ **NO CHANGES**

**Current State**: Lines 1-62 - Route detection with regex patterns

**Analysis**:
- ✅ Route detection works for both sync and async flows
- ✅ LRU cache already implemented (line 50)
- ✅ All 4 routes supported: `general_qa`, `follow_up`, `quote_finding`, `generate_study_guide`

**No changes needed** - route detection is stateless and reusable

---

#### 2.5.4 `backend/python_scripts/tasks.py` ⭐ **NO CHANGES**

**Current State**: Lines 1-57 - RQ job queue for document ingestion

**Analysis**:
- ✅ Redis connection reused from `redis_setup.py` (line 8)
- ✅ Ingestion queue separate from chat generation
- ✅ No overlap with streaming implementation

**No changes needed** - ingestion uses separate RQ queue

---

## 3. Data Flow Analysis

### 3.1 Current Flow (Blocking POST)

```
┌─────────────────────────────────────────────────────────────────┐
│ CURRENT FLOW (Synchronous with Simulated Streaming)            │
└─────────────────────────────────────────────────────────────────┘

Frontend (Chat.tsx:433-517)
  │
  │  1. User submits message
  │  2. Blocking POST /api/v1/chat/new
  │
  ▼
Node Backend (chat_controllers.ts:141-349)
  │
  │  3. Auth check + rate limiting
  │  4. Session bookkeeping
  │  5. Blocking POST /api/v1/semantic_search
  │  6. Wait for full response (3-5 seconds)
  │
  ▼
Python FastAPI (semantic_service.py:64-104)
  │
  │  7. Keepalive wrapper (10s intervals)
  │  8. Call process_semantic_search() in thread pool
  │
  ▼
Python RAG (semantic_search.py:450-1126)
  │
  │  9. Route detection
  │  10. MongoDB vector search
  │  11. Synchronous LangChain call
  │  12. Return full response with citations
  │
  ▼
Node Backend (chat_controllers.ts:335)
  │
  │  13. Save to MongoDB
  │  14. Return full response to frontend
  │
  ▼
Frontend (Chat.tsx:487-500)
  │
  │  15. Simulate streaming with setInterval (2ms per char)
  │  16. Display character-by-character
  │
  ▼
User sees "streaming" effect (simulated)
```

**Latency Breakdown**:
- Time to first token (TTFT): 3-5 seconds
- User sees first character: 3-5 seconds (no real streaming)
- Full response visible: 5-8 seconds (simulated animation)

---

### 3.2 New Flow (Real Streaming via WebSocket)

```
┌─────────────────────────────────────────────────────────────────┐
│ NEW FLOW (Async Streaming via WebSocket)                       │
└─────────────────────────────────────────────────────────────────┘

Frontend (Chat.tsx - modified)
  │
  │  1. User submits message
  │  2. Setup WebSocket listeners (token, complete, error)
  │  3. POST /api/v1/chat/new (trigger streaming)
  │
  ▼
Node Backend (chat_controllers.ts - modified)
  │
  │  4. Auth check (rate limiting deferred until stream completes)
  │  5. Session bookkeeping
  │  6. POST /api/v1/semantic_search_stream (streaming)
  │
  ▼
Python FastAPI (semantic_service.py - new endpoint)
  │
  │  7. Call stream_semantic_search() (async)
  │
  ▼
Python RAG (semantic_search.py - new streaming function)
  │
  │  8. Token reservation (before streaming)
  │  9. Route detection
  │  10. MongoDB vector search
  │  11. Setup TokenStreamingCallback (asyncio.Queue)
  │  12. Async LangChain call with streaming=True
  │
  ▼
OpenAI GPT-4o
  │
  │  13. Stream tokens in real-time
  │
  ▼
Python Callback Handler (TokenStreamingCallback)
  │
  │  14. Put tokens on asyncio.Queue
  │
  ▼
Python Generator (stream_semantic_search)
  │
  │  15. Yield SSE events: data: {"type": "token", "content": "..."}\n\n
  │  16. After [DONE], yield citations
  │
  ▼
Node Backend (chat_controllers.ts - SSE parser)
  │
  │  17. Parse SSE events
  │  18. Emit WebSocket events to user's room
  │      - chat-stream-token (each token)
  │      - chat-stream-complete (after done)
  │  19. Accumulate full response in memory
  │  20. Save to MongoDB only after stream completes
  │  21. Increment free tier count (after success)
  │
  ▼
Frontend (Chat.tsx - WebSocket listeners)
  │
  │  22. Receive chat-stream-token events
  │  23. Append to partialAssistantMessage state
  │  24. React re-renders on each token (real-time display)
  │  25. On chat-stream-complete: finalize message
  │  26. Cleanup listeners
  │
  ▼
User sees real streaming (1-2 seconds TTFT)
```

**Latency Breakdown**:
- Time to first token (TTFT): 1-2 seconds ✅ **50% improvement**
- User sees first token: 1-2 seconds (real streaming)
- Full response visible: 3-5 seconds (depends on length)

---

## 4. Integration Points & Dependencies

### 4.1 Python → Node Integration

**Current**: Blocking HTTP POST (JSON response)
**New**: Streaming HTTP (SSE events)

```
Python SSE Format:
  data: {"type": "token", "content": "Hello"}\n\n
  data: {"type": "token", "content": " world"}\n\n
  data: {"type": "done", "citations": [...], "chunkReferences": [...]}\n\n
```

**Node Parser** (chat_controllers.ts - NEW):
```typescript
pythonStream.data.on('data', (chunk: Buffer) => {
  const text = chunk.toString();
  const lines = text.split('\n').filter(line => line.trim().startsWith('data:'));

  lines.forEach(line => {
    const jsonStr = line.replace('data:', '').trim();
    const event = JSON.parse(jsonStr);

    if (event.type === 'token') {
      io.to(userRoom).emit('chat-stream-token', { sessionId, token: event.content });
      fullResponse += event.content;
    } else if (event.type === 'done') {
      citations = event.citations;
      chunkReferences = event.chunkReferences;
    }
  });
});
```

---

### 4.2 Node → Frontend Integration

**Current**: HTTP JSON response
**New**: WebSocket events (3 event types)

**WebSocket Events**:
1. `chat-stream-token`: Individual token from OpenAI
   ```typescript
   { sessionId: string, token: string }
   ```

2. `chat-stream-complete`: Stream finished with metadata
   ```typescript
   { sessionId: string, citations: any[], chunkReferences: any[] }
   ```

3. `chat-stream-error`: Stream failed with error
   ```typescript
   { sessionId: string, error: string }
   ```

**Frontend Listeners** (Chat.tsx - NEW):
```typescript
socket.on('chat-stream-token', (data) => {
  if (data.sessionId === currentChatSessionId) {
    setPartialAssistantMessage(prev => prev + data.token);
  }
});

socket.on('chat-stream-complete', (data) => {
  if (data.sessionId === currentChatSessionId) {
    // Finalize message with citations
    setChatMessages(prev => [...prev, finalMessage]);
    setIsGenerating(false);
  }
});

socket.on('chat-stream-error', (data) => {
  if (data.sessionId === currentChatSessionId) {
    toast.error("Stream interrupted. Please retry.");
    setIsGenerating(false);
  }
});
```

---

### 4.3 Redis Integration

**Current Usage** (semantic_search.py:190-220):
- Token reservation: `openai:tpm:counter` key
- INCRBY + EXPIRE pattern (70s TTL)

**New Usage** (streaming state management):

```python
# Stream state key format
stream_key = f"chat:stream:{user_id}:{session_id}:{timestamp}"

# Set metadata
r.setex(stream_key, 300, json.dumps({
    "user_id": user_id,
    "session_id": session_id,
    "started_at": datetime.now().isoformat(),
    "status": "in_progress"
}))

# Refresh TTL during streaming
r.expire(stream_key, 300)

# Delete on completion
r.delete(stream_key)

# Mark as failed on error
r.setex(stream_key, 60, json.dumps({"status": "failed", "error": str(e)}))
```

**Cleanup Strategy**:
- Auto-expire after 5 minutes (TTL: 300s)
- Successful completions delete immediately
- Failed streams kept for 1 minute (debugging)

---

### 4.4 MongoDB Integration

**Current**: Save immediately after receiving full response
**New**: Save only after stream completes

**Critical Change** (chat_controllers.ts):
```typescript
// OLD (REMOVE):
await chatSession.save();  // line 335 - immediate save

// NEW (ADD):
pythonStream.data.on('end', async () => {
  // Accumulate full response in memory first
  // Only save to MongoDB after stream completes
  chatSession.messages.push({
    content: fullResponse,  // full response accumulated in memory
    role: "assistant",
    citation: citations,
    chunkReferences: chunkReferences
  });
  await chatSession.save();  // ONLY save after stream completes
});
```

**Why**: Prevents write amplification (1000s of writes per chat)

---

### 4.5 LangChain Integration

**Current** (semantic_search.py:928-936):
```python
# Synchronous LangChain call
answer = construct_chain(
    prompt_template,
    user_query_effective,
    chat_history_cleaned,
    llm  # streaming=False by default
)
```

**New** (streaming function):
```python
# Async LangChain call with streaming callback
callback = TokenStreamingCallback()
llm = ChatOpenAI(
    model=config.OPENAI_CHAT_MODEL,
    temperature=cfg["temperature"],
    streaming=True,  # ← ENABLE STREAMING
    callbacks=[callback]  # ← ATTACH CALLBACK
)

chain = prompt_template | llm | StrOutputParser()

# Stream tokens asynchronously
task = asyncio.create_task(chain.ainvoke({...}))

while True:
    event = await asyncio.wait_for(callback.queue.get(), timeout=1.0)
    if event["type"] == "done":
        break
    yield f"data: {json.dumps(event)}\n\n"
```

**Key Pattern**: `asyncio.Queue` bridges LangChain callbacks to generator

---

## 5. Risk Assessment & Mitigation

### 5.1 High-Risk Areas

#### Risk 1: Stream Interruptions Leave Chat in Incomplete State

**Scenario**: Python crashes mid-stream → partial response sent → MongoDB has incomplete message

**Mitigation**:
- ✅ Accumulate full response in Node backend memory
- ✅ Only save to MongoDB after `chat-stream-complete` event
- ✅ On error, do NOT persist partial response
- ✅ Redis stream state keys track in-progress streams

**Rollback**: Revert all changes, restore simulated streaming from git

---

#### Risk 2: Memory Leaks from Unclosed WebSocket Listeners

**Scenario**: User navigates away mid-stream → listeners not cleaned up → memory leak

**Mitigation**:
- ✅ Store listener refs in `streamListenersRef`
- ✅ Cleanup in `useEffect` unmount callback
- ✅ Test with React StrictMode enabled (double-mount detection)
- ✅ Verify with Chrome DevTools Memory profiler

**Verification**:
```typescript
useEffect(() => {
  return () => {
    if (streamListenersRef.current) {
      socket.off('chat-stream-token', streamListenersRef.current.token);
      socket.off('chat-stream-complete', streamListenersRef.current.complete);
      socket.off('chat-stream-error', streamListenersRef.current.error);
    }
  };
}, []);
```

---

#### Risk 3: Free Tier Users Charged for Failed Streams

**Scenario**: Stream fails → user already charged → retry charges again

**Mitigation**:
- ✅ Move `chatRequestCount` increment to AFTER `chat-stream-complete`
- ✅ Add `shouldIncrementCount` flag (defer until success)
- ✅ On error, do NOT increment counter

**Current** (WRONG):
```typescript
// Line 177 - increments BEFORE streaming
currentUser.chatRequestCount += 1;
await currentUser.save();
```

**New** (CORRECT):
```typescript
// Increment ONLY after successful stream
pythonStream.data.on('end', async () => {
  if (!streamError && shouldIncrementCount) {
    currentUser.chatRequestCount += 1;
    await currentUser.save();
  }
});
```

---

#### Risk 4: Heroku Dyno Sleep Causes Stream Timeout

**Scenario**: First request after dyno sleep → cold start → stream timeout

**Mitigation**:
- ✅ Python keepalive events every 10s (already implemented)
- ✅ Frontend displays "Waking up server..." if >3s delay
- ✅ WebSocket timeout: 60s (configurable via `STREAM_TIMEOUT_MS`)

**Already Implemented** (semantic_service.py:62-88):
```python
KEEPALIVE_INTERVAL = 10  # seconds
while not search_task.done():
    yield b" \n"  # resets Heroku router timer
    await asyncio.sleep(KEEPALIVE_INTERVAL)
```

---

### 5.2 Medium-Risk Areas

#### Risk 5: Citation References Mismatch After Renumbering

**Scenario**: Citations renumbered → chunk IDs don't match → broken references

**Mitigation**:
- ✅ Preserve existing `_renumber_citations()` logic (lines 1004-1036)
- ✅ Test with all 4 routes: `general_qa`, `follow_up`, `quote_finding`, `generate_study_guide`
- ✅ Verify `chunkReferences` array matches renumbered citations

---

#### Risk 6: Concurrent Users Overload Redis Token Bucket

**Scenario**: 10+ concurrent users → Redis token bucket depleted → rate limit errors

**Mitigation**:
- ✅ Existing token reservation logic handles this (lines 190-220)
- ✅ `try_acquire_tokens()` waits up to 10s before failing
- ✅ Redis key TTL: 70s (auto-expires)

**No changes needed** - existing rate limiting is robust

---

### 5.3 Low-Risk Areas

#### Risk 7: WebSocket Disconnect Mid-Stream

**Scenario**: User's internet drops → WebSocket disconnects → stream continues

**Mitigation**:
- ✅ Node backend continues streaming (no cancellation needed)
- ✅ MongoDB saves complete response when Python finishes
- ✅ User reconnects → sees complete message on next page load

**No special handling needed** - existing reconnect logic handles this

---

## 6. Testing Strategy

### 6.1 Unit Testing

**Python** (`semantic_search.py`):
1. Test `TokenStreamingCallback`:
   - Verify tokens added to queue
   - Verify `done` event emitted
   - Verify error handling

2. Test `stream_semantic_search`:
   - Mock LangChain streaming
   - Verify SSE format: `data: {...}\n\n`
   - Verify citations sent after `[DONE]`

**Node** (`chat_controllers.ts`):
1. Test SSE parsing:
   - Parse multi-line SSE events
   - Handle malformed JSON gracefully
   - Verify token accumulation

2. Test WebSocket emission:
   - Verify events emitted to correct room
   - Verify sessionId matching

**Frontend** (`Chat.tsx`):
1. Test WebSocket listeners:
   - Verify token appending to `partialAssistantMessage`
   - Verify finalization on `complete` event
   - Verify cleanup on unmount

2. Test error handling:
   - Verify toast on `error` event
   - Verify listener cleanup on error

---

### 6.2 Integration Testing

**End-to-End Flow**:
1. Send query → verify tokens stream in real-time
2. Test all 4 routes: `general_qa`, `follow_up`, `quote_finding`, `generate_study_guide`
3. Verify citations clickable after stream completes
4. Test document chat with page-level citations
5. Test retry mechanism: interrupt stream → retry → verify new response

**Concurrency Testing**:
1. 2+ users streaming simultaneously
2. Verify no cross-user token leakage (sessionId filtering)
3. Verify Redis token bucket handles concurrent requests

**Memory Leak Testing**:
1. Send 10 consecutive queries
2. Check Chrome DevTools Memory profiler for listener accumulation
3. Enable React StrictMode → verify no duplicate tokens

**Error Scenarios**:
1. Python crash mid-stream → verify error event emitted
2. Network timeout → verify error event after 60s
3. User disconnect → verify MongoDB saves complete response

---

### 6.3 Performance Testing

**Metrics to Track**:
- `stream.started` (counter)
- `stream.completed` (counter)
- `stream.failed` (counter)
- `stream.first_token_latency_ms` (histogram) - **Target: <2000ms**
- `stream.total_duration_ms` (histogram)

**Heroku Logs** (add to semantic_search.py):
```python
log.info("[STREAM] started", extra={"user_id": user_id, "session_id": session_id, "route": route})
first_token_time = time.time()
log.info("[STREAM] first_token", extra={"latency_ms": (first_token_time - start_time) * 1000})
log.info("[STREAM] completed", extra={"total_tokens": token_count, "duration_ms": (time.time() - start_time) * 1000})
```

---

## 7. Deployment Strategy

### 7.1 Phase 1: Python Token Streaming (3-4 hours)

**Files**:
- `backend/python_scripts/semantic_search.py` (+250 lines)
- `backend/python_scripts/semantic_service.py` (+10 lines)
- `backend/python_scripts/.env.example` (+3 lines)

**Verification**:
```bash
# Test streaming endpoint locally
curl -N http://localhost:8000/api/v1/semantic_search_stream \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","class_name":null,"doc_id":null,"user_query":"test","chat_history":[],"source":"main_app"}'

# Should see SSE events:
# data: {"type": "token", "content": "Hello"}\n\n
# data: {"type": "done", "citations": [...]}\n\n
```

---

### 7.2 Phase 2: Node WebSocket Proxy (3-4 hours)

**Files**:
- `backend/src/controllers/chat_controllers.ts` (+150 lines)
- `backend/.env.example` (+3 lines)

**Verification**:
```bash
# Test with WebSocket client (wscat)
wscat -c "ws://localhost:3000" --auth "your-jwt-token"

# Should see events:
# {"event": "chat-stream-token", "data": {"sessionId": "...", "token": "Hello"}}
# {"event": "chat-stream-complete", "data": {"sessionId": "...", "citations": [...]}}
```

---

### 7.3 Phase 3: Frontend WebSocket Consumption (2-3 hours)

**Files**:
- `frontend/src/pages/Chat.tsx` (-30 lines, +80 lines)

**Verification**:
- Open browser DevTools → Network → WS tab
- Send message → verify WebSocket frames received
- Verify tokens display in real-time (not simulated)
- Check Console for no errors

---

### 7.4 Phase 4: Integration Testing (2-3 hours)

**Tests**:
1. End-to-end flow with all services running locally
2. Memory leak testing (React StrictMode + 10+ queries)
3. Error scenarios (disconnect, timeout, retry)
4. Free tier limit testing (verify count only increments on success)
5. Performance testing (measure TTFT - target: <2s)

**Total Estimated Time**: 10-14 hours

---

## 8. Summary: Files Changed

### Files Requiring Changes (5 files + 3 configs)

| File | Type | Lines Changed | Complexity |
|------|------|---------------|------------|
| `backend/python_scripts/semantic_search.py` | Python | +250 new | HIGH |
| `backend/python_scripts/semantic_service.py` | Python | +10 new | LOW |
| `backend/src/controllers/chat_controllers.ts` | TypeScript | +150 modified | HIGH |
| `frontend/src/pages/Chat.tsx` | React | -30 deleted, +80 new | MEDIUM |
| `backend/.env.example` | Config | +3 new | LOW |
| `backend/python_scripts/.env.example` | Config | +3 new | LOW |

**Total Lines Changed**: ~466 lines (250 + 10 + 150 + 50 + 6)

---

### Files Unchanged But Critical (5 files)

| File | Reason |
|------|--------|
| `backend/src/utils/socket_server.ts` | Already production-ready (JWT auth, user rooms) |
| `frontend/src/helpers/socketClient.ts` | Already configured (singleton, auto-reconnect) |
| `backend/python_scripts/redis_setup.py` | Redis client already configured |
| `backend/python_scripts/router.py` | Route detection is stateless |
| `backend/python_scripts/config.py` | All required configs present |

---

## 9. Backward Compatibility

### Preserved Functionality

✅ **Existing chat flows work unchanged**:
- Citation rendering (inline + document references)
- Document chat with page-level citations
- Chunk references (expandable sections)
- Message reactions (like/dislike)
- Retry mechanism (version history)

✅ **Existing WebSocket events unaffected**:
- `document-ready` (document processing status)
- `processing-status` (upload progress)

✅ **MongoDB schema unchanged**:
- `ChatSession` model preserves all fields
- `messages` array structure identical
- `citation` and `chunkReferences` fields unchanged

✅ **Free tier rate limiting preserved**:
- 25 chats/month limit enforced
- Monthly reset logic unchanged
- Only difference: count increments AFTER success (not before)

---

## 10. Rollback Plan

**If streaming fails in production**:

1. **Immediate Rollback** (5 minutes):
   - Revert `chat_controllers.ts` to blocking POST
   - Revert `Chat.tsx` to simulated streaming
   - No Python changes needed (keep both endpoints)

2. **Graceful Degradation**:
   - Add `ENABLE_STREAMING` feature flag
   - Default to `false` (use old flow)
   - Gradually enable for subset of users

3. **Git Revert**:
   ```bash
   git revert <commit-hash>
   git push heroku main
   ```

**Recovery Time**: <10 minutes (Heroku redeploy)

---

## 11. Conclusion

This architecture investigation has identified **ALL files** requiring changes to implement Story 0.6: Real OpenAI Streaming via WebSocket. The implementation is a **3-layer brownfield integration** requiring coordinated changes across Python, Node, and React.

**Key Findings**:
- ✅ Existing WebSocket infrastructure is production-ready (no changes needed)
- ✅ Redis client can be extended for stream state management
- ⚠️ New async patterns required in Python (asyncio.Queue + LangChain callbacks)
- ⚠️ Careful state management required in Node (accumulate full response before MongoDB write)

**Estimated Effort**: 10-14 hours (developer + testing time)

**Risk Level**: Medium-High (but mitigated with comprehensive testing)

**Recommendation**: Proceed with phased implementation:
1. Python streaming endpoint (backend)
2. Node WebSocket proxy (middleware)
3. Frontend WebSocket consumption (UI)
4. Integration testing (E2E)

---

**Document Status**: ✅ COMPREHENSIVE ANALYSIS COMPLETE

**Next Steps**:
1. Review this document with development team
2. Create implementation plan (assign phases to developers)
3. Setup monitoring/logging for streaming metrics
4. Begin Phase 1: Python token streaming

---

*🏗️ Architecture Investigation by Winston*
*📅 Date: 2025-11-10*
*📊 Files Analyzed: 15+*
*⏱️ Investigation Time: Comprehensive*
