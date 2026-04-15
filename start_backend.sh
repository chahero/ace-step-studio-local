#!/usr/bin/env bash
set -euo pipefail

if [ ! -f ".venv/bin/activate" ]; then
  echo "Virtual environment not found: .venv/bin/activate"
  exit 1
fi

if [ -f ".env" ]; then
  set -a
  source .env
  set +a
fi

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8001}"

source .venv/bin/activate
nohup uvicorn backend.main:app --reload --host "$BACKEND_HOST" --port "$BACKEND_PORT" > backend.log 2>&1 &
echo $! > backend.pid
echo "Backend started in background. PID: $(cat backend.pid)"
