from __future__ import annotations

import json
import os
import time
import re
from typing import Any

import httpx

from backend.services.storage import AUDIO_DIR, METADATA_DIR

WORKFLOW_NODE_MAP = {
    "tags": ("94", "tags"),
    "lyrics": ("94", "lyrics"),
    "seed": ("94", "seed"),
    "bpm": ("94", "bpm"),
    "duration": ("94", "duration"),
    "latent_seconds": ("98", "seconds"),
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


def _normalize_timesignature(value: Any, default: str = "4") -> str:
    text = str(value or "").strip()
    match = re.search(r"\b([2346])\b", text)
    if match:
        return match.group(1)
    return default


def _normalize_keyscale(value: Any, default: str = "E minor") -> str:
    text = str(value or "").strip()
    match = re.match(r"^([A-G](?:#|b)?)(?:\s+)?(major|minor)$", text, flags=re.IGNORECASE)
    if match:
        root = match.group(1).upper()
        mode = match.group(2).lower()
        return f"{root} {mode}"
    return default


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
        "latent_seconds": int(generation.get("duration") or 120),
        "timesignature": _normalize_timesignature(generation.get("timesignature"), "4"),
        "language": str(generation.get("language") or "en"),
        "keyscale": _normalize_keyscale(generation.get("keyscale"), "E minor"),
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
    client_id = os.getenv("COMFYUI_CLIENT_ID", "ace-step-studio")
    response = httpx.post(
        f"{base_url.rstrip('/')}/prompt",
        json={"prompt": workflow, "client_id": client_id},
        timeout=60.0,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"ComfyUI /prompt failed ({response.status_code}): {response.text}")
    data = response.json()
    return str(data.get("prompt_id") or data.get("id") or "")


def fetch_history(prompt_id: str) -> dict[str, Any] | None:
    base_url = os.getenv("COMFYUI_BASE_URL", "http://192.168.0.67:8188").rstrip("/")
    client = httpx.Client(timeout=30.0)
    candidates = (
        f"{base_url}/history/{prompt_id}",
        f"{base_url}/history?prompt_id={prompt_id}",
        f"{base_url}/api/history/{prompt_id}",
        f"{base_url}/api/history?prompt_id={prompt_id}",
    )

    try:
        for url in candidates:
            response = client.get(url)
            if response.status_code != 200:
                continue
            payload = response.json()
            if isinstance(payload, dict) and payload:
                return payload
    finally:
        client.close()

    return None


def _find_output_file_info(payload: Any) -> dict[str, Any] | None:
    if isinstance(payload, dict):
        if any(name in payload for name in ("filename", "path", "url")):
            return payload
        for value in payload.values():
            found = _find_output_file_info(value)
            if found is not None:
                return found
    elif isinstance(payload, list):
        for item in payload:
            found = _find_output_file_info(item)
            if found is not None:
                return found
    return None


def _extract_output_file_info(history_payload: dict[str, Any], prompt_id: str) -> dict[str, Any] | None:
    outputs = history_payload.get(prompt_id)
    if not isinstance(outputs, dict):
        if "outputs" in history_payload and isinstance(history_payload["outputs"], dict):
            outputs = history_payload["outputs"]
        else:
            outputs = {}
    return _find_output_file_info(outputs)


def _download_output_file(file_info: dict[str, Any], destination: str) -> None:
    base_url = os.getenv("COMFYUI_BASE_URL", "http://192.168.0.67:8188").rstrip("/")
    filename = file_info.get("filename")
    path = file_info.get("path")
    url = file_info.get("url")
    subfolder = file_info.get("subfolder", "output")
    file_type = file_info.get("type", "output")

    if url:
        response = httpx.get(str(url), timeout=60.0)
        response.raise_for_status()
        with open(destination, "wb") as handle:
            handle.write(response.content)
        return

    if path and os.path.exists(str(path)):
        with open(str(path), "rb") as source, open(destination, "wb") as target:
            target.write(source.read())
        return

    if not filename:
        raise RuntimeError("ComfyUI output did not include a filename")

    response = httpx.get(
        f"{base_url}/view",
        params={
            "filename": str(filename),
            "subfolder": str(subfolder),
            "type": str(file_type),
        },
        timeout=60.0,
    )
    response.raise_for_status()
    with open(destination, "wb") as handle:
        handle.write(response.content)


def run_generation(*, generation: dict[str, Any], workflow_file: str) -> dict[str, str]:
    workflow = load_workflow(workflow_file)
    patched = patch_workflow(workflow, generation, workflow_file)

    workflow_snapshot = METADATA_DIR / f"{generation['id']}.workflow.json"
    workflow_snapshot.write_text(json.dumps(patched, ensure_ascii=False, indent=2), encoding="utf-8")

    prompt_id = submit_workflow(patched)
    output_audio_path = AUDIO_DIR / f"{generation['id']}.mp3"
    poll_timeout_seconds = int(os.getenv("COMFYUI_POLL_TIMEOUT", "900"))
    poll_interval_seconds = float(os.getenv("COMFYUI_POLL_INTERVAL", "2.0"))
    deadline = time.monotonic() + poll_timeout_seconds

    history_payload: dict[str, Any] | None = None
    output_file: dict[str, Any] | None = None
    while time.monotonic() < deadline:
        history_payload = fetch_history(prompt_id)
        if history_payload:
            output_file = _extract_output_file_info(history_payload, prompt_id)
            if output_file is not None:
                break
        time.sleep(poll_interval_seconds)

    if not history_payload:
        raise RuntimeError(f"Timed out waiting for ComfyUI prompt {prompt_id}")

    if output_file is not None:
        _download_output_file(output_file, str(output_audio_path))
    else:
        raise RuntimeError(f"ComfyUI completed prompt {prompt_id} but no output file was found")

    if not output_audio_path.exists() or output_audio_path.stat().st_size == 0:
        raise RuntimeError(f"ComfyUI output file is empty: {output_audio_path}")

    metadata_path = METADATA_DIR / f"{generation['id']}.json"
    metadata_path.write_text(
        json.dumps(
            {
                "generation_id": generation["id"],
                "prompt_id": prompt_id,
                "workflow_file": workflow_file,
                "output_audio_path": str(output_audio_path),
                "history": history_payload,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    return {"prompt_id": prompt_id, "output_audio_path": str(output_audio_path), "workflow_path": str(workflow_snapshot)}
