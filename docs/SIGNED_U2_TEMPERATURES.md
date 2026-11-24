# Correct signed 12-bit U2 temperature decoding in HaierPi alpha13

## Background

The bundled PyHaier decoders use `raw -= 4095` when the sign bit (bit 11)
is set in a 12-bit temperature value. For two's-complement (U2) encoding,
the correct sign extension is `raw -= (1 << 12)`, or `raw -= 4096`.

The existing code therefore reports every negative 12-bit temperature
**0.1 °C too high**, while nonnegative values are unchanged.

Examples (value in °C, raw register field in hexadecimal):

| Raw | Existing | U2 correction |
|---|---:|---:|
| `0xFFF` | 0.0 | -0.1 |
| `0xFF6` | -0.9 | -1.0 |
| `0xFE2` | -2.9 | -3.0 |

### Community reverse-engineering reference

[Elektroda.pl — Konwersja RS485-ttl: sterowanie pompą PC Haier
AUxxxFYCRA z ESP32 i ATW — rejestry, page 2,
post #31 by `lopr_pol` (8 October 2025)](https://www.elektroda.pl/rtvforum/topic3994059-30.html#21714188)

The post reconstructs two signed 12-bit values from packed register bytes,
identifies U2/two's-complement coding, and demonstrates bit inversion plus
adding 1 for negative values. This is independent community protocol
reverse engineering, **not an official Haier specification**.

## Affected decoders shipped in 1.4.5 alpha13

The archive contains 10 occurrences in six source files under
`env/lib/python3.9/site-packages/PyHaier/`:

| File | Occurrences |
|---|---:|
| `GetTao.py` | 1 |
| `GetTdef.py` | 1 |
| `GetTdTs.py` | 2 |
| `GetTSatPd.py` | 2 |
| `GetTSatPs.py` | 2 |
| `GetThiTho.py` | 2 |

`GetTwiTwo.py` does not use the same negative-value subtraction and is
intentionally not modified.

## How this repository applies the correction

- `alpha13.sh` unpacks the alpha13 distribution normally, then checks the
  expected PyHaier source layout and changes all 10 `-= 4095` instances
  to `-= 4096` **before starting the Haier service**.
- It validates all six files before writing and allows an already-corrected
  set of files (safe re-run).
- `tools/patch_alpha13_u2.py` can create a separate patched tarball for
  maintainers who prefer to distribute a corrected archive. It never
  overwrites the original:
  ```sh
  python3 tools/patch_alpha13_u2.py 1.4.5_alpha13.tar.gz \
      -o 1.4.5_alpha13_u2fix.tar.gz
  ```
- `tests/test_u2_temperature_decode.py` covers sign boundaries, all six
  expected decoder files, and fail-closed behavior if a target is missing:
  ```sh
  python3 -m unittest discover -s tests -p 'test_u2_temperature_decode.py'
  ```

The alpha13 binary archive is left unchanged in the pull request so the
code-level correction can be reviewed as a normal text diff.

## Scope

The fix changes temperature decoding only; it does not alter RS485 register
layout, compressor setpoints, GPIO control, climate commands, entity IDs,
or MQTT topics. Negative values in `Tao`, `Tdef`, `Td`, `Ts`,
`Thi`, `Tho`, and saturation temperatures can change by 0.1 °C.

It does **not** address unrelated `fact/fset` sensor mapping, freshness
of MQTT values, or `abs()` being used in superheat/subcooling computation.
Those should be reviewed separately.
