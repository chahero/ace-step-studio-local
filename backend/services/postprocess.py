from __future__ import annotations

import json
import os
import platform
import subprocess
from pathlib import Path

from backend.services.storage import AUDIO_DIR, METADATA_DIR

REPO_ROOT = Path(__file__).resolve().parents[2]
FFMPEG_DIR = REPO_ROOT / "bin" / "ffmpeg"
DEFAULT_GAIN_DB = "1.5"
DEFAULT_TARGET_LUFS = "-14"
DEFAULT_LIMITER_LEVEL = "0.95"
COMMAND_TIMEOUT_SECONDS = 180


class PostprocessError(RuntimeError):
    pass


def _platform_directory() -> str:
    system = platform.system().lower()
    machine = platform.machine().lower()
    if system == "windows":
        return "windows-x64"
    if system == "linux":
        return "linux-arm64" if "arm" in machine or "aarch64" in machine else "linux-x64"
    if system == "darwin":
        return "macos-arm64" if "arm" in machine else "macos-x64"
    raise PostprocessError(f"Unsupported platform for bundled ffmpeg: {platform.system()} {platform.machine()}")


def _resolve_binary(binary_name: str) -> Path:
    env_key = f"{binary_name.upper()}_PATH"
    configured = os.getenv(env_key)
    if configured:
        path = Path(configured).expanduser().resolve()
    else:
        extension = ".exe" if platform.system().lower() == "windows" else ""
        path = (FFMPEG_DIR / _platform_directory() / f"{binary_name}{extension}").resolve()

    if not path.exists() or not path.is_file():
        raise PostprocessError(
            f"Bundled {binary_name} not found. Set {env_key} or place the binary at {path}."
        )
    return path


def _run_command(arguments: list[str], *, timeout: int = COMMAND_TIMEOUT_SECONDS) -> subprocess.CompletedProcess[str]:
    try:
        completed = subprocess.run(
            arguments,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
        )
    except subprocess.TimeoutExpired as exc:  # pragma: no cover - process timing is environment-dependent
        raise PostprocessError("Audio post-processing timed out") from exc
    except OSError as exc:
        raise PostprocessError(str(exc)) from exc

    if completed.returncode != 0:
        stderr = completed.stderr.strip() or completed.stdout.strip() or "Unknown ffmpeg error"
        raise PostprocessError(stderr)
    return completed


def _probe_input(ffprobe_path: Path, input_path: Path) -> dict[str, object]:
    completed = _run_command(
        [
            str(ffprobe_path),
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-print_format",
            "json",
            str(input_path),
        ]
    )
    try:
        return json.loads(completed.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise PostprocessError("ffprobe returned invalid JSON") from exc


def postprocess_generation_audio(generation_id: str, input_audio_path: str) -> dict[str, str]:
    input_path = Path(input_audio_path).resolve()
    if not input_path.exists() or not input_path.is_file():
        raise PostprocessError(f"Input audio file not found: {input_path}")

    ffmpeg_path = _resolve_binary("ffmpeg")
    ffprobe_path = _resolve_binary("ffprobe")
    probe_data = _probe_input(ffprobe_path, input_path)
    if not probe_data.get("streams"):
        raise PostprocessError("ffprobe could not read any audio streams from the generated file")

    output_path = AUDIO_DIR / f"{generation_id}.postprocessed.mp3"
    metadata_path = METADATA_DIR / f"{generation_id}.postprocess.json"
    if output_path.exists():
        output_path.unlink()

    filter_chain = ",".join(
        [
            f"volume={DEFAULT_GAIN_DB}dB",
            f"loudnorm=I={DEFAULT_TARGET_LUFS}:TP=-1.5:LRA=11",
            f"alimiter=limit={DEFAULT_LIMITER_LEVEL}",
        ]
    )

    _run_command(
        [
            str(ffmpeg_path),
            "-y",
            "-i",
            str(input_path),
            "-af",
            filter_chain,
            "-codec:a",
            "libmp3lame",
            "-q:a",
            "2",
            str(output_path),
        ]
    )

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise PostprocessError("Post-processing completed but produced an empty audio file")

    metadata_path.write_text(
        json.dumps(
            {
                "generation_id": generation_id,
                "input_audio_path": str(input_path),
                "output_audio_path": str(output_path),
                "ffmpeg_path": str(ffmpeg_path),
                "ffprobe_path": str(ffprobe_path),
                "probe": probe_data,
                "filter_chain": filter_chain,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    return {
        "postprocess_audio_path": str(output_path),
        "postprocess_metadata_path": str(metadata_path),
    }
