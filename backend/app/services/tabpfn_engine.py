"""Prior Labs TabPFN tabular anomaly detection engine."""

from typing import Any, Dict, List
from fastapi import HTTPException
import numpy as np
import pandas as pd
import tabpfn_client
from tabpfn_client import TabPFNRegressor

from app.core.config import settings
from app.services.sentry_tracing import trace_span


def analyze_tabular_dataset(df: pd.DataFrame) -> Dict[str, Any]:
    """Analyze a pandas DataFrame for statistical outliers and anomalies using TabPFN."""
    if df.empty:
        raise HTTPException(status_code=400, detail="Uploaded CSV dataset is empty.")

    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    if not numeric_cols:
        raise HTTPException(
            status_code=400,
            detail="Uploaded CSV does not contain any numeric columns for statistical analysis.",
        )

    if not settings.TABPFN_API_KEY:
        raise HTTPException(
            status_code=502,
            detail="TABPFN_API_KEY is not configured in environment.",
        )

    tabpfn_client.set_access_token(settings.TABPFN_API_KEY)

    with trace_span(op="tool.tabpfn", name="Prior Labs TabPFN Tabular Analysis"):
        baselines: Dict[str, Dict[str, float]] = {}
        feature_anomaly_scores: Dict[str, float] = {}
        outlier_indices_set = set()

        # Calculate baseline distribution statistics for each numeric column
        for col in numeric_cols:
            series = df[col].dropna()
            if series.empty:
                continue
            mean_val = float(series.mean())
            std_val = float(series.std()) if len(series) > 1 else 0.0
            min_val = float(series.min())
            max_val = float(series.max())
            median_val = float(series.median())

            baselines[col] = {
                "mean": round(mean_val, 4),
                "std": round(std_val, 4),
                "min": round(min_val, 4),
                "max": round(max_val, 4),
                "median": round(median_val, 4),
            }

            if std_val > 1e-8:
                z_scores = np.abs((series - mean_val) / std_val)
                max_z = float(z_scores.max())
                feature_anomaly_scores[col] = round(max_z, 4)
                flagged = series.index[z_scores > 2.5].tolist()
                outlier_indices_set.update(flagged)
            else:
                feature_anomaly_scores[col] = 0.0

        # Apply TabPFN Regression modeling if 2 or more numeric columns are available
        if len(numeric_cols) >= 2 and len(df) >= 4:
            try:
                # Regress the last numeric column against previous numeric columns
                feature_names = numeric_cols[:-1]
                target_name = numeric_cols[-1]

                clean_df = df[numeric_cols].dropna()
                if len(clean_df) >= 4:
                    X = clean_df[feature_names].values
                    y = clean_df[target_name].values

                    regressor = TabPFNRegressor()
                    regressor.fit(X, y)
                    preds = regressor.predict(X)

                    residuals = np.abs(y - preds)
                    res_mean = np.mean(residuals)
                    res_std = np.std(residuals)

                    if res_std > 1e-8:
                        res_z = (residuals - res_mean) / res_std
                        flagged_idx = clean_df.index[res_z > 2.5].tolist()
                        outlier_indices_set.update(flagged_idx)
                        feature_anomaly_scores[f"{target_name}_tabpfn_residual_z"] = round(
                            float(np.max(res_z)), 4
                        )
            except Exception as exc:
                # Fall back gracefully to distribution statistics if TabPFN cloud call has format quirks
                feature_anomaly_scores["tabpfn_note"] = f"TabPFN regression notice: {str(exc)}"

        outlier_indices = sorted(list(outlier_indices_set))

        # Collect details of flagged rows
        anomalous_rows = []
        for idx in outlier_indices:
            row_dict = {"row_index": int(idx)}
            for col in numeric_cols:
                row_dict[col] = float(df.loc[idx, col])
            anomalous_rows.append(row_dict)

        return {
            "total_rows": len(df),
            "analyzed_columns": numeric_cols,
            "detected_anomalies_count": len(outlier_indices),
            "outlier_indices": outlier_indices,
            "feature_anomaly_scores": feature_anomaly_scores,
            "distribution_baselines": baselines,
            "anomalous_rows": anomalous_rows,
        }
