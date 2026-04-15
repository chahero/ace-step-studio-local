from __future__ import annotations

import os
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.db import (
    delete_generation,
    fetch_generation,
    fetch_generations,
    fetch_model_presets,
    init_db,
    insert_generation,
    mark_generation_retry,
    update_generation_status,
)
from backend.schemas import GenerationCreate, PromptAssistRequest, PromptIdeaRequest, PromptLyricsRequest, PromptMetadataRequest
from backend.services import comfyui, ollama, storage

app = FastAPI(title="Ace Step Studio API", version="0.1.0")


def load_env_file() -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_env_file()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/files", StaticFiles(directory="storage"), name="files")


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    storage.ensure_storage_dirs()


@app.get("/api/health")
def health() -> dict[str, object]:
    return {"status": "ok", "ollama": ollama.check_connection()}


@app.get("/api/models")
def get_models() -> list[dict[str, object]]:
    return fetch_model_presets()


@app.get("/api/generations")
def list_generations() -> list[dict[str, object]]:
    return fetch_generations()


@app.get("/api/generations/{generation_id}")
def get_generation(generation_id: str) -> dict[str, object]:
    generation = fetch_generation(generation_id)
    if generation is None:
        raise HTTPException(status_code=404, detail="Generation not found")
    return generation


@app.post("/api/generations")
def create_generation(payload: GenerationCreate, background_tasks: BackgroundTasks) -> dict[str, object]:
    generation = insert_generation(payload.model_dump())
    background_tasks.add_task(run_generation_job, generation["id"])
    return generation


@app.post("/api/generations/{generation_id}/retry")
def retry_generation(generation_id: str, background_tasks: BackgroundTasks) -> dict[str, object]:
    generation = mark_generation_retry(generation_id)
    if generation is None:
        raise HTTPException(status_code=404, detail="Generation not found")
    background_tasks.add_task(run_generation_job, generation["id"])
    return generation


@app.delete("/api/generations/{generation_id}")
def remove_generation(generation_id: str) -> dict[str, object]:
    generation = fetch_generation(generation_id)
    if generation is None:
        raise HTTPException(status_code=404, detail="Generation not found")
    if generation["status"] == "running":
        raise HTTPException(status_code=409, detail="Cannot delete a generation while it is running")

    storage.delete_generation_assets(generation)
    if not delete_generation(generation_id):
        raise HTTPException(status_code=404, detail="Generation not found")
    return {"deleted": True, "id": generation_id}


@app.post("/api/prompt/assist")
def assist_prompt(payload: PromptAssistRequest) -> dict[str, str]:
    try:
        return ollama.assist_prompt(payload.model_dump())
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/prompt/idea")
def generate_prompt_idea(payload: PromptIdeaRequest) -> dict[str, str]:
    try:
        return ollama.generate_prompt_idea(payload.model_dump())
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/prompt/lyrics")
def generate_prompt_lyrics(payload: PromptLyricsRequest) -> dict[str, str]:
    try:
        return ollama.generate_lyrics_draft(payload.model_dump())
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/prompt/metadata")
def suggest_prompt_metadata(payload: PromptMetadataRequest) -> dict[str, object]:
    try:
        return ollama.suggest_metadata(payload.model_dump())
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def run_generation_job(generation_id: str) -> None:
    generation = fetch_generation(generation_id)
    if generation is None:
        return

    try:
        update_generation_status(generation_id, "running")
        preset = next((item for item in fetch_model_presets() if item["id"] == generation["model_preset_id"]), None)
        if preset is None:
            raise RuntimeError("Unknown model preset")

        result = comfyui.run_generation(generation=generation, workflow_file=str(preset["workflow_file"]))
        update_generation_status(
            generation_id,
            "completed",
            comfyui_prompt_id=result.get("prompt_id"),
            output_audio_path=result.get("output_audio_path"),
            workflow_path=result.get("workflow_path"),
        )
    except Exception as exc:  # pragma: no cover - background execution safety
        update_generation_status(generation_id, "failed", error_message=str(exc))
