# Ace Step Studio

Suno-style music generation studio built on top of ComfyUI, ACE-Step 1.5 workflows, and Ollama.

![Ace Step Studio main screen](docs/screenshots/studio-main.png)

The app currently supports:

- song generation with `base / sft / turbo` ACE-Step workflows
- Ollama-assisted generation for `Caption / Tags`, `Metadata`, `Lyrics`, and `Title`
- genre-guided idea generation
- local audio history with playback
- cover image generation through ComfyUI `flux2_klein`
- local file storage for audio, metadata, and generated cover images

## Stack

- Frontend: React + TypeScript + Vite
- Backend: FastAPI
- Database: SQLite
- Music generation: ComfyUI + ACE-Step 1.5
- Cover generation: ComfyUI + `image_flux2_klein_text_to_image.json`
- Prompting / suggestion: Ollama

## Project Structure

```txt
ace-step-studio-local/
+-- backend/                # FastAPI API, DB helpers, ComfyUI/Ollama services
+-- scripts/                # Vite dev bootstrap
+-- src/                    # React frontend
+-- storage/                # Local outputs (audio, images, metadata, sqlite db)
+-- workflow/               # ComfyUI workflow JSON files
+-- .env.example
+-- package.json
+-- README.md
```

## Requirements

- Python 3.10+
- Node.js 18+
- A running ComfyUI server
- A running Ollama server

Expected local endpoints in the current setup:

- ComfyUI: `http://192.168.0.67:8188`
- Ollama: `http://192.168.0.67:11434`
- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:8001`

## Environment

Copy `.env.example` to `.env` and set values for your environment.

Example:

```env
COMFYUI_BASE_URL=http://192.168.0.67:8188
OLLAMA_BASE_URL=http://192.168.0.67:11434
OLLAMA_MODEL=gemma4:e4b
COMFYUI_POLL_TIMEOUT=900
COMFYUI_POLL_INTERVAL=2.0
```

## Install

### Python

Create and activate a virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install fastapi uvicorn httpx pydantic
```

If you manage Python dependencies another way, keep the backend environment consistent with those packages.

### Frontend

```powershell
npm install
```

## Run

### Backend

```powershell
.\start_backend.bat
```

Equivalent command:

```powershell
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8001
```

### Frontend

```powershell
npm run dev
```

## Current Workflow

### Song generation

1. Choose a model preset: `Base`, `SFT`, or `Turbo`
2. Optionally choose a `Main Genre`
3. Fill or generate:
   - `Caption / Tags`
   - `Metadata`
   - `Lyrics`
   - `Title`
4. Click `Generate`

### Cover generation

1. Select a generated song in the library
2. Open the detail panel
3. Click the cover generation icon
4. The app:
   - builds a cover prompt from the song data via Ollama
   - runs the `flux2_klein` ComfyUI workflow
   - stores the image locally
   - updates the library, detail panel, and player artwork

## Storage

Generated files are stored locally:

```txt
storage/
+-- app.db
+-- audio/
+-- images/
+-- metadata/
```

## Screenshots

Create a folder like this if you want to keep screenshots in the repo:

```txt
docs/
+-- screenshots/
    +-- studio-main.png
```

Then add the image to the README like this:

```md
![Ace Step Studio main screen](docs/screenshots/studio-main.png)
```

Recommended screenshot sections:

```md
## Screenshots

### Main studio
![Main studio](docs/screenshots/studio-main.png)

### Song detail and cover generation
![Detail panel](docs/screenshots/studio-detail.png)
```

If you want, you can place the actual image files under `docs/screenshots/` and the README will render them directly.

## Notes

- `Title` is stored in the database and used in the UI, but it is not sent to ComfyUI for song generation.
- `Caption / Tags` is the main concept field and is what gets mapped into ACE-Step `tags`.
- `Time Signature` and `Key` are constrained to values that match the ComfyUI workflow validation rules.
- `Generate Caption`, `Suggest Metadata`, `Suggest Lyrics`, and `Suggest Title` are Ollama-driven helper actions.

## Status

This is still an actively iterated local project. The current focus is:

- improving generation flow quality
- tightening UI behavior
- refining ComfyUI workflow integration
