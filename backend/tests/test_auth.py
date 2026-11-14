from app.models import Role
from tests.conftest import login, make_user


def test_register_login_refresh_logout(client):
    r = client.post("/api/auth/register", json={"email": "Dara@Example.com", "password": "secret123", "password_confirm": "secret123",
                                                "full_name": "Sok Dara", "phone": "+855 12 345 678", "accept_terms": True})
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["user"]["email"] == "dara@example.com"
    assert data["user"]["phone"] == "012345678"
    assert data["user"]["role"] == "customer"

    # duplicate email
    assert client.post("/api/auth/register", json={"email": "dara@example.com", "password": "secret123",
                                                   "password_confirm": "secret123", "full_name": "X Y", "accept_terms": True}).status_code == 409
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
    weak = client.post("/api/auth/register", json={"email": "a@b.com", "password": "abcdefgh", "password_confirm": "abcdefgh",
                                                   "full_name": "A B", "accept_terms": True})
    assert weak.status_code == 422
    bad_phone = client.post("/api/auth/register", json={"email": "a@b.com", "password": "abc12345", "password_confirm": "abc12345",
                                                        "full_name": "A B", "phone": "555-1234", "accept_terms": True})
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


def test_register_requires_matching_passwords_and_terms(client):
    base = {"email": "t@example.com", "password": "secret123", "full_name": "Test User"}
    r = client.post("/api/auth/register", json={**base, "password_confirm": "other123", "accept_terms": True})
    assert r.status_code == 422 and "do not match" in r.json()["detail"]
    r = client.post("/api/auth/register", json={**base, "password_confirm": "secret123", "accept_terms": False})
    assert r.status_code == 422 and "terms" in r.json()["detail"]
    r = client.post("/api/auth/register", json={**base, "password_confirm": "secret123", "accept_terms": True, "locale": "km"})
    assert r.status_code == 201 and r.json()["user"]["locale"] == "km"


def test_khmer_error_messages(client):
    # unknown email: the shop says so, so the customer can register
    r = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "x"},
                    headers={"Accept-Language": "km"})
    assert r.status_code == 404 and r.json()["detail"] == "មិនទាន់មានគណនីប្រើអ៊ីមែលនេះទេ"
    r = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "x"})
    assert r.status_code == 404 and r.json()["detail"] == "No account uses this email yet"
    # dashboard login keeps the generic answer
    r = client.post("/api/auth/admin/login", json={"email": "nobody@example.com", "password": "x"})
    assert r.status_code == 401 and r.json()["detail"] == "Incorrect email or password"


def test_forgot_and_reset_password(client, db, monkeypatch):
    from app.routers import auth as auth_router
    sent = {}
    monkeypatch.setattr(auth_router, "send_password_reset",
                        lambda to, name, link, locale: sent.update(to=to, link=link, locale=locale))
    make_user(db, "reset@iceqsole.com", Role.customer)
    old = login(client, "reset@iceqsole.com")
    # unknown email: told there is no account (and nothing is sent)
    r = client.post("/api/auth/forgot-password", json={"email": "ghost@example.com"})
    assert r.status_code == 404 and r.json()["detail"] == "No account uses this email yet"
    assert not sent
    r = client.post("/api/auth/forgot-password", json={"email": "RESET@iceqsole.com"})
    assert r.status_code == 200 and sent["to"] == "reset@iceqsole.com" and "/reset-password?token=" in sent["link"]
    token = sent["link"].split("token=")[1]
    bad = client.post("/api/auth/reset-password", json={"token": token, "password": "NewPass123", "password_confirm": "Nope12345"})
    assert bad.status_code == 422
    ok = client.post("/api/auth/reset-password", json={"token": token, "password": "NewPass123", "password_confirm": "NewPass123"})
    assert ok.status_code == 200
    # single use, old sessions revoked, new password works
    again = client.post("/api/auth/reset-password", json={"token": token, "password": "Other1234", "password_confirm": "Other1234"})
    assert again.status_code == 400
    assert client.get("/api/account/me", headers=old).status_code == 401
    login(client, "reset@iceqsole.com", "NewPass123")


def test_remember_me_controls_refresh_lifetime(client, db):
    import jwt as pyjwt
    make_user(db, "rm@iceqsole.com", Role.customer)
    short = client.post("/api/auth/login", json={"email": "rm@iceqsole.com", "password": "Passw0rd!", "remember": False}).json()
    long = client.post("/api/auth/login", json={"email": "rm@iceqsole.com", "password": "Passw0rd!", "remember": True}).json()
    exp = lambda t: pyjwt.decode(t, options={"verify_signature": False})["exp"]
    assert exp(long["refresh_token"]) - exp(short["refresh_token"]) > 20 * 86400
    rotated = client.post("/api/auth/refresh", json={"refresh_token": short["refresh_token"]}).json()
    assert pyjwt.decode(rotated["refresh_token"], options={"verify_signature": False})["rem"] is False
