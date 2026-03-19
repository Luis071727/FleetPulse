def test_create_carrier_from_valid_dot(client, auth_headers):
    response = client.post("/api/v1/carriers", json={"dot_number": "3812044"}, headers=auth_headers)
    assert response.status_code == 201
    assert response.json()["data"]["legal_name"] == "Rodriguez Trucking"


def test_create_carrier_duplicate_dot_rejected(client, auth_headers):
    client.post("/api/v1/carriers", json={"dot_number": "3812044"}, headers=auth_headers)
    response = client.post("/api/v1/carriers", json={"dot_number": "3812044"}, headers=auth_headers)
    assert response.status_code in (400, 409)


def test_list_carriers_returns_meta_total(client, auth_headers):
    response = client.get("/api/v1/carriers", headers=auth_headers)
    assert response.status_code == 200
    assert "total" in response.json()["meta"]


def test_list_carriers_supports_search(client, auth_headers):
    response = client.get("/api/v1/carriers", params={"search": "Rodriguez"}, headers=auth_headers)
    assert response.status_code == 200


def test_list_carriers_supports_status_filter(client, auth_headers):
    response = client.get("/api/v1/carriers", params={"status": "active"}, headers=auth_headers)
    assert response.status_code == 200
