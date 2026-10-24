# thebigpicture

A project's picture of itself goes stale silently. Nobody notices, because a stale document looks
exactly like a current one — same confident sentences, same resolving file paths.

This is a family of skills that make that failure visible instead.

| Skill | Owns | Lifetime |
|---|---|---|
| `thebigpicture` | the family entry: which member owns what, and the laws all of them obey | — |
| `architecture` | ONE permanent document per project — the system, then every module and submodule, drilled through in one page | forever |
| `task` | ONE living document per task — the question, the measurement, the stage it reached | one task, planning → verified |

More members will join. They share the runtime in `shared/` and the laws in
`skills/thebigpicture/SKILL.md`; a member that breaks one of those is not a member of this family.

## What makes it different from writing docs

- **Evidence or silence.** Every claim cites `file:line`, and the renderer re-validates every
  reference against the real checkout on every build. A missing file, a line past EOF, an
  unresolved drill-down or an edge with no evidence fails the build and names the offender.
- **Corrections are recorded, never overwritten.** The superseded claim stays visible beside what
  replaced it, with what changed and what evidence changed it — so a reader can tell whether a
  document has ever been wrong, which is exactly what you need to know about one written by agents.
- **Depth honesty.** Untraced branches carry a `SHALLOW` chip and a coverage-limits note instead of
  plausible-looking boxes.
- **Topology, not a wall of cards.** The architecture document draws boxes and arrows — a story map
  at the top, a neighbour graph on every module — because a page of sequential step-cards is not an
  architecture, however correct each sentence is.

## Use it in a project

```bash
# once per project
python3 skills/architecture/scripts/init_project.py --repo /path/to/checkout --name "My Product Architecture"

# then, any time
python3 skills/architecture/scripts/render_universe.py index.html
python3 skills/architecture/scripts/check_hlds.py
python3 skills/task/scripts/render_task.py <task-id>
python3 skills/task/scripts/check_task.py
```

`init_project.py` writes `bigpicture.config.json`, a one-scene seed that is honest about being
empty, and a publication-status file. Everything project-shaped lives in that config — the
authoring directory, the source checkout references resolve against, where task artifacts live, the
publish identities. **No host path, artifact id or published URL appears in any skill**: a skill is
copied between machines and repos; the data is not.

A project that already has `architecture.config.json` keeps working under that name, and is found
first, so adopting the family renames nothing.

## Install

| Client | How it picks the family up |
|---|---|
| Claude Code | add this repo as a plugin marketplace, or symlink `.claude/skills/<member>` at each `skills/<member>` |
| Codex | `.agents/skills` → `.claude/skills`, so the same files serve both |
| tm8 | documents publish as tm8 artifacts; a skill is a `skill` entity in the graph |

## Layout

```
.claude-plugin/         plugin + marketplace manifests
shared/
  config.py             project resolution — the ONLY place a path is decided
  render_common.py      page chrome, and the one vocabulary both renderers draw from
  bootstrap.py          how a member's scripts/ reach shared/
skills/
  thebigpicture/        the family entry and its laws
  architecture/         SKILL.md, references/{format,publishing,hazards}.md, scripts/
  task/                 SKILL.md, scripts/
```

`render_common.py` is shared rather than copied for one reason: it holds the single vocabulary both
renderers draw from — the resource symbols, the kind colours, the relation styles. Two copies would
drift, and a symbol meaning one thing in the architecture and another in a task artifact is worse
than no symbol at all.

Each member's `scripts/` begins with `import bootstrap`, the one line that puts `shared/` on the
path. Read `shared/bootstrap.py` before adding a member.

## The built page

Self-contained: no CDN, no remote fonts, no network. It carries the
`:root` / `prefers-color-scheme` / `[data-theme]` token set, so it renders correctly as a local
file, inside a tm8 artifact frame, and as a Claude Artifact on either host theme.
