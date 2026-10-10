"""SmartRoute AI - Flask API.

Run:  python app.py      (http://127.0.0.1:5000)
"""

import copy
import os

from flask import Flask, jsonify, request

import db
import graph as G
import ml

app = Flask(__name__)


# --------------------------------------------------------------------------- #
# CORS (no extra dependency)
# --------------------------------------------------------------------------- #
@app.after_request
def cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
    return resp


@app.route("/api/<path:_any>", methods=["OPTIONS"])
def preflight(_any):
    return ("", 204)


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


@app.errorhandler(ApiError)
def handle_api_error(err):
    return jsonify({"error": err.message}), err.status


@app.errorhandler(Exception)
def handle_unexpected(err):  # pragma: no cover - safety net
    app.logger.exception(err)
    return jsonify({"error": f"Internal error: {err}"}), 500


def body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("Request body must be a JSON object")
    return data


# --------------------------------------------------------------------------- #
# algorithms
# --------------------------------------------------------------------------- #
ALGORITHMS = {
    "dijkstra": {
        "label": "Dijkstra (shortest latency)",
        "description": "Greedy shortest-path using raw link latency as the metric.",
    },
    "dijkstra_cost": {
        "label": "Dijkstra (least cost)",
        "description": "Same algorithm optimising administrative link cost.",
    },
    "bellman_ford": {
        "label": "Bellman-Ford / Distance Vector",
        "description": "Iterative distance-vector relaxation until convergence.",
    },
    "load_aware": {
        "label": "Load-Aware Routing",
        "description": "Latency inflated by queueing delay, loss and narrow bandwidth.",
    },
    "ai": {
        "label": "AI Recommended (Random Forest)",
        "description": "Weights come from the trained congestion + latency models.",
    },
}


def weight_for(algo, topology, predictor):
    if algo == "dijkstra":
        return G.w_latency
    if algo == "dijkstra_cost":
        return G.w_cost
    if algo == "bellman_ford":
        return G.w_latency
    if algo == "load_aware":
        return G.w_load_aware
    if algo == "ai":
        return G.make_ai_weight(predictor)
    raise ApiError(f"Unknown algorithm '{algo}'")


def solve(topology, src, dst, algo, predictor):
    weight = weight_for(algo, topology, predictor)
    if algo == "bellman_ford":
        path, stats = G.bellman_ford(topology, src, dst, weight)
    else:
        path, stats = G.dijkstra(topology, src, dst, weight)
    return path, stats, weight


def validate_endpoints(topology, src, dst):
    ids = {n["id"] for n in topology["nodes"]}
    if not src or not dst:
        raise ApiError("Source and destination are required")
    if src not in ids:
        raise ApiError(f"Source '{src}' is not part of the topology")
    if dst not in ids:
        raise ApiError(f"Destination '{dst}' is not part of the topology")
    if src == dst:
        raise ApiError("Source and destination must be different")
    status = {n["id"]: n["status"] for n in topology["nodes"]}
    if status[src] == "down":
        raise ApiError(f"Source '{src}' is currently DOWN")
    if status[dst] == "down":
        raise ApiError(f"Destination '{dst}' is currently DOWN")


def build_alerts(topology, path, metrics, predictions):
    alerts = []
    down_nodes = [n["label"] for n in topology["nodes"] if n["status"] == "down"]
    down_links = [l["id"] for l in topology["links"] if l["status"] == "down"]
    if down_nodes:
        alerts.append({"level": "critical", "message": f"Device failure: {', '.join(down_nodes)}"})
    if down_links:
        alerts.append({"level": "critical", "message": f"Link failure: {', '.join(down_links)}"})

    for l in topology["links"]:
        if l["status"] == "down":
            continue
        p = predictions.get(l["id"], {})
        if p.get("congestion_probability", 0) >= 0.7:
            alerts.append(
                {
                    "level": "warning",
                    "message": f"{l['id']} congestion risk "
                    f"{round(p['congestion_probability'] * 100)}% (load {round(l['load'])}%)",
                }
            )
        if l["loss"] >= 5:
            alerts.append({"level": "warning", "message": f"{l['id']} packet loss {l['loss']}%"})

    if path and metrics:
        if metrics["packetLoss"] >= 5:
            alerts.append(
                {"level": "warning", "message": f"End-to-end loss {metrics['packetLoss']}% on active route"}
            )
        if metrics["congestion"] >= 70:
            alerts.append(
                {"level": "warning", "message": f"Active route congestion {metrics['congestion']}%"}
            )
    return alerts[:12]


def route_payload(topology, src, dst, algo, previous_path=None):
    predictor = ml.make_predictor(topology)
    predictions = ml.predict_links(topology["links"])
    path, stats, weight = solve(topology, src, dst, algo, predictor)

    comps = G.connected_components(topology)
    reachable = any(src in c and dst in c for c in comps)

    if not path:
        alerts = build_alerts(topology, None, None, predictions)
        alerts.insert(
            0,
            {
                "level": "critical",
                "message": "No route available: the network is partitioned between "
                f"{src} and {dst}." if not reachable else "No route available.",
            },
        )
        return {
            "found": False,
            "algorithm": algo,
            "algorithmLabel": ALGORITHMS[algo]["label"],
            "source": src,
            "target": dst,
            "path": None,
            "metrics": None,
            "alerts": alerts,
            "components": comps,
            "predictions": predictions,
            "stats": stats,
            "rerouted": bool(previous_path),
        }

    use_pred = predictor if algo == "ai" else None
    metrics = G.path_metrics(topology, path, predictor=use_pred)
    metrics["health"] = G.health_score(metrics)
    metrics["pathWeight"] = round(
        sum(weight({**l}) for l in topology["links"] if l["id"] in set(path["links"])), 3
    )

    alerts = build_alerts(topology, path, metrics, predictions)

    rerouted = False
    if previous_path and previous_path.get("nodes"):
        rerouted = previous_path["nodes"] != path["nodes"]
        if rerouted:
            alerts.insert(
                0,
                {
                    "level": "info",
                    "message": "Dynamic reroute: "
                    f"{' -> '.join(previous_path['nodes'])}  =>  {' -> '.join(path['nodes'])}",
                },
            )

    alternatives = []
    for alt in G.k_alternative_paths(topology, src, dst, weight, k=3):
        if alt["nodes"] == path["nodes"]:
            continue
        m = G.path_metrics(topology, alt, predictor=use_pred)
        m["health"] = G.health_score(m)
        alternatives.append({"path": alt, "metrics": m})

    return {
        "found": True,
        "algorithm": algo,
        "algorithmLabel": ALGORITHMS[algo]["label"],
        "algorithmDescription": ALGORITHMS[algo]["description"],
        "source": src,
        "target": dst,
        "path": path,
        "metrics": metrics,
        "alerts": alerts,
        "components": comps,
        "predictions": predictions,
        "stats": stats,
        "alternatives": alternatives[:2],
        "rerouted": rerouted,
    }


# --------------------------------------------------------------------------- #
# endpoints
# --------------------------------------------------------------------------- #
@app.get("/api/health")
def api_health():
    return jsonify({"status": "ok", "model": ml.metadata()["classifier"]["accuracy"]})


@app.get("/api/algorithms")
def api_algorithms():
    return jsonify([{"id": k, **v} for k, v in ALGORITHMS.items()])


@app.post("/api/route")
def api_route():
    data = body()
    topology = G.normalize(data.get("topology"))
    if not topology["nodes"]:
        raise ApiError("Topology has no devices")
    src, dst = str(data.get("source") or ""), str(data.get("target") or "")
    algo = str(data.get("algorithm") or "dijkstra")
    if algo not in ALGORITHMS:
        raise ApiError(f"Unknown algorithm '{algo}'")
    validate_endpoints(topology, src, dst)

    result = route_payload(topology, src, dst, algo, data.get("previousPath"))

    if data.get("record") and result["found"]:
        db.add_history(
            algo, src, dst, result["path"], result["metrics"],
            event="reroute" if result["rerouted"] else "simulation",
        )
    return jsonify(result)


@app.post("/api/compare")
def api_compare():
    data = body()
    topology = G.normalize(data.get("topology"))
    src, dst = str(data.get("source") or ""), str(data.get("target") or "")
    validate_endpoints(topology, src, dst)

    predictor = ml.make_predictor(topology)
    rows = []
    for algo in ALGORITHMS:
        path, stats, _ = solve(topology, src, dst, algo, predictor)
        if not path:
            rows.append(
                {"algorithm": algo, "label": ALGORITHMS[algo]["label"], "found": False}
            )
            continue
        m = G.path_metrics(topology, path, predictor=predictor if algo == "ai" else None)
        m["health"] = G.health_score(m)
        rows.append(
            {
                "algorithm": algo,
                "label": ALGORITHMS[algo]["label"],
                "found": True,
                "path": path,
                "metrics": m,
                "stats": stats,
            }
        )

    best = None
    for r in rows:
        if not r.get("found"):
            continue
        if best is None or r["metrics"]["health"] > best["metrics"]["health"]:
            best = r
    return jsonify({"results": rows, "best": best["algorithm"] if best else None})


@app.post("/api/whatif")
def api_whatif():
    """changes = [{linkId, bandwidth?, latency?, loss?, load?, status?}, {nodeId, status?}]"""
    data = body()
    topology = G.normalize(data.get("topology"))
    src, dst = str(data.get("source") or ""), str(data.get("target") or "")
    algo = str(data.get("algorithm") or "ai")
    if algo not in ALGORITHMS:
        raise ApiError(f"Unknown algorithm '{algo}'")
    validate_endpoints(topology, src, dst)

    changes = data.get("changes") or []
    if not isinstance(changes, list):
        raise ApiError("'changes' must be a list")

    after = copy.deepcopy(topology)
    link_by_id = {l["id"]: l for l in after["links"]}
    node_by_id = {n["id"]: n for n in after["nodes"]}
    applied = []
    for ch in changes:
        if not isinstance(ch, dict):
            continue
        if ch.get("linkId"):
            l = link_by_id.get(str(ch["linkId"]))
            if not l:
                raise ApiError(f"Unknown link '{ch['linkId']}'")
            for field, lo, hi in (
                ("bandwidth", 1, 10000),
                ("latency", 0.1, 5000),
                ("loss", 0, 100),
                ("load", 0, 100),
                ("cost", 0.1, 10000),
                ("flows", 0, 1000),
            ):
                if ch.get(field) is not None:
                    old = l[field]
                    l[field] = G._num(ch[field], l[field], lo, hi)
                    applied.append({"target": l["id"], "field": field, "from": old, "to": l[field]})
            if ch.get("status") in ("up", "down"):
                applied.append({"target": l["id"], "field": "status", "from": l["status"], "to": ch["status"]})
                l["status"] = ch["status"]
        elif ch.get("nodeId"):
            n = node_by_id.get(str(ch["nodeId"]))
            if not n:
                raise ApiError(f"Unknown device '{ch['nodeId']}'")
            if ch.get("status") in ("up", "down"):
                applied.append({"target": n["id"], "field": "status", "from": n["status"], "to": ch["status"]})
                n["status"] = ch["status"]

    before_res = route_payload(topology, src, dst, algo)
    after_res = route_payload(after, src, dst, algo, previous_path=before_res.get("path"))

    delta = None
    if before_res["found"] and after_res["found"]:
        b, a = before_res["metrics"], after_res["metrics"]
        delta = {
            k: round(a[k] - b[k], 3)
            for k in ("effectiveLatency", "latency", "packetLoss", "throughput", "congestion", "hopCount", "health", "cost")
        }
    return jsonify({"before": before_res, "after": after_res, "delta": delta, "applied": applied})


@app.post("/api/predict")
def api_predict():
    data = body()
    topology = G.normalize(data.get("topology"))
    return jsonify({"predictions": ml.predict_links(topology["links"])})


@app.get("/api/model")
def api_model():
    return jsonify(ml.metadata())


@app.post("/api/model/train")
def api_model_train():
    data = request.get_json(silent=True) or {}
    n = int(G._num(data.get("samples"), 12000, 2000, 60000))
    seed = int(G._num(data.get("seed"), 42, 0, 10**6))
    return jsonify(ml.train(n=n, seed=seed))


@app.get("/api/topologies")
def api_topologies():
    return jsonify(db.list_topologies())


@app.post("/api/topologies")
def api_save_topology():
    data = body()
    name = str(data.get("name") or "").strip()
    if not name:
        raise ApiError("A topology name is required")
    topology = G.normalize(data.get("topology"))
    if not topology["nodes"]:
        raise ApiError("Cannot save an empty topology")
    payload = {"topology": topology, "layout": data.get("layout") or {}}
    return jsonify(db.save_topology(name, payload))


@app.get("/api/topologies/<int:tid>")
def api_get_topology(tid):
    row = db.get_topology(tid)
    if not row:
        raise ApiError("Topology not found", 404)
    return jsonify(row)


@app.delete("/api/topologies/<int:tid>")
def api_delete_topology(tid):
    if not db.delete_topology(tid):
        raise ApiError("Topology not found", 404)
    return jsonify({"deleted": tid})


@app.get("/api/history")
def api_history():
    return jsonify(db.list_history(limit=int(request.args.get("limit", 60))))


@app.delete("/api/history")
def api_clear_history():
    db.clear_history()
    return jsonify({"cleared": True})


if __name__ == "__main__":
    db.init_db()
    ml.ensure_model()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="127.0.0.1", port=port, debug=bool(os.environ.get("DEBUG")))
