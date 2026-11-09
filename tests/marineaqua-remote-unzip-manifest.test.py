#!/usr/bin/env python3
"""Offline contract for PHP-signed public static inventory; never contacts WordPress."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "marineaqua-remote-unzip.py"
spec = importlib.util.spec_from_file_location("template_remote_unzip", SCRIPT)
unzip = importlib.util.module_from_spec(spec)
spec.loader.exec_module(unzip)

HASH = "a" * 64
META = {"size": 13, "sha256": HASH}
ENV = {
    "ENV_FILE": "WC_URL_CLIENT=https://example.test\nWC_URL=https://admin.example.test",
    "ASTRO_FTP_TARGET": "/domains/example.test/public_html/",
    "SOURCE_REPO_PAT": "x" * 40,
}


def check_manifest(static):
    """Exercise the real manifest path with a mocked, correctly signed response."""
    with tempfile.TemporaryDirectory() as tmp:
        original = os.getcwd()
        try:
            os.chdir(tmp)
            Path("source").mkdir()
            response = {
                "ok": True,
                "protocol": 2,
                "host": "example.test",
                "target": "/domains/example.test/public_html/",
                "images": {},
                "static": static,
            }
            with mock.patch.dict(os.environ, ENV, clear=True), \
                    mock.patch.object(sys, "argv", [str(SCRIPT), "manifest"]), \
                    mock.patch.object(unzip, "signed_post", return_value=response), \
                    contextlib.redirect_stdout(io.StringIO()):
                unzip.main()
            return json.loads(Path("source/.marineaqua-remote-image-manifest.json").read_text())
        finally:
            os.chdir(original)


def inventory_request(*, response=None, error=None):
    with tempfile.TemporaryDirectory() as tmp:
        original = os.getcwd()
        try:
            os.chdir(tmp)
            Path("source").mkdir()
            with mock.patch.dict(os.environ, ENV, clear=True), \
                    mock.patch.object(sys, "argv", [str(SCRIPT), "manifest"]), \
                    mock.patch.object(unzip, "signed_post", return_value=response, side_effect=error), \
                    contextlib.redirect_stdout(io.StringIO()):
                unzip.main()
            output = Path("source/.marineaqua-remote-image-manifest.json")
            return json.loads(output.read_text()) if output.is_file() else None
        finally:
            os.chdir(original)


class TemplateSignedStaticJsonManifestTests(unittest.TestCase):
    def test_combined_inventory_within_file_limits_is_not_truncated(self):
        response = {
            "ok": True, "protocol": 2, "host": "example.test",
            "target": "/domains/example.test/public_html/",
            "images": {"photo-%04d.webp" % index: {"size": 1, "sha256": HASH}
                       for index in range(5000)},
            "static": {"_astro/file-%04d.js" % index: {"size": 1, "sha256": HASH}
                       for index in range(5000)},
        }
        payload = json.dumps(response, separators=(",", ":")).encode()
        self.assertGreater(len(payload), 1048577)
        with mock.patch.object(unzip.OPENER, "open") as opened:
            opened.return_value.__enter__.return_value.read.side_effect = lambda limit: payload[:limit]
            self.assertEqual(json.loads(unzip.request("https://admin.example.test/marineaqua-unzip.php")), response)

    def test_oversized_response_is_rejected_with_explicit_error(self):
        payload = b"x" * (4 * 1024 * 1024 + 1)
        with mock.patch.object(unzip.OPENER, "open") as opened:
            opened.return_value.__enter__.return_value.read.side_effect = lambda limit: payload[:limit]
            with self.assertRaisesRegex(RuntimeError, "response exceeds"):
                unzip.request("https://admin.example.test/marineaqua-unzip.php")

    def test_old_php_and_unavailable_inventory_use_full_zip(self):
        for error in (
            "Unpack server returned HTTP 400: Invalid archive checksum",
            "Unpack server returned HTTP 409: Image manifest unavailable",
        ):
            with self.subTest(error=error):
                self.assertIsNone(inventory_request(error=RuntimeError(error)))

    def test_auth_and_unexpected_server_errors_never_fall_back(self):
        for error in (
            "Unpack server returned HTTP 403: Invalid signed request",
            "Unpack server returned HTTP 500: Internal error",
            "Cannot reach unzip endpoint: connection timed out",
        ):
            with self.subTest(error=error):
                with self.assertRaises(RuntimeError):
                    inventory_request(error=RuntimeError(error))

    def test_image_only_php_retains_image_reuse_without_static(self):
        result = inventory_request(response={
            "host": "example.test", "target": "/domains/example.test/public_html/",
            "images": {"nested/image.webp": META},
        })
        self.assertEqual(result, {"images": {"nested/image.webp": META}})

    def test_inventory_from_other_destination_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "unexpected frontend"):
            inventory_request(response={
                "host": "other.test", "target": "/domains/other.test/public_html/",
                "images": {}, "static": {},
            })

    def test_signed_public_json_retained_alongside_existing_types(self):
        remote = {
            "data/catalog.json": META,
            "index.json": META,
            "_astro/main.js": META,
            "assets/site.css": META,
            "catalog/page.html": META,
        }
        inventory = check_manifest(remote)
        self.assertEqual(inventory["static"], remote)
        self.assertEqual(inventory["images"], {})

    def test_unsafe_and_unsupported_names_still_rejected(self):
        for name in (
            "index.html", "../escape.json", "/absolute.json",
            "data//broken.json", "data/../escape.json",
            "bad.exe", "data/private.env", "data/unsafe?.json", "images/metadata.json",
        ):
            with self.subTest(name=name):
                with self.assertRaisesRegex(RuntimeError, "Invalid signed static asset name|Invalid signed static asset digest"):
                    check_manifest({name: META})

    def test_invalid_json_digest_still_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "Invalid signed static asset digest"):
            check_manifest({"data/catalog.json": {"size": 13, "sha256": "wrong"}})


if __name__ == "__main__":
    unittest.main()
