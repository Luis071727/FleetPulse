def test_ai_analyze_load_contract(client, auth_headers, _mock_supabase, org_id):
    # Seed a load for analysis
    _mock_supabase._store.setdefault("loads", []).append({
        "id": "load-1",
        "carrier_id": "carrier-1",
        "organization_id": org_id,
        "rate": 1800,
        "miles": 600,
        "net_rpm": 1.33,
        "broker_trust_score": 55,
        "carrier_status": "active",
        "status": "in_transit",
        "deleted_at": None,
    })
    response = client.post(
        "/api/v1/ai/load/analyze",
        json={"load_id": "load-1"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["recommendation"] in {"GO", "NEGOTIATE", "PASS"}


def test_ai_pass_for_low_rpm(client, auth_headers, _mock_supabase, org_id):
    _mock_supabase._store.setdefault("loads", []).append({
        "id": "load-pass",
        "carrier_id": "carrier-1",
        "organization_id": org_id,
        "rate": 1200,
        "miles": 600,
        "net_rpm": 0.33,
        "broker_trust_score": 55,
        "carrier_status": "active",
        "status": "in_transit",
        "deleted_at": None,
    })
    response = client.post(
        "/api/v1/ai/load/analyze",
        json={"load_id": "load-pass"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["data"]["recommendation"] == "PASS"


def test_ai_go_for_strong_load(client, auth_headers, _mock_supabase, org_id):
    _mock_supabase._store.setdefault("loads", []).append({
        "id": "load-go",
        "carrier_id": "carrier-1",
        "organization_id": org_id,
        "rate": 2600,
        "miles": 600,
        "net_rpm": 2.67,
        "broker_trust_score": 80,
        "carrier_status": "active",
        "status": "in_transit",
        "deleted_at": None,
    })
    response = client.post(
        "/api/v1/ai/load/analyze",
        json={"load_id": "load-go"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["data"]["recommendation"] == "GO"


def test_invoice_followup_tone_polite(client, auth_headers, _mock_supabase, org_id):
    _mock_supabase._store.setdefault("invoices", []).append({
        "id": "inv-polite",
        "load_id": "load-1",
        "carrier_id": "carrier-1",
        "organization_id": org_id,
        "amount": 1000,
        "status": "pending",
        "days_outstanding": 10,
        "followups_sent": 0,
        "deleted_at": None,
    })
    response = client.post(
        "/api/v1/ai/invoice/followup",
        json={"invoice_id": "inv-polite"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["data"]["tone"] == "polite"


def test_insurance_playbook_501(client, auth_headers):
    response = client.post(
        "/api/v1/ai/insurance/playbook",
        json={"carrier_id": "carrier-1"},
        headers=auth_headers,
    )
    assert response.status_code == 501


def test_invoice_followup_tone_bucket_firm(client, auth_headers, _mock_supabase, org_id):
    _mock_supabase._store.setdefault("invoices", []).append({
        "id": "inv-firm",
        "load_id": "l2",
        "carrier_id": "c1",
        "organization_id": org_id,
        "amount": 1200,
        "status": "pending",
        "days_outstanding": 20,
        "followups_sent": 0,
        "deleted_at": None,
    })
    response = client.post(
        "/api/v1/ai/invoice/followup",
        json={"invoice_id": "inv-firm"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["data"]["tone"] == "firm"


def test_invoice_followup_tone_bucket_final(client, auth_headers, _mock_supabase, org_id):
    _mock_supabase._store.setdefault("invoices", []).append({
        "id": "inv-final",
        "load_id": "l3",
        "carrier_id": "c1",
        "organization_id": org_id,
        "amount": 1400,
        "status": "pending",
        "days_outstanding": 32,
        "followups_sent": 0,
        "deleted_at": None,
    })
    response = client.post(
        "/api/v1/ai/invoice/followup",
        json={"invoice_id": "inv-final"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["data"]["tone"] == "final"
