import time


def test_fmcsa_lookup_under_three_seconds(client, auth_headers):
    start = time.perf_counter()
    response = client.post("/api/v1/carriers", json={"dot_number": "3812044"}, headers=auth_headers)
    elapsed = time.perf_counter() - start
    assert response.status_code in (200, 201)
    assert elapsed < 3.0
