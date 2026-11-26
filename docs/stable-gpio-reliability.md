# Stable GPIO / RS485 initialization fix

Base: original 1.4.5 Stable archive (SHA-256 `ca803a3f8777efa75a40739d2efeb0362365ffa4291d3eb76d9a231c6cb53976`). The upstream repository distributes the Python source in an archive, so this branch supplies a reviewable, fail-closed source patch rather than silently replacing the binary archive.

## Problem

The original sysfs GPIO setup unexports an already exported channel and then skips the export/direction setup because of the `else` branch. It also does not explicitly initialize the RS485 direction to receive mode. Failed GPIO writes return False silently.

## Change

Reuse an exported channel; export only when necessary; wait up to one second for the sysfs direction file, accept an EBUSY export race, and set the direction and initial level using the kernel's atomic `low`/ `high` direction operation. The existing RS485 driver defines LOW as receive mode. The original two-argument setup calls still work. Preserve output failure return value, but log the error. No shutdown ordering, pin numbering, control commands, serial parser, MQTT or WWW changes.

Stable updates main.py but does not ship HPi/GPIO.py. The test fixture is the legacy GPIO module observed on an existing NanoPi installation; main.py is validated against the actual pinned Stable archive. The patch targets that legacy sysfs GPIO implementation only and refuses other implementations.

## Test / install on HaierPi

Download the patch from a reviewed commit on this branch. Run as root in a suitable maintenance window, with a verified working pump beforehand.

    python3 stable-gpio.py --diff
    python3 stable-gpio.py --apply

The default action is a dry run. The installer validates both files before touching either, preserves mode/ownership, backs up affected files, and refuses unknown implementation layouts. It does not remount or restart the service. Record the exact backup path printed by the installer.

Then restart once:

    systemctl restart haier
    journalctl -u haier -n 80 --no-pager

Verify the original status API / panel, fresh R141/R241, HA readings and normal heating operation. Do not manually toggle the RS485 direction pin or force a pump write merely to test. Verify normal service restart and eventually a normal reboot.

Rollback if frames do not return: copy the affected files from the exact printed backup directory back to their original paths (only files that exist in that backup), then restart haier and verify telemetry again. No configuration edits are needed.

## Hardware validation — 2026-11-26

Tested on a NanoPi running Stable 1.4.5 with local patches. Pump communication and telemetry worked normally after service restart and a full reboot with the device configured for persistent read-write storage. Python 3.9/3.11 tests passed against the original Stable main.py and legacy GPIO fixture: https://github.com/petec999/hpi/actions/runs/45788712613.

A first reboot with the previous read-only overlay configuration showed no UART RX bytes and an existing shutdown failure when writing charts.pkl. After switching to persistent read-write storage, a full reboot succeeded with both patches unchanged (UART RX 3447, valid pump telemetry, error=0). The cause of the first boot's UART failure is not established. Further testing on other supported devices and with a previously exported physical GPIO is welcome.

## Upstream checklist

- [x] Python regression tests against the pinned archive pass.
- [x] Actual NanoPi/sysfs service restart and live telemetry.
- [x] Whole-device reboot with persistent read-write storage.
- [x] Normal heating and MQTT operation observed after reboot.
- [ ] Check upstream hardware variants before claiming broad compatibility.
