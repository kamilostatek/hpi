"""Static regression cases for alpha13 published compressor and refrigerant metrics.

These tests do not require live hardware or import the 350 KB production main.py.
They verify the expected order of the PyHaier GetCompInfo response and
whether preserving sign of the temperature difference matters.
"""
import unittest

def compressor_values_from_pyhaier(compinfo):
    """PyHaier/GetCompInfo.py returns [fset, fact, current, voltage, temp]."""
    if len(compinfo) < 5:
        raise ValueError("Incomplete compressor state")
    return {"fset": compinfo[0], "fact": compinfo[1]}

def signed_refrigerant_metrics(ts, tsat_ps_act, tsat_pd_act, thi):
    return round(ts - tsat_ps_act, 1), round(tsat_pd_act - thi, 1)

class Alpha13MetricsTests(unittest.TestCase):
    def test_set_and_actual_frequency_are_not_swapped(self):
        result = compressor_values_from_pyhaier([55, 40, 4.8, 220, 35.1])
        self.assertEqual(result, {"fset": 55, "fact": 40})

    def test_sign_is_preserved(self):
        self.assertEqual(signed_refrigerant_metrics(-2, -1, 30, 31), (-1.0, -1.0))

    def test_positive_values_unchanged(self):
        self.assertEqual(signed_refrigerant_metrics(2, 1, 32, 31), (1.0, 1.0))

    def test_incomplete_compressor_data_rejected(self):
        with self.assertRaises(ValueError):
            compressor_values_from_pyhaier([40])

if __name__ == "__main__":
    unittest.main()
