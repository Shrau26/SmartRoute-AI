"""Smoke tests for the SmartRoute AI backend.  Run: python test_api.py"""

import json

import app as server
import db

TOPO = {
    "nodes": [
        {"id": "PC1", "type": "pc", "label": "PC-1"},
        {"id": "R1", "type": "router", "label": "R1"},
        {"id": "R2", "type": "router", "label": "R2"},
        {"id": "R3", "type": "router", "label": "R3"},
        {"id": "R4", "type": "router", "label": "R4"},
        {"id": "PC2", "type": "pc", "label": "PC-2"},
    ],
    "links": [
        {"id": "L1", "source": "PC1", "target": "R1", "bandwidth": 100, "latency": 2, "loss": 0, "cost": 5, "load": 20},
        {"id": "L2", "source": "R1", "target": "R2", "bandwidth": 100, "latency": 8, "loss": 0.5, "cost": 10, "load": 85},
        {"id": "L3", "source": "R1", "target": "R3", "bandwidth": 50, "latency": 14, "loss": 0.2, "cost": 12, "load": 25},
        {"id": "L4", "source": "R2", "target": "R4", "bandwidth": 100, "latency": 6, "loss": 0.3, "cost": 8, "load": 80},
        {"id": "L5", "source": "R3", "target": "R4", "bandwidth": 200, "latency": 9, "loss": 0.1, "cost": 9, "load": 15},
        {"id": "L6", "source": "R4", "target": "PC2", "bandwidth": 100, "latency": 2, "loss": 0, "cost": 5, "load": 18},
    ],
}

PASS = FAIL = 0


def check(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name} {extra}")


def main():
    db.init_db()
    c = server.app.test_client()

    r = c.get("/api/health")
    check("health", r.status_code == 200 and r.get_json()["status"] == "ok")

    r = c.get("/api/algorithms")
    check("algorithms list", r.status_code == 200 and len(r.get_json()) == 5)

    r = c.get("/api/model")
    meta = r.get_json()
    check("model metadata", meta["classifier"]["accuracy"] > 0.8, meta.get("classifier", {}))

    paths = {}
    for algo in ["dijkstra", "dijkstra_cost", "bellman_ford", "load_aware", "ai"]:
        r = c.post("/api/route", json={"topology": TOPO, "source": "PC1", "target": "PC2", "algorithm": algo})
        d = r.get_json()
        check(f"route {algo}", r.status_code == 200 and d["found"], d)
        paths[algo] = d["path"]["nodes"]
        check(f"route {algo} metrics", d["metrics"]["hopCount"] >= 3)
    print("   paths:", json.dumps(paths))
    check("congested path avoided by load-aware", paths["load_aware"] != paths["dijkstra"], paths)

    r = c.post("/api/compare", json={"topology": TOPO, "source": "PC1", "target": "PC2"})
    d = r.get_json()
    check("compare", r.status_code == 200 and len(d["results"]) == 5 and d["best"])

    # link failure -> reroute
    broken = json.loads(json.dumps(TOPO))
    broken["links"][1]["status"] = "down"
    r = c.post("/api/route", json={"topology": broken, "source": "PC1", "target": "PC2",
                                   "algorithm": "dijkstra", "previousPath": {"nodes": paths["dijkstra"]}})
    d = r.get_json()
    check("reroute on link failure", d["found"] and d["rerouted"] and "R2" not in d["path"]["nodes"], d.get("path"))

    # node failure isolating destination
    iso = json.loads(json.dumps(TOPO))
    for n in iso["nodes"]:
        if n["id"] == "R4":
            n["status"] = "down"
    r = c.post("/api/route", json={"topology": iso, "source": "PC1", "target": "PC2", "algorithm": "ai"})
    d = r.get_json()
    check("disconnected network handled", r.status_code == 200 and not d["found"] and d["alerts"], d)

    # what-if
    r = c.post("/api/whatif", json={
        "topology": TOPO, "source": "PC1", "target": "PC2", "algorithm": "load_aware",
        "changes": [{"linkId": "L2", "load": 5, "latency": 2}],
    })
    d = r.get_json()
    check("what-if", r.status_code == 200 and d["delta"] is not None and len(d["applied"]) == 2, d.get("applied"))

    # invalid inputs
    check("bad algorithm", c.post("/api/route", json={"topology": TOPO, "source": "PC1", "target": "PC2", "algorithm": "nope"}).status_code == 400)
    check("same src/dst", c.post("/api/route", json={"topology": TOPO, "source": "PC1", "target": "PC1", "algorithm": "ai"}).status_code == 400)
    check("missing node", c.post("/api/route", json={"topology": TOPO, "source": "XX", "target": "PC2", "algorithm": "ai"}).status_code == 400)
    check("empty topology", c.post("/api/route", json={"topology": {"nodes": [], "links": []}, "source": "a", "target": "b"}).status_code == 400)
    check("garbage body", c.post("/api/route", data="notjson", content_type="application/json").status_code == 400)
    bad = {"nodes": [{"id": "A"}, {"id": "B"}],
           "links": [{"id": "X", "source": "A", "target": "B", "bandwidth": "abc", "latency": None, "loss": -9, "load": 500}]}
    r = c.post("/api/route", json={"topology": bad, "source": "A", "target": "B", "algorithm": "ai"})
    check("coerces invalid numbers", r.status_code == 200 and r.get_json()["found"], r.get_json())

    # persistence
    r = c.post("/api/topologies", json={"name": "__test__", "topology": TOPO, "layout": {"PC1": {"x": 0, "y": 0}}})
    check("save topology", r.status_code == 200)
    tid = r.get_json()["id"]
    check("list topologies", any(t["id"] == tid for t in c.get("/api/topologies").get_json()))
    got = c.get(f"/api/topologies/{tid}").get_json()
    check("load topology", len(got["data"]["topology"]["nodes"]) == 6)
    check("save empty rejected", c.post("/api/topologies", json={"name": "x", "topology": {"nodes": []}}).status_code == 400)
    check("delete topology", c.delete(f"/api/topologies/{tid}").status_code == 200)
    check("delete missing", c.delete(f"/api/topologies/{tid}").status_code == 404)

    c.post("/api/route", json={"topology": TOPO, "source": "PC1", "target": "PC2", "algorithm": "ai", "record": True})
    hist = c.get("/api/history").get_json()
    check("history recorded", len(hist) >= 1 and hist[0]["algorithm"] == "ai")
    check("history cleared", c.delete("/api/history").status_code == 200)

    print(f"\n{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
