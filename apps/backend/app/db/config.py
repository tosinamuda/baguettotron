from __future__ import annotations

import os
from pathlib import Path

# Determine where to store the SQLite database file.
APP_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.getenv("CHAT_DATA_DIR", APP_ROOT / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_FILENAME = os.getenv("CHAT_DB_FILENAME", "chat.sqlite3")
DB_PATH = DATA_DIR / DB_FILENAME

DEFAULT_ASYNC_URL = f"sqlite+aiosqlite:///{DB_PATH}"
ASYNC_DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_ASYNC_URL)


def _derive_sync_url(async_url: str) -> str:
    if async_url.startswith("sqlite+aiosqlite"):
        return async_url.replace("sqlite+aiosqlite", "sqlite+pysqlite", 1)
    return async_url


SYNC_DATABASE_URL = os.getenv("SYNC_DATABASE_URL", _derive_sync_url(ASYNC_DATABASE_URL))

__all__ = [
    "ASYNC_DATABASE_URL",
    "SYNC_DATABASE_URL",
    "DB_PATH",
]
