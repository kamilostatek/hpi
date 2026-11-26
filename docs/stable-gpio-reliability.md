# Stable GPIO / RS485 initialization fix

Base: original 1.4.5 Stable archive (SHA-256 `ca803a3f8777efa75a40739d2efeb0362365ffa4291d3eb76d9a231c6cb53976`). The upstream repository distributes the Python source in an archive, so this branch supplies a reviewable, fail-closed source patch rather than silently replacing the binary archive.

## Problem

The original sysfs GPIO setup unexports an already exported channel and then skips the export/direction setup because of the `else` branch. It also does not explicitly initialize the RS485 direction to receive mode. Failed GPIO writes return False silently.

## Change

Reuse an exported channel; export only when necessary; wait up to one second for the sysfs direction file, accept an EBUSY export race, and set the direction and initial level using the kernel's atomic `low`/ `high` direction operation. The existing RS485 driver defines LOW as receive mode. The original two-argument setup calls still work. Preserve output failure return value, but log the error. No shutdown ordering, pin numbering, control commands, serial parser, MQTT or WWW changes.

This targets the sysfs GPIO implementation shipped in Stable; other GPIO backends need their own compatibility verification. The observed loss of frames after a separate WWW change is not proven to be caused by this defect.

## Test / install on HaierPi

Download the patch from a reviewed commit on this branch. Run as root in a suitable maintenance window, with a verified working pump beforehand.

    python3 stable-gpio.py --diff
    python3 stable-gpio.py --apply

The default action is a dry run. The installer validates both files before touching either, preserves mode/ownership, backs up affected files, and refuses unknown implementation layouts. It does not remount or restart the service. Record the exact backup path printed by the installer.

Then restart once:

    systemctl restart haier
    journalctl -u haier -n 80 --no-pager

Verify the original status API / panel, fresh R141/R241, HA readings and normal heating operation. Do not manually toggle the RS485 direction pin or force a pump write merely to test. Verify normal service restart and eventually a normal reboot. On the existing customized installation verify its WWW panel and MQTT watchdog too.

Rollback if frames do not return: copy the affected files from the exact printed backup directory back to their original paths (only files that exist in that backup), then restart haier and verify telemetry again. No configuration edits are needed.

## Upstream checklist

- [ ] Python regression tests against the pinned archive pass.
- [ ] Actual NanoPi/sysfs hardware restart and reboot.
- [ ] Existing heating and MQTT operation unaffected.
- [ ] Check upstream hardware variants before claiming broad compatibility.
