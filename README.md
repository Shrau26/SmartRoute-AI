# SmartRoute AI — Intelligent Network Routing Simulator

An interactive network routing lab: build a topology, run classical and AI-driven
routing algorithms over it, watch packets traverse the chosen path, and see what
happens when links congest or devices fail.

The "AI" is two real scikit-learn Random Forests trained on a dataset generated
locally at first run. No paid APIs, no API keys, no network access required.

---

## Stack

| Layer     | Technology |
|-----------|------------|
| Frontend  | React 18, Vite, Tailwind CSS, React Flow, Recharts |
| Backend   | Python 3, Flask |
| Storage   | SQLite |
| ML        | scikit-learn (RandomForestClassifier + RandomForestRegressor), pandas, NumPy |

---

## Running the project

### 1. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py                     # http://127.0.0.1:5000
```

On the first start the server generates `data/network_dataset.csv`, trains both
models into `model/`, and creates `data/smartroute.db`. Subsequent starts load
the saved models (a second or two).

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173
```

Vite proxies `/api/*` to `http://127.0.0.1:5000`, so no CORS setup or `.env` file
is needed. `npm run build` produces a static bundle in `frontend/dist`.

---

## Tests

```bash
cd backend && python test_api.py     # 32 API / algorithm / validation checks
cd frontend && npm run test:ui       # JSDOM render + interaction smoke test
```

The UI test mounts the real `App` component against a **running** backend
(start Flask first) and drives the tabs, comparison, what-if and packet send,
failing on any React error. It needs the dev dependencies installed.

---

## Using the simulator

| Action | How |
|--------|-----|
| Add a device | `+ Router` / `+ PC` in the left rail |
| Create a link | Drag from a node's right handle onto another node |
| Edit link parameters | Click the link, then edit bandwidth / latency / loss / cost / load / flows |
| Fail a device or link | Select it, then `Fail device` / `Fail link` |
| Choose a route | Pick source, destination and algorithm in the header |
| Animate a packet | `Send packet` (also records the run in history) |
| Trigger dynamic rerouting | `Live traffic` — link utilisation drifts every 2.6 s and routes recompute |
| Compare algorithms | *Algorithm comparison* tab → `Run algorithm comparison` |
| Run a scenario | *What-if simulator* tab → change values → `Run what-if scenario` |
| Inspect / retrain the model | *AI model* tab |
| Save or reload a topology | *Save / history* tab |
| Toggle theme | `Light` / `Dark` in the header |

---

## Routing algorithms

| ID | Algorithm | Edge weight |
|----|-----------|-------------|
| `dijkstra` | Dijkstra (shortest latency) | raw link latency |
| `dijkstra_cost` | Dijkstra (least cost) | administrative cost |
| `bellman_ford` | Bellman-Ford / Distance Vector | latency, iterative relaxation until convergence |
| `load_aware` | Load-Aware Routing | `latency + latency·2.2·u² + 4·loss + 200/bandwidth` (u = utilisation) |
| `ai` | AI Recommended | `predicted_latency · (1 + 1.8 · P(congested)) + 4·loss`, both terms from the trained models |

Every successful route also returns up to two backup paths, found by removing a
mid-path edge and re-solving (a simplified Yen's algorithm), plus the connected
components of the graph so partitions can be reported precisely.

### Route metrics

`hopCount`, `latency` (sum of base latencies), `effectiveLatency` (queueing delay
included), `packetLoss` (`1 − Π(1 − lossᵢ)`), `throughput` (bottleneck of
`bandwidth · (1 − utilisation)`), `cost`, `avgLoad`, `congestion`, `reliability`,
and a composite `health` score of `0.4·latency + 0.3·loss + 0.3·congestion` terms
normalised to 0–100.

---

## The machine-learning pipeline

`backend/ml.py` is self-contained and reproducible (`seed = 42`).

**1. Dataset.** 12,000 synthetic link telemetry rows are drawn from realistic
distributions — bandwidth from a discrete tier set, latency and loss from gamma
distributions, utilisation from a beta distribution, flow counts from a gamma.
Queue depth grows super-linearly with utilisation (`100·u^2.4 + 0.08·flows`) plus
Gaussian noise. A latent congestion pressure combines utilisation, queue depth,
loss, flow count and inverse bandwidth with noise; rows above the threshold are
labelled congested (~21% of the data). Effective latency is a separate noisy
non-linear target. The file is written to `data/network_dataset.csv`.

**2. Models.** A 75/25 stratified split trains:

- `RandomForestClassifier` (220 trees, depth 14) → probability a link is congested
- `RandomForestRegressor` (220 trees, depth 18) → effective one-hop latency in ms

**3. Reported performance** (held-out test set, default seed):

| Model | Metric | Value |
|-------|--------|-------|
| Classifier | accuracy | 0.939 |
| Classifier | precision / recall | 0.875 / 0.828 |
| Classifier | F1 | 0.850 |
| Classifier | ROC-AUC | 0.983 |
| Regressor | R² | 0.990 |
| Regressor | MAE | 1.18 ms |

Accuracy, the confusion matrix and feature importances are recomputed on every
retrain and shown in the *AI model* tab — the numbers in the UI come from
`sklearn.metrics`, not from constants.

**4. Inference.** Every `/api/route`, `/api/compare` and `/api/whatif` call scores
all links in one batched `predict_proba` / `predict` pass. Predictions colour the
edges on the canvas, drive the congestion alerts, and form the AI edge weights.

---

## Dynamic rerouting

The client sends the currently active path with each route request. The server
recomputes over the live topology — honouring `status: "down"` on nodes and links
and the current utilisation figures — and flags `rerouted: true` when the new path
differs. That raises an info alert showing old path → new path and writes a
`reroute` entry to the history table. Rerouting therefore fires on any of:
congestion growth (including from *Live traffic*), rising packet loss, a failed
router/PC, or a failed link.

If no path exists at all, the API returns `found: false` with a critical alert
that distinguishes a partitioned network from a merely unreachable endpoint.

---

## Error handling

- Every incoming topology passes through `graph.normalize()`, which drops
  malformed nodes/links, rejects self-loops and dangling endpoints, de-duplicates
  IDs, and clamps every numeric field to a valid range — non-numeric input falls
  back to a sane default instead of crashing.
- Endpoint validation rejects missing, unknown, identical or offline source and
  destination devices with a 400 and a readable message.
- Disconnected graphs, empty topologies and unknown algorithm IDs are handled
  explicitly; a global error handler converts anything unexpected into JSON.
- The frontend validates numeric fields inline (range shown on error), blocks
  duplicate and self links on the canvas, and surfaces a "backend offline" badge
  plus an alert if Flask is not reachable.

---

## API reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Liveness + current model accuracy |
| GET | `/api/algorithms` | Algorithm IDs, labels, descriptions |
| POST | `/api/route` | Compute a route (`topology`, `source`, `target`, `algorithm`, `previousPath?`, `record?`) |
| POST | `/api/compare` | Run all five algorithms and pick the best by health |
| POST | `/api/whatif` | Before/after comparison for a list of `changes` |
| POST | `/api/predict` | Per-link congestion probability and predicted latency |
| GET | `/api/model` | Training metadata, metrics, confusion matrix, importances |
| POST | `/api/model/train` | Regenerate the dataset and refit (`samples`, `seed`) |
| GET/POST | `/api/topologies` | List / save (upsert by name, stores canvas layout) |
| GET/DELETE | `/api/topologies/<id>` | Load / delete a saved topology |
| GET/DELETE | `/api/history` | Simulation history / clear it |

---

## Project layout

```
smartroute-ai/
├── backend/
│   ├── app.py              Flask API, algorithm registry, alerts, validation
│   ├── graph.py            normalisation, Dijkstra, Bellman-Ford, metrics
│   ├── ml.py               dataset generation, training, batched inference
│   ├── db.py               SQLite schema and queries
│   ├── test_api.py         backend test suite
│   ├── requirements.txt
│   ├── data/               network_dataset.csv, smartroute.db  (generated)
│   └── model/              *.joblib, metadata.json             (generated)
└── frontend/
    ├── index.html, vite.config.js, tailwind.config.js, postcss.config.js
    └── src/
        ├── App.jsx                     state, routing loop, live traffic
        ├── lib/api.js                  fetch wrapper
        ├── lib/topology.js             graph helpers, defaults, validation
        └── components/
            ├── TopologyCanvas.jsx      React Flow nodes, links, packet animation
            ├── Inspector.jsx           property editor
            ├── Metrics.jsx             health cards, alerts, active-route table
            ├── Charts.jsx              live / per-hop / utilisation charts
            ├── ComparePanel.jsx        algorithm comparison
            ├── WhatIfPanel.jsx         scenario simulator
            ├── AIPanel.jsx             model metrics and retraining
            └── StoragePanel.jsx        save / load / history
```

The generated `data/` and `model/` files can be deleted at any time; they are
rebuilt on the next server start.
