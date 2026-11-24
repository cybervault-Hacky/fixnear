"""Centralized handling for unexpected application errors."""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette import status

logger = logging.getLogger(__name__)


async def handle_unexpected_exception(_request: Request, exc: Exception) -> JSONResponse:
    """Log only safe error metadata; never serialize exception or request contents."""
    logger.error(
        'Unhandled application exception',
        extra={'exception_type': type(exc).__name__},
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={'detail': 'Internal server error'},
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Attach the shared unexpected-error handler to a FastAPI application."""

    app.add_exception_handler(Exception, handle_unexpected_exception)
