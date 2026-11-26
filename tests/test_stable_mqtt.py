import ast
import logging
import os
import runpy
import unittest
from pathlib import Path
from types import SimpleNamespace
from threading import Event

P=runpy.run_path("patches/stable-mqtt.py")
ROOT=Path(os.environ["STABLE_ROOT"])

class Info:
    rc=0
    ack=False
    def is_published(self):
        return self.ack
class Client:
    def __init__(self):
        self.connected=True
        self.sent=[]
        self.disconnects=0
    def is_connected(self):
        return self.connected
    def publish(self,*args,**kwargs):
        self.sent.append((args,kwargs,Info()))
        return self.sent[-1][2]
    def disconnect(self):
        self.disconnects+=1
        self.connected=False

class Tests(unittest.TestCase):
    def setUp(self):
        g={"mqtt":SimpleNamespace(MQTT_ERR_SUCCESS=0),"logging":logging}
        exec(P["BLOCK"],g)
        self.h=g["_StableMqttHealth"]()
        self.c=Client()
        self.stop=Event()
    def tick(self,t):
        self.h.tick(self.c,t,"climate/test",self.stop)
    def test_normal_ack_and_rate(self):
        self.tick(0)
        self.assertEqual(self.c.sent[0][:2],(("climate/test/haierpi/connected","online"),{"qos":1,"retain":True}))
        self.tick(1)
        self.assertEqual(len(self.c.sent),1)
        self.c.sent[0][2].ack=True
        self.tick(2)
        self.assertEqual(self.h.last_ok,2)
        self.tick(31)
        self.assertEqual(len(self.c.sent),1)
        self.tick(32)
        self.assertEqual(len(self.c.sent),2)
    def test_guarded_recovery(self):
        self.tick(0)
        self.c.sent[0][2].ack=True
        self.tick(1)
        self.tick(31)
        self.tick(120)
        self.assertEqual(self.c.disconnects,0)
        self.tick(121)
        self.assertEqual(self.c.disconnects,1)
        self.c.connected=True
        self.tick(122)
        self.tick(212)
        self.assertEqual(self.c.disconnects,1)
        self.tick(421)
        self.assertEqual(self.c.disconnects,2)
    def test_no_ack_ever(self):
        self.tick(0)
        self.tick(90)
        self.tick(1000)
        self.assertEqual(self.c.disconnects,0)
        self.assertEqual(len(self.c.sent),1)
    def test_stop_and_disconnected(self):
        self.stop.set()
        self.tick(0)
        self.stop.clear()
        self.c.connected=False
        self.tick(1)
        self.assertEqual(self.c.sent,[])
    def test_original_source(self):
        core=(ROOT/"main.py").read_text()
        updated=P["patch"](core)
        self.assertEqual(P["patch"](updated),updated)
        compile(updated,"main.py","exec")
        old={n.name:ast.dump(n) for n in ast.parse(core).body if isinstance(n,ast.FunctionDef)}
        new={n.name:ast.dump(n) for n in ast.parse(updated).body if isinstance(n,ast.FunctionDef)}
        self.assertEqual({k for k in old if old[k]!=new[k]},{"connect_mqtt"})
if __name__=="__main__":
    unittest.main()
