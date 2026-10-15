from tests.remixweb.conftest import AUTH

def test_health_is_open(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

def test_protected_route_rejects_missing_key(client):
    r = client.get("/jobs/does-not-exist")
    assert r.status_code == 401

def test_protected_route_rejects_wrong_key(client):
    r = client.get("/jobs/x", headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401

def test_protected_route_accepts_right_key_then_404(client):
    r = client.get("/jobs/does-not-exist", headers=AUTH)
    assert r.status_code == 404

# /auth-check is what the gate validates the password against: if it stops
# rejecting wrong keys, a wrong password opens a console that 401s on first use.
def test_auth_check_rejects_missing_and_wrong_key(client):
    assert client.get("/auth-check").status_code == 401
    assert client.get("/auth-check", headers={"Authorization": "Bearer nope"}).status_code == 401

def test_auth_check_accepts_right_key(client):
    r = client.get("/auth-check", headers=AUTH)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
