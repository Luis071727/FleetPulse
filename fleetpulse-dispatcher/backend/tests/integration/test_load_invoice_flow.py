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
            "rc_reference": "RC-1000",
        },
        headers=auth_headers,
    )
    assert create.status_code == 201
    create_body = create.json()
    assert create_body["data"]["invoice"]["invoice_number"] == "RC-1000"

    invoices = client.get("/api/v1/invoices", headers=auth_headers)
    assert invoices.status_code == 200
    invoice = invoices.json()["data"][0]
    assert invoice["invoice_number"] == "RC-1000"


def test_create_invoice_accepts_invoice_number(client, auth_headers):
    response = client.post(
        "/api/v1/invoices",
        json={
            "carrier_id": "carrier-1",
            "amount": 1500,
            "invoice_number": "INV-2026-001",
        },
        headers=auth_headers,
    )

    assert response.status_code == 201
    assert response.json()["data"]["invoice_number"] == "INV-2026-001"
