"""Unexpected failures stay generic for clients and sanitized in structured logs."""

import asyncio
import json
import logging
from unittest.mock import Mock

from starlette.requests import Request

from app.core.errors import handle_unexpected_exception
from app.core.logging_config import JsonLogFormatter, UvicornErrorRedactionFilter


async def request_body_with_sensitive_marker() -> dict[str, object]:
    return {
        'type': 'http.request',
        'body': b'password=body-secret-marker',
        'more_body': False,
    }


def make_request(path: str) -> Request:
    async def receive() -> dict[str, object]:
        return await request_body_with_sensitive_marker()

    return Request(
        {
            'type': 'http',
            'asgi': {'version': '3.0'},
            'http_version': '1.1',
            'method': 'POST',
            'scheme': 'https',
            'path': path,
            'raw_path': path.encode(),
            'query_string': (
                b'token=query-token-marker&otp=query-otp-marker'
                b'&password=query-password-marker'
            ),
            'headers': [
                (b'authorization', b'Bearer header-token-marker'),
                (b'cookie', b'session=header-cookie-marker'),
            ],
            'client': ('testclient', 50000),
            'server': ('testserver', 443),
        },
        receive=receive,
    )


def test_unexpected_exception_details_and_sensitive_request_data_are_not_logged(
    monkeypatch,
) -> None:
    secret_marker = 'password=exception-secret-marker'
    path_marker = '/account/user-private-marker'
    error = RuntimeError(secret_marker)
    safe_logger = Mock()
    monkeypatch.setattr('app.core.errors.logger', safe_logger)

    response = asyncio.run(
        handle_unexpected_exception(make_request(path_marker), error)
    )

    assert response.status_code == 500
    assert response.body == b'{"detail":"Internal server error"}'
    safe_logger.error.assert_called_once_with(
        'Unhandled application exception',
        extra={'exception_type': 'RuntimeError'},
    )
    log_call = repr(safe_logger.error.call_args)
    for sensitive_marker in (
        secret_marker,
        path_marker,
        'query-token-marker',
        'query-otp-marker',
        'query-password-marker',
        'header-token-marker',
        'header-cookie-marker',
        'body-secret-marker',
    ):
        assert sensitive_marker not in log_call


def test_uvicorn_error_filter_removes_tracebacks_that_contain_secrets() -> None:
    secret_marker = 'provider-dsn-password-marker'
    record = logging.LogRecord(
        name='uvicorn.error',
        level=logging.ERROR,
        pathname=__file__,
        lineno=1,
        msg='Exception in ASGI application',
        args=(),
        exc_info=(RuntimeError, RuntimeError(secret_marker), None),
    )

    assert UvicornErrorRedactionFilter().filter(record)
    formatted = JsonLogFormatter().format(record)

    assert record.exc_info is None
    assert secret_marker not in formatted
    assert 'Exception in ASGI application' in formatted


def test_json_formatter_emits_only_exception_class_for_exception_records() -> None:
    record = logging.LogRecord(
        name='example',
        level=logging.ERROR,
        pathname=__file__,
        lineno=1,
        msg='A fixed message',
        args=(),
        exc_info=(RuntimeError, RuntimeError('private value'), None),
    )

    payload = json.loads(JsonLogFormatter().format(record))

    assert payload['exception_type'] == 'RuntimeError'
    assert 'exception' not in payload
    assert 'private value' not in JsonLogFormatter().format(record)
