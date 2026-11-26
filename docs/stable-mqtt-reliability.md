# Stable MQTT broker-level reliability

Base: original 1.4.5 Stable archive (SHA-256 `ca803a3f8777efa75a40739d2efeb0362365ffa4291d3eb76d9a231c6cb53976`). The upstream repository distributes Python source inside an archive. This branch contains a reviewable source patch and tests, not a replaced release tarball.

## Scope

The existing MQTT connection worker may report a connection without a recent successful publish. Add one outstanding QoS 1 refresh of its existing retained availability topic (`<configured topic>/haierpi/connected`), at most once per 30 seconds after a successful acknowledgement. No extra MQTT client, subscription, callback, configuration field, HA dependency, write to pump or new topic. PUBACK is evidence that the broker acknowledged the publish, not proof that subscribers or HA received/processed it; MQTT 3.1.1 cannot report broker authorization details reliably. Existing pump-frame freshness remains independent.

Warn when the acknowledgement is missing for 90 seconds. Only after a prior successful acknowledgement request a reconnect in the existing worker; at most once per 300 seconds. Do not accumulate new probes while one is outstanding, and do not probe while disconnected or stopping. The revised worker explicitly reconnects after failed connect or loop calls, with interruptible backoff of 1–30 seconds, reset after confirmed connection, and a 15-second CONNACK deadline. Retries no longer depend on the private socket attribute. No forced reconnect if the first acknowledgement never arrives. The patch targets Stable's Paho worker and requires an MQTTMessageInfo object exposing is_published().

## Test / install on HaierPi

The patch can be tested independently on a Stable installation.

Download stable-mqtt.py from a reviewed immutable commit, and run as root:

    python3 stable-mqtt.py --diff
    python3 stable-mqtt.py --apply

Default is a dry run; the patcher validates the source and compiles the updated code. Backup path is printed. It does not change config, remount or restart.

    systemctl restart haier
    journalctl -u haier -n 80 --no-pager

Verify fresh pump frames, broker availability, MQTT discovery and normal control. In a separate test environment, stop and restore the broker and check reconnect and normal message flow. Use a fault-injection broker test for an established session that withholds PUBACK; ordinary broker outage alone does not exercise this recovery branch. Do not interrupt the household broker or heating system without a maintenance window.

Rollback: copy main.py from the exact printed backup directory to /opt/haier/main.py, restart haier, verify telemetry. No credentials should be included in bug reports.

## Hardware validation — 2026-11-26

Tested on a NanoPi running Stable 1.4.5 with local patches. After applying the fix, the broker acknowledged the publication after service restart and full device reboot:

    MQTT broker PUBACK health confirmed

MQTT also connected and received PUBACK during the earlier read-only boot despite initial network unavailability. Pump telemetry worked normally after reboot with persistent read-write storage. Python 3.9/3.11 regression tests passed against the original Stable archive, including simulated timeout and reconnect cooldown: https://github.com/petec999/hpi/actions/runs/45788755974.

## Reconnect v2 validation

The original worker recovered only after an extended interruption during a broker outage test. The revised worker (installed commit 7a876cc20fa478203cc195ff9e62a72c3c8d8be8) was tested against a second actual Mosquitto outage on NanoPi:

- 11:03:23: MQTT connection lost (loop rc=7).
- Reconnect delays: 1, 1.8, 3.2, 5.8, 10.5, 18.9 and 30 seconds.
- 11:04:34: connection established automatically, same HaierPi process.
- 11:05:02: Home Assistant confirmed reception of the independent heartbeat.

The latest source compatibility revision (e8646100b2e09222d139f42a36ed0022558a3a73) changes the patcher's source matching, not the installed reconnect logic. Both Python 3.9 and 3.11 jobs passed regression tests and the real Paho/Mosquitto outage integration test: https://github.com/petec999/hpi/actions/runs/45797409471

A subsequent full NanoPi reboot with reconnect v2 and persistent read-write storage also passed: 11:11:04 initial OSError, 11:11:05 automatic reconnect, 11:11:06 PUBACK confirmed, 11:11:17 HA heartbeat confirmed. The service was active and UART RX count was 5473. The stalled-PUBACK recovery path has simulated coverage but has not yet been reproduced on NanoPi with TCP still connected.

## Upstream checklist

- [x] Unit tests against original Stable source.
- [x] Real Paho/Mosquitto integration test and physical broker outage/recovery.
- [x] Normal startup and broker acknowledgement on NanoPi after service restart and full reboot with reconnect v2.
- [ ] Check without HA.
- [x] Observed bounded reconnect backoff and successful recovery during broker outage.
- [ ] Physical stalled-PUBACK fault injection.
