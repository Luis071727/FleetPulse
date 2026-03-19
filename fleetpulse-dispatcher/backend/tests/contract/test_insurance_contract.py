import pytest


@pytest.mark.skip(reason="Phase 2 — Insurance features not implemented in Phase 1")
def test_list_insurance_contract(client, auth_headers):
    response = client.get("/api/v1/carriers/insurance", headers=auth_headers)
    assert response.status_code == 200


def test_insurance_playbook_returns_501(client, auth_headers):
    response = client.post(
        "/api/v1/ai/insurance/playbook",
        json={"carrier_id": "carrier-1"},
        headers=auth_headers,
    )
    assert response.status_code == 501


@pytest.mark.skip(reason="Phase 2 — MVR features not implemented")
def test_mvr_pull_blocked_without_consent(client, auth_headers):
    pass


@pytest.mark.skip(reason="Phase 2 — DataQs features not implemented")
def test_dataqs_challenge_letter_contract(client, auth_headers):
    pass
