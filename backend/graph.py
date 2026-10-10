"""Graph model + routing algorithms for SmartRoute AI.

A topology is a plain dict:
  {
    "nodes": [{"id","type","label","status"}],
    "links": [{"id","source","target","bandwidth","latency","loss","cost","load","flows","status"}]
  }
bandwidth = Mbps, latency = ms, loss = %, load = % utilisation, flows = active flows.
"""

import heapq

INF = float("inf")


# --------------------------------------------------------------------------- #
# validation
# --------------------------------------------------------------------------- #
def _num(value, default, lo, hi):
    try:
        v = float(value)
    except (TypeError, ValueError):
        return float(default)
    if v != v:  # NaN
        return float(default)
    return max(lo, min(hi, v))


def normalize(topology):
    """Coerce any incoming topology into a safe, fully-typed structure."""
    topology = topology or {}
    raw_nodes = topology.get("nodes") or []
    raw_links = topology.get("links") or []

    nodes, seen = [], set()
    for n in raw_nodes:
        if not isinstance(n, dict):
            continue
        nid = str(n.get("id") or "").strip()
        if not nid or nid in seen:
            continue
        seen.add(nid)
        nodes.append(
            {
                "id": nid,
                "type": "pc" if n.get("type") == "pc" else "router",
                "label": str(n.get("label") or nid),
                "status": "down" if n.get("status") == "down" else "up",
            }
        )

    links, lseen = [], set()
    for l in raw_links:
        if not isinstance(l, dict):
            continue
        lid = str(l.get("id") or "").strip()
        s, t = str(l.get("source") or ""), str(l.get("target") or "")
        if not lid or lid in lseen or s == t:
            continue
        if s not in seen or t not in seen:
            continue
        lseen.add(lid)
        links.append(
            {
                "id": lid,
                "source": s,
                "target": t,
                "bandwidth": _num(l.get("bandwidth"), 100, 1, 10000),
                "latency": _num(l.get("latency"), 5, 0.1, 5000),
                "loss": _num(l.get("loss"), 0, 0, 100),
                "cost": _num(l.get("cost"), 10, 0.1, 10000),
                "load": _num(l.get("load"), 20, 0, 100),
                "flows": _num(l.get("flows"), 10, 0, 1000),
                "status": "down" if l.get("status") == "down" else "up",
            }
        )
    return {"nodes": nodes, "links": links}


# --------------------------------------------------------------------------- #
# weights
# --------------------------------------------------------------------------- #
def w_latency(link, ctx=None):
    return link["latency"]


def w_cost(link, ctx=None):
    return link["cost"]


def w_load_aware(link, ctx=None):
    """Penalise utilised, lossy and narrow links."""
    util = link["load"] / 100.0
    queue_penalty = link["latency"] * (2.2 * util ** 2)
    loss_penalty = link["loss"] * 4.0
    bw_penalty = 200.0 / max(link["bandwidth"], 1.0)
    return link["latency"] + queue_penalty + loss_penalty + bw_penalty


def make_ai_weight(predictor):
    """Weight built from the trained models' predictions."""

    def w_ai(link, ctx=None):
        p = predictor(link)
        eff_latency = p["predicted_latency"]
        risk = p["congestion_probability"]
        return eff_latency * (1.0 + 1.8 * risk) + link["loss"] * 4.0

    return w_ai


# --------------------------------------------------------------------------- #
# adjacency
# --------------------------------------------------------------------------- #
def build_adjacency(topology):
    alive = {n["id"] for n in topology["nodes"] if n["status"] == "up"}
    adj = {nid: [] for nid in alive}
    for l in topology["links"]:
        if l["status"] == "down":
            continue
        if l["source"] not in alive or l["target"] not in alive:
            continue
        adj[l["source"]].append((l["target"], l))
        adj[l["target"]].append((l["source"], l))
    return alive, adj


# --------------------------------------------------------------------------- #
# algorithms
# --------------------------------------------------------------------------- #
def dijkstra(topology, src, dst, weight):
    alive, adj = build_adjacency(topology)
    if src not in alive or dst not in alive:
        return None, {"visited": 0, "relaxations": 0}

    dist = {n: INF for n in alive}
    prev = {}
    dist[src] = 0.0
    pq = [(0.0, src)]
    visited, relax = 0, 0
    done = set()

    while pq:
        d, u = heapq.heappop(pq)
        if u in done:
            continue
        done.add(u)
        visited += 1
        if u == dst:
            break
        for v, link in adj[u]:
            nd = d + weight(link)
            relax += 1
            if nd < dist[v]:
                dist[v] = nd
                prev[v] = (u, link)
                heapq.heappush(pq, (nd, v))

    return _rebuild(prev, src, dst, dist), {"visited": visited, "relaxations": relax}


def bellman_ford(topology, src, dst, weight):
    """Distance-vector style: iterative relaxation until convergence."""
    alive, adj = build_adjacency(topology)
    if src not in alive or dst not in alive:
        return None, {"iterations": 0, "relaxations": 0}

    dist = {n: INF for n in alive}
    prev = {}
    dist[src] = 0.0
    iterations, relax = 0, 0

    for _ in range(max(len(alive) - 1, 1)):
        iterations += 1
        changed = False
        for u in alive:
            if dist[u] == INF:
                continue
            for v, link in adj[u]:
                relax += 1
                nd = dist[u] + weight(link)
                if nd < dist[v] - 1e-12:
                    dist[v] = nd
                    prev[v] = (u, link)
                    changed = True
        if not changed:
            break

    return _rebuild(prev, src, dst, dist), {"iterations": iterations, "relaxations": relax}


def _rebuild(prev, src, dst, dist):
    if dist.get(dst, INF) == INF:
        return None
    nodes, links = [dst], []
    cur = dst
    guard = 0
    while cur != src:
        guard += 1
        if guard > 10000 or cur not in prev:
            return None
        cur, link = prev[cur]
        nodes.append(cur)
        links.append(link["id"])
    nodes.reverse()
    links.reverse()
    return {"nodes": nodes, "links": links}


def connected_components(topology):
    alive, adj = build_adjacency(topology)
    seen, comps = set(), []
    for n in alive:
        if n in seen:
            continue
        stack, comp = [n], []
        seen.add(n)
        while stack:
            u = stack.pop()
            comp.append(u)
            for v, _ in adj[u]:
                if v not in seen:
                    seen.add(v)
                    stack.append(v)
        comps.append(sorted(comp))
    return comps


def k_alternative_paths(topology, src, dst, weight, k=3):
    """Simple edge-removal variant of Yen's algorithm for backup routes."""
    results = []
    banned = set()
    for _ in range(k):
        t = {
            "nodes": topology["nodes"],
            "links": [l for l in topology["links"] if l["id"] not in banned],
        }
        path, _ = dijkstra(t, src, dst, weight)
        if not path:
            break
        if path["nodes"] not in [p["nodes"] for p in results]:
            results.append(path)
        if not path["links"]:
            break
        banned.add(path["links"][len(path["links"]) // 2])
    return results


# --------------------------------------------------------------------------- #
# metrics
# --------------------------------------------------------------------------- #
def path_metrics(topology, path, predictor=None):
    links = {l["id"]: l for l in topology["links"]}
    hops = []
    total_latency = 0.0
    effective_latency = 0.0
    total_cost = 0.0
    survive = 1.0
    bottleneck = INF
    load_sum = 0.0
    risk_sum = 0.0

    for lid in path["links"]:
        l = links[lid]
        util = l["load"] / 100.0
        eff = l["latency"] * (1 + 2.2 * util ** 2)
        risk = None
        if predictor:
            p = predictor(l)
            eff = p["predicted_latency"]
            risk = p["congestion_probability"]
            risk_sum += risk
        total_latency += l["latency"]
        effective_latency += eff
        total_cost += l["cost"]
        survive *= (1 - l["loss"] / 100.0)
        bottleneck = min(bottleneck, l["bandwidth"] * (1 - util))
        load_sum += l["load"]
        hops.append(
            {
                "link": lid,
                "source": l["source"],
                "target": l["target"],
                "latency": round(l["latency"], 2),
                "effectiveLatency": round(eff, 2),
                "loss": round(l["loss"], 2),
                "bandwidth": l["bandwidth"],
                "load": round(l["load"], 1),
                "cost": round(l["cost"], 2),
                "congestionRisk": None if risk is None else round(risk, 3),
            }
        )

    n = max(len(path["links"]), 1)
    avg_load = load_sum / n
    congestion = (risk_sum / n) if predictor else min(1.0, (avg_load / 100.0) ** 1.6)

    return {
        "hopCount": len(path["links"]),
        "latency": round(total_latency, 2),
        "effectiveLatency": round(effective_latency, 2),
        "packetLoss": round((1 - survive) * 100, 3),
        "throughput": 0.0 if bottleneck == INF else round(max(bottleneck, 0.0), 2),
        "cost": round(total_cost, 2),
        "avgLoad": round(avg_load, 1),
        "congestion": round(congestion * 100, 1),
        "reliability": round(survive * 100, 2),
        "hops": hops,
    }


def health_score(metrics):
    """0-100 composite score used by the network-health cards."""
    lat = max(0.0, 100 - metrics["effectiveLatency"] * 1.2)
    loss = max(0.0, 100 - metrics["packetLoss"] * 12)
    cong = max(0.0, 100 - metrics["congestion"])
    return round(0.4 * lat + 0.3 * loss + 0.3 * cong, 1)
