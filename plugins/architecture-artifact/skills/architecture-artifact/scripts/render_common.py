"""Shared page chrome for the architecture-artifact renderers.

Everything emitted here is self-contained: no network, no CDN, no remote fonts,
no host-specific paths, so the built page renders identically as a local file, as
a tm8 artifact and as a Claude Artifact.

Nothing here knows which project it is rendering. The source checkout is resolved
by `arch_config.find_repo()` from `architecture.config.json`, an env var, or a
walk up from cwd — never hardcoded, because this runtime travels between repos.
"""

from __future__ import annotations

import html
import os
import pathlib
import sys

import arch_config

# --------------------------------------------------------------------------
# Repo discovery — no hardcoded host path, because these renderers travel.
# --------------------------------------------------------------------------


def find_repo(start: pathlib.Path | None = None) -> pathlib.Path | None:
    """Delegates to arch_config so there is ONE resolution order, not two."""
    return arch_config.find_repo(start)


def fail(message: str) -> None:
    """Hard failure. A renderer that degrades quietly publishes a lie."""
    print(f"RENDER FAILED: {message}", file=sys.stderr)
    raise SystemExit(2)


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


# --------------------------------------------------------------------------
# Palette. Defined light-first on bare :root, re-declared under both the
# prefers-color-scheme media query and [data-theme="dark"], so the page is
# correct in all three viewer theme states.
# --------------------------------------------------------------------------

CSS = """
:root{
  --bg:#f7f8fa; --panel:#ffffff; --panel-2:#f1f3f7; --ink:#12151c; --ink-2:#4a5163;
  --ink-3:#767e92; --line:#dde1ea; --line-2:#c6ccda;
  --accent:#2f6df6;      /* current / shipped fact */
  --change:#8a4bd8;      /* proposed or delivered delta */
  --recovery:#0f8a6a;    /* recovery + failure lane */
  --gate:#c2700c;        /* a gate that can refuse */
  --alert:#c0362c;
  --shadow:0 1px 2px rgba(16,20,30,.06),0 4px 14px rgba(16,20,30,.05);
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --bg:#0d0f14; --panel:#151922; --panel-2:#1c212c; --ink:#eef1f7; --ink-2:#b3bacb;
    --ink-3:#7b8397; --line:#262c39; --line-2:#39414f;
    --accent:#6f9bff; --change:#b98cf0; --recovery:#3fc79c; --gate:#e0a24a; --alert:#ff8b7e;
    --shadow:0 1px 2px rgba(0,0,0,.5),0 6px 20px rgba(0,0,0,.35);
  }
}
:root[data-theme="dark"]{
  --bg:#0d0f14; --panel:#151922; --panel-2:#1c212c; --ink:#eef1f7; --ink-2:#b3bacb;
  --ink-3:#7b8397; --line:#262c39; --line-2:#39414f;
  --accent:#6f9bff; --change:#b98cf0; --recovery:#3fc79c; --gate:#e0a24a; --alert:#ff8b7e;
  --shadow:0 1px 2px rgba(0,0,0,.5),0 6px 20px rgba(0,0,0,.35);
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);
  font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:28px 20px 72px}
a{color:var(--accent)}
h1{font-size:26px;line-height:1.25;margin:0 0 6px;letter-spacing:-.01em}
h2{font-size:13px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);
  margin:34px 0 12px;font-weight:600}
h3{font-size:15px;margin:0 0 6px;font-weight:600}
p{margin:0 0 10px;color:var(--ink-2)}
code,.mono{font-family:var(--mono);font-size:.87em}
.sub{color:var(--ink-3);font-size:13px;margin:0}
/* An absent Notion ticket is STATED, never omitted — a missing link and a dropped
   link look identical otherwise, and this line is read at standup. */
.sub .no-ticket{color:var(--gate);font-style:italic}
/* The legacy marker is deliberately loud: a document that cannot meet the current
   contract should say so on its face, not hide it in the json. */
.legacy{margin:14px 0 0;padding:10px 14px;border:1px solid var(--gate);border-left-width:3px;
  border-radius:8px;background:var(--panel-2);color:var(--gate);font-size:13px;line-height:1.5}
.thesis{font-size:17px;line-height:1.45;color:var(--ink);margin:14px 0 0;
  border-left:3px solid var(--accent);padding:2px 0 2px 14px}

/* ---- lifecycle stepper ---- */
.stepper{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:20px 0 10px}
.step{display:flex;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;
  border:1px solid var(--line);background:var(--panel);font-size:13px;font-weight:600;
  color:var(--ink-3)}
.step.done{border-color:var(--recovery);color:var(--recovery)}
.step.now{background:var(--accent);border-color:var(--accent);color:#fff}
.step .dot{width:7px;height:7px;border-radius:50%;background:currentColor}
.step-sep{color:var(--line-2);font-size:13px}
.stagenote{background:var(--panel-2);border:1px solid var(--line);border-left:3px solid var(--gate);
  border-radius:8px;padding:10px 14px;color:var(--ink-2);font-size:14px;margin:6px 0 0}

/* ---- cards ---- */
.grid{display:grid;gap:12px}
.g2{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.g3{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;
  padding:14px 16px;box-shadow:var(--shadow)}
.card.change{border-left:3px solid var(--change)}
.card.gap{border-left:3px solid var(--gate)}
.card.alert{border-left:3px solid var(--alert)}
.card.done{border-left:3px solid var(--recovery)}
.card p:last-child{margin-bottom:0}
.chip{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.07em;
  text-transform:uppercase;padding:2px 7px;border-radius:4px;border:1px solid currentColor;
  vertical-align:2px;margin-left:6px}
.chip.proposed{color:var(--change)}
.chip.shipped{color:var(--recovery)}
.chip.shallow,.chip.corrected{color:var(--gate)}
.chip.gap{color:var(--alert)}

/* ---- evidence tiles ---- */
.tile{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px;
  box-shadow:var(--shadow)}
.tile .t-title{font-size:14px;font-weight:600;margin-bottom:2px}
.tile .t-meta{font-size:11.5px;color:var(--ink-3);font-family:var(--mono);line-height:1.55;
  margin:6px 0 10px;padding-bottom:8px;border-bottom:1px dashed var(--line)}
.tile .t-meta b{color:var(--ink-2);font-weight:600}
.row{display:flex;justify-content:space-between;gap:12px;padding:4px 0;font-size:13.5px;
  border-bottom:1px solid var(--line)}
.row:last-child{border-bottom:0}
.row .k{color:var(--ink-2);min-width:0}
.row .v{font-family:var(--mono);font-weight:600;white-space:nowrap}
.caveat{margin-top:9px;font-size:12px;color:var(--gate);line-height:1.45}

/* ---- diagram frame ---- */
.figure{background:var(--panel);border:1px solid var(--line);border-radius:10px;
  box-shadow:var(--shadow);margin:0 0 14px;overflow:hidden}
.figure > .cap{padding:11px 16px;border-bottom:1px solid var(--line);font-size:13px;
  font-weight:600;color:var(--ink-2)}
.figure > .scroll{overflow-x:auto;padding:14px 16px}
svg{display:block}
svg text{font-family:var(--sans)}
.legend{display:flex;flex-wrap:wrap;gap:14px;padding:10px 16px;border-top:1px solid var(--line);
  font-size:12px;color:var(--ink-2)}
.legend span{display:flex;align-items:center;gap:6px}
.legend i{width:12px;height:12px;border-radius:3px;display:inline-block}

ul.plain{margin:0;padding-left:18px;color:var(--ink-2)}
ul.plain li{margin:0 0 6px}
.foot{margin-top:44px;padding-top:14px;border-top:1px solid var(--line);
  color:var(--ink-3);font-size:12px;font-family:var(--mono);line-height:1.7}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line)}
th{color:var(--ink-3);font-size:11.5px;letter-spacing:.06em;text-transform:uppercase}
"""

# Node fill/stroke per kind, as CSS custom-property names.
KIND_COLOR = {
    "current": "--accent",
    "change": "--change",
    "recovery": "--recovery",
    "gate": "--gate",
    "store": "--ink-3",
    "provider": "--ink-3",
    "surface": "--accent",
    "async": "--recovery",
    "gap": "--alert",
    # A finding raised against the change itself, so a review defect is visually
    # distinct from a pre-existing gap the change is fixing.
    "alert": "--alert",
}

REL_STYLE = {
    "calls": ("solid", "calls"),
    "awaits": ("solid", "awaits"),
    "writes": ("solid", "writes"),
    "reads": ("dash", "reads"),
    "emits": ("solid", "emits"),
    "flows_to": ("solid", ""),
    "recovers": ("dash", "recovers"),
    "refuses": ("dash", "refuses"),
}

NODE_W = 178
NODE_H = 62
COL_GAP = 62
LANE_GAP = 46
PAD = 16


def _wrap(label: str, per_line: int = 24) -> list[str]:
    words, lines, cur = label.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if len(trial) > per_line and cur:
            lines.append(cur)
            cur = w
        else:
            cur = trial
    if cur:
        lines.append(cur)
    # A silent cut is a fabricated claim — the reader sees a complete-looking
    # sentence the author did not write. Mark it, always. (Live example, 2026-09-04:
    # "The merge anchor — betfairEventId, and" for "...and nothing else".)
    if len(lines) > 3:
        kept = lines[:3]
        kept[2] = kept[2].rstrip(" —·:,;-") + " …"
        return kept
    return lines


RESOURCE_LABELS = {"database": "Database", "redis": "Redis", "queue": "Queue", "logic": "Logic", "memory": "Memory", "report": "Report", "provider": "Provider"}


# The ONE resource-symbol vocabulary. Module-level so render_universe.py can import
# it (allowlist + paths) instead of copying it: two renderers, one set of symbols.
RESOURCE_SHAPES = {
    "database": '<path d="M3 5v14c0 4 18 4 18 0V5"/><ellipse cx="12" cy="5" rx="9" ry="3"/>',
    "redis": '<path d="M2 8l10-5 10 5-10 5z M2 12l10 5 10-5 M2 16l10 5 10-5"/>',
    "queue": '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M8 5v14 M15 5v14"/>',
    "logic": '<rect x="3" y="4" width="18" height="16" rx="5"/><path d="M7 12h10 m-4-4 4 4-4 4"/>',
    "memory": '<rect x="4" y="5" width="16" height="14"/><path d="M8 1v4 M16 1v4 M8 19v4 M16 19v4"/>',
    "report": '<path d="M5 2h10l5 5v15H5z M15 2v6h5 M8 12h9 M8 16h9"/>',
    "provider": '<circle cx="12" cy="12" r="10"/><path d="M2 12h20 M12 2c-7 7-7 13 0 20 M12 2c7 7 7 13 0 20"/>',
}


def resource_icon(resource: str) -> str:
    """Self-contained SVG symbols; resource identity is independent of change colour."""
    if resource not in RESOURCE_SHAPES:
        fail(f"Unknown resourceType: {resource}")
    return f'<svg viewBox="0 0 24 24" width="20" height="20" aria-label="{RESOURCE_LABELS[resource]}" fill="none" stroke="currentColor" stroke-width="1.6">{RESOURCE_SHAPES[resource]}</svg>'


def render_field_mappings(groups: list[dict]) -> str:
    """Exact field lineage, with full identifiers and explicit change status."""
    html = ['<h2>Exact field mapping · source → storage → report</h2>']
    headers = ["Change / fact", "Provider field or receipt event", "Runtime / transport", "PostgreSQL table.column", "API property → export header"]
    for group in groups:
        opened = " open" if group.get("open", True) else ""
        html.append(f'<details class="field-group"{opened}><summary>{esc(group["title"])}</summary><div class="scroll"><table class="field-map"><thead><tr>')
        html.extend(f'<th>{esc(h)}</th>' for h in headers)
        html.append('</tr></thead><tbody>')
        for row in group['rows']:
            if row['status'] not in ('KEEP', 'ADD', 'RENAME', 'REMOVE', 'NOT STORED'):
                fail('Invalid field mapping change status')
            html.append(f'<tr><td><strong>{esc(row["label"])}</strong><br><span class="map-status">{esc(row["status"])}</span></td>')
            for key in ('source', 'runtime', 'storage', 'export'):
                values = row[key]
                if not isinstance(values, list) or not values:
                    fail(f'Field mapping {row["label"]}: {key} must be explicit lines')
                html.append('<td>' + ''.join(f'<div class="map-line">{esc(v)}</div>' for v in values) + '</td>')
            html.append('</tr>')
        html.append('</tbody></table></div></details>')
    html.append('<style>.field-group{margin:14px 0;border:1px solid var(--line);border-radius:10px;background:var(--panel)}.field-group summary{cursor:pointer;padding:14px;font-weight:650}.field-map{table-layout:fixed;min-width:1000px}.field-map th:first-child{width:12%}.field-map td{vertical-align:top;padding:13px 10px}.map-line{font-family:var(--mono);font-size:11px;overflow-wrap:anywhere;margin-bottom:7px;line-height:1.5}.map-line+ .map-line{color:var(--ink-3)}.map-status{font:10px var(--mono);color:var(--change)}.resource-legend{display:flex;flex-wrap:wrap;gap:16px;padding:8px 14px;color:var(--ink-3);font-size:11px}.resource-legend span{display:flex;align-items:center;gap:5px}</style>')
    return ''.join(html)


def render_flow(spec: dict, caption: str, legend: list[dict] | None = None) -> str:
    """Lane/column flow diagram as inline SVG.

    Layout is author-controlled through each node's `lane` (row) and `col`
    (column) — deterministic, reviewable, and no layout engine to disagree with.
    """
    nodes = spec.get("nodes") or []
    edges = spec.get("edges") or []
    if not nodes:
        fail(f"flow '{caption}' has no nodes — a visual-first artifact may not ship an empty figure")

    pos: dict[str, tuple[float, float]] = {}
    max_col = max(int(n.get("col", 0)) for n in nodes)
    max_lane = max(int(n.get("lane", 0)) for n in nodes)
    for n in nodes:
        if "id" not in n or "label" not in n:
            fail(f"flow '{caption}': every node needs an id and a label (got {n})")
        x = PAD + int(n.get("col", 0)) * (NODE_W + COL_GAP)
        y = PAD + int(n.get("lane", 0)) * (NODE_H + LANE_GAP)
        pos[n["id"]] = (x, y)

    width = PAD * 2 + (max_col + 1) * NODE_W + max_col * COL_GAP
    height = PAD * 2 + (max_lane + 1) * NODE_H + max_lane * LANE_GAP

    fid = f"f{abs(hash(caption)) % 100000}"
    parts: list[str] = [
        f'<svg viewBox="0 0 {width} {height}" width="{width}" height="{height}" '
        f'role="img" aria-label="{esc(caption)}" xmlns="http://www.w3.org/2000/svg">'
    ]
    # One marker per colour so an arrowhead matches its edge in both themes.
    parts.append("<defs>")
    for key, var in KIND_COLOR.items():
        parts.append(
            f'<marker id="ah-{key}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" '
            f'markerHeight="6" orient="auto-start-reverse">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="var({var})"/></marker>'
        )
    parts.append("</defs>")

    for e in edges:
        src, dst = e.get("from"), e.get("to")
        if src not in pos or dst not in pos:
            fail(f"flow '{caption}': edge {src} -> {dst} names a node that does not exist")
        rel = e.get("rel", "flows_to")
        if rel not in REL_STYLE:
            fail(f"flow '{caption}': unknown relation '{rel}' on {src} -> {dst}")
        kind = e.get("kind", "current")
        var = KIND_COLOR.get(kind, "--ink-3")
        dashed = REL_STYLE[rel][0] == "dash"
        x1, y1 = pos[src]
        x2, y2 = pos[dst]
        if abs(y1 - y2) < 1:  # same lane: straight horizontal
            sx, sy = (x1 + NODE_W, y1 + NODE_H / 2) if x2 > x1 else (x1, y1 + NODE_H / 2)
            ex, ey = (x2, y2 + NODE_H / 2) if x2 > x1 else (x2 + NODE_W, y2 + NODE_H / 2)
            d = f"M{sx},{sy} L{ex},{ey}"
            mx, my = (sx + ex) / 2, sy - 8
        else:  # cross-lane: vertical-ish cubic out of the bottom/top face
            down = y2 > y1
            sx, sy = x1 + NODE_W / 2, y1 + (NODE_H if down else 0)
            ex, ey = x2 + NODE_W / 2, y2 + (0 if down else NODE_H)
            c = (ey - sy) / 2
            d = f"M{sx},{sy} C{sx},{sy + c} {ex},{ey - c} {ex},{ey}"
            mx, my = (sx + ex) / 2, (sy + ey) / 2 - 6
        dash_attr = 'stroke-dasharray="5 4" ' if dashed else ""
        parts.append(
            f'<path d="{d}" fill="none" stroke="var({var})" stroke-width="1.6" '
            f'{dash_attr}marker-end="url(#ah-{kind})"/>'
        )
        text = e.get("label") or REL_STYLE[rel][1]
        if text:
            parts.append(
                f'<text x="{mx:.0f}" y="{my:.0f}" text-anchor="middle" font-size="10.5" '
                f'font-family="ui-monospace,Menlo,monospace" fill="var(--ink-3)">{esc(text)}</text>'
            )

    for n in nodes:
        x, y = pos[n["id"]]
        kind = n.get("kind", "current")
        var = KIND_COLOR.get(kind, "--accent")
        if kind not in KIND_COLOR:
            fail(f"flow '{caption}': unknown node kind '{kind}' on {n['id']}")
        # A store is drawn square-cornered; everything else is rounded, so shape
        # carries meaning before colour does (and survives a mono printout).
        rx = 3 if kind in ("store", "provider") else 9
        dashed = ' stroke-dasharray="6 4"' if n.get("proposed") else ""
        # A node carrying `detail` is CLICKABLE. The explanation belongs to the node
        # and opens under this same figure — never a separate section the reader has
        # to hold in their head alongside the picture.
        detail = n.get("detail")
        if detail:
            parts.append(
                f'<g class="hasdetail" tabindex="0" role="button" '
                f'data-detail="{fid}-{esc(n["id"])}" '
                f'aria-label="{esc(n["label"])} — show detail">'
            )
        parts.append(
            f'<rect x="{x}" y="{y}" width="{NODE_W}" height="{NODE_H}" rx="{rx}" '
            f'fill="var(--panel-2)" stroke="var({var})" stroke-width="1.8"{dashed}/>'
        )
        resource = n.get("resourceType")
        if resource:
            icon = resource_icon(resource)
            parts.append(f'<g transform="translate({x + 5},{y - 9})" color="var({var})"><rect x="0" y="0" width="22" height="22" rx="4" fill="var(--panel-2)"/>{icon}</g>')
        lines = _wrap(n["label"])
        note = n.get("note")
        block_h = len(lines) * 14 + (12 if note else 0)
        ty = y + NODE_H / 2 - block_h / 2 + 11
        for line in lines:
            parts.append(
                f'<text x="{x + NODE_W / 2:.0f}" y="{ty:.0f}" text-anchor="middle" font-size="12.5" '
                f'font-weight="600" fill="var(--ink)">{esc(line)}</text>'
            )
            ty += 14
        if note:
            parts.append(
                f'<text x="{x + NODE_W / 2:.0f}" y="{ty:.0f}" text-anchor="middle" font-size="10.5" '
                f'font-family="ui-monospace,Menlo,monospace" fill="var(--ink-3)">{esc(note)}</text>'
            )
        if detail:
            # A visible affordance, because an invisible one is not an affordance:
            # nothing about a rectangle says "click me" until something does.
            parts.append(
                f'<circle cx="{x + NODE_W - 11:.0f}" cy="{y + 11:.0f}" r="6.5" '
                f'fill="var({var})" opacity="0.9"/>'
                f'<text x="{x + NODE_W - 11:.0f}" y="{y + 15:.0f}" text-anchor="middle" '
                f'font-size="9" font-weight="700" fill="var(--panel)">i</text>'
            )
            parts.append("</g>")
    parts.append("</svg>")

    legend_html = ""
    if legend:
        items = "".join(
            f'<span><i style="background:var({KIND_COLOR.get(l.get("id", "current"), "--accent")})">'
            f"</i>{esc(l.get('label', ''))}</span>"
            for l in legend
        )
        legend_html = f'<div class="legend">{items}</div>'

    resources = list(dict.fromkeys(n.get("resourceType") for n in nodes if n.get("resourceType")))
    if resources:
        legend_html += '<div class="resource-legend">' + ''.join(f'<span>{resource_icon(r)}{RESOURCE_LABELS[r]}</span>' for r in resources) + '</div>'

    # One collapsed panel per detailed node, sitting INSIDE this figure. Hidden until
    # its node is clicked; only one open at a time, so the page never grows a wall of
    # prose. Bullets only — a `detail` that needs a paragraph belongs in the diagram.
    panels = []
    for n in nodes:
        d = n.get("detail")
        if not d:
            continue
        if isinstance(d, str):
            fail(f"flow '{caption}': node '{n['id']}' detail must be a LIST of short bullets")
        for b in d:
            if len(str(b)) > 95:
                fail(
                    f"flow '{caption}': node '{n['id']}' has a {len(str(b))}-char bullet. "
                    "The cap is 95 — a bullet that needs a sentence is two bullets, and a "
                    "bullet that needs a paragraph means the diagram is not carrying its weight."
                )
        bullets = "".join(f"<li>{esc(str(b))}</li>" for b in d)
        panels.append(
            f'<div class="ndetail" id="{fid}-{esc(n["id"])}" hidden>'
            f'<b>{esc(n["label"])}</b><ul>{bullets}</ul></div>'
        )
    detail_html = "".join(panels)

    return (
        f'<div class="figure" data-fig="{fid}"><div class="cap">{esc(caption)}</div>'
        f'<div class="scroll">{"".join(parts)}</div>{detail_html}{legend_html}</div>'
    )


def render_measurement(m: dict) -> str:
    """An evidence tile. Instrument, window and population are non-negotiable."""
    for field in ("title", "instrument", "window", "population"):
        if not m.get(field):
            fail(
                f"measurement '{m.get('title', '?')}' is missing '{field}' — "
                "a figure with no instrument is not evidence"
            )
    row_html = []
    for r in m.get("rows", []):
        pct = f" &middot; {esc(r['pct'])}" if r.get("pct") else ""
        row_html.append(
            f'<div class="row"><span class="k">{esc(r.get("k", ""))}</span>'
            f'<span class="v">{esc(r.get("v", ""))}{pct}</span></div>'
        )
    rows = "".join(row_html)
    caveat = (
        f'<div class="caveat">Caveat — {esc(m["caveat"])}</div>' if m.get("caveat") else ""
    )
    return (
        f'<div class="tile"><div class="t-title">{esc(m["title"])}</div>'
        f'<div class="t-meta"><b>instrument</b> {esc(m["instrument"])}<br>'
        f'<b>window</b> {esc(m["window"])}<br>'
        f'<b>population</b> {esc(m["population"])}</div>{rows}{caveat}</div>'
    )


DETAIL_CSS = """
/* Card bodies are bullet lists, not paragraphs. */
.card ul{margin:6px 0 0;padding-left:17px}
.card li{font-size:12.5px;line-height:1.5;color:var(--ink-2);margin:3px 0}
.card p{font-size:12.5px;line-height:1.5;color:var(--ink-2)}

/* A node that explains itself. The affordance is a dot ON the node; the answer opens
   under the SAME figure, so a picture and its explanation are never on two screens. */
.hasdetail{cursor:pointer}
.hasdetail:hover rect{filter:brightness(1.12)}
.hasdetail:focus{outline:none}
.hasdetail:focus rect{stroke-width:3}
.hasdetail.on rect{stroke-width:3}
.ndetail{margin:0 16px 14px;padding:10px 14px;border:1px solid var(--line-2);
  border-radius:8px;background:var(--panel-2)}
.ndetail b{display:block;font-size:12.5px;color:var(--ink);margin-bottom:6px}
.ndetail ul{margin:0;padding-left:18px}
.ndetail li{font-size:12.5px;line-height:1.5;color:var(--ink-2);margin:3px 0}
"""

DETAIL_JS = """
/* Click a node, its bullets appear under that figure. One open at a time per figure,
   so the page cannot grow back into the wall of text this replaced. Keyboard too:
   the group is focusable and Enter/Space toggle it. */
(function(){
  function toggle(g){
    var fig = g.closest('.figure'); if(!fig) return;
    var panel = fig.querySelector('[id="' + g.getAttribute('data-detail') + '"]');
    if(!panel) return;
    var opening = panel.hidden;
    Array.prototype.forEach.call(fig.querySelectorAll('.ndetail'), function(p){ p.hidden = true; });
    Array.prototype.forEach.call(fig.querySelectorAll('.hasdetail'), function(n){ n.classList.remove('on'); });
    if(opening){ panel.hidden = false; g.classList.add('on'); }
  }
  document.addEventListener('click', function(e){
    var g = e.target.closest && e.target.closest('.hasdetail');
    if(g) toggle(g);
  });
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Enter' && e.key !== ' ') return;
    var g = e.target.closest && e.target.closest('.hasdetail');
    if(g){ e.preventDefault(); toggle(g); }
  });
})();
"""

def page(title: str, body: str, footer_lines: list[str]) -> str:
    foot = "<br>".join(esc(line) for line in footer_lines)
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{esc(title)}</title><style>{CSS}{DETAIL_CSS}</style></head><body>"
        f'<div class="wrap">{body}<div class="foot">{foot}</div></div>'
        f"<script>{DETAIL_JS}</script></body></html>"
    )

