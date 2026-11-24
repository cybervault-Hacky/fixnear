"""Small JSON logging configuration using only the Python standard library."""

import json
import logging
import sys
from datetime import datetime, timezone


class JsonLogFormatter(logging.Formatter):
    """Render each log record as one structured JSON line."""

    def format(self, record: logging.LogRecord) -> str:
        timestamp = datetime.fromtimestamp(
            record.created, tz=timezone.utc  # noqa: UP017 - keep Python 3.10 compatibility
        )
        payload: dict[str, object] = {
            'timestamp': timestamp.isoformat(timespec='milliseconds'),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
        }

        for field in ('request_method', 'exception_type'):
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value

        if record.exc_info and record.exc_info[0] is not None:
            payload.setdefault('exception_type', record.exc_info[0].__name__)

        return json.dumps(payload, ensure_ascii=False, default=str)


class UvicornErrorRedactionFilter(logging.Filter):
    """Strip server-side traceback content after the app records a safe error type."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.exc_info = None
        record.exc_text = None
        record.stack_info = None
        return True


def configure_logging(level_name: str) -> None:
    """Configure process-wide JSON logs and sanitize Uvicorn error tracebacks."""

    resolved_level = logging.getLevelName(level_name.upper())
    log_level = resolved_level if isinstance(resolved_level, int) else logging.INFO

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonLogFormatter())

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(log_level)

    uvicorn_error_logger = logging.getLogger('uvicorn.error')
    if not any(
        isinstance(log_filter, UvicornErrorRedactionFilter)
        for log_filter in uvicorn_error_logger.filters
    ):
        uvicorn_error_logger.addFilter(UvicornErrorRedactionFilter())
