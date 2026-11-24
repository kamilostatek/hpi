# HaierPi alpha13 — compressor and refrigerant metric corrections

## 1. Compressor actual vs requested frequency

Bundled `PyHaier/GetCompInfo.py` yields:

```
[fset, fact, current, voltage, temperature]
```

However, MQTT Discovery in `main.py` incorrectly uses index 0 for
the **actual** frequency and index 1 for the **target**.

Fix:
- `HaierPi_Compfact` -> `value_json[1]`.
- `HaierPi_Compfset` -> `value_json[0]`.

These are the existing entity unique IDs; no entity renaming is needed.
Independent cross-check: `d4p/ha_haier` maps
`DATA_COMP_FREQ_SET = comp_info[0]` and
`DATA_COMP_FREQ_ACTUAL = comp_info[1]`.

## 2. Superheat/Subcooling sign

Current alpha13:
```python
superheat = abs(Ts - TsatPs_act)
subcooling = abs(TsatPd_act - Thi)
```
Using `abs()` discards the sign and can disguise invalid or transient
measurements. The patch instead returns signed differences:

```python
superheat = Ts - TsatPs_act
subcooling = TsatPd_act - Thi
```

Unit stays °C for the difference (same numerical increment as K).
Data sources remain unchanged; note R141/R241 may be sampled at
slightly different times. A future improvement should validate freshness
of each input before publishing.

## Delivery

Because the alpha13 release is a compressed tar.gz rather than
plain GitHub source, `alpha13.sh` verifies four exact source snippets
after unpacking and corrects them *before restarting the service*.
It is idempotent, validates Python syntax, and fails if the source is
not the expected alpha13 layout.

## Validation

`python3 -m unittest discover -s tests -p 'test_compressor_refrigerant_metrics.py'`

Synthetic examples verify 55 Hz target / 40 Hz actual and the behavior
of negative/positive refrigerant-temperature differences. This is a
source-level fix, not an on-device test.

No RS485 registers, write operations, MQTT topics, or existing entity IDs
are altered. The related signed 12-bit U2 decode fix is a separate PR.
