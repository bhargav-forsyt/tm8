"""Load the family's shared runtime. See <plugin>/shared/bootstrap.py."""
from __future__ import annotations

import pathlib
import sys

# scripts -> <member> -> skills -> <plugin>
SHARED = pathlib.Path(__file__).resolve().parents[3] / "shared"
if not (SHARED / "render_common.py").is_file():
    raise SystemExit(
        f"the big picture shared runtime is missing at {SHARED}. "
        "This skill's scripts/ cannot run outside the plugin directory."
    )
if str(SHARED) not in sys.path:
    sys.path.insert(0, str(SHARED))
