def test_health_route_exists(client):
    response = client.get("/health")
    assert response.status_code == 200


def test_response_envelope_shape(client, auth_headers):
    response = client.get("/api/v1/carriers", headers=auth_headers)
    body = response.json()
    assert "data" in body
    assert "meta" in body
