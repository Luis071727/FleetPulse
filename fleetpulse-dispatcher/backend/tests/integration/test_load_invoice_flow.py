def test_end_to_end_load_to_invoice_flow(client, auth_headers):
    create = client.post(
        "/api/v1/loads",
        json={
            "carrier_id": "carrier-1",
            "broker_mc": "MC100002",
            "origin": "Austin",
            "destination": "Dallas",
            "miles": 200,
            "rate": 1000,
            "driver_pay": 300,
            "fuel_cost": 200,
        },
        headers=auth_headers,
    )
    assert create.status_code == 201

    invoices = client.get("/api/v1/invoices", headers=auth_headers)
    assert invoices.status_code == 200
