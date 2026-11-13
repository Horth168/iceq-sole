from app.models import Role
from tests.conftest import login, make_user


def test_register_login_refresh_logout(client):
    r = client.post("/api/auth/register", json={"email": "Dara@Example.com", "password": "secret123",
                                                "full_name": "Sok Dara", "phone": "+855 12 345 678"})
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["user"]["email"] == "dara@example.com"
    assert data["user"]["phone"] == "012345678"
    assert data["user"]["role"] == "customer"

    # duplicate email
    assert client.post("/api/auth/register", json={"email": "dara@example.com", "password": "secret123",
                                                   "full_name": "X Y"}).status_code == 409
    # wrong password
    assert client.post("/api/auth/login", json={"email": "dara@example.com", "password": "nope"}).status_code == 401

    me = client.get("/api/account/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert me.status_code == 200

    # refresh rotation: old refresh token is single-use
    r1 = client.post("/api/auth/refresh", json={"refresh_token": data["refresh_token"]})
    assert r1.status_code == 200
    assert client.post("/api/auth/refresh", json={"refresh_token": data["refresh_token"]}).status_code == 401
    # token reuse revoked the whole family, including the newest refresh token
    assert client.post("/api/auth/refresh", json={"refresh_token": r1.json()["refresh_token"]}).status_code == 401


def test_password_rules_and_phone_validation(client):
    weak = client.post("/api/auth/register", json={"email": "a@b.com", "password": "abcdefgh", "full_name": "A B"})
    assert weak.status_code == 422
    bad_phone = client.post("/api/auth/register", json={"email": "a@b.com", "password": "abc12345",
                                                        "full_name": "A B", "phone": "555-1234"})
    assert bad_phone.status_code == 422
    assert "phone" in bad_phone.json()["errors"][0]["field"]


def test_admin_routes_require_staff(client, db):
    make_user(db, "cust@iceqsole.com", Role.customer)
    h = login(client, "cust@iceqsole.com")
    assert client.get("/api/admin/dashboard").status_code == 401
    assert client.get("/api/admin/dashboard", headers=h).status_code == 403
    # customers cannot use the dashboard login
    r = client.post("/api/auth/admin/login", json={"email": "cust@iceqsole.com", "password": "Passw0rd!"})
    assert r.status_code == 403


def test_staff_cannot_change_settings(client, db):
    make_user(db, "staff@iceqsole.com", Role.staff)
    h = login(client, "staff@iceqsole.com", admin=True)
    assert client.get("/api/admin/orders", headers=h).status_code == 200
    assert client.put("/api/admin/settings/store", json={"name": "X"}, headers=h).status_code == 403


def test_change_password_revokes_old_tokens(client, db):
    make_user(db, "c@iceqsole.com", Role.customer)
    h = login(client, "c@iceqsole.com")
    r = client.post("/api/account/password", json={"current_password": "Passw0rd!", "new_password": "NewPass123"}, headers=h)
    assert r.status_code == 200
    assert client.get("/api/account/me", headers=h).status_code == 401
    login(client, "c@iceqsole.com", "NewPass123")
