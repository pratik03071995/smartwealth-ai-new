#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${CONFIG_FILE:-./deploy.config}"
if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_rsa}"
SSH_HOST="${SSH_HOST:-azureuser@172.191.97.203}"
SSH_PORT="${SSH_PORT:-22}"
REMOTE_DIR="${REMOTE_DIR:-/opt/smartwealth-ai-new}"
LOCAL_DIR="${LOCAL_DIR:-$(pwd)}"

for cmd in rsync ssh; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: required command '$cmd' not found in PATH." >&2
    exit 1
  fi
done

if [[ ! -f "$SSH_KEY" ]]; then
  echo "Error: SSH key '$SSH_KEY' not found." >&2
  exit 1
fi

echo "Syncing ${LOCAL_DIR} -> ${SSH_HOST}:${REMOTE_DIR}…"

rsync -avz \
  -e "ssh -i ${SSH_KEY} -p ${SSH_PORT}" \
  --exclude 'backend/venv' \
  --exclude 'backend/.venv' \
  --exclude 'frontend/node_modules' \
  --exclude 'frontend/dist' \
  --exclude '.git' \
  --exclude '*.log' \
  "${LOCAL_DIR}/" "${SSH_HOST}:${REMOTE_DIR}/"

echo "Connecting to ${SSH_HOST} to rebuild containers…"

ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_HOST" <<REMOTE
set -euo pipefail

cd "${REMOTE_DIR}"
docker compose build backend frontend
docker compose up -d
REMOTE

echo "Deployment complete."
