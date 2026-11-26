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
    def test_upgrade_v1_with_external_hook(self):
        core=(ROOT/"main.py").read_text()
        core=core.replace("            rc = cl.loop(timeout=1.0)\n",P["EXTERNAL_WATCHDOG"]+"            rc = cl.loop(timeout=1.0)\n",1)
        old=core.replace("def connect_mqtt():",P["BLOCK"]+"\ndef connect_mqtt():",1)
        old=old.replace("    while not mqtt_stop_event.is_set():\n","    _stable_health = _StableMqttHealth()\n    while not mqtt_stop_event.is_set():\n",1)
        old=old.replace("            rc = cl.loop(timeout=1.0)\n","            rc = cl.loop(timeout=1.0)\n"+P["OLD_TICK"],1)
        updated=P["patch"](old)
        self.assertEqual(P["patch"](updated),updated)
        self.assertIn(P["NEW_EXTERNAL"],updated)
        self.assertEqual(updated.count(P["BLOCK"]),1)

    def test_worker_recovers_even_with_stale_socket(self):
        core=P["patch"]((ROOT/"main.py").read_text())
        node=next(n for n in ast.parse(core).body if isinstance(n,ast.FunctionDef) and n.name=="connect_mqtt")
        stop=Event()
        delays=[]
        class Stop:
            def is_set(self):
                return stop.is_set()
            def wait(self,delay):
                delays.append(delay)
        class Fake(Client):
            _sock=object()
            _client_id=b"test"
            def __init__(self):
                super().__init__()
                self.connected=False
                self.attempts=0
                self.loops=0
            def connect(self,*args):
                self.attempts+=1
                if self.attempts in (2,3):
                    raise OSError("broker offline")
                return 0
            def loop(self,timeout):
                self.loops+=1
                if self.loops==1:
                    self.connected=True
                    return 0
                if self.loops==2:
                    self.connected=False
                    return 7
                self.connected=True
                stop.set()
                return 0
        c=Fake()
        g={"client":c,"mqtt_stop_event":Stop(),"mqtt_broker_addr":"test","mqtt_broker_port":1883,"mqtt_topic":"test","mqtt":SimpleNamespace(MQTT_ERR_SUCCESS=0),"logging":logging,"time":__import__("time")}
        exec(P["BLOCK"],g)
        exec(compile(ast.Module(body=[node],type_ignores=[]),"worker","exec"),g)
        g["connect_mqtt"]()
        self.assertEqual(c.attempts,4)
        self.assertEqual(delays,[1.0,1.8,3.24])

if __name__=="__main__":
    unittest.main()
