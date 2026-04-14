from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

from backend.services.storage import DATA_DIR

DB_PATH = DATA_DIR / "app.db"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS projects (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS model_presets (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              workflow_file TEXT NOT NULL,
              description TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS generations (
              id TEXT PRIMARY KEY,
              project_id TEXT,
              model_preset_id TEXT NOT NULL,
              prompt TEXT NOT NULL,
              lyrics TEXT,
              tags TEXT,
              bpm INTEGER,
              duration INTEGER,
              timesignature TEXT,
              language TEXT,
              keyscale TEXT,
              seed INTEGER,
              temperature REAL,
              cfg_scale REAL,
              status TEXT NOT NULL,
              output_audio_path TEXT,
              workflow_path TEXT,
              error_message TEXT,
              comfyui_prompt_id TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            """
        )
        seed_model_presets(conn)


def seed_model_presets(conn: sqlite3.Connection) -> None:
    count = conn.execute("SELECT COUNT(*) AS count FROM model_presets").fetchone()["count"]
    if count:
        return

    presets = [
        ("base", "Base", "workflow/audio_ace_step1_5_xl_base.json", "General-purpose Ace Step 1.5 XL base workflow"),
        ("sft", "SFT", "workflow/audio_ace_step1_5_xl_sft.json", "Fine-tuned Ace Step 1.5 XL workflow"),
        ("turbo", "Turbo", "workflow/audio_ace_step1_5_xl_turbo.json", "Fast Ace Step 1.5 XL workflow"),
    ]
    timestamp = now_iso()
    conn.executemany(
        """
        INSERT INTO model_presets (id, name, workflow_file, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [(preset_id, name, workflow_file, description, timestamp, timestamp) for preset_id, name, workflow_file, description in presets],
    )
    conn.commit()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


def fetch_model_presets() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM model_presets ORDER BY name ASC").fetchall()
    return [dict(row) for row in rows]


def fetch_generations() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM generations ORDER BY created_at DESC").fetchall()
    return [dict(row) for row in rows]


def fetch_generation(generation_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM generations WHERE id = ?", (generation_id,)).fetchone()
    return row_to_dict(row)


def insert_generation(payload: dict[str, Any]) -> dict[str, Any]:
    generation_id = str(uuid.uuid4())
    timestamp = now_iso()
    record = {
        "id": generation_id,
        "project_id": payload.get("project_id"),
        "model_preset_id": payload["model_preset_id"],
        "prompt": payload["prompt"],
        "lyrics": payload.get("lyrics"),
        "tags": payload.get("tags"),
        "bpm": payload.get("bpm"),
        "duration": payload.get("duration"),
        "timesignature": payload.get("timesignature"),
        "language": payload.get("language"),
        "keyscale": payload.get("keyscale"),
        "seed": payload.get("seed"),
        "temperature": payload.get("temperature"),
        "cfg_scale": payload.get("cfg_scale"),
        "status": "queued",
        "output_audio_path": None,
        "workflow_path": None,
        "error_message": None,
        "comfyui_prompt_id": None,
        "created_at": timestamp,
        "updated_at": timestamp,
    }

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO generations (
              id, project_id, model_preset_id, prompt, lyrics, tags, bpm, duration, timesignature,
              language, keyscale, seed, temperature, cfg_scale, status, output_audio_path,
              workflow_path, error_message, comfyui_prompt_id, created_at, updated_at
            ) VALUES (
              :id, :project_id, :model_preset_id, :prompt, :lyrics, :tags, :bpm, :duration, :timesignature,
              :language, :keyscale, :seed, :temperature, :cfg_scale, :status, :output_audio_path,
              :workflow_path, :error_message, :comfyui_prompt_id, :created_at, :updated_at
            )
            """,
            record,
        )
        conn.commit()

    return record


def update_generation_status(
    generation_id: str,
    status: str,
    *,
    output_audio_path: str | None = None,
    workflow_path: str | None = None,
    error_message: str | None = None,
    comfyui_prompt_id: str | None = None,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE generations
            SET status = ?, output_audio_path = ?, workflow_path = ?, error_message = ?, comfyui_prompt_id = ?, updated_at = ?
            WHERE id = ?
            """,
            (status, output_audio_path, workflow_path, error_message, comfyui_prompt_id, now_iso(), generation_id),
        )
        conn.commit()


def mark_generation_retry(generation_id: str) -> dict[str, Any] | None:
    generation = fetch_generation(generation_id)
    if generation is None:
        return None

    update_generation_status(
        generation_id,
        "queued",
        output_audio_path=None,
        workflow_path=None,
        error_message=None,
        comfyui_prompt_id=None,
    )
    return fetch_generation(generation_id)
