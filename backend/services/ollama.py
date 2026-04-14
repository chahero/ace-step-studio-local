from __future__ import annotations

import os

import httpx


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
                "content": "You help convert short music ideas into clean tags and usable lyrics structure for an audio generation studio.",
            },
            {
                "role": "user",
                "content": f"Prompt: {prompt}\nLyrics: {lyrics}\nLanguage: {language}\nReturn concise tags and improved lyrics.",
            },
        ],
        "stream": False,
    }

    try:
        response = httpx.post(f"{base_url.rstrip('/')}/api/chat", json=request_body, timeout=60.0)
        response.raise_for_status()
        content = response.json().get("message", {}).get("content", "")
    except Exception:
        content = (
            "Tags: ambient, intimate, cinematic, warm, slow-burn\n"
            "Lyrics: [Verse 1]\\nA quiet room, a breathing light\\n..."
        )

    tags = "ambient, intimate, cinematic, warm, slow-burn"
    improved_lyrics = lyrics or "[Verse 1]\nA quiet room, a breathing light\nA soft refrain within the night"

    if content:
        lines = [line.strip() for line in str(content).splitlines() if line.strip()]
        for line in lines:
            lower = line.lower()
            if lower.startswith("tags:"):
                tags = line.split(":", 1)[1].strip() or tags
            elif lower.startswith("lyrics:"):
                improved_lyrics = line.split(":", 1)[1].strip() or improved_lyrics

    return {"tags": tags, "lyrics": improved_lyrics}
