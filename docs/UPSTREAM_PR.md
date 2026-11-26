# Stable: fix GPIO reinitialization and RS485 receive-mode startup

## Problem
The legacy HPi.GPIO sysfs setup unexports an already exported pin, then skips export and direction setup due to the else branch. GPIO write errors are silently swallowed. Stable also does not explicitly request the RS485 receive level at startup.

## Proposed changes
- Reuse existing exported GPIOs; handle EBUSY and wait for the direction attribute.
- Preserve the two-argument setup API and add optional atomic initial LOW/HIGH.
- Initialize RS485 direction to LOW, the receive level used by the existing driver.
- Log GPIO output errors while preserving the existing failure return.

Stable ships main.py but not HPi/GPIO.py. The patcher validates the observed legacy implementation and refuses unknown layouts; the reviewable patch is supplied separately rather than replacing the tarball. No MQTT, heating, frame parser or WWW changes.

## Validation
- Python 3.9/3.11 regression tests passed against the original Stable 1.4.5 main.py and the legacy GPIO implementation (https://github.com/petec999/hpi/actions/runs/45788712613).
- Tested on a NanoPi running Stable 1.4.5 with local patches. After applying the fix and restarting the service, pump communication and telemetry worked normally.
- Further testing on other supported devices and after a full reboot is welcome.

See docs/stable-gpio-reliability.md for verification and rollback.
