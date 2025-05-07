"""
Shared Loguru configuration.
– Pretty prints locally, JSON in prod.
– Level set via LOG_LEVEL (default INFO).
"""
import os, sys
from loguru import logger

logger.remove()
level      = os.getenv("LOG_LEVEL", "INFO").upper()
serialize  = os.getenv("PYTHON_ENV") == "production"   # set PYTHON_ENV=production on your dyno
logger.add(sys.stdout, level=level,
           serialize=serialize,
           backtrace=not serialize,
           diagnose=not serialize,
           colorize=not serialize)

# convenience alias
log = logger
