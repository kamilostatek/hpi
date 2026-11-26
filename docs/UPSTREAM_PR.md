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
- Python 3.9/3.11: passed against pinned Stable main.py and legacy GPIO fixture (https://github.com/petec999/hpi/actions/runs/45788712613).
- Applied on a NanoPi running an existing Stable-derived 1.4.5_3 installation; service restarted and live pump frames returned. A subsequent restart with the separate MQTT patch also returned valid telemetry.
- Not yet tested: whole-device reboot, physical pre-exported pin, other boards/backends, pristine Stable install.

This fixes a concrete defect, but its role in the separate WWW regression is unproven.

See docs/stable-gpio-reliability.md for verification and rollback.
