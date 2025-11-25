# start-local-dev-with-logs

Start all local development servers for the AIStudyBuddy application **with persistent logging**.

## Instructions

When the user invokes this skill, start all four services required for local development with logs saved to `.ai/logs/`:

1. **Create logs directory** (if it doesn't exist)
2. **Kill any existing processes** on ports 3000, 5173, 8000 and RQ workers
3. **Start Backend (Node.js)** on port 3000 with logging
4. **Start Frontend (React/Vite)** on port 5173 with logging
5. **Start Python FastAPI** on port 8000 with logging
6. **Start RQ Worker** for document processing with logging

## Commands

### 1. Create logs directory
```bash
mkdir -p /Users/rileydrake/Desktop/AIStudyBuddy/.ai/logs
```

### 2. Clean up existing processes
```bash
lsof -ti:3000 -ti:5173 -ti:8000 | sort -u | xargs kill -9 2>/dev/null
pkill -9 -f "rq worker" 2>/dev/null
sleep 2
```

### 3. Start Backend (Node.js) with logging
```bash
cd /Users/rileydrake/Desktop/AIStudyBuddy/backend && npm run dev 2>&1 | tee ../.ai/logs/backend.log
```
Run this in the background. The backend will:
- Compile TypeScript in watch mode
- Start the Node.js server with nodemon
- Connect to MongoDB
- Start WebSocket server
- Listen on https://localhost:3000
- **Log to `.ai/logs/backend.log`**

### 4. Start Frontend (React/Vite) with logging
```bash
cd /Users/rileydrake/Desktop/AIStudyBuddy/frontend && npm run dev 2>&1 | tee ../.ai/logs/frontend.log
```
Run this in the background. The frontend will:
- Start Vite dev server
- Listen on https://localhost:5173
- **Log to `.ai/logs/frontend.log`**

### 5. Start Python FastAPI with logging
```bash
conda run -n study_buddy uvicorn semantic_service:app --host 0.0.0.0 --port 8000 --reload --app-dir /Users/rileydrake/Desktop/AIStudyBuddy/backend/python_scripts 2>&1 | tee /Users/rileydrake/Desktop/AIStudyBuddy/.ai/logs/python.log
```
Run this in the background. The Python service will:
- Use the `study_buddy` conda environment
- Start FastAPI with uvicorn
- Enable auto-reload on code changes
- Listen on http://localhost:8000
- **Log to `.ai/logs/python.log`**

### 6. Start RQ Worker with logging
```bash
cd /Users/rileydrake/Desktop/AIStudyBuddy/backend/python_scripts && conda run -n study_buddy rq worker ingest --url redis://localhost:6379 --with-scheduler 2>&1 | tee /Users/rileydrake/Desktop/AIStudyBuddy/.ai/logs/rq-worker.log
```
Run this in the background. The RQ worker will:
- Use the `study_buddy` conda environment
- Process document upload jobs from Redis queue
- Handle both PDF and DOCX file processing
- Run with scheduler support for delayed jobs
- **Log to `.ai/logs/rq-worker.log`**

## Verification

After starting all services, verify they are running:
```bash
lsof -ti:3000 && echo "Backend: ✅" || echo "Backend: ❌"
lsof -ti:5173 && echo "Frontend: ✅" || echo "Frontend: ❌"
lsof -ti:8000 && echo "Python FastAPI: ✅" || echo "Python FastAPI: ❌"
ps aux | grep "rq worker" | grep -v grep && echo "RQ Worker: ✅" || echo "RQ Worker: ❌"
```

Verify logs are being written:
```bash
ls -lh /Users/rileydrake/Desktop/AIStudyBuddy/.ai/logs/
```

## Output

After successfully starting all services, inform the user:

```
✅ All Services Running with Logging

Backend (Node.js) - https://localhost:3000
- Connected to MongoDB
- WebSocket server ready
- Logging to: .ai/logs/backend.log

Frontend (React/Vite) - https://localhost:5173
- Development server ready
- Logging to: .ai/logs/frontend.log

Python FastAPI - http://localhost:8000
- Running with study_buddy conda environment
- Logging to: .ai/logs/python.log

RQ Worker (Document Processing)
- Processing upload jobs from Redis queue
- Handles PDF and DOCX file ingestion
- Logging to: .ai/logs/rq-worker.log

Your local app is ready at https://localhost:5173/

📁 View logs:
  tail -f .ai/logs/backend.log
  tail -f .ai/logs/python.log
  tail -f .ai/logs/frontend.log
  tail -f .ai/logs/rq-worker.log

  Or view all: tail -f .ai/logs/*.log

  Search logs: grep "error" .ai/logs/*.log
```

## Notes

- All services run in the background with auto-reload enabled
- Logs are saved to `.ai/logs/` directory (git-ignored)
- Logs persist across sessions and survive terminal closes
- `tee` command shows output in terminal AND saves to file
- The backend uses concurrently to run TypeScript compilation and nodemon
- The Python service requires the `study_buddy` conda environment
- If services fail to start, check the output using BashOutput tool with the shell IDs
- **IMPORTANT**: This skill does NOT modify any production code - logging is purely local via shell redirection

## Log Files

All logs are saved to:
- `/Users/rileydrake/Desktop/AIStudyBuddy/.ai/logs/backend.log`
- `/Users/rileydrake/Desktop/AIStudyBuddy/.ai/logs/frontend.log`
- `/Users/rileydrake/Desktop/AIStudyBuddy/.ai/logs/python.log`
- `/Users/rileydrake/Desktop/AIStudyBuddy/.ai/logs/rq-worker.log`

These files are already covered by `.gitignore` (`*.log` pattern).
