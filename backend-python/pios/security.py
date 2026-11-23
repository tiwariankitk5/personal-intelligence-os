import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from starlette.middleware.base import BaseHTTPMiddleware

from .db import camel, view

router = APIRouter(prefix="/api/v1")
audit = logging.getLogger("pios.security")
DUMMY_PASSWORD_HASH = bcrypt.hashpw(b"unregistered-account-placeholder", bcrypt.gensalt(rounds=10))


class Model(BaseModel):
    model_config = ConfigDict(alias_generator=camel, populate_by_name=True, extra="ignore", str_strip_whitespace=False)


def fail(status, message):
    raise HTTPException(status, message)


def pool(request: Request):
    return request.app.state.pool


def current_user(request: Request) -> UUID:
    if not getattr(request.state, "user_id", None):
        fail(401, "Sign in to access this workspace.")
    return request.state.user_id


class SessionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        from starlette.concurrency import run_in_threadpool
        from starlette.responses import JSONResponse
        request.state.user_id = None
        request.state.session = None
        token = request.cookies.get("JSESSIONID", "")
        if token and len(token) <= 128:
            def load():
                with pool(request).connection() as conn:
                    return conn.execute("UPDATE python_sessions SET expires_at=now()+interval '30 minutes' WHERE token_hash=%s AND expires_at>now() RETURNING *",
                                        (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
            row = await run_in_threadpool(load)
            request.state.session = row
            request.state.user_id = row["user_id"] if row else None
        auth = request.headers.get("authorization", "")
        if not request.state.user_id and auth.startswith("Bearer "):
            try:
                claims = jwt.decode(auth[7:], request.app.state.settings.secret, algorithms=["HS256", "HS384", "HS512"], options={"require": ["sub", "exp", "uid"]})
                def lookup():
                    with pool(request).connection() as conn:
                        return conn.execute("SELECT id FROM app_users WHERE id=%s AND lower(email)=lower(%s)", (UUID(claims["uid"]), claims["sub"])).fetchone()
                user = await run_in_threadpool(lookup)
                request.state.user_id = user["id"] if user else None
            except (jwt.PyJWTError, ValueError, KeyError):
                pass
        if request.method == "POST" and request.url.path in {"/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/session/login", "/api/v1/auth/session/register"}:
            from .config import setting
            operation = request.url.path.rsplit("/", 1)[1]
            source = request.client.host if request.client else "unknown"
            limit = int(setting("PIOS_AUTH_REGISTER_IP_LIMIT" if operation == "register" else "PIOS_AUTH_LOGIN_IP_LIMIT", "5" if operation == "register" else "30"))
            try:
                await run_in_threadpool(bucket, request, "ip-" + operation, source, limit, 600 if operation == "register" else 60)
            except HTTPException as ex:
                return JSONResponse({"message": ex.detail}, status_code=ex.status_code, headers=ex.headers)
        if request.url.path.startswith("/api/v1") and request.method not in ("GET", "HEAD", "OPTIONS"):
            row = request.state.session
            supplied = request.headers.get("X-CSRF-TOKEN", "")
            if not row or not supplied or not hmac.compare_digest(row["csrf_token"], supplied):
                return JSONResponse({"message": "Invalid CSRF token. Refresh and try again."}, status_code=403)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response


def new_session(request, response, user=None):
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    with pool(request).connection() as conn:
        if request.state.session:
            conn.execute("DELETE FROM python_sessions WHERE token_hash=%s", (request.state.session["token_hash"],))
        conn.execute("INSERT INTO python_sessions VALUES (%s,%s,%s,now()+interval '30 minutes')",
                     (hashlib.sha256(token.encode()).hexdigest(), user, csrf))
        conn.execute("DELETE FROM python_sessions WHERE expires_at<now()")
    response.set_cookie("JSESSIONID", token, httponly=True, secure=request.app.state.settings.secure_cookie, samesite="lax", path="/")
    return csrf


def cleanup(db_pool):
    with db_pool.connection() as conn:
        conn.execute("DELETE FROM auth_abuse_buckets WHERE bucket_key IN (SELECT bucket_key FROM auth_abuse_buckets WHERE expires_at<now() LIMIT 1000)")
        conn.execute("DELETE FROM python_sessions WHERE token_hash IN (SELECT token_hash FROM python_sessions WHERE expires_at<now() LIMIT 1000)")


@router.get("/auth/csrf")
def csrf(request: Request, response: Response):
    row = request.state.session
    value = row["csrf_token"] if row else new_session(request, response)
    return {"headerName": "X-CSRF-TOKEN", "token": value}


class Register(Model):
    display_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    roles: set[str] = Field(default_factory=set, max_length=100)
    interests: set[str] = Field(default_factory=set, max_length=100)
    goals: set[str] = Field(default_factory=set, max_length=100)


class Login(Model):
    email: EmailStr
    password: str = Field(min_length=1, max_length=1000)


def fingerprint(request, kind, identity):
    return hmac.new(request.app.state.settings.secret, ("pios-auth-v1\0" + kind + "\0" + identity.strip().lower()).encode(), hashlib.sha256).hexdigest()


def bucket(request, kind, identity, limit, seconds, mode="consume"):
    key = fingerprint(request, kind, identity)
    now = datetime.now(timezone.utc)
    with pool(request).connection() as conn:
        conn.execute("INSERT INTO auth_abuse_buckets(bucket_key,window_start,attempts,expires_at) VALUES (%s,%s,0,%s) ON CONFLICT DO NOTHING", (key, now, now + timedelta(seconds=seconds)))
        row = conn.execute("SELECT * FROM auth_abuse_buckets WHERE bucket_key=%s FOR UPDATE", (key,)).fetchone()
        start, attempts, blocked = row["window_start"], row["attempts"], row["blocked_until"]
        if mode == "reset" or (blocked is not None and blocked <= now) or (blocked is None and start + timedelta(seconds=seconds) <= now):
            start, attempts, blocked = now, 0, None
        retry = max(1, int((blocked - now).total_seconds()) + 1) if blocked and blocked > now else 0
        if mode == "consume" and not retry:
            if attempts >= limit:
                retry = max(1, int((start + timedelta(seconds=seconds) - now).total_seconds()) + 1)
            else:
                attempts += 1
        elif mode == "failure" and not retry:
            attempts += 1
            if attempts >= limit:
                from .config import setting
                blocked = now + timedelta(seconds=int(setting("PIOS_AUTH_COOLDOWN_SECONDS", "60")))
        conn.execute("UPDATE auth_abuse_buckets SET window_start=%s,attempts=%s,blocked_until=%s,expires_at=%s WHERE bucket_key=%s", (start, attempts, blocked, max(start + timedelta(seconds=seconds), blocked or now), key))
    if retry:
        raise HTTPException(429, "Too many attempts. Try again later.", headers={"Retry-After": str(retry)})


def authenticate(request, body, register=False):
    from .config import setting
    email = str(body.email).strip().lower()
    op = "register" if register else "login"
    if len(body.password.encode()) > 72:
        fail(400, "Password must not exceed 72 UTF-8 bytes.")
    if register:
        if not body.display_name.strip():
            fail(400, "Display name is required.")
        with pool(request).connection() as conn:
            if conn.execute("SELECT 1 FROM app_users WHERE lower(email)=%s", (email,)).fetchone():
                fail(409, "Email is already registered.")
            uid, profile = uuid4(), uuid4()
            conn.execute("INSERT INTO app_users VALUES (%s,%s,%s,%s,now(),now())", (uid, email, bcrypt.hashpw(body.password.encode(), bcrypt.gensalt(rounds=10)).decode(), body.display_name.strip()))
            conn.execute("INSERT INTO user_profiles VALUES (%s,%s,now(),now())", (profile, uid))
            for table, column, values, size in [("roles", "role", body.roles, 60), ("interests", "interest", body.interests, 100), ("goals", "goal", body.goals, 100)]:
                for value in {v.strip() for v in values if v.strip()}:
                    if len(value) > size:
                        fail(400, "Profile value is too long.")
                    conn.execute(f"INSERT INTO user_profile_{table}(profile_id,{column}) VALUES (%s,%s)", (profile, value))
            conn.execute("INSERT INTO workspaces VALUES (%s,%s,'Personal','PERSONAL',true,now(),now())", (uuid4(), uid))
            user = conn.execute("SELECT id,email,display_name FROM app_users WHERE id=%s", (uid,)).fetchone()
    else:
        failure_limit = int(setting("PIOS_AUTH_FAILED_LOGIN_LIMIT", "5"))
        failure_window = int(setting("PIOS_AUTH_FAILURE_WINDOW_SECONDS", "900"))
        bucket(request, "failures", email, failure_limit, failure_window, "check")
        bucket(request, "account-login", email, int(setting("PIOS_AUTH_ACCOUNT_LOGIN_LIMIT", "10")), 60)
        with pool(request).connection() as conn:
            user = conn.execute("SELECT id,email,display_name,password_hash FROM app_users WHERE lower(email)=%s", (email,)).fetchone()
        encoded = user["password_hash"].removeprefix("{bcrypt}").encode() if user else DUMMY_PASSWORD_HASH
        valid = bcrypt.checkpw(body.password.encode(), encoded)
        if not user or not valid:
            bucket(request, "failures", email, failure_limit, failure_window, "failure")
            audit.info("auth_event=login outcome=failure actor_ref=%s", fingerprint(request, "audit-actor", email)[:16])
            fail(401, "Email or password is incorrect.")
        bucket(request, "failures", email, failure_limit, failure_window, "reset")
    audit.info("auth_event=%s outcome=success actor_ref=%s", op, fingerprint(request, "audit-actor", email)[:16])
    return {k: v for k, v in view(user).items() if k != "passwordHash"}


@router.post("/auth/session/register", status_code=201)
def register(body: Register, request: Request, response: Response):
    user = authenticate(request, body, True)
    new_session(request, response, user["id"])
    return user


@router.post("/auth/session/login")
def login(body: Login, request: Request, response: Response):
    user = authenticate(request, body)
    new_session(request, response, user["id"])
    return user


def bearer(request, user):
    from .config import setting
    seconds = int(setting("APP_JWT_EXPIRATION_MS", "43200000")) // 1000
    now = datetime.now(timezone.utc)
    token = jwt.encode({"sub": user["email"], "uid": str(user["id"]), "iat": now, "exp": now + timedelta(seconds=seconds)}, request.app.state.settings.secret, algorithm="HS256")
    return {"accessToken": token, "tokenType": "Bearer", "expiresInSeconds": seconds, "user": user}


@router.post("/auth/register", status_code=201)
def legacy_register(body: Register, request: Request):
    return bearer(request, authenticate(request, body, True))


@router.post("/auth/login")
def legacy_login(body: Login, request: Request):
    return bearer(request, authenticate(request, body))


@router.post("/auth/logout", status_code=204)
def logout(request: Request, response: Response):
    if request.state.session:
        with pool(request).connection() as conn:
            conn.execute("DELETE FROM python_sessions WHERE token_hash=%s", (request.state.session["token_hash"],))
    response.delete_cookie("JSESSIONID", path="/", secure=request.app.state.settings.secure_cookie, httponly=True, samesite="lax")


@router.get("/users/me")
def me(request: Request, user: UUID = Depends(current_user)):
    with pool(request).connection() as conn:
        return view(conn.execute("SELECT id,email,display_name,created_at FROM app_users WHERE id=%s", (user,)).fetchone())
