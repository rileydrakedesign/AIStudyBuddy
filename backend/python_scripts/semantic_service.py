from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional
import uuid

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
# /api/v1/semantic_search  (unchanged)
# ──────────────────────────────────────────────────────────────────────────
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
        return process_semantic_search(
            req.user_id,
            req.class_name or "null",
            req.doc_id or "null",
            req.user_query,
            req.chat_history,
            req.source,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ──────────────────────────────────────────────────────────────────────────
# /api/v1/process_upload  (enqueue job, return 202 Accepted)
# ──────────────────────────────────────────────────────────────────────────
class ProcessUploadRequest(BaseModel):
    user_id: str
    class_name: str
    s3_key: str
    doc_id: str

@app.post("/api/v1/process_upload", status_code=202)
def process_upload(request: ProcessUploadRequest):
    """
    Enqueue an ingest job onto the RQ "ingest" queue and return immediately.
    Worker dynos will execute load_pdf_data(user_id, ...).
    """
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