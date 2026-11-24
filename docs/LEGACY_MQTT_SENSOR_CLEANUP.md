# Removing retired MQTT Discovery sensors in HaierPi alpha13

## Scope
This patch updates the alpha13 installer to add a small cleanup block to
`main.py` inside `configure_ha_mqtt_discovery()`. On HA discovery
reconnect/republication, it uses the existing `_clear('sensor', unique_id)`
helper to publish **empty retained MQTT discovery configurations** for
legacy sensors only. The current active entities keep their existing
`unique_id` and history.

The old sensor configurations targeted are:

| Old unique ID | Reason |
|---|---|
| `HaierPi_Pd` | Superseded by `Pdset` and `Pdact` sensors, in bar |
| `HaierPi_Ps` | Superseded by `Psset` and `Psact` sensors, in bar |
| `HaierPi_PCH` | Old sensor domain, current state is `binary_sensor` |
| `HaierPi_PCool` | Old sensor domain, current state is `binary_sensor` |
| `HaierPi_PDHW` | Old sensor domain, current state is `binary_sensor` |
| `HaierPi_CH_daily_kWh` | Old estimated counter, no longer maintained in alpha13 |
| `HaierPi_DHW_daily_kWh` | Old estimated counter, no longer maintained in alpha13 |
| `HaierPi_DeltaTempEco` | Removed estimated ECO delta (not the active quiet/turbo delta sensors) |

**Important:** These unique IDs must match the retained MQTT discovery
configs to be removed. The Home Assistant *entity_id* alone is not a
guaranteed mapping to the MQTT *unique_id*. This is a best-effort
cleanup of known historical names; the MQTT broker's retained discovery
messages should be inspected to confirm exact object IDs and identify
any other orphan configurations. No broker credentials or HA access are
included.

## Do not remove
Some entities returning unknown/unavailable still exist in alpha13
and may be temporarily uninitialized or missing configuration:
`HaierPi_Delta`, `HaierPi_HumidityInside`,
`HaierPi_DirectInsideSetTemp`, and live climate/binary sensors.
These require investigation, **not a global clear command**.

## Local Home Assistant legacy entities
`climate.haier_2`, `climate.haier_dhw_2`, `sensor.haier_cop`,
`sensor.haier_curve_2`, `sensor.haier_delta`,
`sensor.haier_delta_zadana_twi`, `sensor.haier_power`, and
`switch.haier_flimit` are separate `haier_*` entities.
They are not automatically managed by this cleanup.

Check each entity's source integration and references in dashboards,
automations, scripts and templates before deleting it manually.

## Behavior
The cleanup is run by the next `configure_ha_mqtt_discovery()` call,
not by deleting a Home Assistant registry file. It is restricted to
MQTT domain `sensor` to avoid affecting the valid current
`binary_sensor` implementations with similar names.

Source: [Home Assistant MQTT discovery documentation](https://www.home-assistant.io/integrations/mqtt/).
