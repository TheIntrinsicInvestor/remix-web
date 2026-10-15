import os
os.environ.setdefault("REMIX_ACCESS_KEY", "test-key")
os.environ.setdefault("REMIX_ALLOWED_ORIGIN", "http://localhost:3000")

import pytest
from fastapi.testclient import TestClient
from remixweb.server import app

@pytest.fixture
def client():
    return TestClient(app)

AUTH = {"Authorization": "Bearer test-key"}
