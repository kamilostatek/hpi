"""Regression tests for the HaierPi 1.4.5 alpha13 R141/R241 freshness patch."""
import ast
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "tools" / "patch_alpha13_freshness.py"
INSTALLER = ROOT / "alpha13.sh"

# Exact patch anchors, modeled as executable minimal alpha13 code.
FIXTURE = '''
import time
last_pump_error = ""           # last exception from ReadPump (if any)

def ReadPump():
    if True:
        if True:
            if True:
                if True:
                    R141=T141
                    R241=T241

def on_connect(client, userdata, flags, rc):
    client.publish(mqtt_topic + "/haierpi/connected","online", qos=1, retain=True)

def run_background_function():
    every(1).seconds.do(_safe_job(mqtt_snapshot_tick, "mqtt_snapshot_tick"))

def connect_mqtt():
    pass

def configure_ha_mqtt_discovery():
    _avty = {
        "avty_t": mqtt_topic + "/haierpi/connected",
        "pl_avail": "online",
        "pl_not_avail": "offline",
    }
    def _pub(domain: str, unique_id: str, payload: dict) -> None:
        try:
            cfg = dict(payload)
            for k, v in _avty.items():
                cfg.setdefault(k, v)
            captured.append((domain, unique_id, cfg))
        except Exception:
            raise
    # --- Entity builders ---
    def configure_sensor(name, status_topic, unique_id):
        cfg = {"name": name, "stat_t": status_topic}
        _pub("sensor", unique_id, cfg)
    def configure_binary_sensor(name, status_topic, unique_id, device_class=None, payload_on="on", payload_off="off"):
        cfg = {"name": name}
        _pub("binary_sensor", unique_id, cfg)
    configure_sensor("Twi", "/twi", "HaierPi_Twi")
    configure_sensor("Tao", "/tao", "HaierPi_Tao")
    configure_sensor("SH", "/sh", "HaierPi_Superheat")
    configure_sensor("humidity", "/humid", "HaierPi_HumidityInside")
    configure_binary_sensor("Defrost", "/defrost", "HaierPi_Defrost")
    # --- New: native HA entities (no YAML) ---
'''


class FreshnessPatchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "main.py"
        self.path.write_text(FIXTURE, encoding="utf-8")

    def apply_patch(self):
        return subprocess.run(
            [sys.executable, str(PATCHER)],
            env={**os.environ, "HPI_MAIN_PY": str(self.path)},
            capture_output=True, text=True, check=False
        )

    def test_installer_contains_identical_patcher(self):
        installer = INSTALLER.read_text(encoding="utf-8")
        start = "HPI_MAIN_PY=\"$BASE_DIR/main.py\" python3 - <<'PYHAIER_FRESHNESS'\n"
        end = "\nPYHAIER_FRESHNESS\n"
        inline = installer.split(start, 1)[1].split(end, 1)[0]
        self.assertEqual(inline.strip(), PATCHER.read_text(encoding="utf-8").strip())

    def test_patch_idempotence_and_python_syntax(self):
        first = self.apply_patch()
        self.assertEqual(first.returncode, 0, first.stderr)
        patched = self.path.read_text(encoding="utf-8")
        ast.parse(patched)
        self.assertIn("def mqtt_pump_freshness_tick():", patched)
        self.assertIn("if len(T141) == 16:", patched)
        self.assertIn("if len(T241) == 22:", patched)
        second = self.apply_patch()
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(patched, self.path.read_text(encoding="utf-8"))

    def test_freshness_transitions_and_discovery(self):
        first = self.apply_patch()
        self.assertEqual(first.returncode, 0, first.stderr)
        source = self.path.read_text(encoding="utf-8")
        received = []
        ns = {
            "mqtt_topic": "haier",
            "use_mqtt": "1",
            "captured": [],
            "mqtt_snapshot_tick": lambda: None,
            "_safe_job": lambda function, *args: function,
            "mqtt_publish_raw": lambda suffix, payload, qos=1, retain=True:
                received.append((suffix, payload, qos, retain)),
        }
        exec(compile(source, str(self.path), "exec"), ns)
        ns["configure_ha_mqtt_discovery"]()
        configs = {uid: cfg for _domain, uid, cfg in ns["captured"]}

        self.assertEqual(len(configs["HaierPi_Twi"]["availability"]), 2)
        self.assertEqual(len(configs["HaierPi_Tao"]["availability"]), 2)
        self.assertEqual(len(configs["HaierPi_Superheat"]["availability"]), 3)
        self.assertEqual(len(configs["HaierPi_Defrost"]["availability"]), 2)
        self.assertEqual(configs["HaierPi_Twi"]["availability_mode"], "all")
        self.assertNotIn("avty_t", configs["HaierPi_Twi"])
        self.assertNotIn("availability", configs["HaierPi_HumidityInside"])
        self.assertEqual(configs["HaierPi_HumidityInside"]["avty_t"],
                         "haier/haierpi/connected")
        self.assertIn("HaierPi_R141Fresh", configs)
        self.assertIn("HaierPi_R241Fresh", configs)
        self.assertNotIn("availability", configs["HaierPi_R141Fresh"])

        ns["time"] = SimpleNamespace(monotonic=lambda: 1000.0)
        self.assertFalse(ns["_pump_frame_fresh"]("R141", 1000.0))
        ns["mqtt_pump_freshness_tick"]()
        self.assertEqual([x[:2] for x in received],
                         [("/haierpi/r141_fresh", "offline"),
                          ("/haierpi/r241_fresh", "offline")])

        # One block becomes fresh; stale R241 stays unavailable.
        ns["_pump_frame_last_at"]["R141"] = 999.0
        ns["_pump_frame_last_at"]["R241"] = 810.0
        ns["mqtt_pump_freshness_tick"]()
        self.assertEqual(received[-1][:2], ("/haierpi/r141_fresh", "online"))
        self.assertEqual(len(received), 3)

        # Exact 180s boundary is fresh; 181s is stale.
        ns["time"] = SimpleNamespace(monotonic=lambda: 1179.0)
        self.assertTrue(ns["_pump_frame_fresh"]("R141"))
        ns["time"] = SimpleNamespace(monotonic=lambda: 1180.0)
        self.assertFalse(ns["_pump_frame_fresh"]("R141"))
        ns["mqtt_pump_freshness_tick"]()
        self.assertEqual(received[-1][:2], ("/haierpi/r141_fresh", "offline"))
        self.assertEqual(len(received), 4)
        ns["mqtt_pump_freshness_tick"]()
        self.assertEqual(len(received), 4)  # No message flood.

        # Reconnection must reset retained online/offline before MQTT online.
        class Client:
            def __init__(self):
                self.published = []
            def publish(self, topic, payload, qos=1, retain=True):
                self.published.append((topic, payload))
        client = Client()
        ns["on_connect"](client, None, None, 0)
        self.assertEqual(client.published[0],
                         ("haier/haierpi/r141_fresh", "offline"))
        self.assertEqual(client.published[1],
                         ("haier/haierpi/r241_fresh", "offline"))
        self.assertEqual(client.published[2],
                         ("haier/haierpi/connected", "online"))

    def test_unknown_source_fails_without_modifying_file(self):
        self.path.write_text('print("unknown release")\n', encoding="utf-8")
        original = self.path.read_text(encoding="utf-8")
        result = self.apply_patch()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.path.read_text(encoding="utf-8"), original)


if __name__ == "__main__":
    unittest.main()
