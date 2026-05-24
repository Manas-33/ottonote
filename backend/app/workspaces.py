"""Workspace endpoints: list, create, rename, recolor, delete.

A workspace is a user-owned bucket meetings live in (e.g. "Work", "Group
Project"). Every user gets a lazy-created "Default" workspace the first
time they need one — that workspace cannot be deleted. Deleting any other
workspace reassigns its meetings to the default.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser, get_current_user
from app.db import get_db
from app.models import Meeting, Workspace

router = APIRouter(prefix="/workspaces", tags=["workspaces"])

ALLOWED_COLORS = {"slate", "blue", "emerald", "amber", "rose", "violet"}


class WorkspaceOut(BaseModel):
    id: uuid.UUID
    name: str
    color: str
    is_default: bool
    created_at: str


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str = "slate"


class WorkspacePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    color: str | None = None


def _to_out(w: Workspace) -> WorkspaceOut:
    return WorkspaceOut(
        id=w.id,
        name=w.name,
        color=w.color,
        is_default=w.is_default,
        created_at=w.created_at.isoformat(),
    )


async def ensure_default_workspace(
    user_id: uuid.UUID, db: AsyncSession
) -> Workspace:
    """Return the user's default workspace, creating it if missing."""
    stmt = select(Workspace).where(
        Workspace.user_id == user_id, Workspace.is_default.is_(True)
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        return existing
    ws = Workspace(
        user_id=user_id, name="Default", color="slate", is_default=True
    )
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    return ws


@router.get("", response_model=list[WorkspaceOut])
async def list_workspaces(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[WorkspaceOut]:
    # Side effect: guarantee the user has a default workspace on first load.
    await ensure_default_workspace(user.id, db)
    stmt = (
        select(Workspace)
        .where(Workspace.user_id == user.id)
        .order_by(Workspace.is_default.desc(), Workspace.created_at.asc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_out(w) for w in rows]


@router.post(
    "", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED
)
async def create_workspace(
    body: WorkspaceCreate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceOut:
    if body.color not in ALLOWED_COLORS:
        raise HTTPException(status_code=422, detail=f"color must be one of {sorted(ALLOWED_COLORS)}")
    ws = Workspace(
        user_id=user.id, name=body.name.strip(), color=body.color, is_default=False
    )
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    return _to_out(ws)


@router.patch("/{workspace_id}", response_model=WorkspaceOut)
async def update_workspace(
    workspace_id: uuid.UUID,
    body: WorkspacePatch,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceOut:
    stmt = select(Workspace).where(
        Workspace.id == workspace_id, Workspace.user_id == user.id
    )
    ws = (await db.execute(stmt)).scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if body.name is not None:
        ws.name = body.name.strip()
    if body.color is not None:
        if body.color not in ALLOWED_COLORS:
            raise HTTPException(status_code=422, detail=f"color must be one of {sorted(ALLOWED_COLORS)}")
        ws.color = body.color
    await db.commit()
    await db.refresh(ws)
    return _to_out(ws)


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    workspace_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    stmt = select(Workspace).where(
        Workspace.id == workspace_id, Workspace.user_id == user.id
    )
    ws = (await db.execute(stmt)).scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if ws.is_default:
        raise HTTPException(status_code=409, detail="Cannot delete the default workspace")
    default_ws = await ensure_default_workspace(user.id, db)
    # Reassign any meetings to the default workspace before deleting.
    await db.execute(
        update(Meeting)
        .where(Meeting.workspace_id == ws.id)
        .values(workspace_id=default_ws.id)
    )
    await db.delete(ws)
    await db.commit()
