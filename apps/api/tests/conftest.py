import os
import tempfile

# Point the app at a throwaway database before anything imports the settings.
_tmp = tempfile.mkdtemp(prefix="insightflow-test-")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ["AUTO_SEED"] = "false"
os.environ["ADAPTION_API_KEY"] = ""
os.environ["APP_PROFILE"] = "local"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def seeded(client):
    response = client.post("/api/v1/feedback/sample")
    assert response.status_code == 201, response.text
    return response.json()
