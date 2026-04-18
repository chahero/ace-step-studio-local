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
              title TEXT,
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
              cover_image_path TEXT,
              cover_prompt TEXT,
              cover_negative_prompt TEXT,
              cover_status TEXT,
              cover_error_message TEXT,
              postprocess_status TEXT,
              postprocess_error_message TEXT,
              postprocess_audio_path TEXT,
              postprocess_applied_at TEXT,
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
        generation_columns = {row["name"] for row in conn.execute("PRAGMA table_info(generations)").fetchall()}
        if "title" not in generation_columns:
            conn.execute("ALTER TABLE generations ADD COLUMN title TEXT")
        if "cover_image_path" not in generation_columns:
            conn.execute("ALTER TABLE generations ADD COLUMN cover_image_path TEXT")
        if "cover_prompt" not in generation_columns:
            conn.execute("ALTER TABLE generations ADD COLUMN cover_prompt TEXT")
        if "cover_negative_prompt" not in generation_columns:
            conn.execute("ALTER TABLE generations ADD COLUMN cover_negative_prompt TEXT")
        if "cover_status" not in generation_columns:
            conn.execute("ALTER TABLE generations ADD COLUMN cover_status TEXT")
        if "cover_error_message" not in generation_columns:
            conn.execute("ALTER TABLE generations ADD COLUMN cover_error_message TEXT")
        if "postprocess_status" not in generation_columns:
            conn.execute("ALTER TABLE generations ADD COLUMN postprocess_status TEXT")
        if "postprocess_error_message" not in generation_columns:
            conn.execute("ALTER TABLE generations ADD COLUMN postprocess_error_message TEXT")
        if "postprocess_audio_path" not in generation_columns:
            conn.execute("ALTER TABLE generations ADD COLUMN postprocess_audio_path TEXT")
        if "postprocess_applied_at" not in generation_columns:
            conn.execute("ALTER TABLE generations ADD COLUMN postprocess_applied_at TEXT")
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


def enrich_generation(record: dict[str, Any]) -> dict[str, Any]:
    output_path = record.get("output_audio_path")
    postprocess_audio_path = record.get("postprocess_audio_path")
    cover_image_path = record.get("cover_image_path")
    if not output_path:
        record["output_audio_url"] = None
        record["output_audio_size"] = None
    else:
        path = DATA_DIR.parent / str(output_path)
        if path.exists() and path.stat().st_size > 0:
            record["output_audio_url"] = f"http://127.0.0.1:8001/files/audio/{path.name}"
            record["output_audio_size"] = path.stat().st_size
        else:
            record["output_audio_url"] = None
            record["output_audio_size"] = path.stat().st_size if path.exists() else None

    if not postprocess_audio_path:
        record["postprocess_audio_url"] = None
        record["postprocess_audio_size"] = None
    else:
        postprocess_path = DATA_DIR.parent / str(postprocess_audio_path)
        if postprocess_path.exists() and postprocess_path.stat().st_size > 0:
            record["postprocess_audio_url"] = f"http://127.0.0.1:8001/files/audio/{postprocess_path.name}"
            record["postprocess_audio_size"] = postprocess_path.stat().st_size
        else:
            record["postprocess_audio_url"] = None
            record["postprocess_audio_size"] = postprocess_path.stat().st_size if postprocess_path.exists() else None

    if not cover_image_path:
        record["cover_image_url"] = None
        record["cover_image_size"] = None
    else:
        cover_path = DATA_DIR.parent / str(cover_image_path)
        if cover_path.exists() and cover_path.stat().st_size > 0:
            record["cover_image_url"] = f"http://127.0.0.1:8001/files/images/{cover_path.name}"
            record["cover_image_size"] = cover_path.stat().st_size
        else:
            record["cover_image_url"] = None
            record["cover_image_size"] = cover_path.stat().st_size if cover_path.exists() else None
    return record


def fetch_model_presets() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM model_presets ORDER BY name ASC").fetchall()
    return [dict(row) for row in rows]


def fetch_generations() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM generations ORDER BY created_at DESC").fetchall()
    return [enrich_generation(dict(row)) for row in rows]


def fetch_generation(generation_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM generations WHERE id = ?", (generation_id,)).fetchone()
    record = row_to_dict(row)
    return enrich_generation(record) if record is not None else None


def insert_generation(payload: dict[str, Any]) -> dict[str, Any]:
    generation_id = str(uuid.uuid4())
    timestamp = now_iso()
    record = {
        "id": generation_id,
        "project_id": payload.get("project_id"),
        "model_preset_id": payload["model_preset_id"],
        "title": payload.get("title") or payload["prompt"],
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
        "cover_image_path": None,
        "cover_prompt": None,
        "cover_negative_prompt": None,
        "cover_status": None,
        "cover_error_message": None,
        "postprocess_status": None,
        "postprocess_error_message": None,
        "postprocess_audio_path": None,
        "postprocess_applied_at": None,
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
              id, project_id, model_preset_id, title, prompt, lyrics, tags, bpm, duration, timesignature,
              language, keyscale, seed, temperature, cfg_scale, status, output_audio_path,
              cover_image_path, cover_prompt, cover_negative_prompt, cover_status, cover_error_message,
              postprocess_status, postprocess_error_message, postprocess_audio_path, postprocess_applied_at,
              workflow_path, error_message, comfyui_prompt_id, created_at, updated_at
            ) VALUES (
              :id, :project_id, :model_preset_id, :title, :prompt, :lyrics, :tags, :bpm, :duration, :timesignature,
              :language, :keyscale, :seed, :temperature, :cfg_scale, :status, :output_audio_path,
              :cover_image_path, :cover_prompt, :cover_negative_prompt, :cover_status, :cover_error_message,
              :postprocess_status, :postprocess_error_message, :postprocess_audio_path, :postprocess_applied_at,
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

    with get_connection() as conn:
        conn.execute(
            """
            UPDATE generations
            SET postprocess_status = NULL,
                postprocess_error_message = NULL,
                postprocess_audio_path = NULL,
                postprocess_applied_at = NULL
            WHERE id = ?
            """,
            (generation_id,),
        )
        conn.commit()

    update_generation_status(
        generation_id,
        "queued",
        output_audio_path=None,
        workflow_path=None,
        error_message=None,
        comfyui_prompt_id=None,
    )
    return fetch_generation(generation_id)


def delete_generation(generation_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM generations WHERE id = ?", (generation_id,))
        conn.commit()
        return cursor.rowcount > 0


def update_generation_cover(
    generation_id: str,
    *,
    cover_status: str | None = None,
    cover_image_path: str | None = None,
    cover_prompt: str | None = None,
    cover_negative_prompt: str | None = None,
    cover_error_message: str | None = None,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE generations
            SET cover_status = ?, cover_image_path = ?, cover_prompt = ?, cover_negative_prompt = ?, cover_error_message = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                cover_status,
                cover_image_path,
                cover_prompt,
                cover_negative_prompt,
                cover_error_message,
                now_iso(),
                generation_id,
            ),
        )
        conn.commit()


def update_generation_postprocess(
    generation_id: str,
    *,
    postprocess_status: str | None = None,
    postprocess_error_message: str | None = None,
    postprocess_audio_path: str | None = None,
    postprocess_applied_at: str | None = None,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE generations
            SET postprocess_status = ?,
                postprocess_error_message = ?,
                postprocess_audio_path = ?,
                postprocess_applied_at = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (
                postprocess_status,
                postprocess_error_message,
                postprocess_audio_path,
                postprocess_applied_at,
                now_iso(),
                generation_id,
            ),
        )
        conn.commit()
