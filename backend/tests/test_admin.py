import hashlib
import json

from fastapi import FastAPI
from fastapi.testclient import TestClient

from campus.api.admin import admin_router


def test_admin_session_lifecycle(tmp_path):
    salt = b"test-salt"
    digest = hashlib.scrypt(b"test-password", salt=salt, n=16384, r=8, p=1).hex()
    accounts = tmp_path / "accounts.json"
    accounts.write_text(
        json.dumps(
            {
                "accounts": [
                    {
                        "username": "test-user",
                        "salt": salt.hex(),
                        "password_hash": digest,
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    app = FastAPI()
    app.include_router(admin_router(accounts))
    client = TestClient(app)
    assert client.get("/api/v1/admin/me").status_code == 401
    assert (
        client.post(
            "/api/v1/admin/login",
            json={
                "username": "test-user",
                "password": "wrong",
            },
        ).status_code
        == 401
    )
    response = client.post(
        "/api/v1/admin/login",
        json={
            "username": "test-user",
            "password": "test-password",
        },
    )
    assert response.status_code == 200
    assert "HttpOnly" in response.headers["set-cookie"]
    assert client.get("/api/v1/admin/me").json() == {"username": "test-user"}
    other = TestClient(app)
    assert other.get("/api/v1/admin/me").status_code == 401
    assert client.post("/api/v1/admin/logout").status_code == 200
    assert client.get("/api/v1/admin/me").status_code == 401
    accounts.unlink()
    assert (
        client.post(
            "/api/v1/admin/login",
            json={
                "username": "test-user",
                "password": "test-password",
            },
        ).status_code
        == 503
    )
