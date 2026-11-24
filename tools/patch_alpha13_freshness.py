"""Post-extraction patch of the distributed HaierPi 1.4.5 alpha13 main.py.

Idempotent, fails closed if source layout is not exactly the expected alpha13.
"""
from pathlib import Path
import ast
import os
import stat
import tempfile

path = Path(os.environ["HPI_MAIN_PY"])
original = path.read_text(encoding="utf-8")
marker = "def mqtt_pump_freshness_tick():"
if marker in original:
    print("HaierPi MQTT pump freshness already installed")
    raise SystemExit(0)

source = original

def replace_once(before, after):
    global source
    count = source.count(before)
    if count != 1:
        raise RuntimeError("Unexpected alpha13 source layout (found %d): %s" %
                           (count, before[:100]))
    source = source.replace(before, after, 1)


anchor = 'last_pump_error = ""           # last exception from ReadPump (if any)\n'
replace_once(anchor, anchor + '''
# Monotonic timestamps are updated only after a *complete* R141/R241 frame.
# An idle compressor does not imply missing RS485 communications.
_pump_frame_last_at = {"R141": 0.0, "R241": 0.0}
_pump_freshness_published = {}
PUMP_FRAME_STALE_AFTER_S = 180.0  # Conservative: larger than normal read cadence.
''')

anchor = '                    R141=T141\n'
replace_once(anchor, anchor + '''                    if len(T141) == 16:
                        _pump_frame_last_at["R141"] = time.monotonic()
''')
anchor = '                    R241=T241\n'
replace_once(anchor, anchor + '''                    if len(T241) == 22:
                        _pump_frame_last_at["R241"] = time.monotonic()
''')

# On every MQTT reconnect, invalidate retained availability before announcing
# MQTT connectivity. The scheduler then republishes the fresh state.
anchor = '    client.publish(mqtt_topic + "/haierpi/connected","online", qos=1, retain=True)\n'
replace_once(anchor, '''    for _block in ("R141", "R241"):
        client.publish(mqtt_topic + "/haierpi/" + _block.lower() + "_fresh",
                       "offline", qos=1, retain=True)
    _pump_freshness_published.clear()
''' + anchor)

# Independent block health, published only when availability changes.
anchor = 'def connect_mqtt():\n'
replace_once(anchor, '''def _pump_frame_fresh(block, now=None):
    if now is None:
        now = time.monotonic()
    last = _pump_frame_last_at.get(block, 0.0)
    return bool(last > 0 and 0 <= now - last <= PUMP_FRAME_STALE_AFTER_S)


def mqtt_pump_freshness_tick():
    if str(globals().get('use_mqtt', '0')) != '1':
        return
    now = time.monotonic()
    for block in ("R141", "R241"):
        payload = "online" if _pump_frame_fresh(block, now) else "offline"
        if _pump_freshness_published.get(block) == payload:
            continue
        mqtt_publish_raw("/haierpi/" + block.lower() + "_fresh",
                         payload, qos=1, retain=True)
        _pump_freshness_published[block] = payload


''' + anchor)

anchor = '    every(1).seconds.do(_safe_job(mqtt_snapshot_tick, "mqtt_snapshot_tick"))\n'
replace_once(anchor, anchor + '''    every(1).seconds.do(_safe_job(mqtt_pump_freshness_tick, "mqtt_pump_freshness_tick"))
''')

# MQTT Discovery: the built-in /connected topic checks only HaierPi's MQTT
# connection. For diagnostic sensors add the relevant RS485 block(s).
# Using a list of availability topics must not be combined with avty_t.
anchor = '''            for k, v in _avty.items():
                cfg.setdefault(k, v)
'''
replace_once(anchor, '''            if "availability" not in cfg:
                for k, v in _avty.items():
                    cfg.setdefault(k, v)
''')

anchor = '    # --- Entity builders ---\n'
replace_once(anchor, '''    # Entity IDs stay identical; only the MQTT availability metadata changes.
    _r141_ids = {
        "HaierPi_DHWCurrent", "HaierPi_3wayvalve", "HaierPi_Pump",
        "HaierPi_Error", "HaierPi_Twi", "HaierPi_Two",
        "HaierPi_Thi", "HaierPi_Tho", "HaierPi_Delta",
        "HaierPi_Defrost", "HaierPi_Antifreeze", "HaierPi_Heater",
    }
    _r241_ids = {
        "HaierPi_Archerror", "HaierPi_LastError", "HaierPi_Tao",
        "HaierPi_Tdef", "HaierPi_Fan1", "HaierPi_Fan2",
        "HaierPi_Pd_set", "HaierPi_Pd_act", "HaierPi_Ps_set",
        "HaierPi_Ps_act", "HaierPi_TSatPd_set", "HaierPi_TSatPd_act",
        "HaierPi_TSatPs_set", "HaierPi_TSatPs_act",
        "HaierPi_Compfact", "HaierPi_Compfset",
        "HaierPi_Compcurrent", "HaierPi_Compvoltage",
        "HaierPi_Comptemperature", "HaierPi_Td", "HaierPi_Ts",
        "HaierPi_EEVLevel",
    }
    _cross_block_ids = {"HaierPi_Superheat", "HaierPi_Subcooling"}

    def _apply_pump_frame_availability(cfg, unique_id):
        blocks = []
        if unique_id in _r141_ids or unique_id in _cross_block_ids:
            blocks.append("r141")
        if unique_id in _r241_ids or unique_id in _cross_block_ids:
            blocks.append("r241")
        if not blocks:
            return
        cfg["availability"] = [{
            "topic": mqtt_topic + "/haierpi/connected",
            "payload_available": "online",
            "payload_not_available": "offline",
        }] + [{
            "topic": mqtt_topic + "/haierpi/" + block + "_fresh",
            "payload_available": "online",
            "payload_not_available": "offline",
        } for block in blocks]
        cfg["availability_mode"] = "all"

''' + anchor)

anchor = '        _pub("sensor", unique_id, cfg)\n'
replace_once(anchor, '''        _apply_pump_frame_availability(cfg, unique_id)
''' + anchor)
anchor = '        _pub("binary_sensor", unique_id, cfg)\n'
replace_once(anchor, '''        _apply_pump_frame_availability(cfg, unique_id)
''' + anchor)

# Diagnostics remain available as ON/OFF when MQTT is connected even if no
# Modbus frames have been seen; never gate them on their own freshness.
anchor = '    # --- New: native HA entities (no YAML) ---\n'
replace_once(anchor, '''    configure_binary_sensor("R141 telemetry fresh", mqtt_topic + "/haierpi/r141_fresh",
                            "HaierPi_R141Fresh", device_class="connectivity",
                            payload_on="online", payload_off="offline")
    configure_binary_sensor("R241 telemetry fresh", mqtt_topic + "/haierpi/r241_fresh",
                            "HaierPi_R241Fresh", device_class="connectivity",
                            payload_on="online", payload_off="offline")

''' + anchor)

ast.parse(source, filename=str(path))
# Preserve permissions and replace atomically after all assertions pass.
mode = stat.S_IMODE(path.stat().st_mode)
with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=str(path.parent),
                                 prefix='.haier_freshness_', delete=False) as out:
    out.write(source)
    temp_path = Path(out.name)
try:
    os.chmod(temp_path, mode)
    os.replace(temp_path, path)
except Exception:
    temp_path.unlink(missing_ok=True)
    raise
print("HaierPi alpha13 MQTT freshness: R141/R241 availability enabled")
