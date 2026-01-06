from redis_setup import get_redis
from rq import Queue
from logger_setup import log

# ------------------------------------------------------------------
# 1. Redis connection (uses TLS helper; honors REDIS_TLS_URL/REDIS_URL)
# ------------------------------------------------------------------
redis_conn = get_redis()


# ------------------------------------------------------------------
# 2. Queues – names must match worker configuration
# ------------------------------------------------------------------
# High priority: document ingestion (chunking + embedding)
ingest_q: Queue = Queue(
    name="ingest",
    connection=redis_conn,
    default_timeout=7200,   # 2-hour max (large textbooks)
)

# Low priority: background summarization (runs after ingest completes)
summary_q: Queue = Queue(
    name="summary",
    connection=redis_conn,
    default_timeout=1800,   # 30-minute max for summarization
)

# ------------------------------------------------------------------
# 3. Helper to enqueue ingest job
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
    # Preflight: ensure Redis is reachable so we fail fast with clear logs
    try:
        redis_conn.ping()
        log.info("[RQ] Redis ping ok; enqueueing ingest job")
    except Exception as e:
        log.error("[RQ] Redis ping failed before enqueue: %s", e)
        raise

    # Local import avoids importing PyMuPDF & LangChain in the web process
    from load_data import load_document_data

    job = ingest_q.enqueue(
        load_document_data,
        user_id=user_id,
        class_name=class_name,
        s3_key=s3_key,
        doc_id=doc_id,
        job_timeout=7200,   # seconds; keep in sync with default_timeout
        result_ttl=86400,   # keep result 1 day
        failure_ttl=604800, # keep failures 7 days for debugging
    )
    return job


# ------------------------------------------------------------------
# 4. Helper to enqueue background summary job
# ------------------------------------------------------------------
def enqueue_summary(
    *,
    user_id: str,
    class_name: str,
    doc_id: str,
    file_name: str,
):
    """
    Enqueue a background summarization job.

    This runs at lower priority than ingestion, allowing documents
    to be available for querying immediately after chunking/embedding.
    Summaries are generated in the background and cached for future use.

    Returns the RQ Job instance.
    """
    try:
        redis_conn.ping()
        log.info("[RQ] Redis ping ok; enqueueing summary job for doc %s", doc_id)
    except Exception as e:
        log.error("[RQ] Redis ping failed before summary enqueue: %s", e)
        raise

    from summary_worker import generate_document_summary

    job = summary_q.enqueue(
        generate_document_summary,
        user_id=user_id,
        class_name=class_name,
        doc_id=doc_id,
        file_name=file_name,
        job_timeout=1800,    # 30 minutes max
        result_ttl=86400,    # keep result 1 day
        failure_ttl=604800,  # keep failures 7 days
    )
    return job
