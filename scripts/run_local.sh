#!/usr/bin/env bash
set -euo pipefail

# Determine repository root relative to this script.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_PORT="${BACKEND_PORT:-5000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
API_BASE="${VITE_API_BASE_URL:-http://localhost:${BACKEND_PORT}/api}"

log() {
  printf '\n[%s] %s\n' "run-local" "$1"
}

ensure_backend_venv() {
  if [ ! -d "$BACKEND_DIR/.venv" ]; then
    log "Creating Python virtualenv in backend/.venv"
    python3 -m venv "$BACKEND_DIR/.venv"
  fi
  "$BACKEND_DIR/.venv/bin/pip" install --upgrade pip >/dev/null
  "$BACKEND_DIR/.venv/bin/pip" install -r "$BACKEND_DIR/requirements.txt"
}

start_backend() {
  log "Starting backend on port ${BACKEND_PORT}"
  pushd "$BACKEND_DIR" >/dev/null
  export FLASK_DEBUG="${FLASK_DEBUG:-true}"
  export PORT="$BACKEND_PORT"
  export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"
  "$BACKEND_DIR/.venv/bin/python" app.py &
  BACKEND_PID=$!
  popd >/dev/null
}

install_frontend_deps() {
  if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    log "Installing frontend dependencies"
    pushd "$FRONTEND_DIR" >/dev/null
    npm install
    popd >/dev/null
  fi
}

start_frontend() {
  log "Starting frontend on port ${FRONTEND_PORT} (API ${API_BASE})"
  pushd "$FRONTEND_DIR" >/dev/null
  VITE_API_BASE_URL="$API_BASE" npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT" &
  FRONTEND_PID=$!
  popd >/dev/null
}

cleanup() {
  log "Shutting down local services"
  [[ -n "${FRONTEND_PID:-}" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
  [[ -n "${BACKEND_PID:-}" ]] && kill "$BACKEND_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

ensure_backend_venv
start_backend
install_frontend_deps
start_frontend

log "Backend PID: ${BACKEND_PID:-?}"
log "Frontend PID: ${FRONTEND_PID:-?}"
log "Press Ctrl+C to stop both services"

wait "$BACKEND_PID" "$FRONTEND_PID"
