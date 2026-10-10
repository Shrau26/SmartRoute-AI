"""Local dataset generation + Random Forest models for SmartRoute AI.

Two real scikit-learn models are trained on a locally synthesised network
telemetry dataset (no external data, no API keys):

  1. RandomForestClassifier  -> P(link is congested)
  2. RandomForestRegressor   -> effective one-hop latency under current load

The dataset is written to data/network_dataset.csv so it can be inspected.
"""

import json
import os

import numpy as np
import pandas as pd
from joblib import dump, load
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE, "data")
MODEL_DIR = os.path.join(BASE, "model")
DATASET = os.path.join(DATA_DIR, "network_dataset.csv")
CLF_PATH = os.path.join(MODEL_DIR, "congestion_clf.joblib")
REG_PATH = os.path.join(MODEL_DIR, "latency_reg.joblib")
META_PATH = os.path.join(MODEL_DIR, "metadata.json")

FEATURES = [
    "bandwidth",
    "latency",
    "loss",
    "load",
    "flows",
    "queue_depth",
    "utilisation",
]

_state = {"clf": None, "reg": None, "meta": None}


# --------------------------------------------------------------------------- #
# dataset
# --------------------------------------------------------------------------- #
def generate_dataset(n=12000, seed=42):
    """Synthesise link telemetry with a non-linear, noisy congestion process."""
    rng = np.random.default_rng(seed)

    bandwidth = rng.choice([10, 20, 50, 100, 200, 500, 1000], size=n,
                           p=[0.08, 0.10, 0.18, 0.26, 0.18, 0.12, 0.08]).astype(float)
    latency = rng.gamma(shape=2.2, scale=4.0, size=n) + 0.5
    latency = np.clip(latency, 0.5, 120.0)
    loss = np.clip(rng.gamma(shape=1.3, scale=0.9, size=n), 0, 20)
    load = np.clip(rng.beta(2.1, 2.4, size=n) * 115, 0, 100)
    flows = np.clip(rng.gamma(shape=2.0, scale=18.0, size=n), 1, 400)

    utilisation = load / 100.0
    # queue depth grows super-linearly with utilisation and flow count
    queue_depth = np.clip(
        100 * (utilisation ** 2.4) + flows * 0.08 + rng.normal(0, 4.5, n), 0, 100
    )

    # latent congestion pressure -> label
    pressure = (
        0.52 * utilisation
        + 0.22 * (queue_depth / 100.0)
        + 0.14 * (loss / 20.0)
        + 0.08 * (flows / 400.0)
        + 0.06 * (1 - np.log10(bandwidth) / 3.0)
        + rng.normal(0, 0.055, n)
    )
    congested = (pressure > 0.55).astype(int)

    # effective latency: queueing delay blows up near saturation
    effective_latency = (
        latency * (1 + 2.4 * utilisation ** 2)
        + queue_depth * 0.22
        + (flows / 400.0) * 6.0
        + np.where(bandwidth < 50, 3.0, 0.0)
        + rng.normal(0, 1.2, n)
    )
    effective_latency = np.clip(effective_latency, 0.5, None)

    df = pd.DataFrame(
        {
            "bandwidth": bandwidth,
            "latency": np.round(latency, 3),
            "loss": np.round(loss, 3),
            "load": np.round(load, 2),
            "flows": np.round(flows, 1),
            "queue_depth": np.round(queue_depth, 2),
            "utilisation": np.round(utilisation, 4),
            "congested": congested,
            "effective_latency": np.round(effective_latency, 3),
        }
    )
    os.makedirs(DATA_DIR, exist_ok=True)
    df.to_csv(DATASET, index=False)
    return df


# --------------------------------------------------------------------------- #
# training
# --------------------------------------------------------------------------- #
def train(n=12000, seed=42):
    df = generate_dataset(n=n, seed=seed)
    X = df[FEATURES].values
    y_c = df["congested"].values
    y_r = df["effective_latency"].values

    Xtr, Xte, ytr_c, yte_c, ytr_r, yte_r = train_test_split(
        X, y_c, y_r, test_size=0.25, random_state=seed, stratify=y_c
    )

    clf = RandomForestClassifier(
        n_estimators=220, max_depth=14, min_samples_leaf=3,
        n_jobs=-1, random_state=seed
    ).fit(Xtr, ytr_c)

    reg = RandomForestRegressor(
        n_estimators=220, max_depth=18, min_samples_leaf=2,
        n_jobs=-1, random_state=seed
    ).fit(Xtr, ytr_r)

    pc = clf.predict(Xte)
    proba = clf.predict_proba(Xte)[:, 1]
    pr = reg.predict(Xte)

    meta = {
        "trainedOn": int(len(Xtr)),
        "testedOn": int(len(Xte)),
        "datasetRows": int(len(df)),
        "features": FEATURES,
        "classifier": {
            "model": "RandomForestClassifier",
            "accuracy": round(float(accuracy_score(yte_c, pc)), 4),
            "precision": round(float(precision_score(yte_c, pc, zero_division=0)), 4),
            "recall": round(float(recall_score(yte_c, pc, zero_division=0)), 4),
            "f1": round(float(f1_score(yte_c, pc, zero_division=0)), 4),
            "rocAuc": round(float(roc_auc_score(yte_c, proba)), 4),
            "confusionMatrix": confusion_matrix(yte_c, pc).tolist(),
            "featureImportance": [
                {"feature": f, "importance": round(float(v), 4)}
                for f, v in sorted(
                    zip(FEATURES, clf.feature_importances_),
                    key=lambda kv: kv[1],
                    reverse=True,
                )
            ],
        },
        "regressor": {
            "model": "RandomForestRegressor",
            "r2": round(float(r2_score(yte_r, pr)), 4),
            "mae": round(float(mean_absolute_error(yte_r, pr)), 4),
            "featureImportance": [
                {"feature": f, "importance": round(float(v), 4)}
                for f, v in sorted(
                    zip(FEATURES, reg.feature_importances_),
                    key=lambda kv: kv[1],
                    reverse=True,
                )
            ],
        },
        "congestedShare": round(float(df["congested"].mean()), 4),
    }

    os.makedirs(MODEL_DIR, exist_ok=True)
    dump(clf, CLF_PATH)
    dump(reg, REG_PATH)
    with open(META_PATH, "w") as fh:
        json.dump(meta, fh, indent=2)

    _state.update({"clf": clf, "reg": reg, "meta": meta})
    return meta


def ensure_model():
    if _state["clf"] is not None:
        return _state["meta"]
    if os.path.exists(CLF_PATH) and os.path.exists(REG_PATH) and os.path.exists(META_PATH):
        try:
            _state["clf"] = load(CLF_PATH)
            _state["reg"] = load(REG_PATH)
            with open(META_PATH) as fh:
                _state["meta"] = json.load(fh)
            return _state["meta"]
        except Exception:
            pass
    return train()


def metadata():
    return ensure_model()


# --------------------------------------------------------------------------- #
# inference
# --------------------------------------------------------------------------- #
def link_features(link):
    util = link["load"] / 100.0
    queue = min(100.0, 100 * (util ** 2.4) + link.get("flows", 10) * 0.08)
    return [
        link["bandwidth"],
        link["latency"],
        link["loss"],
        link["load"],
        link.get("flows", 10),
        queue,
        util,
    ]


def predict_links(links):
    """Batch prediction -> {link_id: {...}}. One model call for the whole graph."""
    ensure_model()
    if not links:
        return {}
    X = np.array([link_features(l) for l in links], dtype=float)
    proba = _state["clf"].predict_proba(X)[:, 1]
    eff = _state["reg"].predict(X)
    out = {}
    for l, p, e in zip(links, proba, eff):
        out[l["id"]] = {
            "congestion_probability": float(p),
            "predicted_latency": float(max(e, 0.1)),
            "congested": bool(p >= 0.5),
        }
    return out


def make_predictor(topology):
    """Return f(link) -> prediction dict, cached over the whole topology."""
    cache = predict_links(topology["links"])

    def predictor(link):
        hit = cache.get(link["id"])
        if hit is not None:
            return hit
        fresh = predict_links([link])[link["id"]]
        cache[link["id"]] = fresh
        return fresh

    return predictor


if __name__ == "__main__":
    print(json.dumps(train(), indent=2))
