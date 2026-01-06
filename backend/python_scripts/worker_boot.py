import os
from rq import Worker, Queue, Connection
from logger_setup import log
from redis_setup import get_redis


def main():
    conn = get_redis()

    # Parse queue names from environment or use defaults
    # RQ_QUEUES can be comma-separated: "ingest,summary"
    # Queue order determines priority (first = highest priority)
    queue_names = os.getenv("RQ_QUEUES", "ingest,summary").split(",")
    queue_names = [q.strip() for q in queue_names if q.strip()]

    # Create queue objects - order matters for priority
    # RQ processes queues in order, so ingest jobs run before summary jobs
    queues = [Queue(name, connection=conn) for name in queue_names]

    log.info("[RQ] Worker starting with queues: %s (priority order)", queue_names)

    with Connection(conn):
        worker = Worker(queues)
        log.info("[RQ] Worker ready with TLS-verifying Redis connection")
        worker.work(with_scheduler=True)


if __name__ == "__main__":
    main()

