import os
from rq import Worker, Queue, Connection
from logger_setup import log
from redis_setup import get_redis


def main():
    conn = get_redis()
    queues = [Queue(os.getenv("RQ_QUEUE", "ingest"), connection=conn)]
    with Connection(conn):
        worker = Worker(queues)
        log.info("[RQ] Worker starting with TLS-verifying Redis connection")
        worker.work(with_scheduler=True)


if __name__ == "__main__":
    main()

