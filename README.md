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
