# Ace Step Studio

Suno-style local music generation studio built with ComfyUI, ACE-Step 1.5, and Ollama.

![Ace Step Studio main screen](docs/screenshots/studio-main.png)

## Features

- ACE-Step 1.5 song generation with `Base`, `SFT`, and `Turbo`
- Ollama-assisted generation for `Caption / Tags`, `Metadata`, `Lyrics`, and `Title`
- genre-guided prompt generation
- local history with playback
- cover image generation through ComfyUI `flux2_klein`
- local storage with SQLite, audio files, images, and metadata

## Requirements

- Python 3.10+
- Node.js 18+
- ComfyUI
- Ollama

## Environment

Copy `.env.example` to `.env`.

Example:

```env
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8001
VITE_API_HOST=127.0.0.1
VITE_API_PORT=8001
COMFYUI_BASE_URL=http://192.168.0.67:8188
OLLAMA_BASE_URL=http://192.168.0.67:11434
OLLAMA_MODEL=gemma4:e4b
COMFYUI_POLL_TIMEOUT=900
COMFYUI_POLL_INTERVAL=2.0
```

## Install

### Python

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install fastapi uvicorn httpx pydantic
```

### Frontend

```powershell
npm install
```

## Run

### Backend

```powershell
.\start_backend.bat
```

```bash
./start_backend.sh
```

### Frontend

```powershell
npm run dev
```

Frontend:

- `http://127.0.0.1:5173`

Backend:

- `http://127.0.0.1:8001`

Notes:

- `start_backend.bat` reads `BACKEND_HOST` and `BACKEND_PORT` from `.env`, activates `.venv`, and runs the backend in the foreground.
- `start_backend.sh` reads `BACKEND_HOST` and `BACKEND_PORT` from `.env`, activates `.venv`, and runs the backend in the background.
- Frontend API calls read `VITE_API_HOST` and `VITE_API_PORT` from `.env`.

## Storage

All local outputs are stored under `storage/`.

```txt
storage/
+-- app.db
+-- audio/
+-- images/
+-- metadata/
```

## Project Structure

```txt
backend/      FastAPI API, database, ComfyUI/Ollama services
src/          React frontend
workflow/     ComfyUI workflow JSON files
storage/      Local outputs
```
