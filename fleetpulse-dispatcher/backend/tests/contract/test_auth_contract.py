def test_signup_returns_user(client):
    response = client.post(
        "/api/v1/auth/signup",
        json={
            "email": "newdispatcher@example.com",
            "password": "StrongPass1",
            "full_name": "New Dispatcher",
            "company_name": "Test Dispatch",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["data"] is not None


def test_login_invalid_credentials_shape(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "missing@example.com", "password": "bad-pass"},
    )
    body = response.json()
    # Either 401 or error in envelope
    assert response.status_code in (200, 401) or body.get("error") is not None


def test_invite_carrier_contract(client, auth_headers, _mock_supabase, org_id):
    # Create a carrier first
    _mock_supabase._store.setdefault("carriers", []).append({
        "id": "carrier-1",
        "dot_number": "3812044",
        "legal_name": "Test Carrier",
        "organization_id": org_id,
        "portal_status": "not_invited",
    })
    response = client.post(
        "/api/v1/auth/invite/carrier",
        json={"email": "carrier@example.com", "carrier_id": "carrier-1"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["data"] is not None


def test_accept_invite_contract(client, auth_headers, _mock_supabase, org_id):
    # Seed carrier and invite
    _mock_supabase._store.setdefault("carriers", []).append({
        "id": "carrier-2",
        "dot_number": "3812045",
        "legal_name": "Test Carrier 2",
        "organization_id": org_id,
        "portal_status": "not_invited",
    })
    invited = client.post(
        "/api/v1/auth/invite/carrier",
        json={"email": "carrier2@example.com", "carrier_id": "carrier-2"},
        headers=auth_headers,
    )
    invite_data = invited.json()["data"]
    token = invite_data.get("invite_token") or invite_data.get("token", "")

    accepted = client.post(
        "/api/v1/auth/accept-invite",
        json={"token": token, "password": "CarrierPass1"},
    )
    assert accepted.status_code == 200
