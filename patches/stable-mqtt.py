#!/usr/bin/env python3
"""Broker-level MQTT liveness check for HaierPi 1.4.5 Stable.

Uses existing MQTT worker and availability topic; no HA or extra connection.
"""
import argparse
import ast
import difflib
import os
import shutil
import stat
import tempfile
from pathlib import Path

MARK="# STABLE MQTT PUBACK HEALTH v1"
BLOCK='''# STABLE MQTT PUBACK HEALTH v1
class _StableMqttHealth:
    """Single outstanding QoS 1 availability refresh, driven by the MQTT worker."""
    def __init__(self):
        self.pending = None
        self.sent = None
        self.next_probe = 0.0
        self.last_ok = None
        self.last_reconnect = None
        self.warned = False

    def reset(self):
        self.pending = None
        self.sent = None
        self.next_probe = 0.0

    def tick(self, cl, now, topic, stop_event):
        if stop_event.is_set() or not cl.is_connected():
            self.reset()
            return
        if self.pending is not None:
            try:
                ack = self.pending.is_published()
            except (RuntimeError, ValueError):
                ack = False
            if ack:
                first = self.last_ok is None
                self.last_ok = now
                self.pending = None
                self.sent = None
                self.next_probe = now + 30
                if first:
                    logging.info("MQTT broker PUBACK health confirmed")
                elif self.warned:
                    logging.info("MQTT broker PUBACK health recovered")
                self.warned = False
            elif now - self.sent >= 90:
                if not self.warned:
                    logging.warning("MQTT broker PUBACK not received for 90 seconds")
                    self.warned = True
                # Never force recovery before a previously proven acknowledgement.
                # Do not enqueue more QoS 1 messages while this one is outstanding.
                if (self.last_ok is not None and
                    (self.last_reconnect is None or now-self.last_reconnect >= 300)
                    and not stop_event.is_set() and cl.is_connected()):
                    self.last_reconnect = now
                    logging.warning("MQTT broker PUBACK timeout: requesting reconnect")
                    cl.disconnect()
                    self.reset()
            return
        if now < self.next_probe:
            return
        self.next_probe = now + 30
        try:
            info = cl.publish(topic + "/haierpi/connected", "online", qos=1, retain=True)
            if info.rc == mqtt.MQTT_ERR_SUCCESS:
                self.pending = info
                self.sent = now
            elif not self.warned:
                logging.warning("MQTT availability refresh not accepted: rc=%s",info.rc)
                self.warned = True
        except Exception as exc:
            if not self.warned:
                logging.warning("MQTT availability refresh failed: %s",type(exc).__name__)
                self.warned = True

'''
def patch(source):
    if MARK in source:
        if source.count(BLOCK)==1 and source.count("    _stable_health = _StableMqttHealth()\n")==1 and source.count("                    _stable_health.tick(cl, time.monotonic(), str(mqtt_topic), mqtt_stop_event)\n")==1:
            return source
        raise ValueError("Incomplete or modified MQTT health patch")
    tree=ast.parse(source)
    nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=="connect_mqtt"]
    if len(nodes)!=1:
        raise ValueError("Expected one connect_mqtt worker")
    n=nodes[0]
    lines=source.splitlines(keepends=True)
    worker="".join(lines[n.lineno-1:n.end_lineno])
    init="    while not mqtt_stop_event.is_set():\n"
    anchor="            rc = cl.loop(timeout=1.0)\n"
    if worker.count(init)!=1 or worker.count(anchor)!=1:
        raise ValueError("Unexpected MQTT worker implementation")
    # Require original worker's local client and socket-based reconnect behavior.
    for key in ("cl.connect(", "cl = globals().get(", "sock_open", "MQTT_ERR_SUCCESS"):
        if key not in worker:
            raise ValueError("Missing worker contract: "+key)
    if '"/haierpi/connected"' not in source and "'/haierpi/connected'" not in source:
        raise ValueError("Missing existing availability topic")
    worker=worker.replace(init,"    _stable_health = _StableMqttHealth()\n"+init,1)
    worker=worker.replace(anchor,anchor+'''            if rc == mqtt.MQTT_ERR_SUCCESS:
                try:
                    _stable_health.tick(cl, time.monotonic(), str(mqtt_topic), mqtt_stop_event)
                except Exception as exc:
                    logging.warning("MQTT health check failed: %s",type(exc).__name__)
            else:
                _stable_health.reset()
''',1)
    result="".join(lines[:n.lineno-1])+BLOCK+"\n"+worker+"".join(lines[n.end_lineno:])
    compile(result,"main.py","exec")
    return result

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--path",type=Path,default=Path("/opt/haier/main.py"))
    ap.add_argument("--apply",action="store_true")
    ap.add_argument("--diff",action="store_true")
    a=ap.parse_args()
    p=a.path
    if p.is_symlink() or not p.is_file():
        raise ValueError("Expected regular main.py")
    old=p.read_bytes()
    new=patch(old.decode("utf-8")).encode("utf-8")
    if new==old:
        print("MQTT patch already present.")
        return
    if a.diff:
        print("".join(difflib.unified_diff(old.decode().splitlines(True),new.decode().splitlines(True),str(p),str(p)+" (patched)")))
    if not a.apply:
        print("MQTT dry-run OK; no files changed.")
        return
    st=p.stat()
    backup=Path(tempfile.mkdtemp(prefix=".stable-mqtt-backup-",dir=p.parent))
    shutil.copy2(p,backup/p.name)
    fd,tmp=tempfile.mkstemp(prefix=".stable-mqtt-",dir=p.parent)
    try:
        with os.fdopen(fd,"wb") as f:
            f.write(new)
            os.fchmod(f.fileno(),stat.S_IMODE(st.st_mode))
            if os.geteuid()==0:
                os.fchown(f.fileno(),st.st_uid,st.st_gid)
            f.flush()
            os.fsync(f.fileno())
        if p.read_bytes()!=old:
            raise RuntimeError("File changed during install")
        os.replace(tmp,p)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    print("Installed MQTT patch; backup:",backup)
    print("No restart performed. Restart haier only in a suitable maintenance window.")

if __name__=="__main__":
    main()
