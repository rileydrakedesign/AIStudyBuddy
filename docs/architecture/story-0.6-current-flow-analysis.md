# Story 0.6: Current Simulated Streaming Flow Analysis

**Purpose**: Document EXACTLY how the current simulated streaming works, so we can replicate this behavior with real streaming.

**Created**: 2025-11-14
**Status**: Complete Analysis

---

## Current Implementation Flow

### 1. Frontend: Simulated Streaming (Chat.tsx)

#### State Management
```typescript
// Line 104: Partial message accumulator
const [partialAssistantMessage, setPartialAssistantMessage] = useState("");

// Line 105: Interval ref for simulation
const typeIntervalRef = useRef<NodeJS.Timeout | null>(null);

// Line 114: Generation state
const [isGenerating, setIsGenerating] = useState(false);
```

#### Flow (lines 440-500)
```typescript
// 1. Send blocking request (waits for full response)
const chatData = await sendChatRequest(content, classNameForRequest, chatSessionId);

// 2. Extract complete response
const allMessages = chatData.messages;
const finalAssistantMsg = allMessages[allMessages.length - 1];

// 3. Remove last message temporarily (line 478)
const updatedWithoutLast = allMessages.slice(0, allMessages.length - 1);
setChatMessages(updatedWithoutLast);

// 4. Get full text to "stream"
const fullText = finalAssistantMsg.content;
let i = 0;

// 5. SIMULATE streaming with setInterval (2ms per character)
typeIntervalRef.current = setInterval(() => {
  i += 1;
  setPartialAssistantMessage(fullText.substring(0, i));  // ← Character-by-character

  if (i >= fullText.length) {
    clearInterval(typeIntervalRef.current);
    typeIntervalRef.current = null;
    setChatMessages([...updatedWithoutLast, finalAssistantMsg]);  // ← Add back full message
    setPartialAssistantMessage("");  // ← Clear partial
    setIsGenerating(false);  // ← Stop generating state
  }
}, 2);  // ← 2ms = 500 chars/second
```

#### Key Observations
- ✅ Uses `partialAssistantMessage` state for accumulation
- ✅ Updates every 2ms (very fast - creates smooth effect)
- ✅ Auto-scroll triggers on `partialAssistantMessage` updates (line 363)
- ✅ Complete message includes: content, citation, chunkReferences
- ✅ Citations appear AFTER streaming completes (embedded in finalAssistantMsg)
- ✅ Free tier counter increments BEFORE streaming starts (line 443)
- ✅ Session updates happen after full response received (lines 447-464)

---

### 2. Node Backend: Blocking POST (chat_controllers.ts)

#### Flow (lines 260-335)
```typescript
// 1. Call Python API (BLOCKING - waits for full response)
const responseFromPython = await axios.post(
  semanticSearchEndpoint,
  requestData,
  { headers: { 'X-Request-ID': (req as any).id } }
);

// 2. Extract complete response
const resultMessage = responseFromPython.data;
const aiResponse = resultMessage.message;
let citation = resultMessage.citation;
const chunks = resultMessage.chunks || [];

// 3. Build chunk references
const chunkReferences = chunks.map((c) => ({
  chunkId: c._id,
  displayNumber: c.chunkNumber,
  pageNumber: c.pageNumber ?? null,
  docId: c.docId ?? null,
}));

// 4. Update citation text if single-document chat (lines 283-297)
if (chatSession.assignedDocument && citation && Array.isArray(citation)) {
  let doc = await Document.findOne({ docId: chatSession.assignedDocument });
  if (doc) {
    citation = citation.map((cit) => ({ ...cit, text: doc.fileName }));
  }
}

// 5. Handle retry logic (lines 300-333)
if (retry === true) {
  // Version history: move old content to versions[], update current
  const prevMsg = chatSession.messages[lastIdx];
  if (!prevMsg.versions) prevMsg.versions = [prevMsg.content];
  prevMsg.versions.push(aiResponse);
  prevMsg.currentVersion = prevMsg.versions.length - 1;
  prevMsg.content = aiResponse;
  prevMsg.citation = citation;
  prevMsg.chunkReferences = chunkReferences;
} else {
  // Normal: push new message
  chatSession.messages.push({
    content: aiResponse,
    role: "assistant",
    citation,
    chunkReferences,
  });
}

// 6. Save to MongoDB IMMEDIATELY (line 335)
await chatSession.save();

// 7. Return complete response to frontend
return res.status(200).json({
  chatSessionId: chatSession._id,
  messages: chatSession.messages,
  assignedClass: chatSession.assignedClass,
  assignedDocument: chatSession.assignedDocument,
  chunks,
});
```

#### Key Observations
- ✅ Free tier count incremented BEFORE Python call (line 177) ⚠️ **MUST CHANGE**
- ✅ Session bookkeeping complete before Python call (lines 189-238)
- ✅ MongoDB save happens immediately after Python response
- ✅ Citation text updated for document chats (uses Document lookup)
- ✅ Retry mechanism creates version history
- ✅ Response includes full messages array + metadata

---

### 3. Python Service: Keepalive Wrapper (semantic_service.py)

#### Flow (lines 64-104)
```python
async def body_generator():
    loop = asyncio.get_running_loop()

    # 1. Run blocking search in thread pool
    search_task = loop.run_in_executor(
        None,
        process_semantic_search,  # ← BLOCKING SYNC FUNCTION
        req.user_id,
        req.class_name or "null",
        req.doc_id or "null",
        req.user_query,
        req.chat_history,
        req.source,
    )

    # 2. While running, send whitespace keepalive (every 10s)
    while not search_task.done():
        yield b" \n"  # ← Resets Heroku router 30s idle timeout
        await asyncio.sleep(KEEPALIVE_INTERVAL)  # 10 seconds

    # 3. Task finished - stream full JSON response
    result = await search_task
    yield json.dumps(result).encode()  # ← ONE BIG JSON BLOB

# Return as StreamingResponse (but only for keepalive, not token streaming)
resp = StreamingResponse(body_generator(), media_type="application/json")
resp.headers["X-Keepalive"] = "1"
return resp
```

#### Key Observations
- ✅ Already uses StreamingResponse (but not for tokens)
- ✅ Keepalive prevents Heroku timeout (30s idle limit)
- ✅ `process_semantic_search()` is synchronous and blocking
- ✅ Returns ONE complete JSON response at the end
- ❌ No token-level streaming from OpenAI

---

### 4. WebSocket Infrastructure (Existing but Unused for Chat)

#### Socket Server (socket_server.ts)
```typescript
// JWT authentication middleware (lines 36-75)
io.use((socket, next) => {
  // Extract JWT from cookie
  // Verify JWT
  // Attach userId to socket.data
  next();
});

// Client connection (lines 87-98)
io.on("connection", (socket: Socket) => {
  const uid = socket.data.userId as string;
  socket.join(uid);  // ← Join user-specific room
  addUserSocket(uid, socket);
});

// Document-ready event emission (lines 101-115)
Document.watch([...]).on("change", (change) => {
  const room = d.userId?.toString();
  io.to(room).emit("document-ready", {  // ← Emit to user's room
    docId: d._id.toString(),
    fileName: d.fileName,
    className: d.className,
  });
});
```

#### Socket Client (socketClient.ts)
```typescript
// Singleton pattern (lines 5-11)
export const initializeSocket = (): Socket => {
  if (socket) {
    if (socket.disconnected) socket.connect();
    return socket;
  }

  socket = io(import.meta.env.VITE_WS_URL, {
    withCredentials: true,  // ← Cookie-based auth
  });

  return socket;
};
```

#### Frontend Usage (Chat.tsx:191-217)
```typescript
// Document-ready listener (already implemented)
const handleDocumentReady = (data: { docId: string; fileName: string; className: string }) => {
  setClassDocs((prev) => {
    // Update document list
  });
};

socket.on("document-ready", handleDocumentReady);

return () => {
  socket.off("document-ready", handleDocumentReady);  // ← Cleanup
};
```

#### Key Observations
- ✅ WebSocket server fully functional with JWT auth
- ✅ User-specific rooms already configured (socket.join(uid))
- ✅ Event emission pattern already established (document-ready)
- ✅ Frontend already using socket with cleanup pattern
- ✅ Singleton socket client with auto-reconnect
- ❌ NOT used for chat streaming (only document processing)

---

## UX Behavior to Preserve

### Visual Streaming Effect
- **Current**: Characters appear one at a time at 500 chars/second (2ms interval)
- **Target**: Tokens appear as they arrive from OpenAI (likely 10-50 tokens/second)
- **Impact**: Real streaming will be slightly slower but more realistic

### State Transitions
```
1. User submits message
   ↓
2. isGenerating = true, partialAssistantMessage = ""
   ↓
3. Characters accumulate in partialAssistantMessage (simulated or real)
   ↓
4. When complete: partialAssistantMessage cleared, full message in chatMessages
   ↓
5. isGenerating = false
```

### Auto-Scroll Behavior (lines 346-363)
```typescript
// Auto-scroll triggers on partialAssistantMessage updates
useEffect(() => {
  if (isAtBottom && messagesEndRef.current)
    messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
}, [chatMessages, partialAssistantMessage, isAtBottom]);
```
- ✅ This will work identically with real streaming (no changes needed)

### Free Tier Counter (lines 442-445)
```typescript
// Increment local counter after success
setChatUsage((prev) =>
  prev ? { ...prev, count: Math.min(prev.count + 1, prev.limit) } : prev
);
```
- ⚠️ Currently happens AFTER response received
- ⚠️ Backend increments BEFORE Python call (line 177) - **MUST CHANGE**

---

## New Streaming Implementation: Matching Current Behavior

### Phase 1: Python Token Streaming

**What Changes**:
```python
# NEW: Async streaming function
async def stream_semantic_search(...) -> StreamingResponse:
    # 1. Perform retrieval (same as existing)
    chunks = perform_semantic_search(...)

    # 2. Setup streaming callback
    callback = TokenStreamingCallback()
    llm = ChatOpenAI(streaming=True, callbacks=[callback])

    # 3. Stream tokens as SSE
    async def token_generator():
        task = asyncio.create_task(chain.ainvoke(...))

        while True:
            event = await callback.queue.get()

            if event["type"] == "done":
                # Send citations AFTER streaming completes
                yield f"data: {json.dumps({'type': 'done', 'citations': citations, 'chunkReferences': chunk_refs})}\n\n"
                break
            else:
                # Yield individual token
                yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(token_generator(), media_type="text/event-stream")
```

**What Stays Same**:
- ✅ Retrieval logic unchanged (vector search, route detection, etc.)
- ✅ Citation generation unchanged
- ✅ Chunk reference building unchanged
- ✅ Token reservation unchanged
- ✅ Error handling unchanged

---

### Phase 2: Node WebSocket Proxy

**What Changes**:
```typescript
// REPLACE blocking POST with streaming
const pythonStream = await axios.post(streamEndpoint, requestData, {
  responseType: 'stream',  // ← Stream SSE events
});

let fullResponse = "";
let citations = null;
let chunkReferences = [];

pythonStream.data.on('data', (chunk: Buffer) => {
  const events = parseSSE(chunk);

  events.forEach(event => {
    if (event.type === 'token') {
      // Emit token to user's WebSocket room
      io.to(userRoom).emit('chat-stream-token', {
        sessionId: chatSession._id.toString(),
        token: event.content
      });
      fullResponse += event.content;  // ← Accumulate in memory

    } else if (event.type === 'done') {
      citations = event.citations;
      chunkReferences = event.chunkReferences;
    }
  });
});

pythonStream.data.on('end', async () => {
  // Update citation text (same as before)
  if (chatSession.assignedDocument) {
    // ... citation update logic ...
  }

  // Handle retry logic (same as before)
  if (retry) {
    // ... version history logic ...
  } else {
    chatSession.messages.push({
      content: fullResponse,  // ← Use accumulated response
      role: "assistant",
      citation: citations,
      chunkReferences: chunkReferences,
    });
  }

  await chatSession.save();  // ← Save ONLY after stream completes

  // Increment free tier count ONLY after success
  if (shouldIncrementCount) {
    currentUser.chatRequestCount += 1;
    await currentUser.save();
  }

  // Emit completion event
  io.to(userRoom).emit('chat-stream-complete', {
    sessionId: chatSession._id.toString(),
    citations: citations,
    chunkReferences: chunkReferences
  });
});
```

**What Stays Same**:
- ✅ Auth check (lines 148-152)
- ✅ Free tier limit check (lines 157-175)
- ✅ Session creation logic (lines 189-238)
- ✅ User message push (lines 230-238)
- ✅ Citation text update logic (lines 283-297)
- ✅ Retry version history logic (lines 300-333)

**What Moves**:
- ⚠️ Free tier count increment: FROM before Python call → TO after stream completes
- ⚠️ MongoDB save: FROM immediate → TO stream.on('end')

---

### Phase 3: Frontend WebSocket Consumption

**What Changes**:
```typescript
// DELETE simulated streaming (lines 487-500)
// REMOVE: typeIntervalRef.current = setInterval(...)

// ADD WebSocket listeners
const handleSubmit = async () => {
  // ... existing setup ...

  const socket = initializeSocket();

  const handleToken = (data: { sessionId: string; token: string }) => {
    if (data.sessionId === currentChatSessionId) {
      setPartialAssistantMessage(prev => prev + data.token);  // ← Append token (not substring!)
    }
  };

  const handleComplete = (data: { sessionId: string; citations: any[]; chunkReferences: any[] }) => {
    if (data.sessionId === currentChatSessionId) {
      const finalMessage = {
        role: "assistant" as const,
        content: partialAssistantMessage,  // ← Use accumulated partial
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

  // Trigger streaming
  await sendChatRequest(content, currentChatSessionId, selectedClass, activeDocId);
};
```

**What Stays Same**:
- ✅ State management: `partialAssistantMessage` accumulator
- ✅ State transitions: empty → partial → full message
- ✅ Auto-scroll trigger: `useEffect([partialAssistantMessage])`
- ✅ Generation state: `isGenerating`
- ✅ Document-ready listener (lines 191-217)
- ✅ Class selection logic
- ✅ Chat session loading
- ✅ Free tier usage display
- ✅ Message reactions
- ✅ All other features

**Key Difference**:
- **OLD**: `setPartialAssistantMessage(fullText.substring(0, i))` (substring of complete text)
- **NEW**: `setPartialAssistantMessage(prev => prev + data.token)` (append each token)
- **Result**: IDENTICAL visual effect, just real tokens instead of simulated

---

## Critical Success Criteria

### Must Preserve
1. ✅ Same visual streaming effect (characters appear progressively)
2. ✅ Same state management pattern (partialAssistantMessage → chatMessages)
3. ✅ Same auto-scroll behavior
4. ✅ Same cleanup on unmount
5. ✅ Same error handling (toast messages)
6. ✅ Same free tier counter display
7. ✅ Same citation rendering (after stream completes)
8. ✅ Same retry mechanism (version history)
9. ✅ Same document chat behavior (page-level citations)
10. ✅ Same session management

### Must Change
1. ⚠️ Free tier count increment: AFTER success (not before)
2. ⚠️ MongoDB save: AFTER stream completes (not immediate)
3. ⚠️ Token delivery: Real OpenAI tokens (not substring simulation)

### Must Add
1. ✅ WebSocket listeners for 3 events (token, complete, error)
2. ✅ Cleanup on unmount (prevent memory leaks)
3. ✅ Python async streaming function
4. ✅ Node SSE parsing and WebSocket emission

---

## Complexity Assessment

### Low Complexity
- ✅ Frontend WebSocket listeners (follows existing document-ready pattern)
- ✅ WebSocket server (no changes needed - already ready)
- ✅ Socket client (no changes needed - already ready)

### Medium Complexity
- ⚠️ Node SSE parsing and WebSocket proxy
- ⚠️ Moving MongoDB save timing
- ⚠️ Moving free tier increment timing

### High Complexity
- 🔴 Python async streaming with LangChain callbacks
- 🔴 Preserving all existing Python logic (routes, citations, validation, etc.)
- 🔴 Testing all 4+ query routes with streaming

---

## Testing Strategy

### Visual Regression Testing
1. Send same query in both versions
2. Compare:
   - Streaming speed (should be similar)
   - Final message (identical)
   - Citations (identical)
   - Chunk references (identical)
3. Verify auto-scroll behavior matches

### Functional Testing
1. All query routes work (general_qa, follow_up, quote_finding, generate_study_guide)
2. Retry mechanism works (version history)
3. Free tier counter accurate (increments only on success)
4. Document chat works (page citations)
5. Error handling works (toast messages)

### Performance Testing
1. TTFT (time to first token): <2 seconds
2. No memory leaks (listener cleanup)
3. No duplicate tokens (React StrictMode)

---

## Conclusion

The new streaming implementation is **NOT over-engineered** - it's a direct replacement of the simulated streaming with real streaming while preserving:

1. ✅ Exact same UX (progressive text appearance)
2. ✅ Exact same state management
3. ✅ Exact same features (citations, retry, reactions, etc.)
4. ✅ Existing WebSocket infrastructure (already built)

**Only Changes**:
- Remove `setInterval` simulation
- Add WebSocket listeners (3 events)
- Add Python async streaming
- Add Node SSE proxy
- Fix timing issues (MongoDB save, free tier count)

**No Over-Engineering**:
- ❌ No new state management
- ❌ No UI redesign
- ❌ No new features
- ❌ No architectural changes
- ✅ Just real tokens instead of fake ones

---

*📊 Analysis Complete*
*📅 Date: 2025-11-14*
*✅ Ready for Implementation*
