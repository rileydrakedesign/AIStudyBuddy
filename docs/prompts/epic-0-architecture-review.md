# Epic 0 Architecture Review - Handoff Prompt for Architect Agent

## Purpose

Review **Story 0.1: Local Development Environment Setup & Configuration** and **Epic 0** to ensure architectural accuracy and completeness. Identify ALL configuration changes and code modifications needed to support local development environment that connects to production services.

---

## Context Documents to Review

### Primary Story & Epic
1. **Story 0.1**: `/docs/stories/0.1.local-env-verification.md`
2. **Epic 0 (Sharded)**: `/docs/prd/epic-0-local-development-testing-environment-setup.md`
3. **Epic 0 (Main PRD)**: `/docs/prd.md` (lines 847-1082 approximately)

### Architecture Reference Documents
4. **Architecture Index**: `/docs/architecture/index.md`
5. **Tech Stack**: `/docs/architecture/tech-stack.md`
6. **Component Architecture**: `/docs/architecture/component-architecture.md`
7. **API Design & Integration**: `/docs/architecture/api-design-and-integration.md`
8. **Source Tree**: `/docs/architecture/source-tree.md`
9. **Infrastructure & Deployment**: `/docs/architecture/infrastructure-and-deployment-integration.md`
10. **Coding Standards**: `/docs/architecture/coding-standards.md`
11. **Testing Strategy**: `/docs/architecture/testing-strategy.md`

### Project Configuration
12. **Core Config**: `.bmad-core/core-config.yaml`
13. **Claude.md**: `CLAUDE.md` (production deployment reference)

---

## Your Tasks as Architect

### Task 1: Comprehensive Local Development Configuration Analysis

**Objective**: Identify EVERY code change, configuration update, and new file needed to support local development environment.

**Known Requirements** (already in Story 0.1):
- ✅ Verify existing `.env.local` files for all three services
- ✅ Configure environment-based CORS in Node backend
- ✅ Set up hot reload (nodemon/ts-node-dev for Node, uvicorn --reload for Python)
- ✅ Create DEVELOPMENT.md documentation

**Your Job - Identify ADDITIONAL Requirements**:

Review the entire architecture and identify ALL other places where local development configuration is needed. Consider:

1. **Frontend Configuration**:
   - Is Vite configured correctly for local dev vs production?
   - Are there any API base URLs hardcoded that need environment variables?
   - Does `vite.config.ts` need changes for proxy, CORS, or dev server settings?
   - Are there any build/bundle configurations that differ between dev and prod?
   - Does the WebSocket client need environment-based URL configuration?

2. **Node Backend Configuration**:
   - **CORS** (already identified - verify completeness)
   - Are there other middleware that needs environment-based configuration?
   - Does the Express app initialization differ between dev and production?
   - Are there any hardcoded URLs to the Python service that need .env.local variables?
   - Does the WebSocket server configuration need updates for local dev?
   - Are there any cookie settings (secure, sameSite, domain) that need environment-based configuration?
   - Does logging configuration differ between dev and production (verbosity, format)?
   - Are there any rate limiting or security middleware that should be disabled/relaxed in dev?
   - Does the JWT token expiration or validation differ between environments?

3. **Python AI Service Configuration**:
   - Does FastAPI's CORS middleware need configuration for local dev?
   - Are there any hardcoded URLs that need environment variables?
   - Does the uvicorn server configuration need specific settings for local dev?
   - Are there any background job configurations (RQ workers) that need environment-based settings?
   - Does logging configuration differ between dev and production?

4. **Package.json / Scripts**:
   - Are the dev scripts correctly configured for hot reload in all services?
   - Are there any build scripts that need environment-specific behavior?
   - Are dev dependencies (nodemon, ts-node-dev) listed correctly?

5. **Environment Variable Management**:
   - Are ALL required environment variables documented?
   - Are there any missing variables in .env.local that are needed for local dev?
   - Is there a `.env.example` or template that should be created/updated?

6. **Git Configuration**:
   - Is `.gitignore` configured to exclude `.env.local` files?
   - Are there any other local dev artifacts that should be git-ignored?

7. **Production vs Development Conditional Logic**:
   - Where should `process.env.NODE_ENV === 'development'` checks be added?
   - Are there any features that should behave differently in dev vs prod?
   - Should any error handling or logging be more verbose in dev?

**Output for Task 1**:
- List ALL configuration changes needed (beyond what's in Story 0.1)
- For each item, specify:
  - File path to modify
  - Exact change needed (code snippet if applicable)
  - Why it's needed for local dev
  - Risk level (low/medium/high) if not implemented

---

### Task 2: Story & Epic Accuracy Verification

**Objective**: Verify Story 0.1 and Epic 0 are architecturally accurate and complete.

**Review Points**:

1. **Acceptance Criteria Completeness**:
   - Do the acceptance criteria cover all necessary local dev configuration?
   - Are there missing criteria based on your architecture analysis?
   - Are the integration verification steps sufficient?

2. **Technical Notes Accuracy**:
   - Are the CORS configuration examples correct for this project's setup?
   - Are the environment variable examples complete and accurate?
   - Are the hot reload configuration instructions correct?
   - Are file paths and locations accurate per the source tree?

3. **Task Breakdown Completeness**:
   - Do the tasks/subtasks cover all identified configuration needs?
   - Are tasks sequenced correctly (dependencies)?
   - Are there missing tasks based on your analysis?

4. **Dev Notes Accuracy**:
   - Are the architecture references accurate?
   - Is the CORS code example correct for the project's Express setup?
   - Are production service usage notes accurate (MongoDB, S3, Redis)?

5. **Risk Mitigation Accuracy**:
   - Are the identified risks complete?
   - Are the mitigation strategies correct?
   - Are there additional risks not covered?

**Output for Task 2**:
- List any inaccuracies found (with corrections)
- List any missing acceptance criteria
- List any missing tasks/subtasks
- Suggest improvements to technical notes

---

### Task 3: Architecture Documentation Updates

**Objective**: Update architecture documentation to include local development setup patterns.

**Documents to Update/Create**:

1. **Component Architecture** (`docs/architecture/component-architecture.md`):
   - Add section on "Local Development Configuration"
   - Document environment-based CORS setup
   - Document any other environment-conditional middleware

2. **API Design & Integration** (`docs/architecture/api-design-and-integration.md`):
   - Add notes on local development API URLs
   - Document WebSocket configuration for local dev
   - Document any API endpoint differences between dev and prod

3. **Infrastructure & Deployment** (`docs/architecture/infrastructure-and-deployment-integration.md`):
   - Add "Local Development Setup" section
   - Document .env.local file structure and required variables
   - Document hot reload configuration for all services
   - Document connection to production MongoDB/S3/Redis from local dev
   - Document port configurations (5173, 5001, 8000)

4. **Coding Standards** (`docs/architecture/coding-standards.md`):
   - Add section on "Environment-Based Configuration Patterns"
   - Document how to use `process.env.NODE_ENV` checks
   - Document .env.local vs .env vs production environment variables
   - Add examples of environment-conditional code (CORS, logging, etc.)

5. **Testing Strategy** (`docs/architecture/testing-strategy.md`):
   - Add section on "Local Development Testing"
   - Document how to test locally with production services
   - Document safe testing practices (test account usage)

**Output for Task 3**:
- List all architecture documents that need updates
- Provide specific content to add to each document
- Indicate priority (must-have vs nice-to-have)

---

### Task 4: Production Safety Review

**Objective**: Ensure local dev setup cannot accidentally break production.

**Review Points**:

1. **Environment Isolation**:
   - Are all local dev configurations truly isolated from production?
   - Are there any scenarios where .env.local could be deployed to production?
   - Is the .gitignore correctly configured?

2. **Conditional Logic Safety**:
   - Are all `NODE_ENV === 'development'` checks correct?
   - Could any development-only code accidentally run in production?
   - Are there proper fallbacks if NODE_ENV is not set?

3. **Production Service Access**:
   - Is it safe for local dev to use production MongoDB/S3/Redis?
   - Are there safeguards against accidentally modifying production user data?
   - Should there be any production data access restrictions?

4. **Deployment Workflow Integrity**:
   - Does the local dev setup affect `git push heroku main` workflow?
   - Are Heroku/Vercel deployment configs unchanged?
   - Will production environment variables override .env.local correctly?

**Output for Task 4**:
- List any production safety concerns
- Suggest additional safeguards or checks
- Identify any risks not covered in Epic 0 risk mitigation

---

### Task 5: Generate Refinement Recommendations

**Objective**: Suggest improvements to Story 0.1 and Epic 0.

**Consider**:

1. **Story Structure**:
   - Is the story well-organized and easy to follow?
   - Are tasks/subtasks granular enough for a dev agent?
   - Is there unnecessary complexity that could be simplified?

2. **Documentation Quality**:
   - Are technical notes clear and comprehensive?
   - Are code examples correct and helpful?
   - Is the DEVELOPMENT.md outline complete?

3. **Acceptance Criteria Testability**:
   - Are all acceptance criteria testable/verifiable?
   - Are success metrics clear?
   - Are there any ambiguous requirements?

4. **Epic Scope**:
   - Is Epic 0 appropriately scoped?
   - Should Story 0.1 be split into multiple stories?
   - Are there any scope creep concerns?

**Output for Task 5**:
- List recommended refinements (prioritized)
- Suggest specific improvements to story/epic text
- Identify any red flags or concerns

---

## Deliverables

After completing all tasks above, provide a comprehensive report with:

### 1. Executive Summary
- Overall assessment (Ready / Needs Minor Updates / Needs Major Rework)
- Top 3-5 critical findings
- Estimated effort to address findings

### 2. Detailed Findings
- **Section A**: Additional Configuration Requirements (Task 1 output)
- **Section B**: Accuracy Issues & Corrections (Task 2 output)
- **Section C**: Architecture Documentation Updates Needed (Task 3 output)
- **Section D**: Production Safety Concerns (Task 4 output)
- **Section E**: Refinement Recommendations (Task 5 output)

### 3. Updated Story 0.1 (if needed)
- Provide updated story file if significant changes required
- Highlight what changed and why

### 4. Architecture Documentation Updates
- Provide content to add to architecture documents
- Use same format/style as existing architecture docs
- Include source references [Source: architecture/file.md]

### 5. Action Plan
- Prioritized list of actions needed before Story 0.1 is dev-ready
- Indicate who should do what (Architect, Scrum Master, Dev Agent)
- Estimated time for each action

---

## Important Notes

1. **Be Thorough**: This is a brownfield project. Local dev setup touching production services is risky. Don't miss configuration needs.

2. **Use Project Context**: This project has:
   - JWT HTTP-only cookies for auth
   - WebSocket streaming for chat
   - Redis for job queues
   - S3 for document storage
   - MongoDB Atlas Vector Search for RAG
   - Multiple microservices (React, Node, Python)

3. **Think Like a Developer**: If you were implementing Story 0.1, what would you need to know? What would be unclear? What would break?

4. **Production Safety First**: Local dev using production MongoDB/S3 is convenient but dangerous. Identify all risks.

5. **Reference Everything**: Include source references for all architecture assertions.

---

## Getting Started

1. Read Story 0.1 completely: `/docs/stories/0.1.local-env-verification.md`
2. Read Epic 0 (sharded): `/docs/prd/epic-0-local-development-testing-environment-setup.md`
3. Review all architecture documents listed above
4. Follow the 5 tasks in order
5. Generate comprehensive deliverables

**When you're ready, say:** "I have completed the Epic 0 Architecture Review. Here is my comprehensive report..."

---

*Handoff Date: 2025-10-24*
*Handoff From: Bob (Scrum Master Agent)*
*Handoff To: Winston (Architect Agent)*
*Priority: High - Blocks Epic 0 development*
