from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Request
from pydantic import Field

from .db import view
from .security import Model, current_user, fail, pool

router = APIRouter(prefix="/api/v1", dependencies=[Depends(current_user)])


def profile(conn, uid):
    user = conn.execute("SELECT id,email,display_name FROM app_users WHERE id=%s", (uid,)).fetchone()
    result = {"userId": uid, "email": user["email"], "displayName": user["display_name"]}
    for table, column in [("roles", "role"), ("interests", "interest"), ("goals", "goal")]:
        result[table] = [r[column] for r in conn.execute(f"SELECT {column} FROM user_profile_{table} v JOIN user_profiles p ON p.id=v.profile_id WHERE p.user_id=%s ORDER BY {column}", (uid,))]
    return result


class Profile(Model):
    display_name: str = Field(min_length=1, max_length=120)
    roles: set[str] = Field(default_factory=set, max_length=100)
    interests: set[str] = Field(default_factory=set, max_length=100)
    goals: set[str] = Field(default_factory=set, max_length=100)


@router.get("/profile/me")
def get_profile(request: Request, uid: UUID = Depends(current_user)):
    with pool(request).connection() as conn:
        return profile(conn, uid)


@router.put("/profile/me")
def update_profile(body: Profile, request: Request, uid: UUID = Depends(current_user)):
    if not body.display_name.strip():
        fail(400, "Display name is required.")
    with pool(request).connection() as conn:
        conn.execute("UPDATE app_users SET display_name=%s,updated_at=now() WHERE id=%s", (body.display_name.strip(), uid))
        row = conn.execute("SELECT id FROM user_profiles WHERE user_id=%s FOR UPDATE", (uid,)).fetchone()
        for table, column, values, size in [("roles", "role", body.roles, 60), ("interests", "interest", body.interests, 100), ("goals", "goal", body.goals, 100)]:
            conn.execute(f"DELETE FROM user_profile_{table} WHERE profile_id=%s", (row["id"],))
            for value in {v.strip() for v in values if v.strip()}:
                if len(value) > size:
                    fail(400, "Profile value is too long.")
                conn.execute(f"INSERT INTO user_profile_{table} VALUES (%s,%s)", (row["id"], value))
        return profile(conn, uid)


class Workspace(Model):
    name: str = Field(min_length=1, max_length=120)
    type: Literal["PERSONAL", "LEARNING", "RESEARCH", "PROJECT"]


class Rename(Model):
    name: str = Field(min_length=1, max_length=120)


def workspace_view(row):
    return view({k: row[k] for k in ("id", "name", "workspace_type", "is_default", "created_at")}, {"workspace_type": "type", "is_default": "defaultWorkspace"})


def owned(conn, uid, item):
    row = conn.execute("SELECT * FROM workspaces WHERE id=%s AND owner_id=%s", (item, uid)).fetchone()
    if not row:
        fail(404, "Workspace not found.")
    return row


@router.get("/workspaces")
def workspaces(request: Request, uid: UUID = Depends(current_user)):
    with pool(request).connection() as conn:
        return [workspace_view(r) for r in conn.execute("SELECT * FROM workspaces WHERE owner_id=%s ORDER BY is_default DESC,created_at", (uid,))]


@router.post("/workspaces", status_code=201)
def create_workspace(body: Workspace, request: Request, uid: UUID = Depends(current_user)):
    if not body.name.strip():
        fail(400, "Name is required.")
    with pool(request).connection() as conn:
        return workspace_view(conn.execute("INSERT INTO workspaces VALUES (%s,%s,%s,%s,false,now(),now()) RETURNING *", (uuid4(), uid, body.name.strip(), body.type)).fetchone())


@router.get("/workspaces/{item}")
def get_workspace(item: UUID, request: Request, uid: UUID = Depends(current_user)):
    with pool(request).connection() as conn:
        return workspace_view(owned(conn, uid, item))


@router.patch("/workspaces/{item}")
def rename_workspace(item: UUID, body: Rename, request: Request, uid: UUID = Depends(current_user)):
    if not body.name.strip():
        fail(400, "Name is required.")
    with pool(request).connection() as conn:
        owned(conn, uid, item)
        return workspace_view(conn.execute("UPDATE workspaces SET name=%s,updated_at=now() WHERE id=%s AND owner_id=%s RETURNING *", (body.name.strip(), item, uid)).fetchone())
