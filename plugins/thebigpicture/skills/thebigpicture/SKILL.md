---
name: thebigpicture
description: >-
  The family of skills that keep a project's picture of itself true: one permanent architecture
  document, one living artifact per task, and the shared rules they all obey — evidence over
  assertion, diagrams over prose, corrections recorded rather than overwritten. Use this skill to
  choose the right member, or when a request spans more than one of them. Trigger on "the big
  picture", "bigpicture", "what do we know about this system", "document this", "keep the docs
  honest", or when a task needs both the architecture and a standup document. For the permanent
  product architecture use `architecture`; for the per-task standup document use `task`.
---

# The Big Picture

A project's picture of itself goes stale silently. Nobody notices, because a stale document looks
exactly like a current one — same confident sentences, same resolving file paths. Every skill in
this family exists to make that failure visible instead.

## The members

| Skill | Owns | Lifetime |
|---|---|---|
| `architecture` | ONE permanent document per project: the system, then every module and submodule, drilled through in one page | forever — same identity for the life of the project |
| `task` | ONE living document per task: the question, the measurement, the stage it has reached | the whole life of one task, from planning to verified |

More members will join. They share the runtime in `<plugin>/shared/` and the laws below; a new
member that breaks one of these is not a member of this family.

## Which one

- **"How does X work?" "Where does this live?" "Draw our architecture."** → `architecture`.
  Durable facts about the system, true regardless of who is working today.
- **"What stage is this?" "Record what I did." "Standup."** → `task`. The narrative of one piece of
  work: what was asked, what was measured, what is proposed, where it got to.
- **Both, when a task changes the system.** Findings land in the task artifact; the durable
  consequence lands in the architecture. Get that cut wrong and either the architecture fills with
  task chatter, or the findings vanish when the task closes.

| what | where it goes |
|---|---|
| "the CLI awaits the local facade synchronously" | **architecture** (durable) |
| "this route is 78% 404s, Prometheus, 30d" | **architecture**, on the module that owns it |
| "I was asked whether the delay is material" | **task** |
| the measurement tables and the reasoning | **task** |
| "I propose we instrument session startup" | **task** |
| "this task is at stage: building" | **task** |

## The laws every member obeys

**1. Nothing here is ground truth.** These documents are written by agents. Every claim is a dated
assertion by a previous agent that may since have stopped being true. Verify before you rely on it.
A resolving `file:line` proves the line exists — it proves nothing about whether the sentence around
it is still correct.

**2. Evidence or silence.** A claim cites `file:line` and the runtime re-validates every reference
on every build. A number ships with the command that produced it and the date it was produced, so
the next reader can re-measure rather than believe. If it cannot be measured, say so; never
substitute a proxy that resembles a measurement.

**3. Corrections are recorded, never overwritten.** The superseded claim stays visible beside what
replaced it, with what changed and what evidence changed it. A quietly fixed error teaches nobody
and leaves the reader unable to tell whether a document has ever been wrong — which is exactly what
you need to know about one written by agents.

**4. Depth honesty.** Say what you left shallow rather than levelling everything down. A truthful
"this seam has four boxes and here is all we know" beats twenty plausible ones. Never invent
internals to make a branch look finished.

**5. Diagrams carry the weight; prose is the exception.** Short bullets, five to a card. An
explanation that needs a paragraph means the diagram is not doing its job.

**6. Probe the runtime before authoring against it.** This family has twice documented a renderer
feature that had a stylesheet but no emitter, and an author who trusted the sentence got silence
rather than a chip. Check that something reads the field before you set it.

**7. Verify in a browser, and never narrate a command's result in the same breath that runs it.** A
string count over a built page is not visual QA, and it lies in both directions. If a report says
"verified", the verifying already happened in a previous turn.

## One project, one configuration

Everything project-shaped — the authoring directory, the source checkout the references resolve
against, where task artifacts live, the publish identities — comes from `bigpicture.config.json` at
run time. **No host path, artifact id or published URL belongs in any skill in this family**: a
skill is copied between machines and repos; the data is not.

```bash
# once per project
python3 <plugin>/skills/architecture/scripts/init_project.py --repo <checkout> --name "<Title>"
```

`architecture.config.json` is still read where a project already has one, and is found first, so
nothing has to be renamed to adopt the family. `$BIGPICTURE_DIR` and `$BIGPICTURE_REPO` override;
the older `$ARCHITECTURE_*` names are still honoured.

## The shared runtime

`<plugin>/shared/render_common.py` holds the page chrome and — the reason it is shared rather than
copied — the ONE vocabulary both renderers draw from: the resource symbols, the kind colours, the
relation styles. Two copies would drift, and a symbol meaning one thing in the architecture and
another in a task artifact is worse than no symbol at all.

Each member's `scripts/` starts with `import bootstrap`, which is the single line that puts that
shared directory on the path. Read `<plugin>/shared/bootstrap.py` before adding a member.

## References

| File | What it settles |
|---|---|
| `references/publishing.md` | Publish surfaces, updating in place, share pins, the unwrap step, what to do when a surface is unreachable |
| `references/hazards.md` | Search and verification failures, each with the measurement that produced it |
| `../architecture/references/format.md` | The field-by-field data contract for the architecture document |
| `../../shared/config.py` | Project resolution order, shared by every member |
