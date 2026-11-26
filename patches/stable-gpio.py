#!/usr/bin/env python3
"""Minimal GPIO/RS485 startup fix for HaierPi 1.4.5 Stable.

No changes to MQTT, pump reads/writes, heating algorithms or WWW.
"""
import ast
import argparse
import difflib
import os
import shutil
import stat
import tempfile
from pathlib import Path

SETUP = '''def setup(pin, action, initial=None):
    """Configure an exported GPIO, without unexporting it if already present."""
    import errno
    import time
    base = "/sys/class/gpio/gpio" + str(pin)
    if not os.path.isdir(base):
        try:
            with open("/sys/class/gpio/export", "w") as f:
                f.write(str(pin))
        except OSError as exc:
            if exc.errno != errno.EBUSY:
                raise
    # Export may be asynchronous on some kernels.
    deadline = time.monotonic() + 1.0
    while not os.path.exists(base + "/direction"):
        if time.monotonic() >= deadline:
            raise RuntimeError("GPIO %s direction is unavailable" % pin)
        time.sleep(0.01)
    if initial is not None:
        if action != OUT or initial not in (LOW, HIGH):
            raise ValueError("initial requires an output and LOW or HIGH")
        # Linux GPIO sysfs supports low/high to set direction and value atomically.
        action = "low" if initial == LOW else "high"
    with open(base + "/direction", "w") as f:
        f.write(action)
'''
OUTPUT = '''def output(pin, value):
    try:
        with open("/sys/class/gpio/gpio" + str(pin) + "/value", "w") as f:
            f.write(str(value))
    except OSError as exc:
        import logging
        logging.getLogger(__name__).error("GPIO %s output failed: %s", pin, exc)
        return False
'''
OLD_SETUP = '''def setup(pin, action):
    if os.path.isdir("/sys/class/gpio/gpio"+str(pin)+"/"):
        cleanup(pin)
        print("WARNING: Channel already in use.")
    else:
        file='/sys/class/gpio/export'
        pinfile="/sys/class/gpio/gpio"+str(pin)+"/direction"
        file1 = open(file, 'w')
        file1.write(str(pin))
        file1.close()
        file2 = open(pinfile, 'w')
        file2.write(action)
        file2.close()'''
OLD_OUTPUT = '''def output(pin, value):
    try:
        pinfile="/sys/class/gpio/gpio"+str(pin)+"/value"
        file1 = open(pinfile, 'w')
        file1.write(str(value))
        file1.close()
    except:
        return False'''

def replace_function(source, name, expected, replacement):
    nodes=[n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name==name]
    if len(nodes)!=1:
        raise ValueError("Unexpected GPIO function: "+name)
    n=nodes[0]
    if ast.dump(n)==ast.dump(ast.parse(replacement).body[0]):
        return source
    if ast.dump(n)!=ast.dump(ast.parse(expected).body[0]):
        raise ValueError("Unrecognized implementation: "+name)
    lines=source.splitlines(keepends=True)
    return "".join(lines[:n.lineno-1])+replacement+"".join(lines[n.end_lineno:])

def patch_gpio(source):
    source=replace_function(source,"setup",OLD_SETUP,SETUP)
    return replace_function(source,"output",OLD_OUTPUT,OUTPUT)

def patch_main(source):
    old="GPIO.setup(modbuspin, GPIO.OUT)"
    new="GPIO.setup(modbuspin, GPIO.OUT, initial=GPIO.LOW)"
    if source.count(new)==1 and old not in source:
        return source
    if source.count(old)!=1 or new in source or "import HPi.GPIO as GPIO" not in source:
        raise ValueError("Unrecognized RS485 initialization")
    return source.replace(old,new,1)

def changes(root):
    result=[]
    for rel,fn in (("HPi/GPIO.py",patch_gpio),("main.py",patch_main)):
        p=root/rel
        if p.is_symlink() or not p.is_file():
            raise ValueError("Expected regular file: "+str(p))
        raw=p.read_bytes()
        old=raw.decode("utf-8")
        new=fn(old)
        compile(new,str(p),"exec")
        if new!=old:
            result.append((p,raw,new.encode("utf-8")))
    return result

def atomic_write(path,data):
    st=path.stat()
    fd,tmp=tempfile.mkstemp(prefix=".stable-gpio-",dir=path.parent)
    try:
        with os.fdopen(fd,"wb") as f:
            f.write(data)
            os.fchmod(f.fileno(),stat.S_IMODE(st.st_mode))
            if os.geteuid()==0:
                os.fchown(f.fileno(),st.st_uid,st.st_gid)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root",type=Path,default=Path("/opt/haier"))
    ap.add_argument("--apply",action="store_true")
    ap.add_argument("--diff",action="store_true")
    args=ap.parse_args()
    pending=changes(args.root)
    if args.diff:
        for p,old,new in pending:
            print("".join(difflib.unified_diff(old.decode().splitlines(True),new.decode().splitlines(True),str(p),str(p)+" (patched)")))
    if not pending:
        print("GPIO patch already present.")
        return
    if not args.apply:
        print("GPIO dry-run OK; no files changed.")
        return
    backup=Path(tempfile.mkdtemp(prefix=".stable-gpio-backup-",dir=args.root))
    for p,raw,new in pending:
        dst=backup/p.relative_to(args.root)
        dst.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(p,dst)
    written=[]
    try:
        for p,raw,new in pending:
            if p.read_bytes()!=raw:
                raise RuntimeError("File changed during install: "+str(p))
            atomic_write(p,new)
            written.append((p,raw))
    except BaseException:
        for p,raw in reversed(written):
            atomic_write(p,raw)
        raise
    print("Installed GPIO patch; backup:",backup)
    print("No restart performed. Restart haier only in a suitable maintenance window.")

if __name__=="__main__":
    main()
