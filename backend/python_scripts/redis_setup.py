import os
import ssl
import redis
from urllib.parse import urlparse
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
        ca_file = os.getenv("REDIS_SSL_CA_FILE")
        ca_data = os.getenv("REDIS_SSL_CA_DATA")

        # Create custom SSL context to disable hostname checking
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_REQUIRED

        if ca_file:
            ssl_context.load_verify_locations(cafile=ca_file)
        elif ca_data:
            # Write CA data to a temp file for ssl context to read
            ca_path = "/tmp/redis_ca.pem"
            try:
                with open(ca_path, "w") as f:
                    f.write(ca_data)
                ssl_context.load_verify_locations(cafile=ca_path)
            except Exception as e:
                log.warning("[RedisTLS] Failed to write REDIS_SSL_CA_DATA: %s", e)

        kwargs["ssl_certfile"] = None
        kwargs["ssl_keyfile"] = None
        kwargs["ssl_ca_certs"] = ca_path if ca_data else ca_file
        kwargs["ssl_cert_reqs"] = ssl.CERT_REQUIRED
        kwargs["ssl_check_hostname"] = False
    elif url.startswith("rediss://") and not verify:
        # Explicitly disable verification (legacy behavior)
        kwargs["ssl_cert_reqs"] = None

    try:
        client = redis.Redis.from_url(url, **kwargs)

        # Diagnostics (no secrets): host, port, scheme, verify, CA source
        try:
            u = urlparse(url)
            ca_src = (
                "file" if os.getenv("REDIS_SSL_CA_FILE") else
                "env" if os.getenv("REDIS_SSL_CA_DATA") else
                "none"
            )
            log.info(
                "[RedisTLS] cfg host=%s port=%s scheme=%s verify=%s ca=%s",
                u.hostname, u.port, u.scheme, verify, ca_src,
            )
        except Exception:
            pass

        # Optional early ping to surface TLS/CA errors sooner when enabled
        if os.getenv("REDIS_DIAG", "0") in ("1", "true", "yes", "on"):
            client.ping()

        return client
    except Exception as e:
        log.error("[RedisTLS] Connection init failed: %s", e)
        raise
