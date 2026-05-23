"""One-time setup: create the private 'meetings' Storage bucket.

Idempotent — safe to re-run. Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
and SUPABASE_STORAGE_BUCKET from .env.

Usage:
    uv run python scripts/setup_storage.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from supabase import create_client  # noqa: E402

from app.config import settings  # noqa: E402


def main() -> int:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        print("error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env",
              file=sys.stderr)
        return 1

    client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    name = settings.supabase_storage_bucket

    existing = {b.name for b in client.storage.list_buckets()}
    if name in existing:
        print(f"bucket '{name}' already exists — nothing to do")
        return 0

    client.storage.create_bucket(name, options={"public": False})
    print(f"created private bucket '{name}'")
    return 0


if __name__ == "__main__":
    sys.exit(main())
