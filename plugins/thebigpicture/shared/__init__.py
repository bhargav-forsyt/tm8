"""Runtime shared by every skill in the big picture family.

`render_common.py` holds the page chrome and — the reason it is shared rather
than copied — the ONE vocabulary both renderers draw from (RESOURCE_SHAPES,
KIND_COLOR, REL_STYLE). Two copies would drift, and a symbol meaning one thing
in the architecture document and another in a task artifact is worse than no
symbol at all.

`config.py` is the only place a path is decided, for every member skill.
"""
