"""Put the family's shared runtime on sys.path.

Every member skill's scripts start with:

    import bootstrap  # noqa: F401  — must precede the render_common import

which is the one line that lets `skills/<member>/scripts/*.py` import
`render_common` and `config` from `<plugin>/shared/` without either a package
install or a copy of the runtime per skill.

This file is itself imported by path, so it must not import anything from the
directory it is about to add.
"""

from __future__ import annotations

import pathlib
import sys

SHARED = pathlib.Path(__file__).resolve().parent
PLUGIN = SHARED.parent

if str(SHARED) not in sys.path:
    sys.path.insert(0, str(SHARED))
