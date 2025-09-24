from __future__ import annotations

import os
import re

from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

from api import bp as api_bp


def create_app() -> Flask:
    load_dotenv()
    app = Flask(__name__)

    # Default local development origins
    default_origins = {"http://localhost:5173", "http://127.0.0.1:5173"}
    
    # Environment-based origins
    env_origins = {origin.strip() for origin in (os.getenv("FRONTEND_ORIGINS") or "").split(",") if origin.strip()}
    
    # Azure VM specific origins
    azure_vm_url = os.getenv("AZURE_VM_URL", "")
    azure_origins = {azure_vm_url} if azure_vm_url else set()
    
    # Ngrok regex for development tunneling
    ngrok_regex = re.compile(r"^https://[a-z0-9-]+\.ngrok-free\.app$")
    
    # Combine all origins
    all_origins = list(default_origins.union(env_origins).union(azure_origins)) + [ngrok_regex]

    CORS(
        app,
        resources={r"/api/*": {"origins": all_origins}},
        supports_credentials=True,
    )

    app.register_blueprint(api_bp)
    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "true").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
