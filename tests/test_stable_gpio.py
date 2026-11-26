import ast
import errno
import io
import runpy
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import os

P=runpy.run_path("patches/stable-gpio.py")
ROOT=Path(os.environ["STABLE_ROOT"])

class GPIOTests(unittest.TestCase):
    def setUp(self):
        self.src=(ROOT/"HPi/GPIO.py").read_text()
        self.code=P["patch_gpio"](self.src)
        self.g={}
        exec(self.code,self.g)
        self.events=[]
        self.exported=False
        self.path="/sys/class/gpio/gpio17"
    def fake_open(self,name,mode):
        class File(io.StringIO):
            def close(f):
                if not f.closed:
                    v=f.getvalue()
                    self.events.append((name,v))
                    if name.endswith("/export"):
                        self.exported=True
                super().close()
        return File()
    def fake_exists(self,p):
        return self.exported and p in (self.path,self.path+"/direction")
    def exercise(self,existing,initial):
        self.exported=existing
        with patch("os.path.isdir",side_effect=self.fake_exists),patch("os.path.exists",side_effect=self.fake_exists),patch("builtins.open",side_effect=self.fake_open):
            self.g["setup"](17,self.g["OUT"],initial)
        self.assertEqual(self.events[-1],(self.path+"/direction","low" if initial==0 else "out"))
        self.assertFalse(any(name.endswith("/unexport") for name,_ in self.events))
        self.assertEqual(sum(name.endswith("/export") for name,_ in self.events),0 if existing else 1)
    def test_new_pin(self):
        self.exercise(False,0)
    def test_existing_pin(self):
        self.exercise(True,0)
    def test_legacy_signature(self):
        self.exercise(True,None)
    def test_error_logged(self):
        with patch("builtins.open",side_effect=OSError(errno.EIO,"test")),self.assertLogs(level="ERROR"):
            self.assertIs(self.g["output"](17,0),False)
    def test_actual_source_idempotent(self):
        self.assertEqual(P["patch_gpio"](self.code),self.code)
        core=(ROOT/"main.py").read_text()
        updated=P["patch_main"](core)
        self.assertEqual(P["patch_main"](updated),updated)
        self.assertEqual(updated.replace("GPIO.setup(modbuspin, GPIO.OUT, initial=GPIO.LOW)","GPIO.setup(modbuspin, GPIO.OUT)",1),core)
        compile(updated,"main.py","exec")
        compile(self.code,"GPIO.py","exec")
    def test_busy_export(self):
        def busy(name,mode):
            if name.endswith("/export"):
                self.exported=True
                raise OSError(errno.EBUSY,"busy")
            return self.fake_open(name,mode)
        with patch("os.path.isdir",side_effect=self.fake_exists),patch("os.path.exists",side_effect=self.fake_exists),patch("builtins.open",side_effect=busy):
            self.g["setup"](17,self.g["OUT"],0)
        self.assertEqual(self.events,[(self.path+"/direction","low")])
if __name__=="__main__":
    unittest.main()
