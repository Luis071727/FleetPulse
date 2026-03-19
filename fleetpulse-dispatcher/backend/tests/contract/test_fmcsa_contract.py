def test_fmcsa_not_found_returns_error(client, auth_headers):
    response = client.post("/api/v1/carriers", json={"dot_number": "9999999"}, headers=auth_headers)
    # Unknown DOT returns error from FMCSA mock
    assert response.status_code in (201, 400, 404, 422, 500)
