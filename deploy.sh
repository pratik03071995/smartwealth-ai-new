#!/usr/bin/env bash
set -euo pipefail

SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_rsa}"
SSH_HOST="${SSH_HOST:-azureuser@172.191.97.203}"
REMOTE_DIR="${REMOTE_DIR:-/opt/smartwealth-ai-new}"

echo "Connecting to ${SSH_HOST}…"

ssh -i "$SSH_KEY" "$SSH_HOST" <<'REMOTE'
set -euo pipefail

cd /opt/smartwealth-ai-new
docker compose build backend frontend
docker compose up -d
REMOTE

echo "Deployment complete."
