# Stable MQTT broker-level reliability

Base: original 1.4.5 Stable archive (SHA-256 `ca803a3f8777efa75a40739d2efeb0362365ffa4291d3eb76d9a231c6cb53976`). The upstream repository distributes Python source inside an archive. This branch contains a reviewable source patch and tests, not a replaced release tarball.

## Scope

The existing MQTT connection worker may report a connection without a recent successful publish. Add one outstanding QoS 1 refresh of its existing retained availability topic (`<configured topic>/haierpi/connected`), at most once per 30 seconds after a successful acknowledgement. No extra MQTT client, subscription, callback, configuration field, HA dependency, write to pump or new topic. PUBACK is evidence that the broker acknowledged the publish, not proof that subscribers or HA received/processsed it; MQTT 3.1.1 cannot report broker authorization details reliably. Existing pump-frame freshness and the optional HA end-to-end watchdog remain independent.

Warn when the acknowledgement is missing for 90 seconds. Only after a prior successful acknowledgement request a reconnect in the existing worker; at most once per 300 seconds. Do not accumulate new probes while one is outstanding, and do not probe while disconnected or stopping. Existing reconnect/backoff logic remains in charge. No forced reconnect if the first acknowledgement never arrives. The patch targets Stable's Paho worker and requires an MQTTMessageInfo object exposing is_published().

## Test / install on HaierPi

First test on an isolated Stable installation or test this independently after the GPIO experiment. The existing local fork already has an HA end-to-end watchdog; do not infer that this broker-level patch replaces it. A controlled test should also verify that recovery mechanisms do not conflict.

Download stable-mqtt.py from a reviewed immutable commit, and run as root:

    python3 stable-mqtt.py --diff
    python3 stable-mqtt.py --apply

Default is a dry run; the patcher validates the source and compiles the updated code. Backup path is printed. It does not change config, remount or restart.

    systemctl restart haier
    journalctl -u haier -n 80 --no-pager

Verify fresh pump frames, broker availability, MQTT discovery and normal control. In a separate test environment, stop and restore the broker and check reconnect and normal message flow. Use a fault-injection broker test for an established session that withholds PUBACK; ordinary broker outage alone does not exercise this recovery branch. Do not interrupt the household broker or heating system without a maintenance window.

Rollback: copy main.py from the exact printed backup directory to /opt/haier/main.py, restart haier, verify telemetry. No credentials should be included in bug reports.

## Upstream checklist

- [ ] Unit tests against original Stable source.
- [ ] Test with real Paho/Mosquitto.
- [ ] Hardware test on NanoPi; check with and without HA.
- [ ] Verify recovery and absence of reconnect loops.
- [ ] Test compatibility with optional HA end-to-end watchdog separately.
