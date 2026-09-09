"""Focused checks for the architecture renderer; never imports application code.

Every fixture is DERIVED from the project's own universe.json — no scene id and no
source path of any one project appears here, so the same suite runs unchanged in
any repo that uses this plugin.

    python3 check_hlds.py            # checks the resolved authoring directory
    ARCHITECTURE_DIR=... python3 check_hlds.py
"""
from __future__ import annotations

import copy, json, pathlib, unittest

import arch_config
from render_common import find_repo
from render_universe import validate_hlds

DIR = arch_config.find_authoring_dir()
REPO = find_repo(DIR)
SOURCE = DIR / "universe.json"


def _a_real_ref(data: dict) -> dict | None:
    """Any evidence entry the universe already carries — used to build a past-EOF ref."""
    for h in data.get("hlds", []):
        for ev in h.get("evidence", []) or []:
            return ev
        for lane in h.get("lanes", []) or []:
            for step in lane.get("steps", []):
                for ev in step.get("evidence", []) or []:
                    return ev
    return None


class HldContract(unittest.TestCase):
    def setUp(self):
        self.data = json.loads(SOURCE.read_text())
        self.ids = [h["id"] for h in self.data["hlds"]]
        # Live modules other than the root, for alias/edge fixtures. A freshly seeded
        # universe has none, so the fixtures skip rather than error.
        others = [i for i in self.ids if i != "root"]
        self.mod = others[0] if others else None
        self.mod2 = others[1] if len(others) > 1 else None

    def a_module(self) -> str:
        if self.mod is None:
            self.skipTest("universe has no module beyond root yet")
        return self.mod

    def two_hlds(self) -> None:
        if len(self.data["hlds"]) < 2:
            self.skipTest("universe has only the root scene")

    def reject(self, mutate):
        mutate(self.data)
        with self.assertRaises((AssertionError, KeyError)):
            validate_hlds(self.data, REPO)

    # --- the authored document itself -------------------------------------
    def test_authored_diagrams_valid(self):
        refs = validate_hlds(self.data, REPO)
        self.assertIsInstance(refs, list)
        if len(self.data["hlds"]) > 1:
            # Past the seed, a mapped module that cites nothing is not evidence-backed.
            self.assertGreater(len(refs), 0, "no file:line evidence anywhere in the universe")

    def test_root_exists_and_is_parentless(self):
        root = next(h for h in self.data["hlds"] if h["id"] == "root")
        self.assertIsNone(root["parent"])

    # --- retired scene aliases -------------------------------------------
    def test_retired_scene_alias_accepted(self):
        self.data["sceneAliases"] = {"retired-scene": self.a_module()}
        validate_hlds(self.data, REPO)

    def test_alias_missing_target_rejected(self):
        self.reject(lambda d: d.update(sceneAliases={"retired-scene": "missing"}))

    def test_alias_shadowing_scene_rejected(self):
        mod = self.a_module()
        self.reject(lambda d: d.update(sceneAliases={"root": mod}))

    def test_alias_chain_rejected(self):
        mod = self.a_module()
        self.reject(lambda d: d.update(sceneAliases={"old-a": "old-b", "old-b": mod}))

    # --- hierarchy --------------------------------------------------------
    def test_duplicate_id_rejected(self):
        self.reject(lambda d: d["hlds"].append(copy.deepcopy(d["hlds"][0])))

    def test_cycle_rejected(self):
        self.two_hlds()
        self.reject(lambda d: d["hlds"][1].update(parent=d["hlds"][1]["id"]))

    def test_disconnected_module_rejected(self):
        self.two_hlds()
        self.reject(lambda d: d["hlds"][1].update(parent="missing"))

    def test_unknown_drilldown_rejected(self):
        self.reject(lambda d: d["hlds"][0]["lanes"][0]["steps"][0].update(open="not-a-module"))

    # --- evidence ---------------------------------------------------------
    def test_missing_source_rejected(self):
        self.reject(lambda d: d["hlds"][0].update(
            evidence=[dict(file="no/such/file.does-not-exist", line=1)]))

    def test_absolute_ref_rejected(self):
        self.reject(lambda d: d["hlds"][0].update(evidence=[dict(file="/etc/hosts", line=1)]))

    def test_invalid_line_rejected(self):
        ref = _a_real_ref(self.data)
        if ref is None:
            self.skipTest("universe carries no evidence yet")
        self.reject(lambda d: d["hlds"][0].update(
            evidence=[dict(file=ref["file"], line=10_000_000)]))

    def test_incomplete_hld_correction_rejected(self):
        self.reject(lambda d: d["hlds"][0].update(
            corrections=[dict(date="2026-01-01", task="test", was="old", now="new")]))

    # --- compact-text contracts ------------------------------------------
    def test_long_bullets_rejected(self):
        self.reject(lambda d: d["hlds"][0]["lanes"][0]["steps"][0].update(detail=["x" * 96]))

    def test_prose_detail_rejected(self):
        self.reject(lambda d: d["hlds"][0]["lanes"][0]["steps"][0].update(detail="paragraph"))

    def test_empty_flow_rejected(self):
        self.reject(lambda d: d["hlds"][0].update(lanes=[]))

    # --- step and HLD vocabulary -----------------------------------------
    def test_unknown_resource_type_rejected(self):
        self.reject(lambda d: d["hlds"][0]["lanes"][0]["steps"][0].update(resourceType="cache"))

    def test_unknown_step_kind_rejected(self):
        self.reject(lambda d: d["hlds"][0]["lanes"][0]["steps"][0].update(kind="warning"))

    def test_null_step_vocab_rejected(self):
        self.reject(lambda d: d["hlds"][0]["lanes"][0]["steps"][0].update(resourceType=None))

    def test_known_step_vocab_accepted(self):
        self.data["hlds"][0]["lanes"][0]["steps"][0].update(resourceType="redis", kind="store")
        validate_hlds(self.data, REPO)

    def test_non_boolean_shallow_rejected(self):
        self.reject(lambda d: d["hlds"][0]["lanes"][0]["steps"][0].update(shallow="yes"))

    def test_non_boolean_hld_shallow_rejected(self):
        self.reject(lambda d: d["hlds"][0].update(shallow=1))

    def test_boolean_shallow_accepted(self):
        self.data["hlds"][0].update(shallow=True)
        self.data["hlds"][0]["lanes"][0]["steps"][0].update(shallow=False)
        validate_hlds(self.data, REPO)

    # --- module edges (topology) -----------------------------------------
    def test_module_edge_unknown_hld_rejected(self):
        self.reject(lambda d: d.update(moduleEdges=[{"from": "root", "to": "nope", "rel": "calls"}]))

    def test_module_edge_self_edge_rejected(self):
        self.reject(lambda d: d.update(moduleEdges=[{"from": "root", "to": "root", "rel": "calls"}]))

    def test_module_edge_unknown_rel_rejected(self):
        mod = self.a_module()
        self.reject(lambda d: d.update(
            moduleEdges=[{"from": "root", "to": mod, "rel": "uses"}]))

    def test_module_edge_long_label_rejected(self):
        mod = self.a_module()
        self.reject(lambda d: d.update(
            moduleEdges=[{"from": "root", "to": mod, "rel": "calls", "label": "x" * 41}]))

    def test_module_edge_bad_evidence_rejected(self):
        ref = _a_real_ref(self.data)
        if ref is None:
            self.skipTest("universe carries no evidence yet")
        mod = self.a_module()
        self.reject(lambda d: d.update(moduleEdges=[{
            "from": "root", "to": mod, "rel": "calls",
            "evidence": [dict(file=ref["file"], line=10_000_000)]}]))

    def test_module_edge_accepted(self):
        if self.mod is None or self.mod2 is None:
            self.skipTest("needs two non-root modules")
        self.data.update(moduleEdges=[
            {"from": self.mod, "to": self.mod2, "rel": "flows_to", "label": "ok"}])
        validate_hlds(self.data, REPO)

    # --- schema gate ------------------------------------------------------
    def test_wrong_schema_rejected(self):
        self.reject(lambda d: d.update(hldSchema="someone.elses.v1"))


if __name__ == "__main__":
    unittest.main()
