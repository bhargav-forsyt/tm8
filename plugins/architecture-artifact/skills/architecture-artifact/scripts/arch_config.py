"""Project resolution for the architecture-artifact runtime.

The renderer travels between machines, repos and agent clients, so NOTHING about a
particular project may be baked into it. Everything project-shaped is read at run
time from `architecture.config.json`, which sits beside `universe.json` in the
authoring directory.

Resolution order for the authoring directory:
  1. $ARCHITECTURE_DIR
  2. the directory containing the universe.json passed on the command line
  3. <repo>/architecture, if that repo resolves and the directory exists
  4. cwd, if it holds a universe.json

Resolution order for the source checkout that file:line refs are validated against:
  1. $ARCHITECTURE_REPO
  2. config["repo"], resolved relative to the config file when not absolute
  3. the env var named by config["repoEnv"]
  4. walk up from cwd for a .git dir whose tree contains every config["repoMarkers"]
  5. walk up from cwd for any .git dir

A missing config is not an error: the defaults below describe a project whose
architecture lives in `<repo>/architecture` and whose refs resolve against <repo>.
`init_project.py` writes a real one.
"""

from __future__ import annotations

import json
import os
import pathlib

CONFIG_NAME = "architecture.config.json"

DEFAULTS: dict = {
    "project": None,          # short slug, e.g. "tm8"
    "brand": None,            # header text; falls back to universe title
    "repo": None,             # path to the source checkout, or null to discover
    "repoEnv": None,          # name of an env var that names the checkout
    "repoMarkers": [],        # paths that must exist inside the checkout
    "publish": {},            # surface -> identity, read by the skill, not the renderer
}


def load_config(start: pathlib.Path | None = None) -> tuple[dict, pathlib.Path | None]:
    """Return (config, path_to_config). Missing config yields DEFAULTS and None."""
    here = (start or pathlib.Path.cwd()).resolve()
    candidates = [here, *here.parents] if here.is_dir() else [here.parent, *here.parents]
    env_dir = os.environ.get("ARCHITECTURE_DIR")
    if env_dir:
        candidates.insert(0, pathlib.Path(env_dir).expanduser().resolve())
    for candidate in candidates:
        path = candidate / CONFIG_NAME
        if path.is_file():
            cfg = dict(DEFAULTS)
            cfg.update(json.loads(path.read_text()))
            return cfg, path
    return dict(DEFAULTS), None


def find_repo(start: pathlib.Path | None = None) -> pathlib.Path | None:
    """The source checkout every file:line ref is validated against."""
    cfg, cfg_path = load_config(start)

    env = os.environ.get("ARCHITECTURE_REPO")
    if env:
        p = pathlib.Path(env).expanduser()
        if (p / ".git").exists():
            return p

    if cfg.get("repo"):
        p = pathlib.Path(str(cfg["repo"])).expanduser()
        if not p.is_absolute() and cfg_path is not None:
            p = (cfg_path.parent / p).resolve()
        if (p / ".git").exists():
            return p

    if cfg.get("repoEnv"):
        env = os.environ.get(str(cfg["repoEnv"]))
        if env:
            p = pathlib.Path(env).expanduser()
            if (p / ".git").exists():
                return p

    markers = [str(m) for m in (cfg.get("repoMarkers") or [])]
    here = (start or pathlib.Path.cwd()).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / ".git").exists() and all((candidate / m).exists() for m in markers):
            return candidate
    if markers:
        for candidate in [here, *here.parents]:
            if (candidate / ".git").exists():
                return candidate
    return None


def find_authoring_dir(universe_arg: str | None = None) -> pathlib.Path:
    """Where universe.json and architecture.config.json live."""
    env = os.environ.get("ARCHITECTURE_DIR")
    if env:
        return pathlib.Path(env).expanduser().resolve()
    if universe_arg:
        p = pathlib.Path(universe_arg).expanduser().resolve()
        return p.parent if p.suffix == ".json" else p
    _, cfg_path = load_config()
    if cfg_path is not None:
        return cfg_path.parent
    repo = find_repo()
    if repo and (repo / "architecture" / "universe.json").is_file():
        return repo / "architecture"
    return pathlib.Path.cwd()
