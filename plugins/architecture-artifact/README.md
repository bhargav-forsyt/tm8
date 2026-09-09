# architecture-artifact

One long-lived architecture document per project. Not one per task.

You drill through it from the system down to the file and line: a system HLD, one per module, one
per submodule that carries its own responsibility. Every box, arrow and bullet cites `file:line`,
and the renderer refuses to build if a ref does not resolve, a correction is incomplete, or a text
field is over its cap. Branches nobody has traced are marked `shallow` with a `gaps` note rather
than filled with plausible-looking boxes.

## Why it is a plugin

Because the same document has to be readable and writable from every client that touches the repo.
Nothing in the skill names a project: the authoring directory, the source checkout and the publish
identities are read from `architecture.config.json` at run time.

| Client | How it picks the skill up |
|---|---|
| Claude Code | `.claude/skills/architecture-artifact` → this directory, or install the plugin |
| Codex | `.agents/skills` → `.claude/skills`, so the same file serves both |
| tm8 | the document publishes as a tm8 artifact; the skill itself is a `skill` entity in the graph |

## Start a project

```bash
python3 skills/architecture-artifact/scripts/init_project.py \
    --repo /path/to/checkout --name "My Product Architecture"
```

That writes `architecture.config.json`, a one-scene seed `universe.json` that is honest about being
empty, and `publication-status.json`. Then author scenes, and:

```bash
python3 skills/architecture-artifact/scripts/render_universe.py index.html
python3 skills/architecture-artifact/scripts/check_hlds.py
```

The check suite derives every fixture from the project's own `universe.json`, so it runs unchanged
in any repository — 31 checks, skipping the ones that need modules a seeded project does not have
yet.

## What is in here

| Path | What it is |
|---|---|
| `skills/architecture-artifact/SKILL.md` | the contract an agent follows |
| `.../references/format.md` | the field-by-field data contract |
| `.../references/publishing.md` | surfaces, lockstep, share pins, the unwrap step |
| `.../references/hazards.md` | search and verification failures, with their measurements |
| `.../scripts/arch_config.py` | project resolution — the only place paths are decided |
| `.../scripts/render_universe.py` | render + hard validation |
| `.../scripts/check_hlds.py` | the contract test suite |
| `.../scripts/init_project.py` | bootstrap a project |
| `.../scripts/render_common.py`, `universe_page.template.html`, `validate_universe.py` | page chrome, the client-side renderer, the archive validator |

The built page is self-contained: no CDN, no remote fonts, no network. It carries the
`:root` / `prefers-color-scheme` / `[data-theme]` token set, so it renders correctly as a local
file, inside a tm8 artifact frame, and as a Claude Artifact on either host theme.

## Known duplication

A task-artifact skill in the same repository may ship its own copy of `render_common.py` and
`render_task.py`. This plugin owns the **universe** runtime only. Consolidating the two is a
separate piece of work; until then, a change to shared page chrome has to be made in both, and this
note exists so the next reader knows that rather than discovering it.
