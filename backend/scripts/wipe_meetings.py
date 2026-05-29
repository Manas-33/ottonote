"""Dev helper: wipe ALL meetings + audio. Destructive — only run in dev.

Deletes every row from the `meetings` table (CASCADE handles segments,
summary, action items, calendar events) and every object in the Supabase
Storage bucket.

Usage:
    uv run python scripts/wipe_meetings.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, func, select  # noqa: E402

from app.config import settings  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models import Meeting  # noqa: E402
from app.storage import _client  # noqa: E402


async def wipe_db() -> int:
    async with SessionLocal() as db:
        count = (await db.execute(select(func.count(Meeting.id)))).scalar_one()
        await db.execute(delete(Meeting))
        await db.commit()
        return count


def wipe_storage() -> int:
    bucket = _client().storage.from_(settings.supabase_storage_bucket)
    # The bucket is laid out as <user_id>/<meeting_id>.<ext>. List each
    # user folder, collect file paths, batch-delete.
    user_folders = bucket.list("")
    paths: list[str] = []
    for folder in user_folders:
        name = folder["name"]
        if folder.get("id") is None:  # folder, not a file
            for f in bucket.list(name):
                paths.append(f"{name}/{f['name']}")
        else:
            paths.append(name)
    if paths:
        bucket.remove(paths)
    return len(paths)


async def main() -> int:
    db_count = await wipe_db()
    storage_count = wipe_storage()
    print(f"deleted {db_count} meeting rows, {storage_count} storage objects")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
