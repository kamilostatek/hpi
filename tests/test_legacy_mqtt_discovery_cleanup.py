"""Regression checks for the alpha13 MQTT discovery migration block.

Only retired sensor-domain configs should be cleared. Current binary sensors,
climate, humidity, and thermostat entities must remain untouched.
"""
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "alpha13.sh"
START = "HPI_MAIN_PY=\"$BASE_DIR/main.py\" python3 - <<'PYHAIER_LEGACY_DISCOVERY'\n"
END = "\nPYHAIER_LEGACY_DISCOVERY"


def cleanup_code():
    contents = SCRIPT.read_text(encoding="utf-8")
    return contents.split(START, 1)[1].split(END, 1)[0]


class LegacyDiscoveryCleanupTests(unittest.TestCase):
    def run_patch(self, source):
        with TemporaryDirectory() as td:
            target = Path(td) / "main.py"
            target.write_text(source, encoding="utf-8")
            env = dict(os.environ, HPI_MAIN_PY=str(target))
            process = subprocess.run(
                [sys.executable, "-c", cleanup_code()],
                env=env, text=True, capture_output=True, check=False
            )
            return process, target.read_text(encoding="utf-8")

    def test_eight_retired_sensor_definitions_are_cleared(self):
        fixture = (
            "def configure_ha_mqtt_discovery():\n"
            "    def _clear(domain, unique_id): pass\n"
            "    _clear('sensor', 'HaierPi_DHWSet')\n"
            "    configure_binary_sensor('PCH', None, 'HaierPi_PCH')\n"
            "    configure_sensor('Humidity', None, 'HaierPi_HumidityInside')\n"
        )
        result, updated = self.run_patch(fixture)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(updated.count("    _clear('sensor', 'HaierPi_"), 9)
        self.assertIn("_clear('sensor', 'HaierPi_Pd')", updated)
        self.assertIn("_clear('sensor', 'HaierPi_CH_daily_kWh')", updated)
        self.assertNotIn("_clear('binary_sensor', 'HaierPi_PCH')", updated)
        self.assertIn("configure_binary_sensor('PCH'", updated)
        self.assertIn("configure_sensor('Humidity'", updated)

        # A second installer run is safe and does not add duplicates.
        second, again = self.run_patch(updated)
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(updated, again)

    def test_unexpected_layout_does_not_modify_code(self):
        fixture = "def configure_ha_mqtt_discovery():\n    pass\n"
        result, updated = self.run_patch(fixture)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(updated, fixture)


if __name__ == "__main__":
    unittest.main()
