def test_ai_pass_for_low_net_rpm(client, auth_headers, _mock_supabase, org_id):
    _mock_supabase._store.setdefault("loads", []).append({
        "id": "load-low-rpm",
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
    analysis = client.post("/api/v1/ai/load/analyze", json={"load_id": "load-low-rpm"}, headers=auth_headers)
    assert analysis.status_code == 200
    assert analysis.json()["data"]["recommendation"] == "PASS"


def test_ai_go_for_strong_load(client, auth_headers, _mock_supabase, org_id):
    _mock_supabase._store.setdefault("loads", []).append({
        "id": "load-strong",
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
    analysis = client.post("/api/v1/ai/load/analyze", json={"load_id": "load-strong"}, headers=auth_headers)
    assert analysis.status_code == 200
    assert analysis.json()["data"]["recommendation"] == "GO"


def test_ai_negotiate_for_borderline_load(client, auth_headers, _mock_supabase, org_id):
    _mock_supabase._store.setdefault("loads", []).append({
        "id": "load-border",
        "carrier_id": "carrier-1",
        "organization_id": org_id,
        "rate": 1700,
        "miles": 600,
        "net_rpm": 1.17,
        "broker_trust_score": 55,
        "carrier_status": "active",
        "status": "in_transit",
        "deleted_at": None,
    })
    analysis = client.post("/api/v1/ai/load/analyze", json={"load_id": "load-border"}, headers=auth_headers)
    assert analysis.status_code == 200
    assert analysis.json()["data"]["recommendation"] == "NEGOTIATE"
