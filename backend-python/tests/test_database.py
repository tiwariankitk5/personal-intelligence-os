"""Requires PIOS_TEST_DATABASE_URL pointing ONLY to a disposable PostgreSQL database."""
import os
from uuid import uuid4

import bcrypt
import pytest
from fastapi.testclient import TestClient

from pios.config import Settings
from pios.db import migrate
from pios.main import create_app
from pios.security import cleanup

pytestmark = pytest.mark.skipif(not os.getenv("PIOS_TEST_DATABASE_URL"), reason="Disposable PostgreSQL URL not supplied")


@pytest.fixture
def configuration(monkeypatch, tmp_path):
    monkeypatch.setenv("DB_URL", os.getenv("PIOS_TEST_DATABASE_URL", ""))
    monkeypatch.setenv("DB_PASSWORD", "pios-validation-only")
    monkeypatch.setenv("DB_USERNAME", "pios")
    monkeypatch.setenv("APP_JWT_SECRET_BASE64", "cGlvcy10ZXN0LXNlY3JldC1rZXktMzItYnl0ZXMhISE=")
    monkeypatch.setenv("PIOS_ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
    monkeypatch.setenv("PIOS_STORAGE_PATH", str(tmp_path))
    monkeypatch.setenv("PIOS_RAG_WORKER_ENABLED", "false")
    monkeypatch.setenv("PIOS_AUTH_REGISTER_IP_LIMIT", "100")
    return Settings()


def csrf(client):
    data = client.get("/api/v1/auth/csrf").json()
    return {data["headerName"]: data["token"]}


def register(client):
    before = client.cookies.get("JSESSIONID")
    response = client.post("/api/v1/auth/session/register", headers=csrf(client), json={"displayName": "Session test", "email": f"{uuid4()}@example.com", "password": "private-password"})
    assert response.status_code == 201, response.text
    assert client.cookies.get("JSESSIONID") != before
    return response.json()


def test_shared_sessions_restart_and_logout(configuration):
    app1, app2 = create_app(configuration), create_app(configuration)
    with TestClient(app1) as first, TestClient(app2) as second:
        user = register(first)
        cookie = first.cookies.get("JSESSIONID")
        second.cookies.set("JSESSIONID", cookie)
        assert second.get("/api/v1/users/me").json()["id"] == user["id"]
        assert second.post("/api/v1/auth/logout").status_code == 403
        assert second.post("/api/v1/auth/logout", headers=csrf(second)).status_code == 204
        assert first.get("/api/v1/users/me").status_code == 401
        register(first)
        saved_cookie = first.cookies.get("JSESSIONID")
    # A new pool/application process still sees the persisted session.
    with TestClient(create_app(configuration)) as restarted:
        restarted.cookies.set("JSESSIONID", saved_cookie)
        assert restarted.get("/api/v1/users/me").status_code == 200


def test_existing_spring_bcrypt_and_migration_idempotence(configuration):
    app = create_app(configuration)
    with TestClient(app) as client:
        uid = uuid4()
        email = f"legacy-{uid}@example.com"
        password_hash = bcrypt.hashpw(b"old-password", bcrypt.gensalt(rounds=10)).decode().replace("$2b$", "$2a$", 1)
        with app.state.pool.connection() as conn:
            conn.execute("INSERT INTO app_users VALUES (%s,%s,%s,'Existing Java account',now(),now())", (uid, email, password_hash))
            before = conn.execute("SELECT id,email,password_hash FROM app_users ORDER BY id").fetchall()
        migrate(app.state.pool)
        with app.state.pool.connection() as conn:
            assert conn.execute("SELECT id,email,password_hash FROM app_users ORDER BY id").fetchall() == before
        result = client.post("/api/v1/auth/session/login", headers=csrf(client), json={"email": email, "password": "old-password"})
        assert result.status_code == 200 and result.json()["id"] == str(uid)


def test_transactions_rollback_and_private_metadata(configuration):
    app = create_app(configuration)
    with TestClient(app) as owner, TestClient(app) as stranger:
        register(owner)
        register(stranger)
        folder = owner.post("/api/v1/folders", headers=csrf(owner), json={"name": "Private", "color": "#123456"}).json()
        assert stranger.post("/api/v1/notes", headers=csrf(stranger), json={"title": "Attempt", "folderId": folder["id"]}).status_code == 404
        workspace = owner.post("/api/v1/workspaces", headers=csrf(owner), json={"name": "Private work", "type": "RESEARCH"}).json()
        assert stranger.get("/api/v1/workspaces/" + workspace["id"]).status_code == 404
        updated = owner.put("/api/v1/profile/me", headers=csrf(owner), json={"displayName": "Updated", "roles": ["Engineer"]})
        assert updated.status_code == 200 and updated.json()["roles"] == ["Engineer"]
        bad = owner.put("/api/v1/profile/me", headers=csrf(owner), json={"displayName": "Must roll back", "roles": ["x" * 70]})
        assert bad.status_code == 400
        assert owner.get("/api/v1/profile/me").json()["displayName"] == "Updated"


def test_expired_auth_cleanup_retains_active_sessions(configuration):
    app = create_app(configuration)
    with TestClient(app) as client:
        register(client)
        with app.state.pool.connection() as conn:
            conn.execute("INSERT INTO auth_abuse_buckets VALUES (%s,now()-interval '1 hour',1,NULL,now()-interval '1 minute')", ("e" * 64,))
            conn.execute("INSERT INTO python_sessions VALUES (%s,NULL,'expired',now()-interval '1 minute')", ("e" * 64,))
        cleanup(app.state.pool)
        assert client.get("/api/v1/users/me").status_code == 200
        with app.state.pool.connection() as conn:
            assert not conn.execute("SELECT 1 FROM auth_abuse_buckets WHERE bucket_key=%s", ("e" * 64,)).fetchone()
            assert not conn.execute("SELECT 1 FROM python_sessions WHERE token_hash=%s", ("e" * 64,)).fetchone()


def test_hosted_secure_cookie_and_cors(configuration, monkeypatch):
    monkeypatch.setenv("PIOS_ENV", "hosted")
    monkeypatch.setenv("PIOS_PUBLIC_ORIGIN", "https://pios.test")
    monkeypatch.setenv("PIOS_ALLOW_LOCAL_MODELS", "false")
    hosted = Settings()
    with TestClient(create_app(hosted), base_url="https://pios.test") as client:
        response = client.get("/api/v1/auth/csrf", headers={"Origin": "https://pios.test"})
        assert "Secure" in response.headers["set-cookie"]
        assert "HttpOnly" in response.headers["set-cookie"]
        assert response.headers["access-control-allow-origin"] == "https://pios.test"
        assert "access-control-allow-origin" not in client.get("/api/v1/auth/csrf", headers={"Origin": "https://evil.test"}).headers
