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
# Signed 12-bit U2 temperatures (Haier RS485 / PyHaier)
# https://www.elektroda.pl/rtvforum/topic3994059-30.html#21714188
# -------------------------------------------------
# The alpha13 archive contains 10 cases of "-= 4095" in six PyHaier
# temperature decoders. For 12-bit two's complement, subtract 4096.
# Verify all expected files BEFORE changing any decoder; fail on unknown layouts.
python3 - <<'PYHAIER_U2'
import ast
from pathlib import Path

root = Path('/opt/haier/env/lib/python3.9/site-packages/PyHaier')
expected = {
    'GetTao.py': 1,
    'GetTdef.py': 1,
    'GetTdTs.py': 2,
    'GetTSatPd.py': 2,
    'GetTSatPs.py': 2,
    'GetThiTho.py': 2,
}
old, new = ' -= 4095', ' -= 4096'
changes = {}
for name, count in expected.items():
    path = root / name
    original = path.read_text(encoding='utf-8')
    if original.count(old) == count and original.count(new) == 0:
        patched = original.replace(old, new)
        ast.parse(patched, filename=str(path))
        changes[path] = patched
    elif original.count(old) == 0 and original.count(new) == count:
        continue  # Already patched (safe re-run).
    else:
        raise RuntimeError(f'Unexpected PyHaier decoder layout: {path}')
for path, patched in changes.items():
    path.write_text(patched, encoding='utf-8')
print(f'HaierPi U2: corrected {sum(expected.values())} temperature decodes '
      f'in {len(expected)} files ({len(changes)} file(s) changed).')
PYHAIER_U2

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
