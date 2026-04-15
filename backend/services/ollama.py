from __future__ import annotations

import json
import os
import random
import re

import httpx


def _normalize_text(value: str) -> str:
    return value.replace("\\r\\n", "\n").replace("\\n", "\n").strip()


def _extract_json_block(text: str) -> dict[str, object] | None:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(cleaned[start : end + 1])
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return None

    return None


def _random_idea_fallback(prompt: str, lyrics: str) -> dict[str, str]:
    ideas = [
        {
            "prompt": "A midnight neon drift with soft pulse and distant vocal haze.",
            "tags": "ambient, neon, dreamy, minimal, nocturnal",
            "lyrics": "[Intro]\nNeon fades in the rain\nA soft pulse calls your name",
        },
        {
            "prompt": "A slow-burning winter ballad with glassy piano and breathy harmonies.",
            "tags": "ballad, winter, piano, intimate, emotional",
            "lyrics": "[Verse 1]\nFrost on the window, lights far away\nI keep your echo in the gray",
        },
        {
            "prompt": "A neon club track with clipped bass hits, glossy synths, and a restless hook.",
            "tags": "club, neon, synthpop, bass, restless",
            "lyrics": "[Hook]\nRun with the light, don't let it fade\nUnder the glow, we own the night",
        },
        {
            "prompt": "A hazy lo-fi groove with dusty drums, soft chords, and late-night nostalgia.",
            "tags": "lo-fi, nostalgic, dusty drums, soft chords, late-night",
            "lyrics": "[Verse 1]\nStreetlights blur into the sky\nWe talk in loops and let time slide",
        },
        {
            "prompt": "A cinematic ambient build with distant choir textures and a rising shimmer.",
            "tags": "cinematic, ambient, choir, shimmer, expansive",
            "lyrics": "[Build]\nHold the silence, let it rise\nA silver current through the sky",
        },
        {
            "prompt": "A warm indie-pop sketch with handclaps, sparkling guitar, and hopeful lift.",
            "tags": "indie pop, warm, hopeful, guitar, handclaps",
            "lyrics": "[Chorus]\nWe can start again tonight\nWith the skyline burning bright",
        },
    ]

    base = random.choice(ideas).copy()
    if prompt:
        base["lyrics"] = base["lyrics"] if lyrics else base["lyrics"]
    if lyrics:
        base["lyrics"] = lyrics
    return base


def check_connection() -> dict[str, object]:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://192.168.0.67:11434")
    model = os.getenv("OLLAMA_MODEL", "llama3.1")

    try:
        response = httpx.get(f"{base_url.rstrip('/')}/api/version", timeout=5.0)
        response.raise_for_status()
        return {
            "ok": True,
            "base_url": base_url,
            "model": model,
            "version": response.json().get("version"),
        }
    except Exception as exc:
        return {
            "ok": False,
            "base_url": base_url,
            "model": model,
            "error": str(exc),
        }


def assist_prompt(payload: dict[str, object]) -> dict[str, str]:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://192.168.0.67:11434")
    model = os.getenv("OLLAMA_MODEL", "llama3.1")

    prompt = str(payload.get("prompt", "")).strip()
    lyrics = str(payload.get("lyrics", "") or "").strip()
    language = str(payload.get("language", "en"))

    request_body = {
        "model": model,
        "format": "json",
        "options": {
            "temperature": 0.7,
            "top_p": 0.9,
        },
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
        raise RuntimeError(
            "Ollama is unavailable. Check the connection to 192.168.0.67:11434 and try again."
        )

    tags = "ambient, intimate, cinematic, warm, slow-burn"
    improved_lyrics = lyrics or "[Verse 1]\nA quiet room, a breathing light\nA soft refrain within the night"

    if content:
        text = str(content).strip()
        parsed = _extract_json_block(text)

        if isinstance(parsed, dict):
            tags = _normalize_text(str(parsed.get("tags", tags)) or tags)
            improved_lyrics = _normalize_text(str(parsed.get("lyrics", improved_lyrics)) or improved_lyrics)
        else:
            raise RuntimeError(
                "Ollama returned an unexpected format. Ask it to return JSON and try again."
            )

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
        "format": "json",
        "options": {
            "temperature": 1.15,
            "top_p": 0.98,
            "top_k": 50,
            "repeat_penalty": 1.1,
        },
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
        raise RuntimeError(
            "Ollama is unavailable. Check the connection to 192.168.0.67:11434 and try again."
        )

    if content:
        text = str(content).strip()
        parsed = _extract_json_block(text)

        if isinstance(parsed, dict):
            result = {
                "prompt": _normalize_text(str(parsed.get("prompt", prompt or "")) or prompt or ""),
                "tags": _normalize_text(str(parsed.get("tags", "")) or ""),
                "lyrics": _normalize_text(str(parsed.get("lyrics", "")) or ""),
            }
            if not result["prompt"] or not result["tags"] or not result["lyrics"]:
                raise RuntimeError("Ollama returned incomplete JSON. Try again.")
            return result

        raise RuntimeError("Ollama returned an unexpected format. Ask it to return JSON and try again.")
