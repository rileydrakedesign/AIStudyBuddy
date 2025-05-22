# backend/python_scripts/queue_upload.py
from load_data import load_pdf_data
from logger_setup import log

def run(user_id: str, class_name: str, s3_key: str, doc_id: str) -> None:
    """RQ calls this function in the worker dyno."""
    log.info(f"[worker] start doc={doc_id}")
    load_pdf_data(user_id, class_name, s3_key, doc_id)
    log.info(f"[worker] done   doc={doc_id}")
