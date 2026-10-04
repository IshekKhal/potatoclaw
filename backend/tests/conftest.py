"""Pytest fixtures and synthetic generator utilities."""

import io
import math
import struct
import wave
from typing import Generator
import pandas as pd
from PIL import Image, ImageDraw
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


@pytest.fixture(scope="session")
def client() -> Generator[TestClient, None, None]:
    """Provide a TestClient instance for API verification with default X-Access-Code."""
    headers = {"X-Access-Code": settings.ACCESS_CODE} if settings.ACCESS_CODE else {}
    with TestClient(app, headers=headers) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def synthetic_wav_bytes() -> bytes:
    """Generate a clean 0.5s 440Hz sine wave WAV file in-memory."""
    sample_rate = 16000
    duration_s = 0.5
    freq = 440.0
    num_samples = int(duration_s * sample_rate)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        for i in range(num_samples):
            value = int(32767.0 * 0.3 * math.sin(2.0 * math.pi * freq * (i / sample_rate)))
            wav_file.writeframesraw(struct.pack("<h", value))

    return buf.getvalue()


@pytest.fixture(scope="session")
def synthetic_png_bytes() -> bytes:
    """Generate a 100x100 synthetic test PNG image with text overlay."""
    img = Image.new("RGB", (100, 100), color=(180, 20, 20))
    draw = ImageDraw.Draw(img)
    draw.text((15, 40), "SYNTAX ERROR", fill=(255, 255, 255))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(scope="session")
def synthetic_csv_bytes() -> bytes:
    """Generate a 15-row sensor CSV dataset with an injected voltage spike (>2.5 sigma)."""
    data = {
        "timestamp_s": list(range(1, 16)),
        "temperature_c": [22.0 + (i % 4) * 0.5 for i in range(15)],
        "voltage_v": [
            3.30, 3.31, 3.29, 3.32, 3.30,
            3.28, 3.31, 3.30, 3.29, 3.31,
            24.85,  # Deliberate >5x spike at index 10
            3.30, 3.32, 3.29, 3.31,
        ],
    }
    df = pd.DataFrame(data)
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return buf.getvalue().encode("utf-8")
