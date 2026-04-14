from __future__ import annotations

import json
import os
from typing import Any

import httpx

from backend.services.storage import AUDIO_DIR, METADATA_DIR

WORKFLOW_NODE_MAP = {
    "tags": ("94", "tags"),
    "lyrics": ("94", "lyrics"),
    "seed": ("94", "seed"),
    "bpm": ("94", "bpm"),
    "duration": ("94", "duration"),
    "timesignature": ("94", "timesignature"),
    "language": ("94", "language"),
    "keyscale": ("94", "keyscale"),
    "generate_audio_codes": ("94", "generate_audio_codes"),
    "cfg_scale": ("94", "cfg_scale"),
    "temperature": ("94", "temperature"),
    "top_p": ("94", "top_p"),
    "top_k": ("94", "top_k"),
    "min_p": ("94", "min_p"),
    "model_path": ("104", "unet_name"),
}


def load_workflow(workflow_file: str) -> dict[str, Any]:
    with open(workflow_file, "r", encoding="utf-8") as handle:
        return json.load(handle)


def patch_workflow(workflow: dict[str, Any], generation: dict[str, Any], workflow_file: str) -> dict[str, Any]:
    patched = json.loads(json.dumps(workflow))
    payload = {
        "tags": generation.get("tags") or generation["prompt"],
        "lyrics": generation.get("lyrics") or "",
        "seed": int(generation.get("seed") or 0),
        "bpm": int(generation.get("bpm") or 72),
        "duration": int(generation.get("duration") or 120),
        "timesignature": str(generation.get("timesignature") or "4"),
        "language": str(generation.get("language") or "en"),
        "keyscale": str(generation.get("keyscale") or "E minor"),
        "generate_audio_codes": True,
        "cfg_scale": float(generation.get("cfg_scale") or 2),
        "temperature": float(generation.get("temperature") or 0.85),
        "top_p": 0.9,
        "top_k": 0,
        "min_p": 0,
    }

    model_key = workflow_file.lower()
    for key, (node_id, input_key) in WORKFLOW_NODE_MAP.items():
        if node_id not in patched:
            continue
        if key == "model_path":
            model_name = "acestep_v1.5_xl_base_bf16.safetensors"
            if "sft" in model_key:
                model_name = "acestep_v1.5_xl_sft_bf16.safetensors"
            elif "turbo" in model_key:
                model_name = "acestep_v1.5_xl_turbo_bf16.safetensors"
            patched[node_id]["inputs"][input_key] = model_name
            continue
        patched[node_id]["inputs"][input_key] = payload[key]

    return patched


def submit_workflow(workflow: dict[str, Any]) -> str:
    base_url = os.getenv("COMFYUI_BASE_URL", "http://192.168.0.67:8188")
    response = httpx.post(
        f"{base_url.rstrip('/')}/prompt",
        json={"prompt": workflow},
        timeout=60.0,
    )
    response.raise_for_status()
    data = response.json()
    return str(data.get("prompt_id") or data.get("id") or "")


def run_generation(*, generation: dict[str, Any], workflow_file: str) -> dict[str, str]:
    workflow = load_workflow(workflow_file)
    patched = patch_workflow(workflow, generation, workflow_file)

    workflow_snapshot = METADATA_DIR / f"{generation['id']}.workflow.json"
    workflow_snapshot.write_text(json.dumps(patched, ensure_ascii=False, indent=2), encoding="utf-8")

    try:
        prompt_id = submit_workflow(patched)
    except Exception:
        prompt_id = f"mock-{generation['id']}"

    output_audio_path = str(AUDIO_DIR / f"{generation['id']}.mp3")
    return {"prompt_id": prompt_id, "output_audio_path": output_audio_path}
