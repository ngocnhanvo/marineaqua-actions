#!/usr/bin/env python3
"""Real Python -> ZIP -> PHP reconstruction; temporary files only, no network."""
import os
from pathlib import Path
import runpy
import shutil
import subprocess
import tempfile
import unittest
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
PHP_ROOT = Path(os.environ.get("MARINEAQUA_PHP_SOURCE", ROOT.parent / "marineaqua-php")).resolve()
PHP = shutil.which("php")
IMAGE = runpy.run_path(str(ROOT / "scripts/marineaqua-image-delta-package.py"))
STATIC = runpy.run_path(str(ROOT / "scripts/marineaqua-static-delta-package.py"))


def write_tree(root, files):
    for name, data in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def snapshot(root):
    return {path.relative_to(root).as_posix(): path.read_bytes()
            for path in root.rglob("*") if path.is_file()}


@unittest.skipUnless(PHP, "PHP CLI required; cross-language test runs in Actions")
class DeltaZipRoundtrip(unittest.TestCase):
    def php(self, code, *args, expect_success=True):
        result = subprocess.run([
            PHP, "-r", "define('ABSPATH', __DIR__); require $argv[1] . '/marineaqua-image-delta.php'; " + code,
            str(PHP_ROOT), *(str(value) for value in args)
        ], capture_output=True, text=True, timeout=20)
        if expect_success:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return result

    def test_delta_zip_restores_exact_release_before_any_live_changes(self):
        previous = os.getcwd()
        with tempfile.TemporaryDirectory() as place:
            os.chdir(place)
            try:
                live = Path("live").resolve()
                deploy = Path("deploy").resolve()
                old = {
                    "client/index.html": b"old-entry",
                    "server/entry.mjs": b"old-server",
                    "client/images/stable.webp": b"stable-image",
                    "client/images/metadata.json": b'{"width":1}',
                    "client/images/change.webp": b"old-image",
                    "client/images/deleted.webp": b"deleted-image",
                    "client/_astro/stable.js": b"stable-js",
                    "client/_astro/change.css": b"old-css",
                    "client/about/index.html": b"stable-page",
                    "client/data/stable.json": b'{"n":1}',
                    "client/data/change.json": b'{"n":1}',
                }
                new = {name: data for name, data in old.items() if "deleted.webp" not in name}
                new.update({
                    "client/index.html": b"new-entry",
                    "server/entry.mjs": b"new-server",
                    "client/images/change.webp": b"new-image",
                    "client/images/new.webp": b"new-only-image",
                    "client/_astro/change.css": b"new-css",
                    "client/data/change.json": b'{"n":2}',
                    "client/robots.txt": b"User-agent: *",
                    "client/sitemap.xml": b"<urlset/>",
                })
                write_tree(live, old)
                write_tree(deploy, new)
                response = self.php(
                    "echo json_encode(array('images'=>template_delta_collect($argv[2].'/client/images'),"
                    "'static'=>template_static_collect($argv[2].'/client')));", live)
                Path(".marineaqua-remote-image-manifest.json").write_text(response.stdout)
                IMAGE["main"]()
                STATIC["main"]()
                archive = Path("release.zip")
                with ZipFile(archive, "w", ZIP_DEFLATED) as bundle:
                    for path in sorted(deploy.rglob("*")):
                        bundle.write(path, path.relative_to(deploy).as_posix())
                with ZipFile(archive) as bundle:
                    self.assertNotIn("client/images/stable.webp", bundle.namelist())
                    self.assertNotIn("client/images/metadata.json", bundle.namelist())
                    self.assertNotIn("client/_astro/stable.js", bundle.namelist())
                    self.assertNotIn("client/data/stable.json", bundle.namelist())
                    self.assertEqual(bundle.read("client/index.html"), b"new-entry")
                    self.assertEqual(bundle.read("server/entry.mjs"), b"new-server")
                    stage = Path("stage").resolve()
                    bundle.extractall(stage)
                restored = self.php(
                    "echo template_delta_restore($argv[2],$argv[3]).',';"
                    "echo template_static_restore($argv[2],$argv[3]);", stage, live)
                self.assertEqual(restored.stdout, "2,3")
                self.assertEqual(snapshot(stage), new)
                self.assertEqual(snapshot(live), old)
                self.assertFalse((stage / "marineaqua-image-delta.json").exists())
                self.assertFalse((stage / "marineaqua-static-delta.json").exists())

                # A previously inventoried image changing before activation must fail closed.
                (live / "client/images/stable.webp").write_bytes(b"broken-image")
                mutated = snapshot(live)
                bad_stage = Path("bad-stage").resolve()
                with ZipFile(archive) as bundle:
                    bundle.extractall(bad_stage)
                result = self.php("template_delta_restore($argv[2],$argv[3]);",
                                  bad_stage, live, expect_success=False)
                self.assertIn("Reusable image hash mismatch", result.stderr)
                self.assertEqual(snapshot(live), mutated)
            finally:
                os.chdir(previous)


if __name__ == "__main__":
    unittest.main()
