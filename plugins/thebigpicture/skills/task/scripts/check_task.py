"""Focused checks for the task renderer; never imports application code.

Every fixture is DERIVED from the project's own task artifacts — no task id and no
source path of any one project appears here, so the same suite runs unchanged in
any repository.

    python3 check_task.py                       # checks every task in the project
    BIGPICTURE_DIR=... python3 check_task.py
"""
from __future__ import annotations

import copy
import json
import pathlib
import unittest

import bootstrap  # noqa: F401  — puts <plugin>/shared on sys.path; must come first
import config  # noqa: E402
from render_task import TASK_SCHEMA, normalize_source_links  # noqa: E402

TASKS = config.find_tasks_dir()
FILES = sorted(TASKS.glob("*.json")) if TASKS.is_dir() else []


class SourceLinks(unittest.TestCase):
    """Both authored shapes render. Neither silently drops a link."""

    def test_mapping_shape(self):
        got = normalize_source_links({"A doc": "https://example.com/a"})
        self.assertEqual(got, [("A doc", "https://example.com/a")])

    def test_list_shape(self):
        got = normalize_source_links([{"title": "A doc", "url": "https://example.com/a"}])
        self.assertEqual(got, [("A doc", "https://example.com/a")])

    def test_list_entry_without_title_falls_back_to_url(self):
        got = normalize_source_links([{"url": "https://example.com/a"}])
        self.assertEqual(got, [("https://example.com/a", "https://example.com/a")])

    def test_empty_and_absent_are_the_same(self):
        for raw in (None, [], {}):
            self.assertEqual(normalize_source_links(raw), [])

    def test_plain_http_rejected(self):
        with self.assertRaises(SystemExit):
            normalize_source_links({"A doc": "http://example.com/a"})

    def test_list_entry_missing_url_rejected(self):
        with self.assertRaises(SystemExit):
            normalize_source_links([{"title": "no url here"}])

    def test_wrong_container_rejected(self):
        with self.assertRaises(SystemExit):
            normalize_source_links("https://example.com/a")


class AuthoredTasks(unittest.TestCase):
    """The project's real artifacts, checked as data — not by grepping a render."""

    def setUp(self):
        if not FILES:
            self.skipTest(f"no task artifacts under {TASKS}")

    def test_schema_accepted(self):
        for f in FILES:
            schema = json.loads(f.read_text()).get("schema")
            with self.subTest(task=f.stem):
                self.assertTrue(
                    schema == TASK_SCHEMA
                    or (isinstance(schema, str) and schema.endswith(".task-artifact.v1")),
                    f"{f.name}: schema {schema!r} is neither {TASK_SCHEMA!r} nor a "
                    "legacy <project>.task-artifact.v1",
                )

    def test_every_task_has_a_stage(self):
        for f in FILES:
            with self.subTest(task=f.stem):
                self.assertTrue(json.loads(f.read_text()).get("stage"),
                                f"{f.name}: stage is the headline; it cannot be absent")

    def test_source_links_normalise(self):
        for f in FILES:
            data = json.loads(f.read_text())
            with self.subTest(task=f.stem):
                links = normalize_source_links(data.get("sourceLinks"))
                raw = data.get("sourceLinks")
                expected = len(raw) if isinstance(raw, (dict, list)) else 0
                self.assertEqual(len(links), expected,
                                 f"{f.name}: normalising dropped a link")


if __name__ == "__main__":
    unittest.main()
