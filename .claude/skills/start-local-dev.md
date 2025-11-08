# start-local-dev

Start all local development servers for the AIStudyBuddy application.

## Instructions

When the user invokes this skill, start all three services required for local development:

1. **Kill any existing processes** on ports 3000, 5173, and 8000
2. **Start Backend (Node.js)** on port 3000
3. **Start Frontend (React/Vite)** on port 5173
4. **Start Python FastAPI** on port 8000

## Commands

### 1. Clean up existing processes
```bash
lsof -ti:3000 -ti:5173 -ti:8000 | sort -u | xargs kill -9 2>/dev/null
sleep 2
```

### 2. Start Backend (Node.js)
```bash
cd /Users/rileydrake/Desktop/AIStudyBuddy/backend && npm run dev
```
Run this in the background. The backend will:
- Compile TypeScript in watch mode
- Start the Node.js server with nodemon
- Connect to MongoDB
- Start WebSocket server
- Listen on https://localhost:3000

### 3. Start Frontend (React/Vite)
```bash
cd /Users/rileydrake/Desktop/AIStudyBuddy/frontend && npm run dev
```
Run this in the background. The frontend will:
- Start Vite dev server
- Listen on https://localhost:5173

### 4. Start Python FastAPI
```bash
conda run -n study_buddy uvicorn semantic_service:app --host 0.0.0.0 --port 8000 --reload --app-dir /Users/rileydrake/Desktop/AIStudyBuddy/backend/python_scripts
```
Run this in the background. The Python service will:
- Use the `study_buddy` conda environment
- Start FastAPI with uvicorn
- Enable auto-reload on code changes
- Listen on http://localhost:8000

## Verification

After starting all services, verify they are running:
```bash
lsof -ti:3000 && echo "Backend: ✅" || echo "Backend: ❌"
lsof -ti:5173 && echo "Frontend: ✅" || echo "Frontend: ❌"
lsof -ti:8000 && echo "Python FastAPI: ✅" || echo "Python FastAPI: ❌"
```

## Output

After successfully starting all services, inform the user:

```
✅ All Services Running

Backend (Node.js) - https://localhost:3000
- Connected to MongoDB
- WebSocket server ready

Frontend (React/Vite) - https://localhost:5173
- Development server ready

Python FastAPI - http://localhost:8000
- Running with study_buddy conda environment

Your local app is ready at https://localhost:5173/
```

## Notes

- All services run in the background with auto-reload enabled
- The backend uses concurrently to run TypeScript compilation and nodemon
- The Python service requires the `study_buddy` conda environment
- If services fail to start, check the output using BashOutput tool with the shell IDs
