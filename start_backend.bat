@echo off
setlocal

if not exist ".venv\Scripts\activate.bat" (
  echo Virtual environment not found: .venv\Scripts\activate.bat
  exit /b 1
)

if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (`findstr /R "^[A-Za-z_][A-Za-z0-9_]*=" ".env"`) do (
    set "%%A=%%B"
  )
)

if not defined BACKEND_HOST set "BACKEND_HOST=127.0.0.1"
if not defined BACKEND_PORT set "BACKEND_PORT=8001"

call ".venv\Scripts\activate.bat"
uvicorn backend.main:app --reload --host %BACKEND_HOST% --port %BACKEND_PORT%
