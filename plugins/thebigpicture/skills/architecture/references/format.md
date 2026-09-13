# The data contract for `universe.json`

The renderer is the authority. Everything below is enforced by
`scripts/render_universe.py` (`validate_hlds`) and covered by `scripts/check_hlds.py`; a violation
fails the build and names the offender rather than degrading quietly. A renderer that degrades
quietly publishes a lie.

## Top level

| Field | Required | What it is |
|---|---|---|
| `schema` | no | `architecture.universe.v1` — informational |
| `hldSchema` | **yes** | must be exactly `architecture.hld.v1` |
| `title` | yes in practice | the document name. Becomes `<title>`, the browser tab and the gallery name. **Byte-stable for the life of the artifact** — it is the recovery key when a URL is lost |
| `brand` | no | short header label; `architecture.config.json`'s `brand` wins over it |
| `hldUpdatedAt` | no | date shown in the footer; renders as `unrecorded` when absent |
| `claudeArtifactUrl` | no | the canonical published URL, stored WITH the data so it cannot be separated from it |
| `verification` | no | `{codeRevision, scope, observations}` — shown in evidence panels |
| `planeMap` | no | `{ids, title, intro, linkLabel}` — an extra cross-module map over the named HLDs. Omit it and no plane scene or link exists |
| `hlds` | **yes** | the scenes. Non-empty; exactly one `root` with `parent: null` |
| `moduleEdges` | no | authored cross-HLD topology |
| `sceneAliases` | no | retired scene id → live HLD id |
| `nodes` / `edges` | no | a legacy node graph, kept as an evidence archive. Absent is normal for a project that started on the HLD contract |

## An HLD (a scene)

| Field | Required | Rule |
|---|---|---|
| `id` | yes | unique across `hlds`; must not collide with an archive node id or with `plane-map` |
| `parent` | yes | `null` for `root`, otherwise an existing HLD id. Cycles are rejected; every scene must reach `root` |
| `title` | yes | ≤ 60 characters |
| `summary` | yes | ≤ 140 characters |
| `inputs`, `outputs` | yes | non-empty lists — the responsibility boundary. A scene that cannot say what comes in and out is not a module |
| `provenance.verifiedAgainstCode` | yes | the date this scene was last checked against code |
| `provenance.lastTouchedBy` | convention | the task id that added or revised it |
| `lanes` | yes | non-empty |
| `evidence` | no | scene-level refs, validated |
| `gaps` | no | list of strings → **Coverage limits** in the evidence panel |
| `shallow` | no | JSON boolean only → a `SHALLOW` chip beside the title |
| `resourceType` | no | one of the resource vocabulary; puts a symbol on this HLD's box in map views |
| `kind` | no | one of the kind vocabulary; colours this HLD's box |
| `corrections` | no | see below — all five fields required |
| `timing` | no | free string shown in the evidence panel |
| `sourceIds` | no | archive node ids surfaced inside this scene's evidence section |

## A lane

| Field | Rule |
|---|---|
| `kind` | `main`, `failure` or `recovery` |
| `label` | ≤ 60 characters |
| `steps` | **1 to 5**. More than five means the lane is doing two jobs |

## A step

| Field | Rule |
|---|---|
| `title` | ≤ 60 characters |
| `summary` | ≤ 95 characters |
| `open` | an existing HLD id. This is the drill-down, and it is what turns a scene into a story map when EVERY step has one |
| `detail` | a **list** of at most 5 bullets, each ≤ 95 characters. A string fails the render on purpose |
| `evidence` | list of refs, validated |
| `resourceType` | the symbol on the card |
| `kind` | the border colour and uppercase chip |
| `shallow` | JSON boolean only |

`resourceType` and `kind` are independent axes, both optional; a step with neither renders plainly.
Both allowlists are imported from `render_common.py` (`RESOURCE_SHAPES`, `KIND_COLOR`) so the
universe and task renderers cannot drift. The rendered legend lists only what the current scene
uses.

## Evidence

```jsonc
{ "file": "packages/server/src/facade/registry.ts", "line": 56, "note": "registerAll" }
```

- `file` is **repository-relative**; an absolute path is rejected.
- The file must exist in the resolved checkout and `line` must be within it. Past EOF fails.
- `note` is what a reader should look for when they open it.

A resolving ref proves the line exists. It proves nothing about whether the surrounding claim is
still true — that is what `provenance.verifiedAgainstCode` and re-measuring are for.

## Module edges

```jsonc
{ "from": "ui", "to": "server", "rel": "calls", "label": "catalog over HTTP and WS",
  "evidence": [ { "file": "...", "line": 31, "note": "..." } ] }
```

- `from` and `to` must be HLD ids, and must differ.
- `rel` is one of the relation vocabulary in `render_common.REL_STYLE`.
- `label` ≤ 40 characters.
- `evidence` is validated exactly like a step's. **An edge without evidence does not ship** — a
  wrong arrow teaches the reader something false, which is worse than a gap.

Where `moduleEdges` is silent for a pair, the page derives an edge by lifting the legacy node graph
through `sourceIds`. Nothing else is invented.

## Corrections

```jsonc
"corrections": [{
  "date": "2026-09-09",
  "task": "<task id that found it>",
  "was":  "what the scene claimed before",
  "now":  "what is actually true",
  "why":  "the evidence that changed it"
}]
```

All five fields are **required** — the renderer refuses to build without them. The scene renders an
orange uppercase `CORRECTED` chip beside its title, and the evidence panel keeps the **superseded
claim visible** beside what replaced it, labelled `Latest correction` or `Superseded correction` by
date.

> The chip's *style* (`.chip.corrected` in `render_common.py`) shipped long before anything emitted
> it, so for a while this sentence was false and an author who trusted it got silence. The emitter
> was added on 2026-09-09 and verified in a headless DOM: exactly one `class="chip corrected"`
> element on the one scene carrying a correction, and none elsewhere. Probe before you trust a
> sentence like this one.

**Why keep the old claim rather than overwrite it:** a quietly overwritten error teaches nobody and
leaves the reader unable to tell whether a scene has ever been wrong — which is exactly what you
need to know about a map written by agents. It also means a phrase from a dead claim will appear in
the published page on purpose; see `hazards.md` before reading that as a regression.

## Retired scenes

```jsonc
"sceneAliases": { "provider-to-screen": "data-plane" }
```

The browser replaces the retired hash with the owning scene's hash, so an old deep link keeps
working. Targets must be live HLDs. Alias chains are rejected, and an alias may not shadow a live
scene or an archive node. Aliases do not add sidebar entries.
