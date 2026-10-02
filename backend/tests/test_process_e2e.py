"""End-to-end test suite for POST /api/v1/process across all modalities."""

from fastapi.testclient import TestClient


def test_process_text_branch_e2e(client: TestClient):
    """Verify text reasoning branch via POST /api/v1/process."""
    payload = {
        "prompt": "Write a 1-line Python function to reverse a string.",
        "data_type": "text",
    }
    response = client.post("/api/v1/process", data=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "success"
    assert data["type"] == "code_solution"
    assert isinstance(data["answer"], str)
    assert len(data["answer"]) > 0


def test_process_image_branch_e2e(client: TestClient, synthetic_png_bytes: bytes):
    """Verify multimodal vision branch via POST /api/v1/process."""
    data = {
        "prompt": "Identify any error banner in this snip.",
        "data_type": "image",
    }
    files = {
        "file": ("screenshot.png", synthetic_png_bytes, "image/png"),
    }
    response = client.post("/api/v1/process", data=data, files=files)
    assert response.status_code == 200

    res_data = response.json()
    assert res_data["status"] == "success"
    assert res_data["type"] == "vision_solution"
    assert isinstance(res_data["answer"], str)
    assert len(res_data["answer"]) > 0


def test_process_tabular_branch_e2e(client: TestClient, synthetic_csv_bytes: bytes):
    """Verify tabular analysis & two-pass verification branch via POST /api/v1/process."""
    data = {
        "prompt": "What abnormal voltage events occurred?",
        "data_type": "tabular",
    }
    files = {
        "file": ("telemetry.csv", synthetic_csv_bytes, "text/csv"),
    }
    response = client.post("/api/v1/process", data=data, files=files)
    assert response.status_code == 200

    res_data = response.json()
    assert res_data["status"] == "success"
    assert res_data["type"] == "tabular_solution"
    assert "metrics" in res_data
    assert "answer" in res_data
    assert 10 in res_data["metrics"]["outlier_indices"]
    assert len(res_data["answer"]) > 0


def test_process_tabular_missing_file_rejected(client: TestClient):
    """Verify tabular processing without CSV file returns HTTP 400."""
    data = {
        "prompt": "Analyze dataset",
        "data_type": "tabular",
    }
    response = client.post("/api/v1/process", data=data)
    assert response.status_code == 400
    assert "csv" in response.json()["detail"].lower()


def test_process_image_missing_file_rejected(client: TestClient):
    """Verify image processing without file returns HTTP 400."""
    data = {
        "prompt": "Analyze screenshot",
        "data_type": "image",
    }
    response = client.post("/api/v1/process", data=data)
    assert response.status_code == 400
    assert "image" in response.json()["detail"].lower()
