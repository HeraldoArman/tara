"""Export the actual FastAPI contract without connecting to providers or the database."""

import json
from pathlib import Path

from tara_server.api.main import app

destination = Path(__file__).resolve().parents[1] / "apps/web/openapi.json"
destination.write_text(json.dumps(app.openapi(), indent=2) + "\n")
print("Exported apps/web/openapi.json")
