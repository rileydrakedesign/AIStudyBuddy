"""
Centralized logging configuration for Class Chat AI Python service.

Provides structured logging with JSON format in production and
pretty-printed format in development. Supports context injection
for user_id and session_id.
"""
import sys
from loguru import logger
from config import LOG_LEVEL, NODE_ENV

# Remove default logger
logger.remove()

# Determine format based on environment
is_production = NODE_ENV == "production"

if is_production:
    # Production: JSON structured logs for Heroku log aggregation
    logger.add(
        sys.stdout,
        level=LOG_LEVEL,
        serialize=True,  # JSON lines for easy ingestion
        backtrace=False,
        diagnose=False,
        colorize=False,
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {extra[user_id]} | {extra[session_id]} | {message}",
    )
else:
    # Development: Pretty-printed logs for readability
    logger.add(
        sys.stdout,
        level=LOG_LEVEL,
        serialize=False,
        backtrace=True,
        diagnose=True,
        colorize=True,
        format="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | <cyan>{extra[user_id]}</cyan> | <cyan>{extra[session_id]}</cyan> | <level>{message}</level>",
    )

# Configure logger with default context (will be overridden per request)
logger = logger.bind(user_id="system", session_id="none")

# Convenience alias
log = logger


def get_logger_with_context(user_id: str = "unknown", session_id: str = "unknown"):
    """
    Get a logger instance with user and session context.

    Args:
        user_id: User identifier for log context
        session_id: Session identifier for log context

    Returns:
        Logger instance with bound context

    Example:
        log = get_logger_with_context(user_id="user123", session_id="sess456")
        log.info("Processing request")
    """
    return logger.bind(user_id=user_id or "unknown", session_id=session_id or "unknown")
