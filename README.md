# SmartWealth AI – Full Starter

Full-stack starter with **Flask API** + **React (Vite + TS + Tailwind)** and a premium UI.

## Run locally
### 1) Backend
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py
# http://localhost:5000
```
### 2) Frontend
```bash
cd ../frontend
cp .env.example .env
npm install
npm run dev
# http://localhost:5173
```

## Features
- Landing + **Terminal typewriter**, **Chat board** (narrow width)
- **Floating neon FAB** (and ⌘K/Ctrl+K) to open the sidebar
- Pages: **Earnings**, **Scoring**, **Vendors**, **Sectors**
- **Graph modal** pops when user types “graph/last 5 years” in chat
- Tailwind glass & purple glow theme

## Deploy to Azure VM
The repository ships with Docker assets and helper scripts to run everything on a single Ubuntu VM.

### One-time setup
1. Provision an Ubuntu 22.04 VM (instructions in `deploy/azure/README.md`).
2. Copy the repo to the VM, e.g.
   ```bash
   rsync -avz -e "ssh -i ~/.ssh/id_rsa" \
     --exclude 'backend/venv' --exclude 'backend/.venv' \
     --exclude 'frontend/node_modules' --exclude 'frontend/dist' \
     --exclude '.git' --exclude '*.log' \
     /path/to/smartwealth-ai-new/ \
     azureuser@<vm-ip>:/opt/smartwealth-ai-new/
   ```
3. On the VM run `deploy/azure/setup.sh` to install Docker, then create `backend/.env` using `backend/.env.example` as a template.
4. Start the stack:
   ```bash
   cd /opt/smartwealth-ai-new
   docker compose build
   docker compose up -d
   ```

### Deploying code updates (one-command workflow)

The repo includes `deploy.sh`, which bundles the sync + rebuild steps. Usage:

1. **(Optional)** drop a `deploy.config` next to the script to override defaults:
   ```bash
   SSH_HOST=azureuser@<vm-ip>
   SSH_KEY=$HOME/.ssh/id_rsa
   SSH_PORT=22
   REMOTE_DIR=/opt/smartwealth-ai-new
   ```
   You can also export these variables instead of creating the file.

2. Run the deploy:
   ```bash
   ./deploy.sh
   ```
   The script will:
   - rsync the local workspace to `${SSH_HOST}:${REMOTE_DIR}` (excluding virtualenv, node_modules, dist, git, logs)
   - SSH in and run `docker compose build backend frontend` followed by `docker compose up -d`

3. Verify on the VM if desired:
   ```bash
   docker compose ps
   docker compose logs -f backend
   docker compose logs -f frontend
   ```

4. Visit `http://<vm-ip>/` (or your domain) to confirm the UI and API respond.

### Managing the service
- Restart: `docker compose restart`
- Stop: `docker compose down`
- Run at boot: copy `deploy/azure/smartwealth.service` to `/etc/systemd/system/` and enable it (`sudo systemctl enable --now smartwealth.service`).
- Rotate secrets: update `backend/.env`, then `docker compose up -d`.
