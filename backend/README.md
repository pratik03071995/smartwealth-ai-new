# SmartWealth AI Backend (Flask)
## Run
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py
```
API: http://localhost:5000

## Configuration
- Copy `.env.example` to `.env` and provide Databricks + LLM credentials.
- Prefer Azure OpenAI (`AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`).
- Or supply `OPENAI_API_KEY`/`OPENAI_MODEL` to call OpenAI's public API (also install `openai`/`pydantic` manually if you enable that path).
- For production w/ Gunicorn install it separately (`pip install gunicorn`) once you have network access.
- Optional mock helpers (`LLM_MODE=mock`, `MOCK_*_PATH`) let you run the planner against the bundled sample datasets before wiring up Databricks.
- For a free stack, run an Ollama server on the VM and set `OLLAMA_BASE_URL`/`OLLAMA_MODEL` instead of any paid API keys.
