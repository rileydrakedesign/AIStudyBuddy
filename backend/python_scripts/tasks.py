import os, ssl
from redis import Redis
from rq import Queue
from typing import Any

# ------------------------------------------------------------------
# 1. Redis connection (Heroku injects REDIS_URL automatically)
# ------------------------------------------------------------------
redis_conn = Redis.from_url(
    os.getenv("REDIS_URL"),
    ssl_cert_reqs=None,      
)


# ------------------------------------------------------------------
# 2. Queue – name must match Procfile (`rq worker ingest ...`)
# ------------------------------------------------------------------
ingest_q: Queue = Queue(
    name="ingest",
    connection=redis_conn,
    default_timeout=7200,   # 2-hour max (large textbooks w/ GPT-4.1)
)

# ------------------------------------------------------------------
# 3. Helper to enqueue a job
# ------------------------------------------------------------------
def enqueue_ingest(
    *,           # force keyword args for clarity
    user_id: str,
    class_name: str,
    s3_key: str,
    doc_id: str,
):
    """
    Enqueue a PDF-ingest job.

    Returns the RQ Job instance so callers can log / inspect if desired.
    """
    # Local import avoids importing PyMuPDF & LangChain in the web process
    from load_data import load_pdf_data

    job = ingest_q.enqueue(
        load_pdf_data,
        user_id=user_id,
        class_name=class_name,
        s3_key=s3_key,
        doc_id=doc_id,
        job_timeout=7200,   # seconds; keep in sync with default_timeout
        result_ttl=86400,   # keep result 1 day
        failure_ttl=604800, # keep failures 7 days for debugging
    )
    return job
