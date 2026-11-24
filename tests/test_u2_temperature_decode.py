"""Regression tests for HaierPi alpha13 signed 12-bit U2 temperature decoding."""
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
import tarfile
import unittest

from tools.patch_alpha13_u2 import CHANGES, patch_archive


def signed12_temperature(raw):
    if not 0 <= raw <= 0xFFF:
        raise ValueError(raw)
    if raw & 0x800:
        raw -= 4096
    return raw / 10


class U2TemperatureTests(unittest.TestCase):
    def test_signed_boundaries(self):
        cases = {
            0x000: 0.0,
            0x001: 0.1,
            0x7FF: 204.7,
            0x800: -204.8,
            0xFE2: -3.0,
            0xFF6: -1.0,
            0xFFF: -0.1,
        }
        for raw, expected in cases.items():
            with self.subTest(raw=hex(raw)):
                self.assertAlmostEqual(signed12_temperature(raw), expected)

    @staticmethod
    def _create_test_archive(path, *, missing=None):
        with tarfile.open(path, 'w:gz') as archive:
            for name, count in CHANGES.items():
                if name == missing:
                    continue
                # Real archive contains the same subtraction sites; Python syntax
                # is deliberately valid but these are fixture-only functions.
                source = 'def decode(raw):\n' + ''.join(
                    '    raw -= 4095\n' for _ in range(count)
                ) + '    return raw\n'
                raw = source.encode()
                member = tarfile.TarInfo(
                    './env/lib/python3.9/site-packages/PyHaier/' + name
                )
                member.size = len(raw)
                archive.addfile(member, BytesIO(raw))
            untouched = b'print("other files preserved")\n'
            member = tarfile.TarInfo('./main.py')
            member.size = len(untouched)
            archive.addfile(member, BytesIO(untouched))

    def test_patches_expected_sites_only(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source, dest = root / 'original.tar.gz', root / 'patched.tar.gz'
            self._create_test_archive(source)
            result = patch_archive(source, dest)
            self.assertEqual(sum(result.values()), 10)
            self.assertEqual(len(result), 6)
            with tarfile.open(dest, 'r:gz') as archive:
                self.assertEqual(
                    archive.extractfile('./main.py').read(),
                    b'print("other files preserved")\n'
                )
                for name, count in CHANGES.items():
                    path = './env/lib/python3.9/site-packages/PyHaier/' + name
                    data = archive.extractfile(path).read()
                    self.assertEqual(data.count(b'-= 4096'), count)
                    self.assertNotIn(b'-= 4095', data)

    def test_missing_decoder_fails_without_creating_output(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source, dest = root / 'original.tar.gz', root / 'patched.tar.gz'
            self._create_test_archive(source, missing='GetTao.py')
            with self.assertRaises(ValueError):
                patch_archive(source, dest)
            self.assertFalse(dest.exists())


if __name__ == '__main__':
    unittest.main()
