"""
Centralized configuration module for Class Chat AI Python service.

All environment variables are loaded and validated here.
This module fails fast on startup if required environment variables are missing.
"""
import os
import sys
from typing import Optional
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class ConfigValidationError(Exception):
    """Raised when required configuration is missing or invalid."""
    pass


def _get_required_env(key: str) -> str:
    """
    Retrieve a required environment variable.
    Raises ConfigValidationError with clear message if missing.
    """
    value = os.getenv(key)
    if value is None or value.strip() == "":
        raise ConfigValidationError(
            f"FATAL: Required environment variable '{key}' is not set. "
            f"Please set it in your .env file or environment."
        )
    return value


def _get_optional_env(key: str, default: str = "") -> str:
    """Retrieve an optional environment variable with a default value."""
    return os.getenv(key, default)


def _get_int_env(key: str, default: int) -> int:
    """Retrieve an integer environment variable with a default value."""
    value = os.getenv(key)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        raise ConfigValidationError(
            f"FATAL: Environment variable '{key}' must be an integer. Got: '{value}'"
        )


def _get_float_env(key: str, default: float) -> float:
    """Retrieve a float environment variable with a default value."""
    value = os.getenv(key)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        raise ConfigValidationError(
            f"FATAL: Environment variable '{key}' must be a float. Got: '{value}'"
        )


def _get_bool_env(key: str, default: bool = False) -> bool:
    """Retrieve a boolean environment variable with a default value."""
    value = os.getenv(key, "").lower()
    if value in ("1", "true", "yes", "on"):
        return True
    elif value in ("0", "false", "no", "off", ""):
        return default if value == "" else False
    else:
        raise ConfigValidationError(
            f"FATAL: Environment variable '{key}' must be a boolean value. "
            f"Got: '{value}'. Valid values: true/false, yes/no, 1/0, on/off"
        )


# ────────────────────────────────────────────────────────────────
# REQUIRED CONFIGURATION
# ────────────────────────────────────────────────────────────────

# Database
MONGO_CONNECTION_STRING: str = _get_required_env("MONGO_CONNECTION_STRING")

# OpenAI API
OPENAI_API_KEY: str = _get_required_env("OPENAI_API_KEY")

# AWS S3
AWS_ACCESS_KEY: str = _get_required_env("AWS_ACCESS_KEY")
AWS_SECRET: str = _get_required_env("AWS_SECRET")
AWS_REGION: str = _get_required_env("AWS_REGION")
AWS_S3_BUCKET_NAME: str = _get_required_env("AWS_S3_BUCKET_NAME")


# ────────────────────────────────────────────────────────────────
# OPTIONAL CONFIGURATION WITH DEFAULTS
# ────────────────────────────────────────────────────────────────

# Redis
REDIS_URL: str = _get_optional_env("REDIS_URL", "redis://localhost:6379/0")
REDIS_TLS_URL: Optional[str] = _get_optional_env("REDIS_TLS_URL") or None
REDIS_SSL_VERIFY: bool = _get_bool_env("REDIS_SSL_VERIFY", True)
REDIS_SSL_CA_FILE: Optional[str] = _get_optional_env("REDIS_SSL_CA_FILE") or None
REDIS_SSL_CA_DATA: Optional[str] = _get_optional_env("REDIS_SSL_CA_DATA") or None
REDIS_DIAG: bool = _get_bool_env("REDIS_DIAG", False)

# Backend URLs
BACKEND_URL: str = _get_optional_env(
    "BACKEND_URL", "https://class-chat-node-8a0ef9662b5a.herokuapp.com"
)
BACKEND_URL_DEV: str = _get_optional_env("BACKEND_URL_DEV", "http://localhost:3000")
NODE_NOTIFY_URL: str = _get_optional_env("NODE_NOTIFY_URL", "https://localhost:3000")

# Python API URLs
PYTHON_API_URL: str = _get_optional_env(
    "PYTHON_API_URL", "https://class-chat-python-f081e08f29b8.herokuapp.com"
)
PYTHON_API_URL_DEV: str = _get_optional_env("PYTHON_API_URL_DEV", "http://localhost:8001")

# Logging
LOG_LEVEL: str = _get_optional_env("LOG_LEVEL", "INFO").upper()
NODE_ENV: str = _get_optional_env("NODE_ENV", "development")

# OpenAI Model Configuration
OPENAI_CHAT_MODEL: str = _get_optional_env("OPENAI_CHAT_MODEL", "gpt-4o-mini")
OPENAI_TPM_LIMIT: int = _get_int_env("OPENAI_TPM_LIMIT", 180000)

# RAG Configuration
RAG_K: int = _get_int_env("RAG_K", 12)
RAG_K_FOLLOWUP: int = _get_int_env("RAG_K_FOLLOWUP", 10)
RAG_K_QUOTE: int = _get_int_env("RAG_K_QUOTE", 20)
RAG_K_GUIDE: int = _get_int_env("RAG_K_GUIDE", 8)
RAG_K_SUM: int = _get_int_env("RAG_K_SUM", 8)
RAG_CANDIDATES: int = _get_int_env("RAG_CANDIDATES", 1000)
RAG_TEMP_GENERAL: float = _get_float_env("RAG_TEMP_GENERAL", 0.2)
RAG_TEMP_FOLLOWUP: float = _get_float_env("RAG_TEMP_FOLLOWUP", 0.2)
RAG_TEMP_QUOTE: float = _get_float_env("RAG_TEMP_QUOTE", 0.0)
RAG_TEMP_GUIDE: float = _get_float_env("RAG_TEMP_GUIDE", 0.3)
RAG_TEMP_SUM: float = _get_float_env("RAG_TEMP_SUM", 0.2)
RAG_MAX_TOKENS: int = _get_int_env("RAG_MAX_TOKENS", 700)
RAG_MAX_TOKENS_QUOTE: int = _get_int_env("RAG_MAX_TOKENS_QUOTE", 400)
RAG_MAX_TOKENS_GUIDE: int = _get_int_env("RAG_MAX_TOKENS_GUIDE", 1200)
RAG_MAX_TOKENS_SUM: int = _get_int_env("RAG_MAX_TOKENS_SUM", 600)

# Search Configuration
MIN_SIMILARITY: float = _get_float_env("MIN_SIMILARITY", 0.35)
SIMILARITY_THRESHOLD: float = _get_float_env("SIMILARITY_THRESHOLD", 0.0)
MAX_PROMPT_TOKENS: int = _get_int_env("MAX_PROMPT_TOKENS", 8000)
CONTEXT_BUDGET_TOKENS: int = _get_int_env("CONTEXT_BUDGET_TOKENS", 6000)
HISTORY_BUDGET_TOKENS: int = _get_int_env("HISTORY_BUDGET_TOKENS", 2000)


# ────────────────────────────────────────────────────────────────
# STARTUP VALIDATION
# ────────────────────────────────────────────────────────────────

def validate_config():
    """
    Validate all configuration on module import.
    This ensures the service fails fast with clear error messages.
    """
    errors = []

    # Validate MongoDB connection string format
    if not MONGO_CONNECTION_STRING.startswith(("mongodb://", "mongodb+srv://")):
        errors.append(
            "MONGO_CONNECTION_STRING must start with 'mongodb://' or 'mongodb+srv://'"
        )

    # Validate OpenAI API key format
    if not OPENAI_API_KEY.startswith("sk-"):
        errors.append("OPENAI_API_KEY must start with 'sk-'")

    # Validate AWS region
    valid_regions = [
        "us-east-1", "us-east-2", "us-west-1", "us-west-2",
        "eu-west-1", "eu-west-2", "eu-central-1",
        "ap-southeast-1", "ap-southeast-2", "ap-northeast-1"
    ]
    if AWS_REGION not in valid_regions:
        errors.append(
            f"AWS_REGION '{AWS_REGION}' may be invalid. "
            f"Common regions: {', '.join(valid_regions[:5])}"
        )

    # Validate log level
    valid_log_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
    if LOG_LEVEL not in valid_log_levels:
        errors.append(
            f"LOG_LEVEL '{LOG_LEVEL}' is invalid. "
            f"Valid values: {', '.join(valid_log_levels)}"
        )

    if errors:
        error_message = "\n".join(f"  - {err}" for err in errors)
        raise ConfigValidationError(
            f"\nConfiguration validation failed:\n{error_message}\n"
        )


# Run validation on module import
try:
    validate_config()
except ConfigValidationError as e:
    print(f"\n{'='*70}", file=sys.stderr)
    print(f"CONFIGURATION ERROR", file=sys.stderr)
    print(f"{'='*70}", file=sys.stderr)
    print(str(e), file=sys.stderr)
    print(f"{'='*70}\n", file=sys.stderr)
    sys.exit(1)
