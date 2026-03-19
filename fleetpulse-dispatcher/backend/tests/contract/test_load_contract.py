def test_create_load_creates_invoice(client, auth_headers):
    # First create a carrier
    client.post("/api/v1/carriers", json={"dot_number": "3812044"}, headers=auth_headers)

    response = client.post(
        "/api/v1/loads",
        json={
            "carrier_id": "carrier-1",
            "broker_mc": "MC100001",
            "origin": "Los Angeles",
            "destination": "San Francisco",
            "miles": 500,
            "rate": 2400,
            "driver_pay": 800,
            "fuel_cost": 400,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201


def test_list_loads_contract(client, auth_headers):
    response = client.get("/api/v1/loads", headers=auth_headers)
    assert response.status_code == 200


def test_list_invoices_contract(client, auth_headers):
    response = client.get("/api/v1/invoices", headers=auth_headers)
    assert response.status_code == 200
