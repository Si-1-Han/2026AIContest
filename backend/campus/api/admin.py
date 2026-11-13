"""Local JSON account authentication; sessions expire on server restart."""

import hashlib
import json
import secrets
import time
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

COOKIE = "campus_admin_session"
SESSION_SECONDS = 8 * 60 * 60


class Login(BaseModel):
    username: str = Field(max_length=100)
    password: str = Field(max_length=200)


def admin_router(
    accounts_file: Path, source_dir: Path | None = None, data_dir: Path | None = None
) -> APIRouter:
    router = APIRouter(prefix="/api/v1/admin", tags=["admin"])
    sessions: dict[str, tuple[str, float]] = {}

    def identity(request: Request) -> str:
        token = request.cookies.get(COOKIE, "")
        user, expires = sessions.get(token, ("", 0))
        if expires <= time.time():
            sessions.pop(token, None)
            raise HTTPException(401, "관리자 로그인이 필요합니다.")
        return user

    @router.post("/login")
    def login(body: Login, response: Response) -> dict[str, str]:
        try:
            accounts = json.loads(accounts_file.read_text(encoding="utf-8"))["accounts"]
            valid = False
            for account in accounts:
                digest = hashlib.scrypt(
                    body.password.encode(),
                    salt=bytes.fromhex(account["salt"]),
                    n=16384,
                    r=8,
                    p=1,
                ).hex()
                if secrets.compare_digest(
                    body.username, account["username"]
                ) and secrets.compare_digest(digest, account["password_hash"]):
                    valid = True
            if not valid:
                raise HTTPException(401, "아이디 또는 비밀번호가 올바르지 않습니다.")
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise HTTPException(503, "관리자 계정 파일을 확인해 주세요.") from exc
        now = time.time()
        for expired in [key for key, (_, until) in sessions.items() if until <= now]:
            sessions.pop(expired, None)
        token = secrets.token_urlsafe(32)
        sessions[token] = (body.username, now + SESSION_SECONDS)
        response.set_cookie(
            COOKIE,
            token,
            httponly=True,
            samesite="strict",
            max_age=SESSION_SECONDS,
            path="/api/v1/admin",
        )
        response.headers["Cache-Control"] = "no-store"
        return {"username": body.username}

    @router.get("/me")
    def me(request: Request, response: Response) -> dict[str, str]:
        response.headers["Cache-Control"] = "no-store"
        return {"username": identity(request)}

    @router.post("/logout")
    def logout(request: Request, response: Response) -> dict[str, bool]:
        sessions.pop(request.cookies.get(COOKIE, ""), None)
        response.delete_cookie(COOKIE, path="/api/v1/admin")
        return {"ok": True}

    if source_dir is not None and data_dir is not None:
        from campus.api.admin_data import data_router

        router.include_router(data_router(source_dir, data_dir), dependencies=[Depends(identity)])
    return router
