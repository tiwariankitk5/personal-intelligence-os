"""Run with an isolated OLD Java service/database, never a user's normal deployment."""
import os
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from pios.config import Settings
from pios.db import open_pool
from pios.gateway import decrypt
from pios.main import create_app

pytestmark = pytest.mark.skipif(not os.getenv("PIOS_JAVA_FIXTURE_URL"), reason="Old Java migration fixture not supplied")


def test_real_java_database_adoption(monkeypatch, tmp_path):
    email, password = f"adoption-{uuid4()}@example.com", "old-java-password"
    with httpx.Client(base_url=os.environ["PIOS_JAVA_FIXTURE_URL"], trust_env=False) as java:
        def call(path, method="GET", body=None):
            headers = {}
            if method != "GET":
                token = java.get("/api/v1/auth/csrf").json()
                headers[token["headerName"]] = token["token"]
            result = java.request(method, "/api/v1" + path, headers=headers, json=body)
            assert result.is_success, result.text
            return result.json() if result.content else None
        user = call("/auth/session/register", "POST", {"displayName": "Existing Java user", "email": email, "password": password})
        folder = call("/folders")[0]
        note = call("/notes", "POST", {"title": "Keep my Java note", "bodyHtml": "<h1>Existing</h1><p>My retained content</p>", "plainText": "My retained content", "folderId": folder["id"], "color": "rose", "pinned": True, "archived": False, "order": 3, "inkData": "retained drawing", "editorSettings": "{}"})
        provider = call("/ai/providers", "POST", {"displayName": "Existing key", "providerType": "OPENAI_COMPATIBLE", "modelName": "test", "apiKey": "java-created-test-key", "makeDefault": True})
        old_token = call("/auth/login", "POST", {"email": email, "password": password})["accessToken"]
    for name, value in {"DB_URL": os.environ["PIOS_ADOPTION_DATABASE_URL"], "DB_USERNAME": "pios", "DB_PASSWORD": "pios-validation-only", "APP_JWT_SECRET_BASE64": "cGlvcy10ZXN0LXNlY3JldC1rZXktMzItYnl0ZXMhISE=", "PIOS_ENCRYPTION_KEY": "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=", "PIOS_RAG_WORKER_ENABLED": "false", "PIOS_STORAGE_PATH": str(tmp_path)}.items():
        monkeypatch.setenv(name, value)
    settings = Settings()
    before_pool = open_pool(settings)
    with before_pool.connection() as conn:
        before = conn.execute("SELECT * FROM notes ORDER BY id").fetchall()
        password_before = conn.execute("SELECT password_hash FROM app_users WHERE id=%s", (user["id"],)).fetchone()
    before_pool.close()
    app = create_app(settings)
    with TestClient(app) as client:
        # Java JWTs keep working; Java serialized sessions deliberately require re-login.
        assert client.get("/api/v1/users/me", headers={"Authorization": "Bearer " + old_token}).json()["id"] == user["id"]
        token = client.get("/api/v1/auth/csrf").json()
        result = client.post("/api/v1/auth/session/login", headers={token["headerName"]: token["token"]}, json={"email": email, "password": password})
        assert result.status_code == 200 and result.json()["id"] == user["id"]
        retained = next(n for n in client.get("/api/v1/notes").json() if n["id"] == note["id"])
        # Both representations are ISO-8601 UTC; PostgreSQL values must stay byte-for-byte identical below.
        retained["updatedAt"] = retained["updatedAt"].replace("+00:00", "Z")
        assert retained == note
        with app.state.pool.connection() as conn:
            assert conn.execute("SELECT * FROM notes ORDER BY id").fetchall() == before
            assert conn.execute("SELECT password_hash FROM app_users WHERE id=%s", (user["id"],)).fetchone() == password_before
            encrypted = conn.execute("SELECT encrypted_api_key FROM ai_provider_connections WHERE id=%s", (provider["id"],)).fetchone()["encrypted_api_key"]
            assert decrypt(settings, encrypted) == "java-created-test-key"
