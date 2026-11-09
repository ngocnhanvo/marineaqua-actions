#!/usr/bin/env python3
"""Offline MARINE AQUA delta package checks; never connects to hosting."""
import hashlib
import json
import os
from pathlib import Path
import runpy
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'scripts/marineaqua-image-delta-package.py'
MODULE = runpy.run_path(str(SOURCE))
def sha(value):
    return hashlib.sha256(value).hexdigest()

class DeltaTest(unittest.TestCase):
    def test_oversized_marker_keeps_full_zip_bytes(self):
        cwd = os.getcwd()
        with tempfile.TemporaryDirectory() as place:
            os.chdir(place)
            try:
                root = Path('deploy/client/images')
                root.mkdir(parents=True)
                files = {}
                for index in range(2100):
                    name = 'image-%04d-' % index + 'x' * 218 + '.webp'
                    (root / name).write_bytes(b'x')
                    files[name] = {'size': 1, 'sha256': sha(b'x')}
                Path('.marineaqua-remote-image-manifest.json').write_text(json.dumps({'images': files}))
                MODULE['main']()
                self.assertFalse(Path('deploy/marineaqua-image-delta.json').exists())
                self.assertEqual(len(list(root.iterdir())), len(files))
            finally:
                os.chdir(cwd)

    def test_exact_reuse_and_fallback(self):
        cwd = os.getcwd()
        with tempfile.TemporaryDirectory() as place:
            os.chdir(place)
            try:
                root = Path('deploy/client/images')
                root.mkdir(parents=True)
                unchanged=b'real-original-image'
                modified=b'new-image'
                (root/'one.webp').write_bytes(unchanged)
                (root/'two.webp').write_bytes(modified)
                remote={'images':{
                    'one.webp':{'size':len(unchanged),'sha256':sha(unchanged)},
                    'two.webp':{'size':len(modified),'sha256':sha(b'different')}}}
                Path('.marineaqua-remote-image-manifest.json').write_text(json.dumps(remote))
                MODULE['main']()
                result=json.loads(Path('deploy/marineaqua-image-delta.json').read_text())
                self.assertEqual(result['reuse'],['one.webp'])
                self.assertFalse((root/'one.webp').exists())
                self.assertEqual((root/'two.webp').read_bytes(),modified)
                Path('deploy/marineaqua-image-delta.json').unlink()
                Path('.marineaqua-remote-image-manifest.json').unlink()
                MODULE['main']()
                self.assertFalse(Path('deploy/marineaqua-image-delta.json').exists())
            finally:
                os.chdir(cwd)
if __name__ == '__main__':
    unittest.main()
