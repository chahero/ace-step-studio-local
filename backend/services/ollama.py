from __future__ import annotations

import json
import os

import httpx


def _normalize_text(value: str) -> str:
    return value.replace("\\r\\n", "\n").replace("\\n", "\n").strip()


def assist_prompt(payload: dict[str, object]) -> dict[str, str]:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://192.168.0.67:11434")
    model = os.getenv("OLLAMA_MODEL", "llama3.1")

    prompt = str(payload.get("prompt", "")).strip()
    lyrics = str(payload.get("lyrics", "") or "").strip()
    language = str(payload.get("language", "en"))

    request_body = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You help convert short music ideas into clean tags and usable lyrics structure for an audio generation studio. "
                    "Return ONLY valid JSON with exactly two keys: tags and lyrics. "
                    "tags must be a concise comma-separated string. "
                    "lyrics must be a short lyric structure using real newlines, not escaped \\n sequences."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Prompt: {prompt}\n"
                    f"Lyrics: {lyrics}\n"
                    f"Language: {language}\n"
                    "Return concise tags and improved lyrics."
                ),
            },
        ],
        "stream": False,
    }

    try:
        response = httpx.post(f"{base_url.rstrip('/')}/api/chat", json=request_body, timeout=60.0)
        response.raise_for_status()
        content = response.json().get("message", {}).get("content", "")
    except Exception:
        content = json.dumps(
            {
                "tags": "ambient, intimate, cinematic, warm, slow-burn",
                "lyrics": "[Verse 1]\nA quiet room, a breathing light\nA soft refrain within the night",
            }
        )

    tags = "ambient, intimate, cinematic, warm, slow-burn"
    improved_lyrics = lyrics or "[Verse 1]\nA quiet room, a breathing light\nA soft refrain within the night"

    if content:
        text = str(content).strip()
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = None

        if isinstance(parsed, dict):
            tags = _normalize_text(str(parsed.get("tags", tags)) or tags)
            improved_lyrics = _normalize_text(str(parsed.get("lyrics", improved_lyrics)) or improved_lyrics)
        else:
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            for line in lines:
                lower = line.lower()
                if lower.startswith("tags:"):
                    tags = _normalize_text(line.split(":", 1)[1]) or tags
                elif lower.startswith("lyrics:"):
                    improved_lyrics = _normalize_text(line.split(":", 1)[1]) or improved_lyrics

    return {"tags": _normalize_text(tags), "lyrics": _normalize_text(improved_lyrics)}


def generate_prompt_idea(payload: dict[str, object]) -> dict[str, str]:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://192.168.0.67:11434")
    model = os.getenv("OLLAMA_MODEL", "llama3.1")

    prompt = str(payload.get("prompt", "") or "").strip()
    lyrics = str(payload.get("lyrics", "") or "").strip()
    language = str(payload.get("language", "en") or "en").strip()
    model_preset_id = str(payload.get("model_preset_id", "") or "").strip()

    request_body = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You create fresh random music ideas for a song generation studio. "
                    "Return ONLY valid JSON with exactly three keys: prompt, tags, lyrics. "
                    "prompt should be a short vivid music concept. "
                    "tags should be concise comma-separated tags. "
                    "lyrics should be a short lyric sketch or instrumental cue using real newlines."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Current prompt: {prompt}\n"
                    f"Current lyrics: {lyrics}\n"
                    f"Language: {language}\n"
                    f"Selected model preset: {model_preset_id or 'none'}\n"
                    "Create a fresh idea that is different from the current input."
                ),
            },
        ],
        "stream": False,
    }

    try:
        response = httpx.post(f"{base_url.rstrip('/')}/api/chat", json=request_body, timeout=60.0)
        response.raise_for_status()
        content = response.json().get("message", {}).get("content", "")
    except Exception:
        content = json.dumps(
            {
                "prompt": "A midnight neon drift with soft pulse and distant vocal haze.",
                "tags": "ambient, neon, dreamy, minimal, nocturnal",
                "lyrics": "[Intro]\nNeon fades in the rain\nA soft pulse calls your name",
            }
        )

    fallback = {
        "prompt": prompt or "A midnight neon drift with soft pulse and distant vocal haze.",
        "tags": "ambient, neon, dreamy, minimal, nocturnal",
        "lyrics": lyrics or "[Intro]\nNeon fades in the rain\nA soft pulse calls your name",
    }

    if content:
        text = str(content).strip()
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = None

        if isinstance(parsed, dict):
            fallback["prompt"] = _normalize_text(str(parsed.get("prompt", fallback["prompt"])) or fallback["prompt"])
            fallback["tags"] = _normalize_text(str(parsed.get("tags", fallback["tags"])) or fallback["tags"])
            fallback["lyrics"] = _normalize_text(str(parsed.get("lyrics", fallback["lyrics"])) or fallback["lyrics"])

    return {key: _normalize_text(value) for key, value in fallback.items()}
