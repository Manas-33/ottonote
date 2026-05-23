"""Supabase Storage helpers for meeting audio.

Uploads + downloads use the service role key — the API has already verified
user ownership before calling these, and the worker has no user context.
"""

from __future__ import annotations

import asyncio
import tempfile
import uuid
from functools import lru_cache
from pathlib import Path

from supabase import Client, create_client

from app.config import settings


@lru_cache(maxsize=1)
def _client() -> Client:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use storage"
        )
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def _bucket():
    return _client().storage.from_(settings.supabase_storage_bucket)


def storage_path_for(user_id: uuid.UUID, meeting_id: uuid.UUID, suffix: str) -> str:
    suffix = suffix if suffix.startswith(".") else f".{suffix}"
    return f"{user_id}/{meeting_id}{suffix}"


async def upload_audio(local_path: Path, storage_path: str, content_type: str) -> None:
    def _upload() -> None:
        with open(local_path, "rb") as f:
            data = f.read()
        # upsert=true so re-running /process for the same meeting overwrites
        # cleanly instead of erroring.
        _bucket().upload(
            path=storage_path,
            file=data,
            file_options={"content-type": content_type, "upsert": "true"},
        )

    await asyncio.to_thread(_upload)


async def download_audio_to_tmp(storage_path: str) -> Path:
    def _download() -> Path:
        data = _bucket().download(storage_path)
        suffix = Path(storage_path).suffix or ".bin"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            return Path(tmp.name)

    return await asyncio.to_thread(_download)


async def delete_audio(storage_path: str) -> None:
    await asyncio.to_thread(lambda: _bucket().remove([storage_path]))


async def signed_url(storage_path: str, expires_in: int = 3600) -> str:
    def _sign() -> str:
        result = _bucket().create_signed_url(storage_path, expires_in)
        return result["signedURL"]

    return await asyncio.to_thread(_sign)
