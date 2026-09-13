---
name: task
description: >-
  Creates and maintains ONE living document per task, alive for the task's whole lifecycle —
  created at planning, then updated through building, merge and testing, and still the same
  document at the end. This is what gets reported at standup, so the current stage reads at a
  glance. Works in any repository — everything project-specific is read from bigpicture.config.json
  at run time. A member of the big picture family. Trigger on "task artifact", "standup", "what
  stage is this", "update the task doc", "record what I did", or when starting or finishing a task.
  For the permanent product architecture, use `architecture` instead.
---

# Task

A member of the **big picture** family — read `thebigpicture`'s SKILL.md for the laws every member
obeys, and for the cut between what belongs here and what belongs in the permanent `architecture`
document. This file is the task document's own contract.

**One artifact per task, alive for the whole task.** Not a PRE snapshot and then a separate POST
snapshot — one living document that moves through its stages and is still the same artifact, at the
same link, at the end.

This is the task progress document used at standup. The architecture artifact is continuous
background improvement; **this** is the thing he reads out.

## A change is not done until this artifact and the skill carry it

Automatic, not batched at the end. The moment a change lands, it is carried in two places or it is
not finished:

1. **this task artifact** — the stage, the new fact, the corrected claim;
2. **the skill that taught the old behaviour** — canonical `.claude/skills` only, never through
   `.agents`.

**Why not at the end:** batching is how it gets lost. The session that made the change is the only
one that knows why, and a skill still teaching superseded behaviour is actively wrong from the
moment the change lands — every later agent reads it and repeats what you just fixed. If it was
worth changing, it was worth carrying.

## Visual-first contract

The artifact is a **system-design canvas with a small amount of supporting text**. The first
viewport must answer, visually: where the task is, what exists now, what changes, and what proves
success.

- Lead with the lifecycle stepper and one primary flow: **current → change → resulting system**.
- Use nodes, typed arrows, swimlanes, state transitions, gates, and compact evidence tiles.
- Put failure/recovery paths on the diagram instead of burying them in paragraphs.
- Keep prose to labels and short annotations. A card gets at most two short sentences; detailed
  reasoning belongs in its drill-down or attached task doc.
- Show proposals with a distinct visual treatment from shipped facts. Never let a planning render
  look implemented.
- Prefer one legible architecture flow over a stack of narrative sections. Tables are reserved for
  exact comparisons or measurements.

## Explanation belongs ON the node, not under the page

> **APPROVED BY BHARGAV, 2026-09-04.** The `i` button on a node and its clickable bullet panel
> are ratified — "the i button and clicable bulet point is good". This is settled, not a
> proposal. Do not revert to prose cards, do not add a separate explainer section, and do not
> ask again whether diagrams-first is wanted.
>
> **STANDING RULE from the same exchange:** every change he approves is written into this skill
> in the SAME turn it is approved. Not batched, not "at the end". An approval that lives only in
> a session transcript is lost the moment the session ends, and the next agent rebuilds the thing
> he just rejected.


**Ruled 2026-09-04, by Bhargav, after reading an artifact he could not use.** The failure was
not that the answers were wrong — they were correct and verified. It was that eight explanations
arrived as prose cards stacked below the diagrams, and *"can't comprehend all the verbose texts
you write"*. An artifact nobody can read is not a deliverable.

So:

- **Maximum in diagrams.** Prose is the exception, and a paragraph is a smell.
- **A node explains ITSELF.** Give a node a `detail`: a LIST of short bullets. The renderer draws
  an `i` dot on it, makes it clickable and keyboard-focusable, and opens the bullets **inside that
  same figure**, directly under the picture.
- **No new tab, no new section, no separate explainer page.** The whole point is that the reader
  never holds a picture on one screen and its explanation on another. One panel open at a time per
  figure, so the page cannot silently grow back into a wall of text.
- **`detail` must be a list.** A string fails the render, deliberately — if an explanation needs a
  paragraph, the diagram is not carrying its weight and the fix is a better diagram, not longer prose.

```jsonc
{ "id": "runner", "label": "stream runner + merge", "col": 1, "lane": 0, "kind": "change",
  "detail": [
    "A session event may contain only the fields changed by that event",
    "A session snapshot returns the complete current state",
    "Replacing state with a partial event can erase unchanged fields"
  ] }
```

Bullets are the unit. One fact each, no sub-clauses, no narrative. If a bullet needs a "because",
it is two bullets or it is a node on the diagram.

**When the user asks what a term means, the answer goes on the node that term names** — never as a
new card. That is the whole rule, and it is why `exists` / `did` cards should stay to a line or two:
they carry the narrative, not the teaching.

### Bullets and numbers everywhere else, too

The node rule above is not just for diagrams. **Every** section is bullets:

- `exists`, `did`, `proposals`, `unanswerable` — `body` is a **LIST**, not a string. Five bullets
  max per card, and the renderer caps a bullet at **95 characters**; over that it FAILS the build.
  A bullet needing a sentence is two bullets. A bullet needing a paragraph means the diagram is
  not carrying its weight.
- Card titles under ~62 characters. The title is a label, not a summary.
- `measurements` are where numbers live, and they should be *dense*: the figure, the unit, and the
  comparison. Include **time and space complexity as rows** for anything on a hot path —
  `O(f) — f = fields per message, typically 1` beats a paragraph about efficiency.
- Caveats: one sentence. If a caveat needs three, the measurement is not ready to publish.

The test is whether the page can be *scanned*. Numbers, pictures and bullets — in that order.
Prose is what you write when you have not worked out the number yet.

### The artifact keeps moving after merge

`merged` is not the end. **`/post-merge-verify` produces the `tested` stage**, and its findings —
what was verified on the local runtime, what regressed, what could not be exercised because
the path was activity-gated — go back into this same artifact at the same URL. A task artifact
that stops at `merged` is a document that never says whether the thing actually worked.

## Big-picture diagrams only

> **RULED 2026-09-06 by the document's owner:** *"Include the big picture diagrams only.
> Change this to only show the big picture diagrams, not HLDs and LLDs."* This supersedes
> the earlier HLD-before/after and LLD-before/after requirement. Do not add HLD or LLD
> figures to a task document, and do not ask again whether the detailed pairs are wanted.
> Detail levels are the `architecture` skill's job, and they live there.

A big-picture diagram shows the whole path at the granularity a stakeholder reads at
standup: the surfaces a user touches, the seams between them, the store that holds
the result, and the gate that can refuse. It answers *what happens, in what order,
and what changes* — not which branch inside one hop counts a failure.

Every render must include at least:

1. a stage/lifecycle visual;
2. **one primary big-picture flow**: current path → the change → the resulting system,
   with proposals visually distinct from shipped facts;
3. **further big-picture figures only when they show a different whole** — a second
   surface, a second delivery path, a state lifecycle, or the build order. Never a
   before/after pair of the same subsystem and never a single hop opened up;
4. a recovery or failure-path visual when the task has one;
5. evidence tiles whose numbers include instrument, window, population, and caveat.

`visuals.extraFlows` still renders directly after `primaryFlow`; use it for the extra
big-picture figures above, not for detail levels.

**Draw review findings onto the diagram.** A defect raised against the change belongs
on the big-picture flow as its own marked node, next to the hop it breaks — not only in
prose below. "This counter mis-attributes a database outage" is a sentence; an arrow
from `resolver DB failure` into `outcome=unlinked` is the finding. If a finding needs a
hop opened up to be seen, that detail belongs on the node's `i` bullets or in the PR
review, not as an LLD figure.

## The two beats it moves through

- **Early (planning):** *"Here is what exists in the system today. Here are the changes I propose to
  make."* Forward-looking. **Not** "I worked on something."
- **Later (building → merged → tested):** *"Here is what I did."* Concise.

Same artifact throughout. You **update** it; you never mint a second one for the same task.

## Stage is the headline

`stage` must be one of `stages` — the renderer refuses to build otherwise, because a stage that is
not a real point in the lifecycle cannot be reported. Default lifecycle:

```
planning  →  building  →  merged  →  tested
```

It renders as a stepper: completed stages green, the current one filled. Add a `stageNote` saying
what is actually true right now — especially *"nothing has been built yet; every proposal is
awaiting go-ahead"*, which is the single most misread thing at standup.

**Update the stage when it changes.** A task artifact still saying `planning` after the PR merged is
worse than no artifact.

## What belongs here, and what does not

This artifact holds the **narrative**. Durable facts about how the system works belong in
`architecture-artifact` and outlive this task.

| what | where |
|---|---|
| the question asked, and its framing | **task artifact** |
| measurement tables, instrument/window/population | **task artifact** |
| what I propose to change | **task artifact** |
| what I did, once done | **task artifact** |
| the stage | **task artifact** |
| "the placement path is synchronous", "this route is 78% 404s" | architecture |

Cutting along that line is the whole point. Get it wrong and either the architecture fills with
stale task chatter, or it loses the findings when the task closes.

## Connect it to the architecture — a link, not an index

Set `architecture.readBranches` and `architecture.wroteBranches` to the branch ids this task read
and changed, and set `provenance.lastTouchedBy` on those architecture nodes to this task's id. That
gives provenance both ways. **Do not over-build it** — a link and a "last touched by" is worth more
than a bidirectional index nobody maintains.

## Issue or task reference — resolve rather than guess

Use optional `ticket: {url, title}` for an existing task or user-provided issue.
Resolve an exact identity; with no linked issue the renderer explicitly says so. Persist
this reference in the task JSON so later revisions keep it. Do not invent a ticket or write
links to external systems as part of rendering.
New documents always require `visuals.primaryFlow`; no legacy exemption is inherited.

## Fields

```jsonc
{
  "schema": "task.artifact.v1",        // legacy <project>.task-artifact.v1 is still read
  "id": "session-recovery",          // file name and artifact slug
  "title": "...", "source": "<where the task came from>",
  "ticket": {"url": "<resolved task or issue URL>", "title": "<exact title>"},
  "opened": "2026-09-02",
  "stage": "planning",
  "stages": ["planning","building","merged","tested"],
  "stageNote": "what is actually true right now",
  "thesis": "the one sentence he reads out",
  "architecture": { "readBranches": [...], "wroteBranches": [...], "note": "..." },
  "visuals": {
    "primaryFlow": { "nodes": [...], "edges": [...] },
    "stateFlow": { "nodes": [...], "edges": [...] },
    "legend": [{ "id": "current|change|recovery|gate", "label": "..." }]
  },
  "exists": [...],          // what exists today
  "unanswerable": [...],    // what you could NOT determine — never omit this
  "proposals": [...],       // what you propose to change (planning)
  "did": [...],             // what you actually did (later stages)
  "measurements": [ { "title","instrument","window","population","caveat","rows":[{k,v,pct}] } ]
}
```

`instrument`, `window` and `population` are **required** on every measurement — the renderer rejects
a number without them, because a figure with no instrument is not evidence.

## Evidence discipline

- **No guessed numbers.** A latency or volume claim needs an instrument, a window and a population.
- **Both terms of any difference must share a clock and a population.** If they do not, say so and
  **do not subtract** — publish the two figures separately.
- **Publish "unanswerable" rather than a proxy.** If the data cannot answer it, that is the finding.
- **Prefer a range to a false precision.** Coarse histogram buckets give you "between 2 and 5
  seconds", not an interpolated median — publish the range.
- **Keep proposals distinct from implementation.** Proceed within the user-authorized task scope;
  a request for planning alone does not authorize implementing a proposal.

## Render, verify, publish

Author `<tasks dir>/<id>.json`, then render and check:

```bash
SKILL=<this skill directory>
python3 $SKILL/scripts/render_task.py <task-id> [out.html]
python3 $SKILL/scripts/check_task.py
```

The tasks directory comes from `bigpicture.config.json` — `tasksDir` if set, otherwise
`<authoring dir>/tasks`; `$BIGPICTURE_TASKS` overrides. It is resolved by the same shared
`config.py` the `architecture` skill uses, so both documents agree on where the project is
and which checkout `file:line` references resolve against.

The renderer fails hard rather than degrading, because a partially-rendered document reads
as a complete one. It rejects a measurement with no instrument, a non-HTTPS source link, and
a schema it does not recognise.

Verify locally with the available browser. Preserve one stable title and one artifact id for
this task through planning → building → merged → tested. Publish a fresh clean bundle
containing `index.html` and the task JSON; revisions require the recorded artifact id and
expected version — the publish surfaces and their identities come from `bigpicture.config.json`,
and the rules are the same ones in `../thebigpicture/references/publishing.md`.
Retain the same local HTML path when no publish surface is configured.
Open the render in Codex's available panel/browser or Claude's available browser/platform
opener. On headless systems return the absolute file path and state the visual limitation.

No external publishing service or Notion board is required. Local runtime and browser
checks replace remote deployment checks; `staging` is a branch, not a separate environment.
