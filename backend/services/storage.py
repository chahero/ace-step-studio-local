from __future__ import annotations

from pathlib import Path

DATA_DIR = Path("storage")
AUDIO_DIR = DATA_DIR / "audio"
IMAGE_DIR = DATA_DIR / "images"
METADATA_DIR = DATA_DIR / "metadata"


def ensure_storage_dirs() -> None:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    METADATA_DIR.mkdir(parents=True, exist_ok=True)


def delete_postprocess_assets(generation: dict[str, object]) -> None:
    generation_id = str(generation.get("id") or "")
    postprocess_audio_path = generation.get("postprocess_audio_path")

    candidate_paths = [
        Path(str(postprocess_audio_path)) if postprocess_audio_path else None,
        METADATA_DIR / f"{generation_id}.postprocess.json" if generation_id else None,
    ]

    for candidate in candidate_paths:
        if candidate is None:
            continue
        try:
            if candidate.exists():
                candidate.unlink()
        except OSError:
            continue


def delete_generation_assets(generation: dict[str, object]) -> None:
    generation_id = str(generation.get("id") or "")
    output_audio_path = generation.get("output_audio_path")
    postprocess_audio_path = generation.get("postprocess_audio_path")
    workflow_path = generation.get("workflow_path")
    cover_image_path = generation.get("cover_image_path")

    candidate_paths = [
        Path(str(output_audio_path)) if output_audio_path else None,
        Path(str(postprocess_audio_path)) if postprocess_audio_path else None,
        Path(str(cover_image_path)) if cover_image_path else None,
        Path(str(workflow_path)) if workflow_path else None,
        METADATA_DIR / f"{generation_id}.json" if generation_id else None,
        METADATA_DIR / f"{generation_id}.workflow.json" if generation_id else None,
        METADATA_DIR / f"{generation_id}.cover.json" if generation_id else None,
        METADATA_DIR / f"{generation_id}.cover.workflow.json" if generation_id else None,
        METADATA_DIR / f"{generation_id}.postprocess.json" if generation_id else None,
    ]

    for candidate in candidate_paths:
        if candidate is None:
            continue
        try:
            if candidate.exists():
                candidate.unlink()
        except OSError:
            continue
