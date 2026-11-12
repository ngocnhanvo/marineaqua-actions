"""Offline regression tests for the push-driven GitHub Actions dispatch bridge."""
import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest

from marineaqua_dispatch_bridge import (BridgeError, execute, new_request_from_push, valid_request)

PHP = {
    "action": "workflow_dispatch",
    "source_sha": "d4013371fbfaa072ad2508a0dfe6d5163a578052",
    "reason": "Deploy bounded product log paging to WordPress production",
    "request_id": "20261113T010000Z-php-product-paging",
    "workflow": "marineaqua-php-release.yml",
    "ref": "main",
    "inputs": {"confirm": "DEPLOY_PHP"},
}
ASTRO = {
    "action": "repository_dispatch",
    "source_sha": "479f79e4356660387d8271bfdca4b76bef461026",
    "reason": "Deploy signed Astro build after the PHP pagination release",
    "request_id": "20261113T020000Z-astro-product-paging",
    "event_type": "wp_trigger_build",
    "client_payload": {"site_domain": "marine-aqua.io.vn"},
}
BEFORE = "a" * 40
AFTER = "b" * 40


class FakeGitHub:
    def __init__(self, source_sha, event):
        self.source_sha, self.event = source_sha, event
        self.posts = []
        self.round = 0
        self.status = "success"
        self.active = False

    def source_head(self, _repo):
        return self.source_sha

    def runs(self, _workflow):
        self.round += 1
        if self.active:
            return [{"id": 9, "status": "in_progress", "event": self.event}]
        if self.round == 1:
            return []
        return [{
            "id": 42, "event": self.event,
            "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "html_url": "https://github.com/example/actions/runs/42",
        }]

    def post(self, doc):
        self.posts.append(doc["action"])

    def run(self, _id):
        return {
            "id": 42, "status": "completed", "conclusion": self.status,
            "html_url": "https://github.com/example/actions/runs/42",
        }

    def run_jobs(self, _id):
        return [{"name": "signed build", "conclusion": "success"}]


class BridgeTests(unittest.TestCase):
    def test_php_contract(self):
        self.assertEqual(valid_request(PHP), PHP)
        for override in [
            {"inputs": {"confirm": "NO"}},
            {"ref": "master"},
            {"workflow": "malicious.yml"},
            {"source_sha": "000"},
            {"reason": ""},
            {"extra": "not allowed"}
        ]:
            with self.subTest(override=override), self.assertRaises(BridgeError):
                valid_request({**PHP, **override})

    def test_astro_contract(self):
        self.assertEqual(valid_request(ASTRO), ASTRO)
        for override in [
            {"event_type": "wrong"},
            {"client_payload": {"site_domain": "other.example"}},
            {"client_payload": {"site_domain": "marine-aqua.io.vn", "extra": 1}},
        ]:
            with self.subTest(override=override), self.assertRaises(BridgeError):
                valid_request({**ASTRO, **override})

    def test_real_added_request_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            name = "dispatch-requests/" + PHP["request_id"] + ".json"
            path = Path(tmp) / name
            path.parent.mkdir()
            path.write_text(json.dumps(PHP))
            doc = new_request_from_push(BEFORE, AFTER, "1",
                git=lambda _: "A\t" + name + "\n", root=Path(tmp))
            self.assertEqual(doc, PHP)

    def test_no_request_when_only_bridge_code_changes(self):
        self.assertIsNone(new_request_from_push(BEFORE, AFTER, "1",
            git=lambda _: "M\tscripts/marineaqua-dispatch-bridge.py\n"))

    def test_disallow_modified_or_multiple_files_and_rerun(self):
        with tempfile.TemporaryDirectory() as tmp:
            name = "dispatch-requests/" + PHP["request_id"] + ".json"
            path = Path(tmp) / name
            path.parent.mkdir()
            path.write_text(json.dumps(PHP))
            for changed in ["M\t" + name + "\n",
                            "A\t" + name + "\nM\tREADME.md\n",
                            "D\t" + name + "\n"]:
                with self.subTest(changed=changed), self.assertRaises(BridgeError):
                    new_request_from_push(BEFORE, AFTER, "1", git=lambda _: changed,
                                          root=Path(tmp))
            with self.assertRaises(BridgeError):
                new_request_from_push(BEFORE, AFTER, "2",
                                      git=lambda _: "A\t" + name + "\n",
                                      root=Path(tmp))

    def test_complete_php_and_astro_bridge_run(self):
        for doc, event in [(PHP, "workflow_dispatch"), (ASTRO, "repository_dispatch")]:
            with self.subTest(event=event):
                gh = FakeGitHub(doc["source_sha"], event)
                result = execute(doc, gh, sleeper=lambda _: None)
                self.assertEqual(gh.posts, [doc["action"]])
                self.assertEqual(result["run_id"], 42)
                self.assertEqual(result["status"], "TARGET_RUN_SUCCESS_NOT_LIVE_QA")

    def test_wrong_source_sha_refuses_post(self):
        gh = FakeGitHub("c" * 40, "workflow_dispatch")
        with self.assertRaisesRegex(BridgeError, "Source master changed"):
            execute(PHP, gh)
        self.assertEqual(gh.posts, [])

    def test_active_workflow_refuses_post(self):
        gh = FakeGitHub(PHP["source_sha"], "workflow_dispatch")
        gh.active = True
        with self.assertRaisesRegex(BridgeError, "already active"):
            execute(PHP, gh)
        self.assertEqual(gh.posts, [])

    def test_failed_target_run_is_not_success(self):
        gh = FakeGitHub(PHP["source_sha"], "workflow_dispatch")
        gh.status = "failure"
        with self.assertRaisesRegex(BridgeError, "ended failure"):
            execute(PHP, gh, sleeper=lambda _: None)
        self.assertEqual(gh.posts, ["workflow_dispatch"])


if __name__ == "__main__":
    unittest.main()
