"""SQLite persistence: saved topologies + simulation history."""

import json
import os
import sqlite3
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE, "data", "smartroute.db")


def _conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_db():
    with _conn() as c:
        c.execute(
            """CREATE TABLE IF NOT EXISTS topologies (
                   id INTEGER PRIMARY KEY AUTOINCREMENT,
                   name TEXT NOT NULL UNIQUE,
                   data TEXT NOT NULL,
                   created_at TEXT NOT NULL,
                   updated_at TEXT NOT NULL)"""
        )
        c.execute(
            """CREATE TABLE IF NOT EXISTS history (
                   id INTEGER PRIMARY KEY AUTOINCREMENT,
                   created_at TEXT NOT NULL,
                   algorithm TEXT NOT NULL,
                   source TEXT NOT NULL,
                   target TEXT NOT NULL,
                   path TEXT NOT NULL,
                   metrics TEXT NOT NULL,
                   event TEXT)"""
        )


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------- topologies ---------------- #
def save_topology(name, data):
    name = (name or "").strip()
    if not name:
        raise ValueError("Topology name is required")
    payload = json.dumps(data)
    with _conn() as c:
        row = c.execute("SELECT id, created_at FROM topologies WHERE name=?", (name,)).fetchone()
        if row:
            c.execute(
                "UPDATE topologies SET data=?, updated_at=? WHERE id=?",
                (payload, _now(), row["id"]),
            )
            return {"id": row["id"], "name": name, "updated": True}
        cur = c.execute(
            "INSERT INTO topologies(name, data, created_at, updated_at) VALUES (?,?,?,?)",
            (name, payload, _now(), _now()),
        )
        return {"id": cur.lastrowid, "name": name, "updated": False}


def list_topologies():
    with _conn() as c:
        rows = c.execute(
            "SELECT id, name, created_at, updated_at FROM topologies ORDER BY updated_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def get_topology(tid):
    with _conn() as c:
        row = c.execute("SELECT * FROM topologies WHERE id=?", (tid,)).fetchone()
    if not row:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "data": json.loads(row["data"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def delete_topology(tid):
    with _conn() as c:
        cur = c.execute("DELETE FROM topologies WHERE id=?", (tid,))
        return cur.rowcount > 0


# ---------------- history ---------------- #
def add_history(algorithm, source, target, path, metrics, event=None):
    with _conn() as c:
        cur = c.execute(
            "INSERT INTO history(created_at, algorithm, source, target, path, metrics, event)"
            " VALUES (?,?,?,?,?,?,?)",
            (_now(), algorithm, source, target, json.dumps(path), json.dumps(metrics), event),
        )
        return cur.lastrowid


def list_history(limit=60):
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM history ORDER BY id DESC LIMIT ?", (int(limit),)
        ).fetchall()
    out = []
    for r in rows:
        out.append(
            {
                "id": r["id"],
                "createdAt": r["created_at"],
                "algorithm": r["algorithm"],
                "source": r["source"],
                "target": r["target"],
                "path": json.loads(r["path"]),
                "metrics": json.loads(r["metrics"]),
                "event": r["event"],
            }
        )
    return out


def clear_history():
    with _conn() as c:
        c.execute("DELETE FROM history")
