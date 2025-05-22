# backend/python_scripts/worker.py
import os
from redis import Redis
from rq import Connection, Worker, Queue

listen = ["ingest"]
redis_conn = Redis.from_url(os.getenv("REDIS_URL"))

if __name__ == "__main__":
    with Connection(redis_conn):
        Worker([Queue(q) for q in listen]).work(
            with_scheduler=True,
            burst=False,
            max_jobs=1_000,      # restart after N jobs to reclaim RAM
        )
