#!/usr/bin/env python3
"""Render ONE task artifact — the living standup document for a single task.

    python3 render_task.py <task-id> [out.html]

Source of truth: `<authoring dir>/tasks/<task-id>.json`. The authoring directory is
resolved by the shared config module, never hardcoded, so this renders a task in
any project. See the `task` skill's SKILL.md for the document contract.

This renderer
implements the CURRENT visual-first contract: a stage visual, a current-state
system flow, a delta overlay, a recovery lane where the task has one, and
evidence tiles that carry their instrument. It fails hard rather than degrading,
because a partially-rendered artifact reads as a complete one.
"""

from __future__ import annotations

import json
import pathlib
import sys

import bootstrap  # noqa: F401  — puts <plugin>/shared on sys.path; must come first
import config  # noqa: E402

from render_common import (  # noqa: E402
    esc,
    fail,
    find_repo,
    page,
    render_flow,
    render_field_mappings,
    render_measurement,
)

# Where task artifacts live. Resolved at call time rather than import time so a test
# or a caller that sets $BIGPICTURE_DIR after import still gets the right directory.
TASK_SCHEMA = "task.artifact.v1"


def tasks_dir() -> pathlib.Path:
    return config.find_tasks_dir()



def normalize_source_links(raw: object) -> list[tuple[str, str]]:
    """Accept both authored shapes and return [(title, url)].

    Two shapes exist in real data and both are reasonable:
      - a mapping  {"title": "https://…"}
      - a list of  {"title": …, "url": …}
    The list form was what this renderer knew; the mapping form is what another
    renderer in the same family wrote. Iterating a mapping yields its KEYS, so the
    old code called .get on a string and died with an AttributeError that named
    neither the file nor the field. Normalising is not leniency — the HTTPS gate
    below is unchanged — it is refusing to let one project's artifacts stop
    rendering over a shape nobody documented as wrong.
    """
    if not raw:
        return []
    if isinstance(raw, dict):
        pairs = [(str(title), str(url)) for title, url in raw.items()]
    elif isinstance(raw, list):
        pairs = []
        for item in raw:
            if not isinstance(item, dict) or "url" not in item:
                fail(f"sourceLinks entry is not a {{title, url}} object: {item!r}")
            pairs.append((str(item.get("title") or item["url"]), str(item["url"])))
    else:
        fail(f"sourceLinks must be a mapping or a list, got {type(raw).__name__}")
    for title, url in pairs:
        if not url.startswith("https://"):
            fail(f"sourceLinks must use HTTPS URLs — {title!r} is {url!r}")
    return pairs


def cards(items: list, klass: str = "") -> str:
    """Cards from either plain strings or {title, body, chip} objects."""
    out = []
    for item in items:
        if isinstance(item, str):
            out.append(f'<div class="card {klass}"><p>{esc(item)}</p></div>')
            continue
        chip = (
            f'<span class="chip {esc(item.get("chipKind", "proposed"))}">'
            f'{esc(item["chip"])}</span>'
            if item.get("chip")
            else ""
        )
        # BULLETS ARE THE UNIT (ruled 2026-09-04). A card body is a LIST of short
        # facts, one per line. A string still renders — legacy entries exist — but a
        # paragraph in a card is the thing this document is trying to stop being.
        raw = item.get("body")
        if isinstance(raw, list):
            body = "<ul>" + "".join(f"<li>{esc(str(b))}</li>" for b in raw) + "</ul>"
        elif raw:
            body = f"<p>{esc(raw)}</p>"
        else:
            body = ""
        out.append(
            f'<div class="card {klass}"><h3>{esc(item.get("title", ""))}{chip}</h3>{body}</div>'
        )
    return f'<div class="grid g2">{"".join(out)}</div>'


def handoff_sections(sections: list) -> str:
    """Standalone, hand-off-able sections (added 2026-09-11, task 01a0886f-0586-7258-9ded-f7609d8a681a).

    Each section is meant to be read WITHOUT the rest of the artifact (e.g. copied to a
    spec author), so it allows short paragraphs and numbered lists, and keeps evidence in
    a collapsed footnote. Contract: {title, intro?, blocks:[{heading, paragraphs?:[str],
    items?:[{id, topic, a, b, why, question}], bullets?:[str], numbered?:[str]}], footnote?:[str]}.
    Every string is escaped; nothing is markdown-rendered.
    """
    out = []
    for sec in sections:
        for key in ("title", "blocks"):
            if not sec.get(key):
                fail(f"handoffSections entry is missing '{key}'")
        out.append(f'<section class="handoff"><h2>{esc(sec["title"])}</h2>')
        if sec.get("intro"):
            out.append(f'<p class="handoff-intro">{esc(sec["intro"])}</p>')
        for blk in sec["blocks"]:
            out.append(f'<h3>{esc(blk.get("heading", ""))}</h3>')
            for para in blk.get("paragraphs", []):
                out.append(f"<p>{esc(para)}</p>")
            items = blk.get("items", [])
            if items:
                out.append('<div class="scroll"><table class="handoff-table"><thead><tr>'
                           '<th>ID</th><th>Topic</th><th>ChatGPT rendering says</th>'
                           '<th>Claude rendering says</th><th>Why it matters</th><th>Question</th></tr></thead><tbody>')
                for it in items:
                    for k in ("id", "topic", "a", "b", "why", "question"):
                        if k not in it:
                            fail(f"handoff item {it.get('id', '?')} is missing '{k}'")
                    out.append("<tr>" + "".join(f"<td>{esc(it[k])}</td>" for k in ("id", "topic", "a", "b", "why", "question")) + "</tr>")
                out.append("</tbody></table></div>")
            if blk.get("bullets"):
                out.append("<ul>" + "".join(f"<li>{esc(b)}</li>" for b in blk["bullets"]) + "</ul>")
            if blk.get("numbered"):
                out.append("<ol>" + "".join(f"<li>{esc(b)}</li>" for b in blk["numbered"]) + "</ol>")
        if sec.get("footnote"):
            out.append('<details class="handoff-foot"><summary>Evidence footnote (file:line, internal ids)</summary><ul>'
                       + "".join(f"<li>{esc(f)}</li>" for f in sec["footnote"]) + "</ul></details>")
        out.append("</section>")
    return "".join(out)


def stepper(stage: str, stages: list[str], note: str | None) -> str:
    if stage not in stages:
        fail(
            f"stage '{stage}' is not one of {stages} — a stage that is not a real point "
            "in the lifecycle cannot be reported"
        )
    idx = stages.index(stage)
    steps = []
    for i, s in enumerate(stages):
        klass = "done" if i < idx else ("now" if i == idx else "")
        steps.append(f'<span class="step {klass}"><i class="dot"></i>{esc(s)}</span>')
        if i < len(stages) - 1:
            steps.append('<span class="step-sep">&rarr;</span>')
    note_html = f'<div class="stagenote">{esc(note)}</div>' if note else ""
    return f'<div class="stepper">{"".join(steps)}</div>{note_html}'


def main() -> None:
    if len(sys.argv) < 2:
        fail("usage: render_task.py <task-id> [out.html]")
    task_id = sys.argv[1]
    src = tasks_dir() / f"{task_id}.json"
    if not src.exists():
        fail(f"no task source at {src}")
    data = json.loads(src.read_text())

    # The canonical schema is `task.artifact.v1`. Projects that started before the
    # family had one wrote `<project>.task-artifact.v1`; those are still read, because
    # refusing to render a project's existing artifacts is not a migration, it is a
    # broken tool. New artifacts get the canonical name.
    schema = data.get("schema")
    if not (schema == TASK_SCHEMA or (isinstance(schema, str) and schema.endswith(".task-artifact.v1"))):
        fail(f"unexpected schema {schema!r} — expected {TASK_SCHEMA!r}")
    for field in ("id", "title", "stage", "stages", "thesis"):
        if not data.get(field):
            fail(f"task artifact is missing required field '{field}'")

    # LEGACY GRANDFATHERING (ruled 2026-09-04). Two artifacts — bet-timing and
    # per-sport-score-architecture — were authored BEFORE the visual-first contract
    # required a primaryFlow, and they never had flows to lose. Erroring on them made
    # them unrenderable, which makes a task artifact a dead document whatever its
    # stage says. So `legacy: true` lets them render, and the page SAYS SO.
    #
    # The gate is an EXPLICIT flag, never inferred from "visuals is missing". An
    # inferred rule would silently readmit every future omission and quietly retire
    # the contract; a new task artifact with no primaryFlow must still fail here.
    # Authoring flows for these two is off the table — nobody invents a diagram for
    # a task they did not run — so the flag is a permanent statement about those
    # files, not a to-do.
    legacy = data.get("legacy") is True
    visuals = data.get("visuals") or {}
    if not visuals.get("primaryFlow") and not legacy:
        fail(
            "visuals.primaryFlow is required — the visual-first contract needs a "
            "current-state system flow in the first viewport"
        )

    body: list[str] = []
    body.append('<style>.handoff{margin:28px 0;padding:18px 20px;border:2px solid var(--gate,#c47a1c);border-radius:10px}.handoff h2{margin-top:0}.handoff h3{margin:18px 0 6px;font-size:15px}.handoff p{font-size:13.5px;line-height:1.55;margin:6px 0}.handoff-table{border-collapse:collapse;font-size:12.5px;min-width:1100px}.handoff-table th,.handoff-table td{border:1px solid var(--line-2,#ccc);padding:6px 8px;vertical-align:top;text-align:left}.handoff-table th{font-weight:600}.handoff ol li,.handoff ul li{font-size:13px;line-height:1.5;margin:3px 0}.handoff-foot{margin-top:10px;font-size:12px}.handoff-foot li{font-size:11.5px}</style>')
    body.append(f"<h1>{esc(data['title'])}</h1>")
    # The meta line is assembled as already-escaped HTML fragments rather than one
    # escaped string, because the Notion ticket is a LINK and `esc` would render
    # the anchor as visible markup. Every fragment is escaped at the point it is
    # built; nothing untrusted reaches this list unescaped.
    #
    # The ticket slot is NEVER omitted. A silently absent link is indistinguishable
    # from a link the renderer dropped, and this document is read at standup — so a
    # task with no ticket says so, in words.
    ticket = data.get("notionTicket") or {}
    ticket_url = (ticket.get("url") or "").strip()
    ticket_title = (ticket.get("title") or "").strip()
    if ticket_url:
        label = esc(ticket_title or "Notion ticket")
        ticket_html = f'<a href="{esc(ticket_url)}">{label}</a>'
    else:
        ticket_html = '<span class="no-ticket">no Notion ticket</span>'

    meta_parts = [
        esc(data["source"]) if data.get("source") else None,
        ticket_html,
        esc(f"tm8 {data['tm8Task']}") if data.get("tm8Task") else None,
        esc(f"opened {data['opened']}") if data.get("opened") else None,
    ]
    meta = " · ".join(part for part in meta_parts if part)
    if meta:
        body.append(f'<p class="sub">{meta}</p>')
    links = normalize_source_links(data.get("sourceLinks"))
    if links:
        body.append('<p class="sub">' + ' · '.join(
            f'<a href="{esc(url)}">{esc(title)}</a>' for title, url in links
        ) + '</p>')
    if legacy:
        # VISIBLE on the page, not just a json field: a reader must see that this
        # predates the visual contract without opening the source.
        body.append(
            '<p class="legacy">LEGACY · authored before the visual-first contract. '
            "It has no system flow because it never had one — flows were not "
            "reconstructed, because inventing a diagram for a task nobody re-ran is "
            "how a wrong claim enters a document.</p>"
        )
    body.append(stepper(data["stage"], data["stages"], data.get("stageNote")))
    body.append(f'<p class="thesis">{esc(data["thesis"])}</p>')

    legend = visuals.get("legend")
    # Opt-in comparison layout; legacy task renders retain their existing layout.
    paired = visuals.get("sideBySidePairs") is True
    if paired:
        body.append('<style>.flow-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start}.flow-pair .figure{min-width:0}.flow-pair .figure>.scroll>svg{width:100%;height:auto;min-width:420px}.flow-pair .figure>.scroll{padding:10px}.flow-pair .legend{font-size:10px}.wrap{max-width:1440px}.field-group>.scroll{overflow-x:auto;max-width:100%}.grid>*{min-width:0}.row .v{white-space:normal;text-align:right;overflow-wrap:anywhere}.sub{overflow-wrap:anywhere}@media(max-width:950px){.flow-pair{grid-template-columns:1fr}}</style>')
    big_before = visuals.get("bigPictureBefore")
    big_after = visuals.get("bigPictureAfter")
    if bool(big_before) != bool(big_after):
        fail("Big picture requires both BEFORE and AFTER figures")
    if big_before and big_after:
        body.append("<h2>Big picture · what the product needs and what changes</h2>")
        if paired:
            body.append('<div class="flow-pair">')
        for big in (big_before, big_after):
            body.append(render_flow(big, big.get("caption", "Big picture"), legend))
        if paired:
            body.append('</div>')
    if data.get("fieldMappings"):
        body.append(render_field_mappings(data["fieldMappings"]))
    # A legacy artifact has no flows at all, so the whole visual section is skipped
    # rather than emitted as an empty heading — a heading over nothing reads as a
    # rendering fault, which is the opposite of what the legacy banner just said.
    if visuals.get("primaryFlow"):
        body.append("<h2>The system, and what changes in it</h2>")
        body.append(
            render_flow(
                visuals["primaryFlow"],
                visuals["primaryFlow"].get("caption", "Current path, and the delta this task applies"),
                legend,
            )
        )
    # extraFlows FIRST, so a before/after pair renders adjacent. A reader comparing
    # two states of one subsystem must not have an unrelated diagram between them.
    for extra in visuals.get("extraFlows", []):
        body.append(render_flow(extra, extra.get("caption", "Detail"), legend))
    for pair in visuals.get("flowPairs", []):
        if not pair.get("before") or not pair.get("after"):
            fail("flowPairs requires a before and an after figure")
        body.append(f'<h2>{esc(pair.get("title", "Before / after"))}</h2>')
        body.append('<div class="flow-pair">' if paired else '<div>')
        for flow in (pair["before"], pair["after"]):
            body.append(render_flow(flow, flow.get("caption", "Detail"), legend))
        body.append('</div>')
    if visuals.get("stateFlow"):
        body.append(
            render_flow(
                visuals["stateFlow"],
                visuals["stateFlow"].get("caption", "State transitions"),
                legend,
            )
        )
    if visuals.get("recoveryFlow"):
        body.append(
            render_flow(
                visuals["recoveryFlow"],
                visuals["recoveryFlow"].get("caption", "Failure and recovery path"),
                legend,
            )
        )

    if data.get("handoffSections"):
        body.append(handoff_sections(data["handoffSections"]))
    if data.get("exists"):
        body.append("<h2>What exists today</h2>")
        body.append(cards(data["exists"]))
    if data.get("proposals"):
        body.append("<h2>Proposed changes &mdash; not built</h2>")
        body.append(cards(data["proposals"], "change"))
    if data.get("did"):
        body.append("<h2>What was actually done</h2>")
        body.append(cards(data["did"], "done"))
    if data.get("unanswerable"):
        body.append("<h2>Could not be determined</h2>")
        body.append(cards(data["unanswerable"], "gap"))

    if data.get("measurements"):
        body.append("<h2>Evidence</h2>")
        tiles = "".join(render_measurement(m) for m in data["measurements"])
        body.append(f'<div class="grid g2">{tiles}</div>')

    arch = data.get("architecture") or {}
    if arch:
        read = ", ".join(arch.get("readBranches", [])) or "—"
        wrote = ", ".join(arch.get("wroteBranches", [])) or "—"
        body.append("<h2>Link to the architecture universe</h2>")
        body.append(
            f'<div class="card"><p><b>read</b> <span class="mono">{esc(read)}</span><br>'
            f'<b>wrote</b> <span class="mono">{esc(wrote)}</span></p>'
            + (f"<p>{esc(arch['note'])}</p>" if arch.get("note") else "")
            + "</div>"
        )

    repo = find_repo()
    footer = [
        f"source  {src}",
        f"renderer  {pathlib.Path(__file__).resolve()}",
        f"repo  {repo if repo else 'not resolved ($BIGPICTURE_REPO unset, cwd outside a checkout)'}",
        f"stage  {data['stage']}",
    ]
    if data.get("portable") is True:
        footer = [f"source tasks/{task_id}.json", "renderer architecture/render_task.py",
                  f"stage {data['stage']}"]
    out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else tasks_dir() / f"{task_id}.html"
    out.write_text(page(data["title"], "".join(body), footer))
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
