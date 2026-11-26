# Stable: improve MQTT reconnect and broker PUBACK monitoring

## Problem
MQTT communication can remain unavailable for an extended period after the broker restarts. The existing worker relies on private socket state and does not explicitly schedule reconnection after every loop failure. A connected client also does not establish that recent publishes were acknowledged.

## Proposed changes
- Schedule explicit reconnection after connection or network-loop failures, with exponential backoff from 1 to 30 seconds.
- Reset backoff only after a confirmed connection; bound the CONNACK wait.
- Monitor one outstanding QoS 1 publish on the existing availability topic.
- Warn after 90 seconds without PUBACK; request recovery after a previously successful acknowledgement, subject to a 300-second cooldown.
- No new MQTT client, topics, configuration fields or Home Assistant dependency.

## Validation
- Python 3.9/3.11 regression tests against the original Stable 1.4.5 archive passed, including simulated stale socket, PUBACK timeout and cooldown.
- Real Paho/Mosquitto integration test passed after stopping and restarting a disposable broker: https://github.com/petec999/hpi/actions/runs/45797409471
- Tested on a NanoPi running Stable 1.4.5 with local patches. During an actual Mosquitto outage, reconnection attempts followed the expected backoff and communication recovered automatically without restarting HaierPi. Home Assistant confirmed reception after reconnect.
- Full NanoPi reboot with the revised worker: initial connection failure recovered on the next attempt, followed by PUBACK and HA heartbeat confirmation. UART reception was verified.
- Further testing of a stalled PUBACK with TCP still connected is welcome.

PUBACK confirms broker acknowledgement, not subscriber reception. See docs/stable-mqtt-reliability.md for verification and rollback.
