#!/usr/bin/env bash
set -euo pipefail

if ! command -v sudo >/dev/null; then
  echo "This script must run on a system with sudo access." >&2
  exit 1
fi

sudo apt-get update
sudo apt-get install -y \
  ca-certificates \
  curl \
  gnupg \
  git \
  docker.io \
  docker-compose-plugin

sudo systemctl enable docker
sudo systemctl start docker

# Add current user to docker group if not already
if ! groups "$USER" | grep -q docker; then
  sudo usermod -aG docker "$USER"
  echo "Added $USER to docker group. Log out and back in for the change to take effect."
fi

echo "Docker and prerequisites installed."
