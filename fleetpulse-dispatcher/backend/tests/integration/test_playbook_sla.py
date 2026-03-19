def test_playbook_response_returns_501(client, auth_headers):
    response = client.post(
        "/api/v1/ai/insurance/playbook",
        json={"carrier_id": "carrier-1"},
        headers=auth_headers,
    )
    assert response.status_code == 501
