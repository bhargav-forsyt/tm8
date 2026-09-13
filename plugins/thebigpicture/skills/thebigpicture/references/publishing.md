# Publishing the architecture

One running document, one or more published surfaces, identical content on all of them. They are
outputs of one source, never two documents that drift.

Which surfaces a project has is **data, not skill text**: read `publish` in
`architecture.config.json` and the recorded identities in `publication-status.json`. Never hardcode
a URL or an artifact id in the skill — it is copied between machines and repos; the data is not.

## The rules that hold regardless of surface

**1. Update in place. A bare publish is a bug.** It mints a new id and a new link, and the old link
keeps working and keeps being wrong — which is worse than a broken one, because nobody notices.
Every publish after the first passes the recorded identity.

**2. Recover before you mint.** "I cannot see a URL" is not "there isn't one". List the surface and
match on the **title** — which is the second reason `title` must stay byte-stable, beyond being the
display name. Change the title and you sever the only way back to the artifact you already own.

**3. Read before you republish.** Build your revision on the version that comes back, not on your
memory of it. Someone may have republished since, and the response is also where you learn the
surface's current sharing state.

**4. Ship the render AND the source.** A surface that stores the built page only is a viewer; a
surface that stores `universe.json` beside it is a system of record you can rebuild from.

**5. Surfaces move together — and an unreachable surface is reported, not skipped.** A publish that
advances one surface and not another is an incomplete publish, and reporting it as "the
architecture is updated" is false. When a surface genuinely cannot be reached — no credentials, a
different account, a node that is down — do all three of these:

- publish the surfaces you *can* reach;
- record the blocked surface in `publication-status.json` with the reason and what would unblock it;
- say plainly in your report which surfaces advanced and which did not.

A strict "never publish one without the other" reading freezes every surface the moment one becomes
unreachable, and stacked unpublished revisions are how a shared link silently rots. Publish what
you can; be explicit about what you could not.

**6. Do not report a publish as though it landed with its audience.** Where a surface pins shared
viewers to a version, your republish updates the artifact and changes nothing for anyone already
holding the link. Moving that pin is a human step. Say so and ask for it; never let the reader
assume.

**7. Build the bundle fresh, outside the repository.** Hooks and tooling write logs into the
working directory, and a session transcript has leaked into a published bundle before. Check the
file count the publisher reports.

## Publishing to a Claude Artifact

```
# FIRST publish only — mints the id:
Artifact(file_path="<unwrapped>.html", favicon="<emoji>", description="<one sentence>")
# EVERY publish after that — updates in place, same link:
Artifact(action="read",  url="<recorded URL>")          # build on what comes back
Artifact(file_path="<unwrapped>.html", url="<recorded URL>", description="<one sentence>")
```

`url` is not optional after the first publish. Republishing the same *file path* keeps the URL only
WITHIN one conversation; every task is a new session, so a bare publish there mints a new id and a
new link. Before minting anything, `Artifact(action="list")` and match on the title.

Omit `favicon` on a redeploy — the artifact keeps its icon, and a changed icon reads to a viewer as
a different page.

**Persist the URL where the next session will find it:** as top-level `claudeArtifactUrl` in
`universe.json`, beside `title`. It is the same file the render is built from, so the URL travels
with the data into every exported bundle and cannot be separated from it.

**There is no delete action.** An obsolete architecture artifact cannot be removed from a tool call
— only superseded by continuing to publish to the one canonical URL. Removing an old one is a human
action in the gallery. Do not claim to have cleaned one up.

**Unwrap the render first — one mechanical edit, nothing else.** The renderer emits a FULL document
and the Artifact tool supplies its own skeleton, so strip `<!doctype html>`, `<html>`, `<head>`,
`</head>`, `<body>`, `</body>`, `</html>` and the `<meta charset>` / `<meta viewport>` lines. **Keep
`<title>` and the whole `<style>` block.** Do not otherwise rewrite the page: it is a validated
render, and editing it here makes the copies disagree. Assert the skeleton is gone rather than
trusting the regex.

Nothing else is needed. These pages are already self-contained — no CDN, no remote fonts, no
network — and they already carry the `:root` / `prefers-color-scheme` / `[data-theme]` token set
plus an explicit `body{background:var(--bg)}`, which is exactly what an Artifact needs to render on
either host theme.

## Publishing to a tm8 artifact

```bash
tm8 artifact publish <clean-dir> --artifact <id> --expect-version <n> --entrypoint index.html
```

- Ship `index.html` **and** `universe.json` — tm8 is a system of record, not just a viewer.
- Extension allowlist: `avif css gif htm html ico jpeg jpg js json map mjs png svg txt wasm webp
  woff2`. **`.md` is rejected** — ship docs as `README.txt`.
- **A published artifact's title is immutable.** `--name` is silently ignored on a revision and a
  title patch is refused. Name it correctly at creation; the only later fix is a new artifact and a
  broken link.
- After publishing, confirm it is listed and open its preview. Publication success alone is not
  preview verification. If the preview is refused, inspect the actual error and report the blocker;
  do not claim it works.

## What to record after every publish

In `publication-status.json`:

- the identity of every surface and the revision each now holds;
- the source and render hashes that were published, so parity is checkable later;
- the code revision the render was validated against;
- what was verified, by what means (validator counts, browser DOM checks, scenes inspected);
- any surface that did not advance, with the reason.
