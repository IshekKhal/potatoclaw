"""Test suite for TabPFN tabular anomaly detection engine."""

import io
import pandas as pd
from app.services.tabpfn_engine import analyze_tabular_dataset


def test_tabpfn_anomaly_detection_live(synthetic_csv_bytes: bytes):
    """Test that TabPFN engine flags deliberate >2.5 sigma voltage spike anomaly."""
    df = pd.read_csv(io.BytesIO(synthetic_csv_bytes))

    metrics = analyze_tabular_dataset(df)

    assert metrics["total_rows"] == 15
    assert "voltage_v" in metrics["analyzed_columns"]
    assert metrics["detected_anomalies_count"] >= 1

    # Row 10 has the 24.85V spike
    assert 10 in metrics["outlier_indices"]

    voltage_score = metrics["feature_anomaly_scores"].get("voltage_v", 0.0)
    assert voltage_score > 2.5

    assert "voltage_v" in metrics["distribution_baselines"]
    baseline = metrics["distribution_baselines"]["voltage_v"]
    assert "mean" in baseline
    assert "std" in baseline
    assert "max" in baseline
    assert baseline["max"] == 24.85
