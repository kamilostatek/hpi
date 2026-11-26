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
ORIGINAL_LOOP = '''    backoff = 1.0
    max_backoff = 30.0
    connected_once = False

    while not mqtt_stop_event.is_set():
        # (Re)connect if needed
        try:
            try:
                is_conn = bool(getattr(cl, 'is_connected', lambda: False)())
            except Exception:
                is_conn = False

            sock_open = getattr(cl, '_sock', None) is not None
            if (not is_conn) and (not sock_open):
                try:
                    cl.connect(str(mqtt_broker_addr), int(mqtt_broker_port))
                    connected_once = True
                    backoff = 1.0
                except Exception:
                    if not connected_once:
                        logging.error(colored("MQTT connection error.", "red", attrs=['bold']))
                        connected_once = True
                    time.sleep(backoff)
                    backoff = min(max_backoff, backoff * 1.8)
                    continue

            rc = cl.loop(timeout=1.0)
            if rc != mqtt.MQTT_ERR_SUCCESS:
                # Connection lost or other socket error
                time.sleep(0.5)
        except Exception:
            logging.exception("MQTT worker exception")
            time.sleep(1.0)

'''
RECONNECT_MARK = "# STABLE MQTT RECONNECT v2"
OLD_TICK = """            if rc == mqtt.MQTT_ERR_SUCCESS:
                try:
                    _stable_health.tick(cl, time.monotonic(), str(mqtt_topic), mqtt_stop_event)
                except Exception as exc:
                    logging.warning("MQTT health check failed: %s",type(exc).__name__)
            else:
                _stable_health.reset()
"""
NEW_LOOP = '''    # STABLE MQTT RECONNECT v2
    health = _StableMqttHealth()
    backoff = 1.0
    needs_connect = True
    connack_deadline = None
    was_connected = False
    while not mqtt_stop_event.is_set():
        try:
            if needs_connect:
                # Public Paho API closes/replaces any stale transport on connect.
                # Do not gate retries on private socket state.
                logging.info("MQTT connection attempt")
                rc = cl.connect(str(mqtt_broker_addr), int(mqtt_broker_port))
                if rc != mqtt.MQTT_ERR_SUCCESS:
                    raise RuntimeError("connect rc=%s" % rc)
                needs_connect = False
                connack_deadline = time.monotonic() + 15.0
                was_connected = False

            if mqtt_stop_event.is_set():
                break
            rc = cl.loop(timeout=1.0)
            if rc != mqtt.MQTT_ERR_SUCCESS:
                raise RuntimeError("loop rc=%s" % rc)

            if cl.is_connected():
                if not was_connected:
                    logging.info("MQTT worker connection established")
                    backoff = 1.0
                    was_connected = True
                    connack_deadline = None
                health.tick(cl, time.monotonic(), str(mqtt_topic), mqtt_stop_event)
                # The health probe may deliberately disconnect the client.
                if not cl.is_connected():
                    raise RuntimeError("health check requested reconnect")
            elif was_connected:
                raise RuntimeError("connection lost")
            elif connack_deadline is not None and time.monotonic() >= connack_deadline:
                raise RuntimeError("CONNACK timeout")
        except Exception as exc:
            health.reset()
            needs_connect = True
            was_connected = False
            connack_deadline = None
            if mqtt_stop_event.is_set():
                break
            # Do not log credentials or connection addresses.
            logging.warning("MQTT reconnect scheduled in %.1fs (%s)", backoff,
                            str(exc) if isinstance(exc, RuntimeError) and
                            str(exc).startswith(("connect rc=", "loop rc=", "CONNACK timeout",
                                                 "connection lost", "health check requested reconnect",
                                                 "external watchdog requested reconnect"))
                            else type(exc).__name__)
            mqtt_stop_event.wait(backoff)
            backoff = min(30.0, backoff * 1.8)

'''
EXTERNAL_WATCHDOG = '''            if globals().get('_wd_reconnect_request') is cl:
                globals()['_wd_reconnect_request'] = None
                if not mqtt_stop_event.is_set() and globals().get('client') is cl and cl.is_connected():
                    logging.warning('MQTT watchdog: disconnecting MQTT client for reconnect')
                    cl.disconnect()
'''
NEW_EXTERNAL = '''            if globals().get('_wd_reconnect_request') is cl:
                globals()['_wd_reconnect_request'] = None
                if not mqtt_stop_event.is_set() and globals().get('client') is cl and cl.is_connected():
                    logging.warning('MQTT watchdog: disconnecting MQTT client for reconnect')
                    cl.disconnect()
                    raise RuntimeError("external watchdog requested reconnect")
'''

def patch(source):
    tree=ast.parse(source)
    nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=="connect_mqtt"]
    if len(nodes)!=1:
        raise ValueError("Expected one connect_mqtt worker")
    n=nodes[0]
    lines=source.splitlines(keepends=True)
    worker="".join(lines[n.lineno-1:n.end_lineno])
    before="".join(lines[:n.lineno-1])
    after="".join(lines[n.end_lineno:])
    if RECONNECT_MARK in worker:
        expected=NEW_LOOP.replace("            rc = cl.loop(timeout=1.0)\n",NEW_EXTERNAL+"            rc = cl.loop(timeout=1.0)\n",1)
        if before.count(BLOCK)!=1 or not (NEW_LOOP in worker or expected in worker):
            raise ValueError("Modified MQTT v2 patch")
        return source
    if MARK in source:
        if before.count(BLOCK)!=1 or worker.count(OLD_TICK)!=1:
            raise ValueError("Unknown installed MQTT v1 patch; restore original or known v1 first")
        worker=worker.replace(OLD_TICK,"",1).replace("    _stable_health = _StableMqttHealth()\n","",1)
    else:
        before+=BLOCK+"\n"
    # Recognize the original worker, or the exact optional HA watchdog hook.
    for key in ("cl.connect(", "cl = globals().get(", "sock_open", "MQTT_ERR_SUCCESS"):
        if key not in worker:
            raise ValueError("Missing worker contract: "+key)
    # Locate top-level statements, independent of comment formatting.
    parsed=ast.parse(worker).body[0]
    starts=[x for x in parsed.body if isinstance(x,ast.Assign) and
            any(isinstance(t,ast.Name) and t.id=="backoff" for t in x.targets)]
    loops=[x for x in parsed.body if isinstance(x,ast.While)]
    if len(starts)!=1 or len(loops)!=1:
        raise ValueError("Unexpected worker boundary")
    wl=worker.splitlines(keepends=True)
    original="".join(wl[starts[0].lineno-1:loops[0].end_lineno])
    if original.count("            rc = cl.loop(timeout=1.0)\n")!=1:
        raise ValueError("Unexpected loop layout")
    if "_wd_reconnect_request" in original:
        if original.count(EXTERNAL_WATCHDOG)!=1:
            raise ValueError("Unknown external watchdog hook")
        replacement=NEW_LOOP.replace("            rc = cl.loop(timeout=1.0)\n",NEW_EXTERNAL+"            rc = cl.loop(timeout=1.0)\n",1)
    else:
        replacement=NEW_LOOP
    # Reject unfamiliar worker logic rather than discarding it.
    normalized=original.replace(EXTERNAL_WATCHDOG,"")
    if ast.dump(ast.parse("def _worker():\n"+normalized))!=ast.dump(ast.parse("def _worker():\n"+ORIGINAL_LOOP)):
        raise ValueError("Unknown original MQTT worker body: "+normalized)
    result=before+worker.replace(original,replacement,1)+after
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
