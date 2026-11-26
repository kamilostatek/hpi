# HaierPi 1.4.5 alpha13: mark stale RS485 telemetry unavailable in Home Assistant

## Problem

Existing MQTT Discovery entities use the single `/haierpi/connected` availability
topic. That means HA treats the MQTT bridge as healthy even if HaierPi is no
longer receiving current RS485/Modbus frames from the heat pump.

The current `mqtt_publish_snapshot()` also republishes cached values. Therefore,
`expire_after: 0` and retained sensor topics can leave stale readings looking
current in Home Assistant, including Twi/Two, Td/Ts, compressor Hz, pressure,
superheat and subcooling.

## Patch in this PR

The release is a compressed `.tar.gz`, so the installer uses a validated
post-extraction source patch, before starting `haier`. The same patch is
available as `tools/patch_alpha13_freshness.py` for review and testing.

- Record **separate monotonic timestamps** for each **complete** 16-register
  R141 frame and 22-register R241 frame. The normal pump idle/compressor-off
  state does not itself make a frame stale.
- Publish **retained** availability states, only on transition:
  - `<mqtt_topic>/haierpi/r141_fresh`
  - `<mqtt_topic>/haierpi/r241_fresh`
- Use a conservative **180 second** timeout after the last complete frame.
  `offline` is published until that block is received, or once it goes stale.
- On MQTT reconnect, explicitly publish `offline` for both block states
  before advertising `<mqtt_topic>/haierpi/connected=online`. This prevents
  a retained `online` from a prior process lifetime from being treated as fresh.
- Amend MQTT Discovery of **frame-dependent measurements** to use a list of
  availability topics with `availability_mode: all`. For example:
  - Twi / Two / Thi / Tho, 3-way valve, pump state, defrost -> **R141**
  - Tao / Tdef, Td / Ts, pressures, compressor, EEV, fans -> **R241**
  - Superheat / Subcooling -> **both R141 and R241**
- Add two diagnostic entities:
  `binary_sensor.haierpi_r141_telemetry_fresh` and
  `binary_sensor.haierpi_r241_telemetry_fresh` (suggested entity IDs; HA may
  assign different names). Their discovery unique IDs are
  `HaierPi_R141Fresh` and `HaierPi_R241Fresh`.
- Non-frame-derived entities such as `HaierPi_HumidityInside`, setpoints,
  editable controls, and thermostat settings retain their existing behavior.
- The installer validates **all** expected source anchors and Python syntax
  before making an atomic replacement. It is safe to re-run without double
  patching.

### Expected Home Assistant behavior

When MQTT is up but R241 has received no complete frame for over 180s:

- `R241 telemetry fresh` is OFF.
- R241-based entities (compressor frequency, Pd/Ps, Td/Ts, etc.) show
  `unavailable`, rather than the last retained value as though current.
- R141 temperatures can remain available if their frames are still arriving.
- Superheat and Subcooling show unavailable if **either** block is stale.

After valid frames return, the associated entities become available again.
Cached state topics may be republished normally, but only while their
availability topics are healthy.

## Compatibility and limitations

- No writes to the pump, Modbus register changes, setpoint changes, or
  changes to existing MQTT entity IDs.
- The timeout is a **conservative initial default**, not a manufacturer
  guarantee. Verify actual R141/R241 cadence on several running systems
  before release and adjust the timeout if regular gaps exceed 180s.
- A complete frame means the expected count of register values was received.
  This does not add a CRC check or fully validate the serial protocol;
  malformed-but-complete frames remain outside this PR's scope.
- This is **telemetry availability**, not disabling control commands. The
  app's existing MQTT connection status and control behavior are unchanged.
- The patch does not make raw sensor timestamps available as numeric
  entities. A future update could expose time since last R141/R241 frame.
- Real hardware and live MQTT integration testing are still needed.

## Tests

```sh
python3 -m unittest discover -s tests -p 'test_alpha13_mqtt_freshness.py' -v
```

Tests cover independent block status, startup without frames, 180-second
boundary, publishing only on transition, MQTT reconnect, HA Discovery
availability mapping, preserving unrelated entities, idempotent install and
fail-closed source validation. The patch also matches the exact alpha13
`main.py` source anchors (independently checked before publication).

Reference: [Home Assistant MQTT availability options](https://www.home-assistant.io/integrations/sensor.mqtt/).

## Scope relative to other PRs

Independent of the U2 temperature decoder fix, compressor fact/fset and
superheat/subcooling calculations, and legacy MQTT sensor cleanup.
Each PR currently changes `alpha13.sh`, so installers may need conflict
resolution when merging; retain all post-extraction patches in order.
