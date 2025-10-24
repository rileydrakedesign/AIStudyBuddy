# Load environment variables FIRST, before any other imports that might use them
import os
from dotenv import load_dotenv
from pathlib import Path

# In production (Heroku), env vars are set via config vars, not .env files
# In local development, load from .env.local if it exists
env_file = Path('.env.local')
if env_file.exists():
    load_dotenv(env_file)
elif Path('.env').exists():
    load_dotenv('.env')

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import uuid
import asyncio
import json

from semantic_search import process_semantic_search
from tasks import enqueue_ingest
from logger_setup import log

app = FastAPI()

# ──────────────────────────────────────────────────────────────────────────
# Middleware – attach a per-request UUID to every log entry
# ──────────────────────────────────────────────────────────────────────────
@app.middleware("http")
async def add_req_id(request: Request, call_next):
    req_id = str(uuid.uuid4())
    with log.contextualize(req_id=req_id):
        try:
            response = await call_next(request)
        except Exception as exc:
            log.exception(exc)
            return JSONResponse(
                status_code=500,
                content={
                    "error": type(exc).__name__,
                    "message": str(exc),
                    "reqId": req_id,
                },
            )
        response.headers["X-Request-ID"] = req_id
        return response

# ──────────────────────────────────────────────────────────────────────────
# /api/v1/semantic_search
#   ‣ Streams keep‑alive bytes every ~10 s until processing completes
# ──────────────────────────────────────────────────────────────────────────
class SearchRequest(BaseModel):
    user_id: str
    class_name: Optional[str]
    doc_id: Optional[str]
    user_query: str
    chat_history: List[dict]
    source: str

KEEPALIVE_INTERVAL = 10  # seconds – send a byte every 10 s to reset Heroku timer

@app.post("/api/v1/semantic_search")
async def semantic_search(req: SearchRequest):
    """Route is now *streamed* so Heroku’s 30 s idle‑timeout is never hit.
    We first drip whitespace every KEEPALIVE_INTERVAL seconds, 
    then emit the final JSON once the heavy search finishes.
    """

    async def body_generator():
        loop = asyncio.get_running_loop()
        # Off‑load the blocking search to a default thread‑pool executor
        search_task = loop.run_in_executor(
            None,
            process_semantic_search,
            req.user_id,
            req.class_name or "null",
            req.doc_id or "null",
            req.user_query,
            req.chat_history,
            req.source,
        )

        # While the task is running, yield a single space + newline periodically
        while not search_task.done():
            yield b" \n"  # any byte resets Heroku router timer
            await asyncio.sleep(KEEPALIVE_INTERVAL)

        # Task finished – stream the real JSON payload
        try:
            result = await search_task
            # Emit only valid JSON so non-stream clients (Axios) can parse
            yield json.dumps(result).encode()
        except Exception as e:
            # Convert exceptions into a JSON error so caller still receives valid JSON
            log.exception(e)
            err_payload = json.dumps({"error": str(e)})
            yield err_payload.encode()

    resp = StreamingResponse(body_generator(), media_type="application/json")
    # Explicit keepalive hint so client can ignore whitespace ticks
    resp.headers["X-Keepalive"] = "1"
    return resp

# ──────────────────────────────────────────────────────────────────────────
# /api/v1/process_upload  (unchanged – still enqueues ingest job)
# ──────────────────────────────────────────────────────────────────────────
class ProcessUploadRequest(BaseModel):
    user_id: str
    class_name: str
    s3_key: str
    doc_id: str

@app.post("/api/v1/process_upload", status_code=202)
def process_upload(request: ProcessUploadRequest):
    """Enqueue an ingest job onto the RQ "ingest" queue and return immediately."""
    try:
        job = enqueue_ingest(
            user_id=request.user_id,
            class_name=request.class_name,
            s3_key=request.s3_key,
            doc_id=request.doc_id,
        )
        return {
            "message": "Job queued",
            "doc_id": request.doc_id,
            "job_id": job.get_id(),
        }
    except Exception as e:
        log.exception(e)
        raise HTTPException(status_code=500, detail=str(e))
