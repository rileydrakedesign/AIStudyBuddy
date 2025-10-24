# Testing Strategy

## Testing Approach for MVP

**No Automated Testing Infrastructure** - Acceptable for MVP beta launch given:
- Solo developer / small team
- No staging environment (production is test environment)
- Manual testing more practical than E2E test setup for initial launch
- Post-beta: Add automated tests based on beta feedback

**Primary Testing Method**: **Manual Testing Checklist** (comprehensive, repeatable)

**Secondary Testing Method**: **API Testing** (Postman/curl for backend verification)

## Manual Testing Checklist

**Comprehensive 29-Test Suite** (from PRD Story 2.9) - Execute before each production deploy.

### Auth Flows (7 Tests)

1. Email/Password Signup + Verification
2. Google OAuth Signup
3. Forgot Password Flow
4. Change Email (Profile)
5. Change Password (Profile)
6. Login Rate Limiting
7. Delete Account

### Document Management (6 Tests)

8. PDF Upload + Ingestion
9. DOCX Upload + Ingestion
10. PPTX Upload + Ingestion
11. OCR Upload (Scanned PDF/Image)
12. Unsupported Format Rejection
13. Document Deletion

### Chat & RAG (7 Tests)

14. Class Chat with Citation Limit (max 3-5 citations)
15. Document Chat with Page-Level Citations
16. Study Guide Generation + Save + Edit + Delete
17. Summary Generation + Save
18. Quote Finding + Save
19. Follow-Up Query Context Preservation
20. No-Hit Query Refinement Suggestions

### UI/UX (6 Tests)

21. Sidebar Class Selection
22. Recent Chats (All Classes)
23. Document Viewer Summary Toggle
24. Formula Rendering (No Layout Breaks)
25. Toast Notification Positioning
26. Mobile Access Blocking

### Performance (3 Tests)

27. Query Response Time (<3s first token, <15s complete)
28. Ingestion Time (<2 min for 50-page PDF)
29. Sidebar Class Selection Latency (<200ms)

## API Testing (Backend Verification)

**Postman/Curl Test Suite** - Execute before deploying backend changes.

**Node API Health Checks**:
```bash
# Login
curl -X POST https://class-chat-node-8a0ef9662b5a.herokuapp.com/api/v1/user/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'

# Save material
curl -X POST https://class-chat-node-8a0ef9662b5a.herokuapp.com/api/v1/materials/save \
  -H "Cookie: auth_token=..." \
  -H "Content-Type: application/json" \
  -d '{"classId":"CS229","type":"study_guide","title":"Test","content":"# Test"}'
```

**Python API Health Checks**:
```bash
# Semantic search
curl -X POST https://class-chat-python-f081e08f29b8.herokuapp.com/api/v1/semantic_search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id":"test-user-id",
    "class_name":"CS229",
    "doc_id":null,
    "user_query":"What are Markov chains?",
    "chat_history":[],
    "source":"main_app"
  }'
```

## Regression Testing

**Critical Regression Checklist** - Execute after EVERY deploy:

- Email/password signup and login
- Google OAuth login
- PDF upload and ingestion
- Class chat with citations
- Document chat with page navigation
- WebSocket streaming
- Document deletion
- User logout

**If ANY regression test fails**: Rollback immediately.

## Future Testing Infrastructure (Post-Beta)

**Recommended for Phase 2**:

- **Frontend E2E Tests** (Playwright or Cypress): Auth flows, upload → chat → citation
- **Backend Unit Tests** (Jest): Controller logic, rate limiting, citation renumbering
- **Python Unit Tests** (pytest): Citation deduplication, section extraction, processors
- **Integration Tests**: Node → Python API calls, MongoDB schema validation
- **Load Testing** (k6): Concurrent user queries, ingestion queue stress

---
