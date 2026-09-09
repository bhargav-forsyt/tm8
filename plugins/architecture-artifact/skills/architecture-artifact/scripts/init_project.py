#!/usr/bin/env python3
"""Bootstrap the architecture artifact for a project that does not have one yet.

    python3 init_project.py --repo <checkout> [--dir <authoring dir>] [--name "<Title>"]

Writes, and never overwrites:
  <authoring dir>/architecture.config.json   project resolution + publish surfaces
  <authoring dir>/universe.json              a one-scene seed, honest about being empty
  <authoring dir>/publication-status.json    where published identities are recorded

The seed deliberately contains a single root scene with an explicit gap, so the very
first render is truthful ("nothing is mapped yet") rather than a plausible-looking map.
"""
from __future__ import annotations

import argparse
import datetime
import json
import pathlib
import subprocess
import sys

SEED_NOTE = ("Seeded by init_project.py. Every scene below is a dated claim by an agent, "
             "not ground truth — verify against code before relying on it.")


def canonical_checkout(repo: pathlib.Path) -> pathlib.Path:
    """The main worktree, so every worktree writes to ONE authoring directory."""
    try:
        out = subprocess.run(["git", "worktree", "list", "--porcelain"], cwd=repo,
                             capture_output=True, text=True, check=True).stdout
        for line in out.splitlines():
            if line.startswith("worktree "):
                return pathlib.Path(line.split(" ", 1)[1]).resolve()
    except Exception:
        pass
    return repo.resolve()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, help="the source checkout file:line refs resolve against")
    ap.add_argument("--dir", help="authoring directory (default <canonical checkout>/architecture)")
    ap.add_argument("--name", help='document title, e.g. "tm8 Architecture"')
    ap.add_argument("--brand", help="short header label (default: --name)")
    args = ap.parse_args()

    repo = canonical_checkout(pathlib.Path(args.repo).expanduser().resolve())
    if not (repo / ".git").exists():
        print(f"not a checkout: {repo}", file=sys.stderr)
        return 2
    d = pathlib.Path(args.dir).expanduser().resolve() if args.dir else repo / "architecture"
    d.mkdir(parents=True, exist_ok=True)
    title = args.name or f"{repo.name} Architecture"
    today = datetime.date.today().isoformat()

    wrote = []
    cfg_path = d / "architecture.config.json"
    if not cfg_path.exists():
        rel = ".." if d.parent == repo else str(repo)
        cfg_path.write_text(json.dumps({
            "project": repo.name,
            "brand": args.brand or title,
            "repo": rel,
            "repoEnv": None,
            "repoMarkers": [],
            "publish": {
                "local": {"entrypoint": "index.html"},
                "claude": {"artifactUrl": None, "title": title},
                "tm8": {"artifactId": None, "expectVersion": None},
            },
        }, indent=2) + "\n")
        wrote.append(cfg_path)

    uni_path = d / "universe.json"
    if not uni_path.exists():
        uni_path.write_text(json.dumps({
            "schema": "architecture.universe.v1",
            "hldSchema": "architecture.hld.v1",
            "title": title,
            "note": SEED_NOTE,
            "hldUpdatedAt": today,
            "claudeArtifactUrl": None,
            "hlds": [{
                "id": "root", "parent": None,
                "title": "The big picture",
                "summary": "Nothing is mapped yet. This scene exists so the first render is honest.",
                "inputs": ["nothing yet"], "outputs": ["nothing yet"],
                "shallow": True,
                "gaps": ["No module has been traced from code yet."],
                "provenance": {"verifiedAgainstCode": today, "lastTouchedBy": "init_project"},
                "lanes": [{"kind": "main", "label": "Start here", "steps": [{
                    "title": "Trace the first module",
                    "summary": "Read the code, name files and lines, then author its HLD.",
                }]}],
            }],
            "moduleEdges": [],
            "sceneAliases": {},
        }, indent=2) + "\n")
        wrote.append(uni_path)

    pub_path = d / "publication-status.json"
    if not pub_path.exists():
        pub_path.write_text(json.dumps({
            "localAuthoringDirectory": str(d),
            "localPreview": str(d / "index.html"),
            "surfaces": {"claude": {"artifactUrl": None, "lastPublishedAt": None},
                          "tm8": {"artifactId": None, "revision": None, "lastPublishedAt": None}},
            "lastPublishedAt": None,
        }, indent=2) + "\n")
        wrote.append(pub_path)

    for p in wrote:
        print(f"wrote {p}")
    if not wrote:
        print(f"already initialised: {d}")
    inside = d.is_relative_to(repo)
    exclude = f"/{d.relative_to(repo)}/" if inside else str(d)
    print(f"\nnext: exclude it from commits if you do not want it version-controlled\n"
          f"  echo '{exclude}' >> {repo}/.git/info/exclude\n"
          f"then render:\n"
          f"  python3 {pathlib.Path(__file__).resolve()} --help\n"
          f"  ARCHITECTURE_DIR={d} python3 {pathlib.Path(__file__).resolve().parent}/render_universe.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
