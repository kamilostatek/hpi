"""Exercise the actual patched worker with Paho and a disposable broker."""
import ast
import logging
import os
import runpy
import socket
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path
import paho.mqtt.client as mqtt

P=runpy.run_path("patches/stable-mqtt.py")

def until(predicate,timeout=20):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        if predicate():
            return True
        time.sleep(.1)
    return False

class BrokerTest(unittest.TestCase):
    def test_broker_restart(self):
        source=P["patch"]((Path(os.environ["STABLE_ROOT"])/"main.py").read_text())
        node=next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name=="connect_mqtt")
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0))
            port=sock.getsockname()[1]
        with tempfile.TemporaryDirectory() as td:
            conf=Path(td)/"mosquitto.conf"
            conf.write_text("listener %d 127.0.0.1\nallow_anonymous true\npersistence false\n"%port)
            def start():
                return subprocess.Popen(["mosquitto","-c",str(conf)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            def ready():
                try:
                    with socket.create_connection(("127.0.0.1",port),.2):
                        return True
                except OSError:
                    return False
            broker=start()
            stop=threading.Event()
            client=mqtt.Client("stable-test")
            connections=[]
            acks=[]
            client.on_connect=lambda cl,ud,flags,rc: connections.append(rc)
            client.on_publish=lambda cl,ud,mid: acks.append(mid)
            g={"client":client,"mqtt_stop_event":stop,"mqtt_broker_addr":"127.0.0.1","mqtt_broker_port":port,"mqtt_topic":"stable-test","mqtt":mqtt,"logging":logging,"time":time}
            exec(P["BLOCK"],g)
            exec(compile(ast.Module(body=[node],type_ignores=[]),"worker","exec"),g)
            t=threading.Thread(target=g["connect_mqtt"],daemon=True)
            try:
                self.assertTrue(until(ready))
                t.start()
                self.assertTrue(until(lambda: connections==[0] and len(acks)>=1))
                broker.terminate()
                broker.wait(timeout=5)
                self.assertTrue(until(lambda: not client.is_connected()))
                time.sleep(3)
                before=len(acks)
                broker=start()
                self.assertTrue(until(ready))
                self.assertTrue(until(lambda: len(connections)>=2 and connections[-1]==0 and len(acks)>before))
                self.assertTrue(t.is_alive())
            finally:
                stop.set()
                if t.ident is not None:
                    t.join(10)
                if broker.poll() is None:
                    broker.terminate()
                    broker.wait(timeout=5)
            self.assertFalse(t.is_alive())

if __name__=="__main__":
    unittest.main()
