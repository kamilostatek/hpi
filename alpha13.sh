#!/bin/bash
set -euo pipefail

SERVICE="haier"
BASE_DIR="/opt/haier"
CONFIG="/opt/config.ini"
TMP="$(mktemp)"

echo "📦 Wklejam pliki z paczki test 1.4.5_alpha13"

systemctl stop "$SERVICE"

rm -rf "$BASE_DIR/static" "$BASE_DIR/templates" "$BASE_DIR/main.py"
cd "$BASE_DIR"

curl -sL https://github.com/kamilostatek/hpi/raw/refs/heads/main/1.4.5_alpha13.tar.gz | tar -xz

HPI_MAIN_PY="$BASE_DIR/main.py" python3 - <<'PYHAIER_FRESHNESS'
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
PYHAIER_FRESHNESS

cp "$CONFIG" "${CONFIG}.backup"

echo "✅ Podmiana zakończona"
echo

# -------------------------------------------------
# FUNKCJE
# -------------------------------------------------

config_has() {
    grep -Eq "^[[:space:]]*$1[[:space:]]*=" "$CONFIG"
}

insert_after_section() {
    local section="$1"
    local content="$2"
    local tmp
    tmp="$(mktemp)"

    awk -v sec="[$section]" -v txt="$content" '
    $0 == sec {
        print
        print txt
        next
    }
    { print }
    ' "$CONFIG" > "$tmp" && mv "$tmp" "$CONFIG"
}


# -------------------------------------------------
# Usuwanie wpisu blablabla = abccasd
# -------------------------------------------------

sed -i '/^[[:space:]]*blablabla[[:space:]]*=/d' "$CONFIG"

# -------------------------------------------------
# CWU
# -------------------------------------------------

if ! config_has "dhwuse"; then
    read -p "Czy korzystasz z CWU? [t/n]: " -n 1 answer < /dev/tty
    echo

    [[ "$answer" =~ [Tt] ]] && DHW=1 || DHW=0

    insert_after_section "SETTINGS" "dhwuse = $DHW"
    echo "ℹ️  Wpis dhwuse dodany"
else
    echo "ℹ️  Wpis dhwuse istnieje"
fi

# -------------------------------------------------
# ZONE
# -------------------------------------------------

if ! config_has "zone_frost_enable"; then
    insert_after_section "SETTINGS" \
    "zone_frost_enable = 0
    zone_frost_temp = -5
    zone_frost_mode = quiet
    zone_warm_enable = 0
    zone_warm_temp = 10
    zone_warm_mode = quiet_flimit"
    echo "ℹ️  Wpis zone dodany"
else
    echo "ℹ️  Wpis zone istnieje"
fi

# -------------------------------------------------
# EMERGENCY
# -------------------------------------------------

if ! config_has "emergency_intemp"; then
    insert_after_section "SETTINGS" "emergency_intemp = 20.0"
    echo "ℹ️  Wpis emergency_intemp dodany"
else
    echo "ℹ️  Wpis emergency_intemp istnieje"
fi

# -------------------------------------------------
# DHW TEMP
# -------------------------------------------------

if ! config_has "dhwtemp"; then
    insert_after_section "SETTINGS" "dhwtemp = builtin"
    insert_after_section "HOMEASSISTANT" "dhwsensor ="
    echo "ℹ️  Wpis dhwtemp dodany"
else
    echo "ℹ️  Wpis dhwtemp istnieje"
fi

# -------------------------------------------------
# ANTI LEGIONELLA & DHW HEATER ASSIST
# -------------------------------------------------

if ! config_has "dhw_heater_assist_below_temp"; then
    insert_after_section "SETTINGS" "dhw_heater_assist_below_temp = 10"
    echo "ℹ️  Wpis dhw_heater_assist_below_temp dodany"
else
    echo "ℹ️  Wpis dhw_heater_assist_below_temp istnieje"
fi

if ! config_has "dhw_heater_assist_enable"; then
    insert_after_section "SETTINGS" "dhw_heater_assist_enable = 0"
    echo "ℹ️  Wpis dhw_heater_assist_enable dodany"
else
    echo "ℹ️  Wpis dhw_heater_assist_enable istnieje"
fi

if ! config_has "anti_legionella_temp"; then
    insert_after_section "SETTINGS" "anti_legionella_temp = 60.0"
    echo "ℹ️  Wpis anti_legionella_temp dodany"
else
    echo "ℹ️  Wpis anti_legionella_temp istnieje"
fi

if ! config_has "anti_legionella_enable"; then
    insert_after_section "SETTINGS" "anti_legionella_enable = 0"
    echo "ℹ️  Wpis anti_legionella_enable dodany"
else
    echo "ℹ️  Wpis anti_legionella_enable istnieje"
fi

# -------------------------------------------------
# NO LIMIT MODE
# -------------------------------------------------

if ! config_has "dhwnolimit_mode"; then
    insert_after_section "SETTINGS" "dhwnolimit_mode = turbo"
    echo "ℹ️  Wpis dhwnolimit_mode dodany"
else
    echo "ℹ️  Wpis dhwnolimit_mode istnieje"
fi

# -------------------------------------------------
# DIRECT THERMOSTAT
# -------------------------------------------------

if ! config_has "direct_inside_settemp"; then
    insert_after_section "SETTINGS" \
"direct_inside_settemp = 22.0"
    echo "ℹ️  Wpis direct_inside_settemp dodany"
else
    echo "ℹ️  Wpis direct_inside_settemp istnieje"
fi

# -------------------------------------------------
# UI_FONT
# -------------------------------------------------

if ! config_has "ui_font"; then
    insert_after_section "MAIN" "ui_font = inter"
    insert_after_section "SETTINGS" \
"antifreeze_custom_enable = 0
antifreeze_custom_outtemp = 1
antifreeze_custom_twi = 4
antifreeze_custom_two = 4
antifreeze_custom_runtime_min = 0.5
service_test_duration_s = 30
thermostat_on = 1
heatingcurve_last = manual"
    echo "ℹ️  Wpis ui_font dodany"
else
    echo "ℹ️  Wpis ui_font istnieje"
fi

# -------------------------------------------------
# MQTT SNAPSHOT INTERVAL
# -------------------------------------------------

if ! config_has "snapshot_interval_s"; then
    insert_after_section "MQTT" "snapshot_interval_s = 30"
    echo "ℹ️  Wpis snapshot_interval_s dodany"
else
    echo "ℹ️  Wpis snapshot_interval_s istnieje"
fi

# -------------------------------------------------
# RESTORE LAST OPERATING STATE
# -------------------------------------------------

if ! config_has "restore_state_on_boot"; then
    insert_after_section "SETTINGS" "restore_state_on_boot = 1"
    echo "Restore state on boot enabled"
else
    echo "restore_state_on_boot already exists"
fi

# -------------------------------------------------
# START
# -------------------------------------------------

echo
echo "🚀 Startuję usługę Haier..."
systemctl start "$SERVICE" \
    && echo "✅ OK: USŁUGA WYSTARTOWAŁA" \
    || echo "⚠️  Błąd uruchamiania usługi"
