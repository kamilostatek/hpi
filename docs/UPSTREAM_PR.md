# Stable: monitor MQTT broker PUBACK and recover stalled publishes

## Problem
A connected MQTT client is not sufficient evidence that the broker recently acknowledged a publish. Stable already reconnects on socket failure, but an established connection may have stalled publishing.

## Proposed changes
- Refresh the existing retained availability topic with QoS 1 in the existing MQTT worker.
- Track one outstanding MQTTMessageInfo acknowledgement; do not accumulate probes while waiting.
- Warn after 90 seconds without PUBACK.
- Request reconnect only after a prior successful acknowledgement, with a 300-second cooldown.
- Preserve existing backoff/reconnect behavior; no new client, topics, callbacks, HA dependency, or configuration fields.

PUBACK demonstrates broker acknowledgement only, not receipt by HA or another subscriber. This is separate from the optional HA end-to-end watchdog. The patcher validates the original worker structure rather than replacing the Stable archive.

## Validation
- Python 3.9/3.11: passed against pinned Stable archive; simulated ACK, timeout, initial failure, cooldown and shutdown tests (https://github.com/petec999/hpi/actions/runs/45788755974).
- Hardware startup on NanoPi with existing Stable-derived 1.4.5_3 and independent GPIO fix:
    10:14:31 MQTT broker PUBACK health confirmed
    10:14:44 MQTT watchdog OK: HA confirmed heartbeat (failures=0 recoveries=0)
  Subsequent status snapshot contained complete pump data.
- Not yet tested: actual broker outage, stalled PUBACK fault injection, recovery interactions with the existing HA watchdog, reboot, clean Stable device without HA.

See docs/stable-mqtt-reliability.md for verification and rollback.
