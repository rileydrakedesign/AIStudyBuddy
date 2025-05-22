# semantic_service.py
# ===================
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional
import uuid
import os

from semantic_search import process_semantic_search
from load_data import load_pdf_data
from logger_setup import log

# ─────────── Redis / RQ wiring (background jobs) ──────────
import redis
from rq import Queue

REDIS_URL     = os.getenv("REDIS_URL")            # set automatically by Heroku Redis add-on
redis_conn    = redis.from_url(REDIS_URL)
ingest_q      = Queue("pdf_ingest", connection=redis_conn, default_timeout=1800)  # 30 min timeout

# ───────────────────────────────────────────────────────────
app = FastAPI()

# ⋆ request-ID middleware + contextual logging
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
                    "error":   type(exc).__name__,
                    "message": str(exc),
                    "reqId":   req_id,
                },
            )
        response.headers["X-Request-ID"] = req_id
        return response


# ─────────────── semantic search endpoint ────────────────
class SearchRequest(BaseModel):
    user_id: str
    class_name: Optional[str]
    doc_id: Optional[str]
    user_query: str
    chat_history: List[dict]
    source: str


@app.post("/api/v1/semantic_search")
async def semantic_search(req: SearchRequest):
    try:
        result = process_semantic_search(
            req.user_id,
            req.class_name or "null",
            req.doc_id or "null",
            req.user_query,
            req.chat_history,
            req.source,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────── PDF ingest (asynchronous) ───────────────
class ProcessUploadRequest(BaseModel):
    user_id: str
    class_name: str
    s3_key: str
    doc_id: str


@app.post("/api/v1/process_upload")
def process_upload(request: ProcessUploadRequest):
    """
    Enqueue the heavy PDF-ingest job so the web dyno returns quickly.
    A separate worker dyno (Procfile: `worker: rq worker pdf_ingest`)
    will pick it up.
    """
    try:
        job = ingest_q.enqueue(
            load_pdf_data,
            request.user_id,
            request.class_name,
            request.s3_key,
            request.doc_id,
            job_timeout=1800,          # 30 min hard cap
        )
        return {
            "message": "Ingest queued",
            "job_id":  job.id,
            "status":  job.get_status(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
