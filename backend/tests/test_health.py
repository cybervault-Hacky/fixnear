"""Checks for the public health endpoints."""

import asyncio

import httpx
import pytest

from app.main import app


@pytest.mark.parametrize('path', ['/health', '/api/v1/health'])
def test_health_endpoints_return_service_status(path: str) -> None:
    async def get_health_response() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url='http://testserver') as client:
            return await client.get(path)

    response = asyncio.run(get_health_response())

    assert response.status_code == 200
    assert response.json() == {
        'status': 'ok',
        'service': 'fixnear-api',
        'version': '1.0.0',
    }
