# Ace Step Studio

Suno-style audio generation studio built around ComfyUI Ace Step workflows and Ollama-assisted prompting.

## MVP stack

- Frontend: React + TypeScript + Vite
- Backend: FastAPI
- Storage: SQLite + local audio files
- AI services: ComfyUI on `192.168.0.67:8188`, Ollama on `192.168.0.67:11434`

## Layout

- `workflow/`: raw ComfyUI workflow exports
- `backend/`: API, DB, and service adapters
- `src/`: frontend studio UI
- `storage/`: generated audio and metadata
