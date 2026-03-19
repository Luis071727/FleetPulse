def test_portal_invite_to_accept_flow(client, auth_headers, _mock_supabase, org_id):
    _mock_supabase._store.setdefault("carriers", []).append({
        "id": "carrier-42",
        "dot_number": "9900042",
        "legal_name": "Portal Test Carrier",
        "organization_id": org_id,
        "portal_status": "not_invited",
    })
    invite = client.post(
        "/api/v1/auth/invite/carrier",
        json={"email": "portalcarrier@example.com", "carrier_id": "carrier-42"},
        headers=auth_headers,
    )
    assert invite.status_code == 200
    invite_data = invite.json()["data"]
    token = invite_data.get("invite_token") or invite_data.get("token", "")

    accept = client.post(
        "/api/v1/auth/accept-invite",
        json={"token": token, "password": "CarrierPass1"},
    )
    assert accept.status_code == 200
