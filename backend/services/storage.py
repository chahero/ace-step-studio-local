from __future__ import annotations

from pathlib import Path

DATA_DIR = Path("storage")
AUDIO_DIR = DATA_DIR / "audio"
METADATA_DIR = DATA_DIR / "metadata"


def ensure_storage_dirs() -> None:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    METADATA_DIR.mkdir(parents=True, exist_ok=True)
