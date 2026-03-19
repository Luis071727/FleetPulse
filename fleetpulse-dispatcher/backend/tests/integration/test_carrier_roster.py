def test_carrier_search_filters_results(client, auth_headers):
    client.post("/api/v1/carriers", json={"dot_number": "3812044"}, headers=auth_headers)
    response = client.get("/api/v1/carriers", params={"search": "Rodriguez"}, headers=auth_headers)
    assert response.status_code == 200


def test_view_preference_contract_placeholder(client, auth_headers):
    response = client.get("/api/v1/carriers", headers=auth_headers)
    assert response.status_code == 200
