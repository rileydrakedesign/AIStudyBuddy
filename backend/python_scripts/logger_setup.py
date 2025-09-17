
import os, sys
from loguru import logger

logger.remove()
level = os.getenv("LOG_LEVEL", "INFO").upper()

# Always use production-style structured logs
logger.add(
    sys.stdout,
    level=level,
    serialize=True,     # JSON lines for easy ingestion
    backtrace=False,
    diagnose=False,
    colorize=False,
)

# convenience alias
log = logger
