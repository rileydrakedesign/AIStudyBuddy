import os
import ssl
import redis
from logger_setup import log


def get_redis():
    """
    Create a Redis client with optional TLS verification.

    Env vars:
    - REDIS_TLS_URL: preferred TLS URL (e.g., rediss://...)
    - REDIS_URL:     fallback if TLS URL not present
    - REDIS_SSL_VERIFY: 'true'|'false' (default: 'true')
    - REDIS_SSL_CA_FILE: path to CA bundle file (optional)
    - REDIS_SSL_CA_DATA: PEM content of CA bundle (optional alternative to file)
    """
    url = os.getenv("REDIS_TLS_URL") or os.getenv("REDIS_URL")
    if not url:
        raise RuntimeError("REDIS_URL/REDIS_TLS_URL not set")

    verify = (os.getenv("REDIS_SSL_VERIFY", "true").lower() in ("1", "true", "yes", "on"))

    kwargs: dict = {}
    if url.startswith("rediss://") and verify:
        kwargs["ssl_cert_reqs"] = ssl.CERT_REQUIRED

        ca_file = os.getenv("REDIS_SSL_CA_FILE")
        ca_data = os.getenv("REDIS_SSL_CA_DATA")

        if ca_file:
            kwargs["ssl_ca_certs"] = ca_file
        elif ca_data:
            # Write CA data to a temp file for redis-py to read
            ca_path = "/tmp/redis_ca.pem"
            try:
                with open(ca_path, "w") as f:
                    f.write(ca_data)
                kwargs["ssl_ca_certs"] = ca_path
            except Exception as e:
                log.warning("[RedisTLS] Failed to write REDIS_SSL_CA_DATA: %s", e)
    elif url.startswith("rediss://") and not verify:
        # Explicitly disable verification (legacy behavior)
        kwargs["ssl_cert_reqs"] = None

    try:
        client = redis.Redis.from_url(url, **kwargs)
        # Simple ping to fail fast if misconfigured (optional)
        # client.ping()
        return client
    except Exception as e:
        log.error("[RedisTLS] Connection init failed: %s", e)
        raise

