---
name: architecture-artifact
description: >-
  Owns and maintains THE architecture of a whole product — one long-lived artifact per project, not
  one per task: system design, module and submodule diagrams, and a navigable map of how the pieces
  actually connect, every claim backed by file:line. Every task reads it before starting and writes
  back into it: extended modules, deeper submodules, and corrections to what earlier agents got
  wrong. Works in any repository — everything project-specific is read from architecture.config.json
  at run time. Trigger on "architecture artifact", "architecture of X", "system design", "flow
  chart", "how does X work", "diagram our architecture", "add this to the architecture", "correct
  the architecture", or any task asking how a subsystem actually behaves. For the per-task standup
  document, use a task-artifact skill instead.
---

# Architecture Artifact

**One artifact per project, forever.** Not one per task. Same identity for its entire life. Every
task reads it before starting and writes back into it afterwards.

Nothing in this skill names a project. The authoring directory, the source checkout and the publish
identities all come from `architecture.config.json` at run time — see **Resolve the project** below.
A repository that has no artifact yet gets one from `scripts/init_project.py`.

## Not ground truth — a set of prior assertions to be tested

**Do not assume this artifact is right.** It is written by agents, so read every scene as a claim a
previous agent made, dated, that may since have stopped being true. Verify a claim against current
code and live state BEFORE you rely on it, and where it is wrong, correcting it is part of the job
you are already doing — not a separate task to raise and defer. "One artifact, forever" is an
identity rule; it is not a claim that the contents are settled.

**The failure mode:** a previously true call-site or dependency claim survives a later merge and
becomes the premise of new work. A resolving `file:line` does not establish that its interpretation
is still correct — the refs still resolve. Only re-measuring catches it.

**This skill's own claims are dated assertions too.** It has previously asserted renderer features
that did not exist, and an author who followed those sentences got silence rather than a chip.
Probe the runtime (below) before authoring against a field.

**Update the artifact when:**

1. **A PR merges.** Merge is the moment reality moved, so the map is stale from that instant. Do not
   wait for someone to notice.
2. **Someone asks.**

**Correct rather than route around.** If a scene is wrong and you only need it right for your own
task, fixing it in your head leaves the next reader with the same trap. Record the correction; the
superseded claim stays visible beside what replaced it. Update `provenance.verifiedAgainstCode`
whenever you re-check a scene, even when nothing changed — that is how a later reader tells "still
true" from "nobody has looked since".

## The HLD contract — the whole system, then every module and submodule

The artifact is a set of **high-level designs**: one for the system, one per module, one per
submodule that carries its own responsibility. Depth IS the hierarchy — a flat wall of cards fails
the artifact even when every sentence is correct.

- **The system HLD is the landing view**, at the coarsest useful grain: the picture someone needs
  before they can ask a sensible question about any one part.
- **Every module gets its own HLD**: what it is responsible for, what it depends on, what depends on
  it, and where a unit of work can die inside it.
- **Stop splitting** when a further split would not change what a reader does next.
- **Drill-down is a scene change WITHIN the one document** — never a link out to a sibling artifact,
  never a second artifact id.
- Show happy path, failure path and recovery path as separate lanes when they differ.
- Keep copy compact: a label, a short summary, optional drill-down detail. Long reasoning points at
  the owning task artifact.
- Proposed work stays in the task artifact. This document holds deployed facts and clearly marked
  current gaps only.

### Topology is required, not optional

A document of sequential step-cards with no boxes and no arrows is not an architecture, however
correct each sentence is. The reconciliation is **both**, not either:

- **Story map** — any scene whose every step carries `open` renders as a system map instead of
  cards: lanes become columns, steps become module boxes, `open` becomes the click-through. It is a
  RULE on the data, so it fires automatically on new scenes of that shape.
- **"How it connects"** — a neighbour graph above the lanes on any scene with cross-module edges.
- **`moduleEdges`** — authored `{from, to, rel, label, evidence}` between HLD ids, and **evidence is
  validated like every other ref**. A wrong arrow is worse than a missing one, because it teaches
  the reader something false: an edge without evidence does not ship.
- **`resourceType` / `kind` at HLD level** — the map boxes read these; step-level tags do not reach
  them. Absent is honest; wrong is a false claim at the most visible point in the document.

Lanes remain the drill-down and still carry the evidence.

### Extend existing owners first

The big picture describes the project's major responsibilities. A request to explain more detail
normally **deepens** those responsibilities rather than adding a new top-level box.

1. Read the system HLD and drill into the relevant existing modules. Map each requested
   responsibility to its current owner before adding a scene.
2. Extend the deepest scene that already owns the behaviour. Add a child only when it has a
   distinct responsibility worth opening separately; reuse an existing child when it fits.
3. When a flow spans modules, put each detail with its owner and connect those owners with
   evidence-backed edges. A guided journey references those same modules from an existing flow; it
   does not become another owning subsystem.
4. Add a top-level module only when verified architecture reveals a distinct major responsibility
   that existing modules cannot represent accurately. Record its boundary, its dependencies, and
   why an existing owner cannot contain it.
5. When consolidating, retain evidence and corrections, update containment and navigation together,
   and redirect retired scene links to their new owners with `sceneAliases`.

**Completion check:** every added detail is reachable through its owning big-picture flow; each
responsibility has exactly one owning scene; each new top-level module has a boundary
justification. Count new responsibilities, not tasks.

## Resolve the project

```bash
SKILL=<this skill directory>              # scripts/ lives beside this file
python3 $SKILL/scripts/init_project.py --repo <checkout> --name "<Title>"   # first time only
```

`architecture.config.json` sits beside `universe.json` in the authoring directory and holds the
project name, the source checkout, and the publish identities. Resolution order is documented in
`scripts/arch_config.py`; `$ARCHITECTURE_DIR` and `$ARCHITECTURE_REPO` override it. **Never hardcode
a host path, an artifact id or a published URL in this skill** — a skill is copied between machines
and repos; the data is not.

**Resolve the CANONICAL checkout, not the worktree you happen to be in.** `git worktree list
--porcelain` names it first. Every client — Claude Code, Codex, tm8 — edits that one authoring
directory. Coordinate one writer at a time.

## Probe the runtime before you author against it

The renderer is the authority on what a field does. Before authoring a field you have not used in
this project, check that something reads it:

```bash
grep -rn "resourceType\|moduleEdges\|sceneAliases\|shallow\|gaps" $SKILL/scripts/ | head
```

A field nothing reads is a no-op: setting it gives you silence, not a chip, and a reader who
believes this file rather than the code loses a session to it. If the capability is genuinely
missing, repair that concrete gap in the runtime rather than hand-assembling another artifact.

## Workflow

1. **Read the existing artifact first.** That is the point of it — do not re-derive a subsystem
   someone already mapped. Reconcile it with whatever prose docs the repo actually has; inspect
   paths before trusting any cached inventory.
2. **Trace from code, not memory.** Name files and line numbers. State sync or async per hop.
   **Verify what a field actually is — never trust its name.** (A `created_at` may be stamped at
   persistence, not at the user action it appears to describe.)
3. **Measure, or say you cannot.** A number ships with the command that produced it and the date it
   was produced. If it cannot be measured, say so on the scene; never substitute a proxy.
4. **Apply "Extend existing owners first"**, then author the scene.
5. **Correct what you find wrong** — all five correction fields are required, and the renderer
   refuses to build without them, because a correction that does not say what was wrong is not one.
6. **Set `provenance.lastTouchedBy`** to your task id on every scene you add or revise.
7. **Render and validate:**
   ```bash
   python3 $SKILL/scripts/render_universe.py <out.html>
   python3 $SKILL/scripts/check_hlds.py
   ```
   The render fails hard on a missing file, a line past EOF, an unresolved parent, drill-down or
   edge, an unknown relation, an incomplete correction, or a text field over its cap.
8. **Verify in a browser** (below), then publish.

## Depth honesty

Say what you left shallow rather than levelling everything down. A truthful *"this seam has four
boxes and here is all we know"* beats twenty plausible ones. **Never invent internals to make a
branch look finished.**

Two mechanisms, both real and both checked by the validator:

- **`gaps`** — a list of strings on an HLD, rendered under **Coverage limits** in its evidence
  panel. Scene-level: what this diagram does not cover.
- **`shallow: true`** — on an HLD or on a step. Draws an orange uppercase `SHALLOW` chip beside the
  title or on the card. Point-level: this specific box is thin. Anything other than a JSON boolean
  fails the render and names the offender.

## Verify, never assume

Render against current source first, then open the built page in a real browser and exercise
system → module → submodule navigation, parent/back navigation, detail clicks and keyboard
activation. Check desktop and mobile widths: wide diagrams scroll inside their own figure, never
the whole body. Read console errors. Inspect the rendered DOM against the parsed authored data —
**a string count over the built page is not visual QA**, and it will lie to you in both directions
(the whole document is embedded in every scene, so a probe "finds" content that is not on screen).

If browser tools are unavailable, report the render as generated but visually unverified.

## Publish

The full contract — surfaces, identity preservation, lockstep, share pins, the unwrap step and the
mistakes that have actually cost revisions — is in `references/publishing.md`. Read it before your
first publish in a project. Three rules that are not negotiable:

- **Publish to the ids recorded in the config/status file, never to a fresh one.** A bare publish
  mints a new link while the old one keeps working and keeps being wrong — worse than broken,
  because nobody notices.
- **Recover before you mint.** "I cannot see a URL" is not "there isn't one". List the surface and
  match on the TITLE, which is why the title must stay byte-stable.
- **Surfaces move together, and an unreachable surface is reported, not silently skipped.** If one
  surface cannot be published — no credentials, a different account, a dead node — publish the ones
  you can, record the blocked one with the reason and what is needed to unblock it, and say plainly
  which surfaces advanced and which did not. Never report "the architecture is updated" when one
  surface is still stale, and never let one blocked surface freeze every publish.

## Searching and reporting: hazards that have cost real results

`references/hazards.md` has the full list with the measurements behind each one. The two that cost
the most:

- **A string probe over a rendered blob is not a content check.** It fails absent (escaping, case,
  wording) and it fails present (a phrase inside a superseded `corrections.was` is the mechanism
  working, not a regression). Parse the DATA and check the field.
- **Never narrate a command's result in the same message that runs it.** A batch that prints
  "patched" and then raises before writing has patched nothing; a loop ending `&& echo OK || echo
  FAIL` is a check only if somebody reads what it printed. Run it, read what came back, then write
  the sentence. If a report says "verified", the verifying already happened in a previous turn.

## Detail bullets, not prose blocks

A step carrying a `detail` list of SHORT BULLETS becomes clickable and opens those bullets inside
its own figure. No separate explainer section, no new tab. `detail` must be a list — a string fails
the render on purpose, because an explanation that needs a paragraph means the diagram is not
carrying its weight.

Maximum in diagrams. Prose is the exception.

## References

| File | What it settles |
|---|---|
| `references/format.md` | The field-by-field data contract for `universe.json` |
| `references/publishing.md` | Surfaces, lockstep, share pins, the unwrap step |
| `references/hazards.md` | Search and verification failures, with their measurements |
| `scripts/arch_config.py` | Project resolution order |
