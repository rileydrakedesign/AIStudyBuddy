# Source Tree

## Existing Project Structure

The project follows a monorepo structure with separate frontend, backend (Node), and Python AI service directories.

```plaintext
AIStudyBuddy/
├── frontend/                       # React SPA (Vercel deployment)
│   ├── public/                     # Static assets
│   ├── src/
│   │   ├── assets/                 # Images, icons
│   │   ├── components/
│   │   │   ├── chat/               # Chat-related components
│   │   │   │   ├── chatItem.tsx
│   │   │   │   └── DocumentChat.tsx
│   │   │   ├── shared/             # Reusable components
│   │   │   │   ├── CustomizedInput.tsx
│   │   │   │   ├── Logo.tsx
│   │   │   │   └── NavigationLink.tsx
│   │   │   ├── ui/                 # UI primitives (buttons, inputs, loaders)
│   │   │   └── Header.tsx
│   │   ├── config/                 # Frontend config
│   │   ├── context/                # React Context providers
│   │   │   └── authContext.tsx
│   │   ├── helpers/                # API communication, socket client
│   │   │   ├── api-communicators.ts
│   │   │   └── socketClient.ts
│   │   ├── hooks/                  # Custom React hooks
│   │   │   └── use-toast.ts
│   │   ├── lib/                    # Utility functions
│   │   │   └── utils.ts
│   │   ├── pages/                  # Page-level components
│   │   │   ├── Chat.tsx
│   │   │   ├── DocumentChat.tsx
│   │   │   ├── ForgotPassword.tsx
│   │   │   ├── Home.tsx
│   │   │   ├── Login.tsx
│   │   │   ├── NotFound.tsx
│   │   │   ├── Profile.tsx
│   │   │   ├── ResetPassword.tsx
│   │   │   ├── Signup.tsx
│   │   │   └── Upload.tsx
│   │   ├── theme/                  # Material UI theme config
│   │   │   ├── muiTheme.ts
│   │   │   └── tokens.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── .env.local
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── backend/                        # Node.js API (Heroku deployment)
│   ├── src/
│   │   ├── config/                 # Database connection config
│   │   ├── controllers/            # Route handlers
│   │   │   ├── chat_controllers.ts
│   │   │   ├── document_controllers.ts
│   │   │   ├── download_controllers.ts
│   │   │   ├── password_reset.ts
│   │   │   ├── profile_controllers.ts
│   │   │   ├── user_confirm.ts
│   │   │   └── user_controllers.ts
│   │   ├── db/                     # MongoDB connection setup
│   │   ├── models/                 # Mongoose schemas
│   │   │   ├── chatSession.ts
│   │   │   ├── chunkModel.ts
│   │   │   ├── documents.ts
│   │   │   ├── IChunk.ts
│   │   │   └── user.ts
│   │   ├── routes/                 # Express route definitions
│   │   │   ├── chat_routes.ts
│   │   │   ├── document_routes.ts
│   │   │   ├── download_routes.ts
│   │   │   ├── index.ts
│   │   │   ├── profile_routes.ts
│   │   │   └── user_routes.ts
│   │   ├── utils/                  # Utilities (email, logger, validators, socket)
│   │   │   ├── constants.ts
│   │   │   ├── email.ts
│   │   │   ├── logger.ts
│   │   │   ├── socket_server.ts
│   │   │   ├── token_manager.ts
│   │   │   └── validators.ts
│   │   ├── app.ts                  # Express app setup
│   │   └── index.ts                # Entry point
│   ├── .env.local
│   ├── package.json
│   └── tsconfig.json
│
│   └── python_scripts/             # Python AI service (Heroku deployment)
│       ├── load_data.py            # Document ingestion, chunking, embedding
│       ├── logger_setup.py         # Loguru configuration
│       ├── redis_setup.py          # Redis connection
│       ├── router.py               # Query routing logic
│       ├── semantic_search.py      # RAG retrieval + generation
│       ├── semantic_service.py     # FastAPI app
│       ├── tasks.py                # RQ job definitions
│       ├── worker_boot.py          # RQ worker entry point
│       ├── .env.local
│       └── requirements.txt
│
├── docs/                           # Documentation
│   ├── prd.md                      # Product requirements
│   └── brief.md                    # Product brief
│
├── .bmad-core/                     # BMAD agent framework
├── .claude/                        # Claude Code configuration
├── CLAUDE.md                       # Architecture reference
└── README.md
```

## New File Organization

All new files placed directly in **existing folders** following the current flat structure. No new folders created.

```plaintext
AIStudyBuddy/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── chatItem.tsx                      # EXISTING
│   │   │   │   ├── DocumentChat.tsx                  # EXISTING
│   │   │   │   ├── SpecialResponseCard.tsx           # NEW: Study guide/summary formatting
│   │   │   │   └── SummaryView.tsx                   # NEW: Document summary toggle
│   │   │   ├── shared/
│   │   │   │   ├── CustomizedInput.tsx               # EXISTING
│   │   │   │   ├── Logo.tsx                          # EXISTING
│   │   │   │   ├── NavigationLink.tsx                # EXISTING
│   │   │   │   ├── ClassDropdown.tsx                 # NEW: Class selector
│   │   │   │   ├── SavedMaterialsList.tsx            # NEW: Saved materials
│   │   │   │   ├── RecentChatsList.tsx               # NEW: Recent chats
│   │   │   │   ├── SaveMaterialModal.tsx             # NEW: Save dialog
│   │   │   │   ├── DeleteAccountModal.tsx            # NEW: Delete confirmation
│   │   │   │   └── MobileBlockingPage.tsx            # NEW: Mobile block page
│   │   │   ├── ui/                                   # EXISTING (no changes)
│   │   │   └── Header.tsx                            # EXISTING
│   │   ├── context/
│   │   │   ├── authContext.tsx                       # EXISTING
│   │   │   └── savedMaterialsContext.tsx             # NEW: Materials state
│   │   ├── helpers/
│   │   │   ├── api-communicators.ts                  # MODIFIED: Add materials APIs
│   │   │   └── socketClient.ts                       # EXISTING
│   │   ├── hooks/
│   │   │   ├── use-toast.ts                          # EXISTING
│   │   │   └── useSavedMaterials.ts                  # NEW: Materials hook
│   │   ├── pages/
│   │   │   ├── Chat.tsx                              # MODIFIED: New sidebar
│   │   │   ├── Profile.tsx                           # MODIFIED: Delete account
│   │   │   └── ...                                   # EXISTING pages
│   │   └── App.tsx                                   # MODIFIED: Mobile detection
│
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── user_controllers.ts                   # MODIFIED: Delete account, rate limit
│   │   │   ├── password_reset.ts                     # EXISTING (email template tweak)
│   │   │   ├── materials_controllers.ts              # NEW: Materials CRUD
│   │   │   └── ...                                   # EXISTING
│   │   ├── models/
│   │   │   ├── user.ts                               # MODIFIED: New fields
│   │   │   ├── documents.ts                          # MODIFIED: New fields
│   │   │   ├── savedMaterial.ts                      # NEW: Materials schema
│   │   │   └── ...                                   # EXISTING
│   │   ├── routes/
│   │   │   ├── index.ts                              # MODIFIED: Mount materials routes
│   │   │   ├── materials_routes.ts                   # NEW: Materials routes
│   │   │   └── ...                                   # EXISTING
│   │   └── utils/
│   │       ├── email.ts                              # MODIFIED: Email templates
│   │       ├── rateLimitLogin.ts                     # NEW: Rate limit middleware
│   │       └── ...                                   # EXISTING
│
│   └── python_scripts/
│       ├── config.py                                 # NEW: Centralized env vars
│       ├── docx_processor.py                         # NEW: DOCX extraction
│       ├── pptx_processor.py                         # NEW: PPTX extraction
│       ├── ocr_processor.py                          # NEW: OCR processing
│       ├── load_data.py                              # MODIFIED: Section metadata, routing
│       ├── router.py                                 # MODIFIED: Follow-up detection
│       ├── semantic_search.py                        # MODIFIED: Citation fix, hybrid retrieval
│       ├── semantic_service.py                       # MODIFIED: Suggested queries endpoint
│       └── ...                                       # EXISTING
│
├── docs/
│   ├── architecture.md                               # NEW: This document
│   ├── prd.md                                        # EXISTING
│   └── brief.md                                      # EXISTING
```

## File Naming Conventions

**Frontend** (React/TypeScript):
- **Components**: PascalCase with `.tsx` extension (e.g., `ClassDropdown.tsx`, `SaveMaterialModal.tsx`)
- **Hooks**: camelCase with `use` prefix, `.ts` extension (e.g., `useSavedMaterials.ts`)
- **Contexts**: camelCase with `Context` suffix, `.tsx` extension (e.g., `savedMaterialsContext.tsx`)
- **Pages**: PascalCase matching route name, `.tsx` extension (e.g., `Chat.tsx`, `Profile.tsx`)

**Backend (Node/TypeScript)**:
- **Controllers**: snake_case with `_controllers.ts` suffix (e.g., `materials_controllers.ts`)
- **Routes**: snake_case with `_routes.ts` suffix (e.g., `materials_routes.ts`)
- **Models**: camelCase, `.ts` extension (e.g., `savedMaterial.ts`, `user.ts`)
- **Middleware**: camelCase descriptive name, `.ts` extension (e.g., `rateLimitLogin.ts`)

**Backend (Python)**:
- **Modules**: snake_case with `.py` extension (e.g., `config.py`, `docx_processor.py`)

## Folder Placement Rules

**Place new files in existing folders matching their type**:

✅ **Frontend**:
- Chat-related components → `components/chat/`
- Reusable components (dropdowns, modals, lists) → `components/shared/`
- Hooks → `hooks/`
- Contexts → `context/`
- API calls → `helpers/api-communicators.ts` (modify existing file)

✅ **Backend Node**:
- Controllers → `controllers/`
- Routes → `routes/`
- Models → `models/`
- Middleware/utilities → `utils/`

✅ **Backend Python**:
- All Python modules → `python_scripts/` (flat structure)

---
