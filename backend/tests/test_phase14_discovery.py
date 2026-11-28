"""Additional pagination and coordinate validation for existing coverage search."""

from tests.test_booking_management import (
    _add_technician_eligibility,
    _create_user,
    _seed_catalog,
)


def test_nearby_pagination_preserves_total_and_distance_order(booking_api):
    client, _, session = booking_api
    service, _ = _seed_catalog(session)
    for name, latitude in [("Alpha", 0.01), ("Beta", 0.02), ("Gamma", 0.03)]:
        user = _create_user(
            session, ("technician",), display_name=name, verification_status="approved"
        )
        _add_technician_eligibility(
            session, user, service, center_latitude=latitude, center_longitude=0
        )
    path = "/api/v1/services/ac-repair/nearby-technicians/search"
    payload = {
        "mode": "coordinates",
        "latitude": 0,
        "longitude": 0,
        "radius_km": 10,
        "limit": 1,
    }
    first = client.post(path, json=payload)
    second = client.post(path, json={**payload, "offset": 1})
    assert first.status_code == second.status_code == 200
    assert first.json()["total"] == second.json()["total"] == 3
    assert first.json()["results"][0]["display_name"] == "Alpha"
    assert second.json()["results"][0]["display_name"] == "Beta"
    assert second.json()["offset"] == 1
    assert client.post(path, json={**payload, "limit": 101}).status_code == 422
    assert client.post(path, json={**payload, "offset": -1}).status_code == 422
    assert client.post(path, json={**payload, "latitude": 91}).status_code == 422
