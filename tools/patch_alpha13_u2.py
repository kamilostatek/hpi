#!/usr/bin/env python3
"""Build a patched copy of HaierPi 1.4.5_alpha13.tar.gz; never touch /opt/haier.

Source: https://www.elektroda.pl/rtvforum/topic3994059-30.html
post #31 (lopr_pol, 2025-10-08): signed 12-bit U2 temperatures.
"""
from __future__ import annotations

import argparse
import ast
from io import BytesIO
from pathlib import Path
import tarfile

# Exact library paths verified in the distributed alpha13 archive.
CHANGES = {
    "GetTao.py": 1,
    "GetTdef.py": 1,
    "GetTdTs.py": 2,
    "GetTSatPd.py": 2,
    "GetTSatPs.py": 2,
    "GetThiTho.py": 2,
}
OLD = b"-= 4095"
NEW = b"-= 4096"


def patch_archive(source: Path, destination: Path) -> dict[str, int]:
    if not source.is_file():
        raise FileNotFoundError(source)
    if source.resolve() == destination.resolve():
        raise ValueError("Source and destination must differ")
    if destination.exists():
        raise FileExistsError(destination)

    changes = {}
    patched = {}
    seen = set()
    with tarfile.open(source, "r:gz") as archive:
        members = archive.getmembers()

        # Validate ALL targets before producing or writing any result.
        for member in members:
            path = member.name.removeprefix("./")
            name = path.rsplit("/", 1)[-1]
            if not (path.startswith("env/lib/")
                    and "/site-packages/PyHaier/" in path
                    and name in CHANGES
                    and member.isfile()):
                continue
            if name in seen:
                raise ValueError(f"Duplicate target: {name}")
            seen.add(name)
            raw = archive.extractfile(member).read()
            count = raw.count(OLD)
            if count != CHANGES[name]:
                raise ValueError(f"Unexpected signed decoding layout in {name}: {count}")
            updated = raw.replace(OLD, NEW)
            ast.parse(updated.decode("utf-8"), filename=name)
            patched[member.name] = updated
            changes[name] = count
        if seen != set(CHANGES):
            raise ValueError(f"Missing decoders: {sorted(set(CHANGES) - seen)}")

        # Preserve all other tar members; create a separate archive.
        with tarfile.open(destination, "x:gz") as result:
            for member in members:
                if not member.isfile():
                    result.addfile(member)
                    continue
                data = patched.get(member.name)
                if data is None:
                    data = archive.extractfile(member).read()
                member.size = len(data)
                result.addfile(member, BytesIO(data))

    # Verify the new artifact after writing.
    with tarfile.open(destination, "r:gz") as result:
        for member in result.getmembers():
            path = member.name.removeprefix("./")
            name = path.rsplit("/", 1)[-1]
            if not (path.startswith("env/lib/")
                    and "/site-packages/PyHaier/" in path
                    and name in CHANGES and member.isfile()):
                continue
            raw = result.extractfile(member).read()
            if raw.count(NEW) != CHANGES[name] or OLD in raw:
                raise ValueError(f"Post-write verification failed: {name}")
    return changes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Original alpha13 archive")
    parser.add_argument("-o", "--output", type=Path,
                        default=Path("1.4.5_alpha13_u2fix.tar.gz"))
    args = parser.parse_args()
    changed = patch_archive(args.source, args.output)
    print(f"Patched copy: {args.output.resolve()}")
    print(f"Corrected {sum(changed.values())} decode sites in {len(changed)} files")
    print("The running HaierPi installation was not modified.")


if __name__ == "__main__":
    main()
