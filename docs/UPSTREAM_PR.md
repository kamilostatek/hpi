# Stable: monitor MQTT broker PUBACK and recover stalled publishes

## Problem
A connected MQTT client is not sufficient evidence that the broker recently acknowledged a publish. Stable already reconnects on socket failure, but an established connection may have stalled publishing.

## Proposed changes
- Refresh the existing retained availability topic with QoS 1 in the existing MQTT worker.
- Track one outstanding MQTTMessageInfo acknowledgement; do not accumulate probes while waiting.
- Warn after 90 seconds without PUBACK.
- Request reconnect only after a prior successful acknowledgement, with a 300-second cooldown.
- Preserve existing backoff/reconnect behavior; no new client, topics, callbacks, HA dependency, or configuration fields.

PUBACK demonstrates broker acknowledgement only, not receipt by HA or another subscriber. The patcher validates the original worker structure rather than replacing the Stable archive.

## Validation
- Python 3.9/3.11 regression tests passed against the original Stable 1.4.5 archive, including simulated PUBACK timeout and reconnect cooldown (https://github.com/petec999/hpi/actions/runs/45788755974).
- Tested on a NanoPi running Stable 1.4.5 with local patches. The broker confirmed PUBACK after service restart and full device reboot; pump telemetry worked normally after reboot with persistent read-write storage.
- Further testing under actual broker failure and recovery conditions is welcome.

See docs/stable-mqtt-reliability.md for verification and rollback.
