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

# -------------------------------------------------
# Remove only retired SENSOR discovery configurations in alpha13.
# Keep the current binary_sensor, number, climate and switch entities.
# HA must receive the retained empty config on the next MQTT discovery run.
# -------------------------------------------------
HPI_MAIN_PY="$BASE_DIR/main.py" python3 - <<'PYHAIER_LEGACY_DISCOVERY'
import ast
import os
from pathlib import Path

path = Path(os.environ["HPI_MAIN_PY"])
source = path.read_text(encoding="utf-8")
anchor = "    _clear('sensor', 'HaierPi_DHWSet')\n"
marker = "    # Legacy sensors retired in alpha13: use newer discovery entities.\n"
legacy = {
    # Old pressure sensors superseded by Pd/Ps set/actual sensors (bar).
    "HaierPi_Pd",
    "HaierPi_Ps",
    # Old read-only CH/DHW switch states: binary_sensor replacements exist.
    "HaierPi_PCH",
    "HaierPi_PCool",
    "HaierPi_PDHW",
    # Discontinued estimated daily compressor-energy counters.
    "HaierPi_CH_daily_kWh",
    "HaierPi_DHW_daily_kWh",
    # Removed ECO delta sensor (quiet/turbo/flimit deltas remain supported).
    "HaierPi_DeltaTempEco",
}
# Never remove retained configs for current entities (e.g. HaierPi_Delta,
# humidity, direct thermostat target, or the binary_sensor PCH/PCool/PDHW).
if marker not in source:
    if source.count(anchor) != 1:
        raise RuntimeError("Unexpected HaierPi MQTT discovery layout")
    lines = marker + "".join(
        "    _clear('sensor', {!r})\n".format(unique_id)
        for unique_id in sorted(legacy)
    )
    source = source.replace(anchor, anchor + lines, 1)
    ast.parse(source, filename=str(path))
    path.write_text(source, encoding="utf-8")
print("HaierPi MQTT discovery: retired legacy sensor configs cleared on reconnect.")
PYHAIER_LEGACY_DISCOVERY

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
