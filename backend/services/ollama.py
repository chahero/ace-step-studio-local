from __future__ import annotations

import json
import os
import random
import re

import httpx


GENRE_GUIDANCE: dict[str, dict[str, str]] = {
    "Pop": {
        "focus": "strong hooks, memorable topline, polished production, broad appeal, concise modern song structure",
        "avoid": "jazz-hop, harsh industrial textures, long ambient drift, extreme experimental structure",
    },
    "K-pop": {
        "focus": "high-impact hooks, polished idol-pop production, sleek arrangement changes, catchy chorus, bright or stylish contemporary energy",
        "avoid": "loose indie demo feel, raw garage rock texture, dusty lo-fi beat tape language, lounge jazz drift",
    },
    "J-pop": {
        "focus": "melodic uplift, bright emotional progression, clean pop-rock or synth-pop polish, strong chorus payoff, expressive anime-like energy when appropriate",
        "avoid": "heavy trap minimalism, murky lo-fi haze, slow lounge jazz phrasing, grim industrial tone",
    },
    "Hip-Hop / Trap": {
        "focus": "808-driven rhythm, crisp drums, rap-friendly phrasing, modern bounce, dark or flex-heavy energy",
        "avoid": "soft lounge jazz, orchestral ballad writing, folk acoustic textures, dreamy ambient wash",
    },
    "R&B / Soul": {
        "focus": "smooth groove, soulful vocals, warm bass, lush chords, intimate late-night mood, emotional phrasing",
        "avoid": "jazz-hop, lo-fi beat tape language, lounge instrumentals, EDM festival energy, hard rock textures",
    },
    "Electronic": {
        "focus": "synthetic textures, club-ready rhythm, crisp sound design, dance energy, modern electronic arrangement",
        "avoid": "campfire folk language, unplugged acoustic feel, vintage lounge jazz, orchestral hymn style",
    },
    "Rock": {
        "focus": "guitars, live-band energy, punchy drums, strong chorus lift, direct physical momentum",
        "avoid": "EDM drop language, lo-fi beat tape phrasing, delicate ambient drift, smooth neo-soul softness",
    },
    "Ambient / Cinematic": {
        "focus": "atmosphere, spacious texture, slow evolution, emotional worldbuilding, cinematic scale or ambient stillness",
        "avoid": "trap bounce, radio pop hook language, funk groove emphasis, aggressive rock riffing",
    },
}


def _normalize_text(value: str) -> str:
    return value.replace("\\r\\n", "\n").replace("\\n", "\n").strip()


def _chat_timeout_seconds() -> float:
    raw_value = os.getenv("OLLAMA_CHAT_TIMEOUT", "180")
    try:
        return max(30.0, float(raw_value))
    except ValueError:
        return 180.0


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


def _coerce_int(value: object, default: int) -> int:
    try:
        if value is None:
            return default
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return default


def _coerce_float(value: object, default: float) -> float:
    try:
        if value is None:
            return default
        return float(str(value).strip())
    except (TypeError, ValueError):
        return default


def _genre_instruction(genre_category: str) -> str:
    genre = str(genre_category or "").strip()
    if not genre:
        return "No genre category selected. You may choose any genre naturally."
    config = GENRE_GUIDANCE.get(genre)
    if not config:
        return f"Genre category selected: {genre}. Stay clearly within that genre family."
    return (
        f"Genre category selected: {genre}. "
        f"Stay strictly within this genre family. "
        f"Prioritize: {config['focus']}. "
        f"Avoid: {config['avoid']}."
    )


def _normalize_timesignature(value: object, default: str = "4") -> str:
    text = str(value or "").strip()
    match = re.search(r"\b([2346])\b", text)
    if match:
        return match.group(1)
    return default


def _normalize_keyscale(value: object, default: str = "E minor") -> str:
    text = str(value or "").strip()
    match = re.match(r"^([A-G](?:#|b)?)(?:\s+)?(major|minor)$", text, flags=re.IGNORECASE)
    if match:
        root = match.group(1).upper()
        mode = match.group(2).lower()
        return f"{root} {mode}"
    return default


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


def _ollama_chat(base_url: str, request_body: dict[str, object]) -> str:
    try:
        timeout = httpx.Timeout(_chat_timeout_seconds(), connect=10.0)
        response = httpx.post(f"{base_url.rstrip('/')}/api/chat", json=request_body, timeout=timeout)
        response.raise_for_status()
        return response.json().get("message", {}).get("content", "")
    except httpx.HTTPStatusError as exc:
        body = exc.response.text.strip()
        status = exc.response.status_code
        raise RuntimeError(
            f"Ollama chat request failed with HTTP {status}: {body or exc.response.reason_phrase}"
        ) from exc
    except httpx.RequestError as exc:
        raise RuntimeError(f"Ollama connection failed: {exc}") from exc


def _repair_json_output(
    *,
    base_url: str,
    model: str,
    original_text: str,
    required_keys: list[str],
    description: str,
) -> dict[str, object]:
    repair_request = {
        "model": model,
        "format": "json",
        "options": {
            "temperature": 0.2,
            "top_p": 0.8,
        },
        "messages": [
            {
                "role": "system",
                "content": (
                    "Return ONLY valid JSON. Do not add markdown, code fences, or extra text. "
                    f"Return exactly these keys: {', '.join(required_keys)}."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"The previous response was invalid or incomplete for: {description}\n"
                    f"Previous response:\n{original_text}\n"
                    "Rewrite it as strict JSON."
                ),
            },
        ],
        "stream": False,
    }

    repaired = _ollama_chat(base_url, repair_request)
    parsed = _extract_json_block(repaired)
    if not isinstance(parsed, dict):
        raise RuntimeError("Ollama returned an unexpected format. Ask it to return JSON and try again.")
    return parsed


def check_connection() -> dict[str, object]:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://192.168.0.67:11434")
    model = os.getenv("OLLAMA_MODEL", "gemma4:e4b")

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
    model = os.getenv("OLLAMA_MODEL", "gemma4:e4b")

    prompt = str(payload.get("prompt", "")).strip()
    lyrics = str(payload.get("lyrics", "") or "").strip()
    language = str(payload.get("language", "en"))
    genre_category = str(payload.get("genre_category", "") or "").strip()
    genre_instruction = _genre_instruction(genre_category)

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
                    f"Genre category: {genre_category or 'unspecified'}\n"
                    f"Genre instruction: {genre_instruction}\n"
                    "Return concise tags and improved lyrics."
                ),
            },
        ],
        "stream": False,
    }

    content = _ollama_chat(base_url, request_body)

    tags = "ambient, intimate, cinematic, warm, slow-burn"
    improved_lyrics = lyrics or "[Verse 1]\nA quiet room, a breathing light\nA soft refrain within the night"

    if content:
        text = str(content).strip()
        parsed = _extract_json_block(text)

        if isinstance(parsed, dict):
            tags = _normalize_text(str(parsed.get("tags", tags)) or tags)
            improved_lyrics = _normalize_text(str(parsed.get("lyrics", improved_lyrics)) or improved_lyrics)
        else:
            parsed = _repair_json_output(
                base_url=base_url,
                model=model,
                original_text=text,
                required_keys=["tags", "lyrics"],
                description="prompt refinement output",
            )
            tags = _normalize_text(str(parsed.get("tags", tags)) or tags)
            improved_lyrics = _normalize_text(str(parsed.get("lyrics", improved_lyrics)) or improved_lyrics)

    return {"tags": _normalize_text(tags), "lyrics": _normalize_text(improved_lyrics)}


def generate_prompt_idea(payload: dict[str, object]) -> dict[str, str]:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://192.168.0.67:11434")
    model = os.getenv("OLLAMA_MODEL", "gemma4:e4b")

    prompt = str(payload.get("prompt", "") or "").strip()
    lyrics = str(payload.get("lyrics", "") or "").strip()
    language = str(payload.get("language", "en") or "en").strip()
    model_preset_id = str(payload.get("model_preset_id", "") or "").strip()
    genre_category = str(payload.get("genre_category", "") or "").strip()
    genre_instruction = _genre_instruction(genre_category)

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
                    f"Genre category: {genre_category or 'none'}\n"
                    f"Genre instruction: {genre_instruction}\n"
                    f"Selected model preset: {model_preset_id or 'none'}\n"
                    "Create a fresh idea that is different from the current input. "
                    "Keep the result clearly inside the selected genre family if one is provided."
                ),
            },
        ],
        "stream": False,
    }

    content = _ollama_chat(base_url, request_body)

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
                parsed = _repair_json_output(
                    base_url=base_url,
                    model=model,
                    original_text=text,
                    required_keys=["prompt", "tags", "lyrics"],
                    description="random idea generation output",
                )
                result = {
                    "prompt": _normalize_text(str(parsed.get("prompt", prompt or "")) or prompt or ""),
                    "tags": _normalize_text(str(parsed.get("tags", "")) or ""),
                    "lyrics": _normalize_text(str(parsed.get("lyrics", "")) or ""),
                }
                if not result["prompt"] or not result["tags"] or not result["lyrics"]:
                    raise RuntimeError("Ollama returned incomplete JSON. Try again.")
            return result

        parsed = _repair_json_output(
            base_url=base_url,
            model=model,
            original_text=text,
            required_keys=["prompt", "tags", "lyrics"],
            description="random idea generation output",
        )
        result = {
            "prompt": _normalize_text(str(parsed.get("prompt", prompt or "")) or prompt or ""),
            "tags": _normalize_text(str(parsed.get("tags", "")) or ""),
            "lyrics": _normalize_text(str(parsed.get("lyrics", "")) or ""),
        }
        if not result["prompt"] or not result["tags"] or not result["lyrics"]:
            raise RuntimeError("Ollama returned incomplete JSON. Try again.")
        return result

    raise RuntimeError("Ollama returned an unexpected format. Ask it to return JSON and try again.")


def generate_lyrics_draft(payload: dict[str, object]) -> dict[str, str]:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://192.168.0.67:11434")
    model = os.getenv("OLLAMA_MODEL", "gemma4:e4b")

    prompt = str(payload.get("prompt", "") or "").strip()
    language = str(payload.get("language", "en") or "en").strip()
    bpm = payload.get("bpm")
    duration = payload.get("duration")
    timesignature = str(payload.get("timesignature", "") or "").strip()
    keyscale = str(payload.get("keyscale", "") or "").strip()
    genre_category = str(payload.get("genre_category", "") or "").strip()
    genre_instruction = _genre_instruction(genre_category)

    request_body = {
        "model": model,
        "format": "json",
        "options": {
            "temperature": 0.85,
            "top_p": 0.92,
            "top_k": 40,
        },
        "messages": [
            {
                "role": "system",
                "content": (
                    "You write concise, structured song lyrics for an audio generation studio. "
                    "Return ONLY valid JSON with exactly one key: lyrics. "
                    "lyrics must use real newlines and section markers like [Verse], [Chorus], or [Instrumental]."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Caption / tags: {prompt}\n"
                    f"Language: {language}\n"
                    f"Genre category: {genre_category or 'unspecified'}\n"
                    f"Genre instruction: {genre_instruction}\n"
                    f"BPM: {bpm if bpm not in (None, '') else 'unspecified'}\n"
                    f"Duration: {duration if duration not in (None, '') else 'unspecified'}\n"
                    f"Time signature: {timesignature or 'unspecified'}\n"
                    f"Key: {keyscale or 'unspecified'}\n"
                    "Write a short but usable lyric draft based on the caption/tags."
                ),
            },
        ],
        "stream": False,
    }

    content = _ollama_chat(base_url, request_body)
    if not content:
        raise RuntimeError("Ollama returned incomplete JSON. Try again.")

    text = str(content).strip()
    parsed = _extract_json_block(text)
    if not isinstance(parsed, dict):
        parsed = _repair_json_output(
            base_url=base_url,
            model=model,
            original_text=text,
            required_keys=["lyrics"],
            description="lyrics draft output",
        )

    lyrics = _normalize_text(str(parsed.get("lyrics", "")) or "")
    if not lyrics:
        raise RuntimeError("Ollama returned incomplete JSON. Try again.")

    return {"lyrics": lyrics}


def suggest_metadata(payload: dict[str, object]) -> dict[str, object]:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://192.168.0.67:11434")
    model = os.getenv("OLLAMA_MODEL", "gemma4:e4b")

    prompt = str(payload.get("prompt", "") or "").strip()
    lyrics = str(payload.get("lyrics", "") or "").strip()
    language = str(payload.get("language", "en") or "en").strip()
    genre_category = str(payload.get("genre_category", "") or "").strip()
    genre_instruction = _genre_instruction(genre_category)

    request_body = {
        "model": model,
        "format": "json",
        "options": {
            "temperature": 0.5,
            "top_p": 0.85,
            "top_k": 40,
        },
        "messages": [
            {
                "role": "system",
                "content": (
                    "You suggest practical generation metadata for an audio model. "
                    "Return ONLY valid JSON with exactly these keys: bpm, duration, timesignature, language, keyscale, seed, temperature, cfg_scale. "
                    "Use numbers for bpm, duration, seed, temperature, cfg_scale; use strings for the others. "
                    "Keep values realistic and usable for music generation."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Caption / tags: {prompt}\n"
                    f"Lyrics: {lyrics}\n"
                    f"Language: {language}\n"
                    f"Genre category: {genre_category or 'unspecified'}\n"
                    f"Genre instruction: {genre_instruction}\n"
                    "Suggest metadata that fits this idea."
                ),
            },
        ],
        "stream": False,
    }

    content = _ollama_chat(base_url, request_body)
    if not content:
        raise RuntimeError("Ollama returned incomplete JSON. Try again.")

    text = str(content).strip()
    parsed = _extract_json_block(text)
    if not isinstance(parsed, dict):
        parsed = _repair_json_output(
            base_url=base_url,
            model=model,
            original_text=text,
            required_keys=["bpm", "duration", "timesignature", "language", "keyscale", "seed", "temperature", "cfg_scale"],
            description="metadata suggestion output",
        )

    return {
        "bpm": _coerce_int(parsed.get("bpm"), 72),
        "duration": _coerce_int(parsed.get("duration"), 120),
        "timesignature": _normalize_timesignature(parsed.get("timesignature"), "4"),
        "language": str(parsed.get("language") or language or "en"),
        "keyscale": _normalize_keyscale(parsed.get("keyscale"), "E minor"),
        "seed": _coerce_int(parsed.get("seed"), 0),
        "temperature": _coerce_float(parsed.get("temperature"), 0.85),
        "cfg_scale": _coerce_float(parsed.get("cfg_scale"), 2.0),
    }


def suggest_title(payload: dict[str, object]) -> dict[str, str]:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://192.168.0.67:11434")
    model = os.getenv("OLLAMA_MODEL", "gemma4:e4b")

    prompt = str(payload.get("prompt", "") or "").strip()
    lyrics = str(payload.get("lyrics", "") or "").strip()
    metadata = payload.get("metadata")
    genre_category = str(payload.get("genre_category", "") or "").strip()
    genre_instruction = _genre_instruction(genre_category)
    metadata_text = json.dumps(metadata, ensure_ascii=False) if isinstance(metadata, dict) else ""

    request_body = {
        "model": model,
        "format": "json",
        "options": {
            "temperature": 0.6,
            "top_p": 0.9,
            "top_k": 40,
        },
        "messages": [
            {
                "role": "system",
                "content": (
                    "You generate short, memorable music titles. "
                    "Return ONLY valid JSON with exactly one key: title. "
                    "The title should be 2 to 5 words, natural, and fit the song concept."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Caption / tags: {prompt}\n"
                    f"Lyrics: {lyrics}\n"
                    f"Genre category: {genre_category or 'unspecified'}\n"
                    f"Genre instruction: {genre_instruction}\n"
                    f"Metadata: {metadata_text}\n"
                    "Suggest a concise title."
                ),
            },
        ],
        "stream": False,
    }

    content = _ollama_chat(base_url, request_body)
    if not content:
        raise RuntimeError("Ollama returned incomplete JSON. Try again.")

    text = str(content).strip()
    parsed = _extract_json_block(text)
    if not isinstance(parsed, dict):
        parsed = _repair_json_output(
            base_url=base_url,
            model=model,
            original_text=text,
            required_keys=["title"],
            description="title suggestion output",
        )

    title = _normalize_text(str(parsed.get("title", "")) or "")
    if not title:
        raise RuntimeError("Ollama returned incomplete JSON. Try again.")

    return {"title": title}
