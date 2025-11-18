# DEV HANDOFF: Story 0.6 - Real OpenAI Streaming Implementation

**Date**: 2025-11-10
**Story**: Real OpenAI Streaming via WebSocket
**Priority**: HIGH
**Risk Level**: MEDIUM-HIGH (Brownfield integration across 3 layers)

---

## ⚠️ CRITICAL: READ THIS FIRST

### **This is a brownfield integration in a production application**

**The #1 priority is: DO NOT BREAK EXISTING FUNCTIONALITY**

This application is currently working in production with:
- Multi-route chat (general_qa, follow_up, quote_finding, study_guide, summary)
- Document chat with page-level citations
- Free tier rate limiting (25 chats/month)
- Message reactions (like/dislike)
- Retry mechanism with version history
- Real-time document processing via WebSocket
- Class and document management

**All of these features MUST continue working after your changes.**

---

## 📚 Required Reading (In Order)

**You MUST read these documents before writing any code**:

### 1. **Story Definition** (30 minutes)
📄 `/docs/stories/0.6.real-openai-streaming.md`
- Complete acceptance criteria
- Technical implementation specifications
- Detailed code examples for each layer

### 2. **Architecture Investigation** (45 minutes)
📄 `/docs/architecture/story-0.6-architecture-investigation.md`
- Comprehensive analysis of all files requiring changes
- Current vs. new data flow diagrams
- Integration points (Python ↔ Node ↔ Frontend)
- Risk assessment with mitigations
- Testing strategy
- Deployment phases

### 3. **Functionality Preservation Guide** (60 minutes) ⭐ **MOST IMPORTANT**
📄 `/docs/architecture/story-0.6-functionality-preservation-guide.md`
- **14 Python functionalities** that must remain intact
- **7 Node functionalities** that must be preserved
- **8 Frontend functionalities** that must work unchanged
- **45+ test cases** you must verify
- **Pre-deployment checklist** (ALL items must be ✅)
- **Emergency rollback procedures**

**Total Reading Time**: ~2.5 hours (DO NOT SKIP)

---

## 🎯 Implementation Scope

### **What You're Building**

Replace simulated character-by-character streaming with **real OpenAI token streaming** via WebSocket.

**Current Flow** (Blocking):
```
User → Frontend → Node (blocking POST) → Python (sync) → OpenAI
                                                              ↓
User ← Frontend ← Node ← Python ← Full Response (3-5s) ← OpenAI
     (simulate streaming with setInterval)
```

**New Flow** (Real Streaming):
```
User → Frontend (WebSocket listeners) → Node (SSE proxy) → Python (async) → OpenAI
                                                                                ↓
User ← Frontend ← Node ← Python ← Token Stream (1-2s TTFT) ← LangChain ← OpenAI
     (real-time display)
```

**Expected Result**: Time to first token (TTFT) improves from 3-5 seconds to 1-2 seconds.

---

## 📝 Files You Will Modify

### **5 Core Files + 2 Config Files**

| File | Lines to Change | Complexity | Critical Risks |
|------|----------------|------------|----------------|
| `backend/python_scripts/semantic_search.py` | +250 new | HIGH | Breaking 14 existing features |
| `backend/python_scripts/semantic_service.py` | +10 new | LOW | None (new endpoint) |
| `backend/src/controllers/chat_controllers.ts` | +150 modified | HIGH | Free tier accounting, MongoDB timing |
| `frontend/src/pages/Chat.tsx` | -30 deleted, +80 new | MEDIUM | Memory leaks, listener cleanup |
| `backend/.env.example` | +3 new | LOW | None |
| `backend/python_scripts/.env.example` | +3 new | LOW | None |

**Total**: ~466 lines of code changes

---

## 🚨 TOP 5 CRITICAL RISKS (Must Avoid)

### **1. Charging Free Users on Stream Failure** 🔴 CRITICAL

**Current Code** (WRONG):
```typescript
// backend/src/controllers/chat_controllers.ts:177
currentUser.chatRequestCount += 1;  // ← Increments BEFORE streaming
await currentUser.save();
```

**Your Fix** (REQUIRED):
```typescript
let shouldIncrementCount = false;
if (currentUser.plan === "free") {
  if (currentUser.chatRequestCount >= 25) {
    return res.status(403).json({ message: "Free plan limit reached..." });
  }
  shouldIncrementCount = true;  // ← Defer increment
}

// Later, in stream.on('end'):
if (!streamError && shouldIncrementCount) {
  currentUser.chatRequestCount += 1;  // ← Only increment on success
  await currentUser.save();
}
```

**Test**: Free user's stream fails → counter MUST NOT increment

---

### **2. Saving Partial Responses to MongoDB** 🔴 CRITICAL

**Wrong Approach** (DO NOT DO THIS):
```typescript
pythonStream.data.on('data', (chunk) => {
  fullResponse += chunk;
  await chatSession.save();  // ❌ Saves every token! (1000s of writes)
});
```

**Correct Approach** (REQUIRED):
```typescript
pythonStream.data.on('data', (chunk) => {
  fullResponse += chunk;  // ← Accumulate in memory
  // ✅ Do NOT save to MongoDB here
});

pythonStream.data.on('end', async () => {
  // ✅ ONLY save after full response received
  chatSession.messages.push({ content: fullResponse, ... });
  await chatSession.save();
});
```

**Test**: Reload page mid-stream → should NOT see partial message in MongoDB

---

### **3. Modifying Existing Python Functions** 🔴 CRITICAL

**Wrong Approach** (DO NOT DO THIS):
```python
# ❌ Modifying existing function
def process_semantic_search(...):
    # Changed to async streaming - BREAKS BACKWARD COMPATIBILITY!
```

**Correct Approach** (REQUIRED):
```python
# ✅ Keep existing function unchanged
def process_semantic_search(...):  # ← UNCHANGED
    # ... all existing logic preserved

# ✅ Add NEW function alongside
async def stream_semantic_search(...):  # ← NEW
    # ... new streaming logic
    # REUSE all existing helper functions
```

**Test**: Old endpoint `/api/v1/semantic_search` still works

---

### **4. Memory Leaks from Unclosed Listeners** 🔴 CRITICAL

**Wrong Approach** (DO NOT DO THIS):
```typescript
// frontend/src/pages/Chat.tsx
socket.on('chat-stream-token', handleToken);
// ❌ No cleanup = memory leak
```

**Correct Approach** (REQUIRED):
```typescript
// Store listener refs
const streamListenersRef = useRef<{...} | null>(null);

// Add listeners
socket.on('chat-stream-token', handleToken);
streamListenersRef.current = { token: handleToken, ... };

// Cleanup on unmount
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

**Test**: Enable React StrictMode → send 10 queries → verify no duplicate listeners

---

### **5. Breaking Follow-Up Mode** 🔴 CRITICAL

**Existing Behavior** (MUST PRESERVE):
```python
# backend/python_scripts/semantic_search.py:597-618
if route == "follow_up":
    # Reuse previous chunks (no new vector search)
    last_refs = next((m.get("chunkReferences") for m in reversed(chat_history_cleaned) ...))
    # ... chunk lookup logic
    mode = "follow_up"  # ← Skips vector search at line 620
```

**Your Requirement**:
- ✅ Copy this exact logic to new streaming function
- ✅ Follow-up MUST reuse previous chunks (no new MongoDB search)

**Test**: Send "What is X?" → then "Tell me more" → verify no new vector search

---

## ✅ Golden Rules for This Implementation

### **DO:**
1. ✅ **ADD** new functions alongside existing ones
2. ✅ **REUSE** all existing helper functions (do NOT duplicate)
3. ✅ **TEST** all 45+ test cases before deployment
4. ✅ **PRESERVE** all existing logic paths unchanged
5. ✅ **CLEAN UP** WebSocket listeners on component unmount
6. ✅ **ACCUMULATE** full response in memory before MongoDB save
7. ✅ **INCREMENT** free tier counter ONLY after successful stream
8. ✅ **VERIFY** no memory leaks with React StrictMode

### **DO NOT:**
1. ❌ Modify existing `process_semantic_search()` function
2. ❌ Delete any existing helper functions
3. ❌ Change function signatures of existing functions
4. ❌ Remove existing WebSocket events (`document-ready`)
5. ❌ Modify MongoDB schema
6. ❌ Change Redis key formats or TTL values
7. ❌ Save partial responses to MongoDB during streaming
8. ❌ Increment free tier counter before stream completes

---

## 🧪 Testing Requirements

### **You MUST verify all 45+ test cases**

**Test Suites** (see Preservation Guide for details):
1. **Core Chat Functionality** (10 tests) - 🔴 ALL CRITICAL
2. **Streaming-Specific** (10 tests) - 🔴 8 CRITICAL
3. **Free Tier & Rate Limiting** (7 tests) - 🔴 4 CRITICAL
4. **Document Chat** (5 tests) - 🔴 2 CRITICAL
5. **Backward Compatibility** (5 tests) - 🔴 2 CRITICAL
6. **Edge Cases** (8 tests) - Must handle gracefully

**Most Critical Tests**:
- ✅ Free user at 25/25 sends message → succeeds, counter increments to 25
- ✅ Free user's stream fails → counter does NOT increment
- ✅ Reload page mid-stream → NO partial message in MongoDB
- ✅ 2+ users streaming simultaneously → no cross-user token leakage
- ✅ Send "Tell me more" → reuses previous chunks (no new search)
- ✅ Enable React StrictMode → no duplicate tokens displayed
- ✅ Navigate away mid-stream → listeners cleaned up, no errors
- ✅ Load existing chat session → messages display correctly with citations

**Performance Targets**:
- ✅ TTFT (time to first token) < 2 seconds (average)
- ✅ Streaming success rate > 95%
- ✅ No memory leaks (Chrome DevTools Memory profiler after 10+ queries)

---

## 📋 Implementation Phases

### **Phase 1: Python Token Streaming** (3-4 hours)

**Files**:
- `backend/python_scripts/semantic_search.py` (+250 lines)
- `backend/python_scripts/semantic_service.py` (+10 lines)

**Tasks**:
1. Create `TokenStreamingCallback` class with asyncio.Queue
2. Create `stream_semantic_search()` async function
3. Add `/api/v1/semantic_search_stream` endpoint
4. Verify SSE format: `data: {"type": "token", "content": "..."}\n\n`
5. Test locally with curl

**Verification**:
```bash
curl -N http://localhost:8000/api/v1/semantic_search_stream \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","class_name":null,"doc_id":null,"user_query":"test","chat_history":[],"source":"main_app"}'
```

**Critical Checks**:
- [ ] Existing `/api/v1/semantic_search` endpoint still works
- [ ] All 14 Python functionalities preserved (see Preservation Guide)
- [ ] All helper functions unchanged (18 functions)

---

### **Phase 2: Node WebSocket Proxy** (3-4 hours)

**Files**:
- `backend/src/controllers/chat_controllers.ts` (+150 lines)

**Tasks**:
1. Import WebSocket server: `import { io } from '../utils/socket_server.js';`
2. Replace blocking POST with streaming POST (`responseType: 'stream'`)
3. Parse SSE events from Python
4. Emit WebSocket events to user's room
5. Move free tier increment to after stream completes
6. Move MongoDB save to `stream.on('end')`

**Verification**:
```bash
# Test with WebSocket client (wscat)
wscat -c "ws://localhost:3000" --auth "your-jwt-token"

# Should see events:
# {"event": "chat-stream-token", "data": {"sessionId": "...", "token": "Hello"}}
# {"event": "chat-stream-complete", "data": {"sessionId": "...", "citations": [...]}}
```

**Critical Checks**:
- [ ] Auth check unchanged (lines 148-152)
- [ ] Session creation logic unchanged (lines 189-224)
- [ ] Free tier increment ONLY after successful stream
- [ ] MongoDB save ONLY after stream completes
- [ ] Citation text update preserved (lines 282-297)
- [ ] Retry mechanism preserved (lines 300-333)

---

### **Phase 3: Frontend WebSocket Consumption** (2-3 hours)

**Files**:
- `frontend/src/pages/Chat.tsx` (-30 lines, +80 lines)

**Tasks**:
1. Delete simulated streaming code (lines 487-500)
2. Add WebSocket listeners for 3 events (token, complete, error)
3. Add listener cleanup in useEffect unmount
4. Test in browser with DevTools WebSocket tab

**Verification**:
- Open browser DevTools → Network → WS tab
- Send message → verify WebSocket frames received
- Verify tokens display in real-time (not simulated)
- Check Console for no errors

**Critical Checks**:
- [ ] Document-ready listener unchanged (lines 191-217)
- [ ] Class selection logic unchanged (lines 225-304)
- [ ] Auto-scroll behavior unchanged (lines 346-363)
- [ ] Message reactions unchanged (lines 135-163)
- [ ] Free tier usage counter unchanged (lines 261-272, 407-411, 442-445)
- [ ] WebSocket listeners cleaned up on unmount

---

### **Phase 4: Integration Testing** (2-3 hours)

**Tasks**:
1. Run all 45+ test cases from Preservation Guide
2. Memory leak testing (React StrictMode + 10+ queries)
3. Error scenarios (disconnect, timeout, retry)
4. Free tier limit testing
5. Performance testing (measure TTFT - target: <2s)

**Critical Checks**:
- [ ] All Core Chat Functionality tests pass (10/10)
- [ ] All Streaming-Specific tests pass (10/10)
- [ ] All Free Tier tests pass (7/7)
- [ ] All Document Chat tests pass (5/5)
- [ ] All Backward Compatibility tests pass (5/5)
- [ ] All Edge Cases handled gracefully (8/8)
- [ ] TTFT < 2 seconds (average)
- [ ] No memory leaks detected
- [ ] React StrictMode shows no duplicate tokens

---

## 🚀 Pre-Deployment Checklist

**ALL items must be ✅ before deploying**:

### Code Review:
- [ ] Existing `process_semantic_search()` unchanged
- [ ] All 18 Python helper functions unchanged
- [ ] Free tier increment moved to after stream completes
- [ ] MongoDB save moved to `stream.on('end')`
- [ ] WebSocket listener cleanup implemented
- [ ] Simulated streaming code deleted (lines 487-500)
- [ ] All new code follows existing patterns (snake_case in Python, camelCase in TS)
- [ ] No console.log statements left in code
- [ ] All TypeScript types properly defined

### Testing:
- [ ] All 45+ test cases PASS
- [ ] TTFT < 2 seconds (average across 10 queries)
- [ ] No memory leaks (Chrome DevTools Memory profiler)
- [ ] React StrictMode enabled (no duplicate tokens)
- [ ] Streaming success rate > 95% (manual testing with 20+ queries)
- [ ] All 5 routes tested: general_qa, follow_up, quote_finding, study_guide, summary
- [ ] Document chat with page citations works
- [ ] Retry mechanism works (creates version history)
- [ ] Free tier limit enforced correctly

### Monitoring:
- [ ] Heroku logs show streaming metrics (started, first_token, completed)
- [ ] Redis stream state keys created and cleaned up
- [ ] MongoDB writes only after stream completes (no incremental writes)
- [ ] No errors in Heroku logs during test run

### Configuration:
- [ ] Environment variables added to `.env.example` files
- [ ] Local `.env` files updated (not committed)
- [ ] Heroku config vars documented (for production deployment)

### Documentation:
- [ ] Code comments added for complex logic
- [ ] Any architecture deviations documented and justified
- [ ] Rollback procedure tested locally

### Rollback Preparation:
- [ ] Git commit hash documented
- [ ] Feature flag `ENABLE_STREAMING` configured (default: false)
- [ ] Rollback script ready (see below)
- [ ] Team notified of deployment window

---

## 🚨 Emergency Rollback Procedures

### **If something breaks in production**:

#### **5-Minute Rollback** (Full Revert):
```bash
# 1. Identify working commit
git log --oneline

# 2. Revert to last working version
git revert <commit-hash>

# 3. Deploy to Heroku
git push heroku main

# 4. Verify services are healthy
heroku logs --tail --app class-chat-node-8a0ef9662b5a
heroku logs --tail --app class-chat-python-f081e08f29b8
```

#### **1-Minute Feature Flag Disable** (Graceful Degradation):
```bash
# Disable streaming (falls back to old flow)
heroku config:set ENABLE_STREAMING=false --app class-chat-node-8a0ef9662b5a
heroku config:set ENABLE_STREAMING=false --app class-chat-python-f081e08f29b8

# Verify
heroku config --app class-chat-node-8a0ef9662b5a | grep ENABLE_STREAMING
```

#### **Rollback Triggers** (Immediate rollback if any occur):
- [ ] Streaming success rate < 95%
- [ ] TTFT > 3 seconds (regression from current)
- [ ] Memory leaks detected (increasing memory usage)
- [ ] Free tier counter bugs (charging on failure)
- [ ] MongoDB partial writes detected
- [ ] Existing features broken (citations, reactions, document chat)
- [ ] Multiple user reports of issues

---

## 📞 Questions & Clarifications

### **Before you start coding, clarify**:

1. **Architecture Questions**:
   - Do you understand the 3-layer flow (Python → Node → Frontend)?
   - Do you understand why we use LangChain instead of direct OpenAI client?
   - Do you understand the SSE → WebSocket conversion in Node?

2. **Preservation Questions**:
   - Have you read all 14 Python functionalities that must be preserved?
   - Do you understand why free tier increment must move to after stream completes?
   - Do you understand why MongoDB save must happen only once?

3. **Testing Questions**:
   - Do you have access to a local MongoDB instance for testing?
   - Do you have access to Redis for token reservation testing?
   - Do you have an OpenAI API key for testing?
   - Can you enable React StrictMode for memory leak testing?

4. **Deployment Questions**:
   - Do you have access to Heroku for deployment?
   - Do you understand the feature flag strategy?
   - Do you know how to rollback if something breaks?

**If you're unclear on ANY of these, ask for clarification BEFORE writing code.**

---

## 📚 Reference Architecture Docs

**Already in this repo** (for your reference):

1. **`/CLAUDE.md`** - Project architecture overview
2. **`/docs/architecture/coding-standards.md`** - Code style guide
3. **`/docs/architecture/tech-stack.md`** - Technology decisions
4. **`/docs/architecture/source-tree.md`** - Codebase organization

**Story-specific docs** (MUST READ):

1. **`/docs/stories/0.6.real-openai-streaming.md`** - Complete story with acceptance criteria
2. **`/docs/architecture/story-0.6-architecture-investigation.md`** - File-by-file analysis
3. **`/docs/architecture/story-0.6-functionality-preservation-guide.md`** - What NOT to break

---

## 🎯 Success Criteria

**Your implementation is complete when**:

1. ✅ All 45+ test cases pass
2. ✅ TTFT < 2 seconds (50% improvement)
3. ✅ Zero existing functionalities broken
4. ✅ No memory leaks detected
5. ✅ Free tier accounting works correctly
6. ✅ MongoDB writes only after stream completes
7. ✅ Pre-deployment checklist 100% complete
8. ✅ Code review approved by tech lead

**Estimated Total Time**: 10-14 hours (including testing)

---

## 🚦 Getting Started

### **Step-by-step start procedure**:

1. **Read all required docs** (2.5 hours)
   - [ ] Story definition
   - [ ] Architecture investigation
   - [ ] Functionality preservation guide

2. **Set up local environment** (30 minutes)
   - [ ] MongoDB running locally
   - [ ] Redis running locally
   - [ ] Python dependencies installed
   - [ ] Node dependencies installed
   - [ ] OpenAI API key configured
   - [ ] All services start successfully

3. **Create feature branch** (5 minutes)
   ```bash
   git checkout -b feature/story-0.6-real-streaming
   ```

4. **Run existing tests** (baseline) (15 minutes)
   - [ ] Verify all existing tests pass
   - [ ] Document baseline performance (TTFT, success rate)

5. **Begin Phase 1** (Python streaming)
   - Follow the Phase 1 checklist in this document
   - Verify each critical check before moving to Phase 2

6. **Continue through Phases 2-4**
   - Complete each phase fully before moving to next
   - Run tests after each phase

7. **Complete pre-deployment checklist**
   - ALL items must be ✅

8. **Create pull request**
   - Reference this handoff doc
   - Include test results
   - Document any deviations from the plan

---

## ⚠️ Final Reminder

**This is a production application with real users.**

**Your changes MUST NOT break**:
- Multi-route chat (general_qa, follow_up, quote_finding, study_guide, summary)
- Document chat with page-level citations
- Free tier rate limiting (25 chats/month)
- Message reactions (like/dislike)
- Retry mechanism with version history
- Real-time document processing
- Class and document management
- Existing WebSocket events
- MongoDB schema
- Redis integration

**If you're unsure about ANY change, ask for clarification BEFORE implementing.**

**When in doubt, preserve existing behavior.**

---

## 📝 Development Notes

**Use this section to track your progress**:

### Phase 1 Completion:
- [ ] Date started: __________
- [ ] Date completed: __________
- [ ] Issues encountered: __________
- [ ] All critical checks ✅

### Phase 2 Completion:
- [ ] Date started: __________
- [ ] Date completed: __________
- [ ] Issues encountered: __________
- [ ] All critical checks ✅

### Phase 3 Completion:
- [ ] Date started: __________
- [ ] Date completed: __________
- [ ] Issues encountered: __________
- [ ] All critical checks ✅

### Phase 4 Completion:
- [ ] Date started: __________
- [ ] Date completed: __________
- [ ] Test results: __________
- [ ] All critical checks ✅

### Pre-Deployment:
- [ ] Checklist completed: __________
- [ ] Code review approved: __________
- [ ] Ready for deployment: __________

---

**Good luck! Remember: Preservation first, streaming second.**

---

*🏗️ Dev Handoff by Winston (Architecture Agent)*
*📅 Date: 2025-11-10*
*⚠️ CRITICAL: Read all referenced docs before coding*
