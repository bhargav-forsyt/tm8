from __future__ import annotations
import pathlib
from render_common import fail, REL_STYLE
KIND_TO_FLOW={'root': 'current', 'domain': 'current', 'module': 'current', 'flow': 'current', 'gate': 'gate', 'store': 'store', 'external': 'provider'}
def validate(data: dict, repo: pathlib.Path | None) -> list[str]:
    """Every hard rule. Returns the list of file:line refs it actually checked."""
    nodes = data.get("nodes") or []
    edges = data.get("edges") or []
    by_id = {}
    for n in nodes:
        for field in ("id", "kind", "title", "summary"):
            if not n.get(field):
                fail(f"node {n.get('id', '?')} is missing required field '{field}'")
        if n["id"] in by_id:
            fail(f"duplicate node id '{n['id']}'")
        if n["kind"] not in KIND_TO_FLOW:
            fail(f"node {n['id']} has unknown kind '{n['kind']}'")
        by_id[n["id"]] = n

    for n in nodes:
        parent = n.get("parent")
        if parent is None:
            if n["kind"] != "root":
                fail(f"node {n['id']} has no parent but is not the root")
        elif parent not in by_id:
            fail(f"node {n['id']} names a parent '{parent}' that does not exist")

    # Containment cycles. A cycle makes the drill-down infinite and silently hides
    # every node inside it from the map, which reads as "that seam is not mapped".
    for n in nodes:
        seen = set()
        cur = n
        while cur.get("parent") is not None:
            if cur["id"] in seen:
                fail(f"containment cycle through node '{n['id']}'")
            seen.add(cur["id"])
            cur = by_id[cur["parent"]]

    for e in edges:
        if e.get("from") not in by_id or e.get("to") not in by_id:
            fail(f"edge {e.get('from')} -> {e.get('to')} names a node that does not exist")
        if e.get("rel") not in REL_STYLE:
            fail(f"edge {e['from']} -> {e['to']} has unknown relation '{e.get('rel')}'")

    checked: list[str] = []
    for n in nodes:
        for ev in n.get("evidence", []):
            ref = f"{ev.get('file')}:{ev.get('line')}"
            if not ev.get("file") or not ev.get("line"):
                fail(f"node {n['id']} has an evidence entry with no file:line ({ev})")
            if repo is None:
                fail(
                    "cannot validate file:line — no source checkout resolved. Set "
                    "$ARCHITECTURE_REPO, set \"repo\" in architecture.config.json, or run from "
                    "inside the checkout. Publishing an unvalidated map is not allowed."
                )
            path = repo / ev["file"]
            if not path.exists():
                fail(f"node {n['id']}: evidence file does not exist — {ref}")
            total = sum(1 for _ in path.open("rb"))
            if int(ev["line"]) > total:
                fail(f"node {n['id']}: {ref} is past EOF (file has {total} lines)")
            checked.append(ref)
        for m in n.get("metrics", []):
            for field in ("label", "value", "source", "window"):
                if not m.get(field):
                    fail(
                        f"node {n['id']} metric '{m.get('label', '?')}' is missing "
                        f"'{field}' — a number with no instrument and window is not a metric"
                    )
        for c in n.get("corrections", []):
            for field in ("date", "task", "was", "now", "why"):
                if not c.get(field):
                    fail(
                        f"node {n['id']} correction is missing '{field}' — a correction "
                        "that does not say what was wrong is not a correction"
                    )
    return checked

