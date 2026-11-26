#!/usr/bin/env bash
# HaierPi 1.4.5 Stable - aktualizacja z kopia zapasowa i rollbackiem.
set -Eeuo pipefail
REPO_RAW=https://raw.githubusercontent.com/kamilostatek/hpi/main
PACKAGE=1.4.5_stable.tar.gz
EXPECTED_SHA256=5ef4a4bbe6bd570960391cdc60e83356d65eefc7f80a1410115df589694620a7
HAIER_DIR=/opt/haier
SERVICE=haier.service
OVERRIDE_DIR=/etc/systemd/system/haier.service.d
OVERRIDE_FILE=$OVERRIDE_DIR/20-haierpi-145-stable.conf
ITEMS=(main.py static templates HPi env/lib/python3.9/site-packages/PyHaier)
say() { printf '%s\n' "[HaierPi] $*"; }
die() { say "BLAD: $*" >&2; exit 1; }
CHECK_ONLY=0
LOCAL_ARCHIVE=''
case "${1:-}" in
  --check) [[ $# == 2 ]] || die 'Uzycie: --check PLIK.tar.gz'; CHECK_ONLY=1; LOCAL_ARCHIVE=$2;;
  '') ;;
  *) [[ $# == 1 ]] || die 'Uzycie: stable.sh [PLIK.tar.gz]'; LOCAL_ARCHIVE=$1;;
esac
if (( ! CHECK_ONLY )); then [[ $EUID == 0 ]] || die 'Uruchom jako root'; fi
for tool in tar sha256sum python3 mktemp; do command -v "$tool" >/dev/null || die "Brak $tool"; done
WORK=$(mktemp -d /tmp/haierpi145stable.XXXXXXXX)
STAGE=$WORK/stage
mkdir -p "$STAGE"
BACKUP=''
CHANGING=0
COMMITTED=0
rollback() {
  say 'Przywracanie poprzedniej instalacji...'
  systemctl stop "$SERVICE" || true
  for item in "${ITEMS[@]}"; do
    rm -rf -- "$HAIER_DIR/$item"
    if [[ -e "$BACKUP/items/$item" ]]; then
      mkdir -p "$(dirname "$HAIER_DIR/$item")"
      cp -a -- "$BACKUP/items/$item" "$HAIER_DIR/$item"
    fi
  done
  if [[ -e "$BACKUP/original_override" ]]; then
    cp -a "$BACKUP/original_override" "$OVERRIDE_FILE"
  else
    rm -f "$OVERRIDE_FILE"
  fi
  systemctl daemon-reload
  systemctl start "$SERVICE"
}
finish() {
  local code=$?
  trap - EXIT
  if (( code != 0 && CHANGING && ! COMMITTED )); then
    rollback || say "UWAGA: rollback niepelny, kopia: $BACKUP"
  fi
  rm -rf -- "$WORK"
  exit "$code"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if [[ -n "$LOCAL_ARCHIVE" ]]; then
  cp -- "$LOCAL_ARCHIVE" "$WORK/$PACKAGE"
else
  curl -fsSL --retry 2 --connect-timeout 15 --max-time 120 "$REPO_RAW/$PACKAGE" -o "$WORK/$PACKAGE"
fi
printf '%s  %s\n' "$EXPECTED_SHA256" "$WORK/$PACKAGE" | sha256sum -c - || die 'Niezgodna suma SHA256'
python3 - "$WORK/$PACKAGE" "$STAGE" <<'PY'
import ast, pathlib, tarfile, sys
archive, stage = sys.argv[1:]
roots = {'main.py', 'static', 'templates', 'HPi'}
lib = ('env','lib','python3.9','site-packages','PyHaier')
with tarfile.open(archive,'r:gz') as tf:
    seen=set()
    for m in tf:
        p=pathlib.PurePosixPath(m.name)
        parts=p.parts
        if not parts and m.isdir(): continue
        if p.is_absolute() or '..' in parts or not parts or not (m.isfile() or m.isdir()): raise SystemExit('Niedozwolony element: '+m.name)
        if parts[0] not in roots and not (parts[:len(lib)] == lib or (m.isdir() and parts == lib[:len(parts)])): raise SystemExit('Niedozwolona sciezka: '+m.name)
        if parts in seen: raise SystemExit('Powtorzona sciezka: '+m.name)
        seen.add(parts)
        tf.extract(m,stage)
base=pathlib.Path(stage)
main=(base/'main.py').read_text()
for marker in ['version="1.4.5"','def mqtt_pump_freshness_tick():','"HaierPi_R141Fresh"','initial=GPIO.LOW','class _StableMqttHealth']:
    assert marker in main, marker
for p in base.rglob('*.py'): ast.parse(p.read_bytes(),filename=str(p),feature_version=(3,9))
print('[HaierPi] Kontrola skladni Python 3.9 OK')
PY
for item in "${ITEMS[@]}"; do [[ -e "$STAGE/$item" ]] || die "Brak $item"; done
if (( CHECK_ONLY )); then say 'Kontrola zakonczona. Niczego nie zmieniono.'; exit 0; fi
[[ -d "$HAIER_DIR/env/lib/python3.9/site-packages" ]] || die 'Wymagany istniejacy Python 3.9 venv'
systemctl cat "$SERVICE" >/dev/null || die 'Brak uslugi haier'
BACKUP=/var/backups/haierpi-1.4.5-stable-$(date +%Y%m%d-%H%M%S)-$$
mkdir -m 0700 -p "$BACKUP/items"
for item in "${ITEMS[@]}"; do
  if [[ -e "$HAIER_DIR/$item" ]]; then
    mkdir -p "$(dirname "$BACKUP/items/$item")"
    cp -a -- "$HAIER_DIR/$item" "$BACKUP/items/$item"
  fi
done
for keep in /opt/config.ini "$HAIER_DIR/users.json"; do
  if [[ -f "$keep" ]]; then cp -a "$keep" "$BACKUP/$(basename "$keep").backup"; fi
done
if [[ -e "$OVERRIDE_FILE" ]]; then cp -a "$OVERRIDE_FILE" "$BACKUP/original_override"; fi
say "Kopia: $BACKUP"
systemctl stop "$SERVICE"
CHANGING=1
for item in "${ITEMS[@]}"; do
  target="$HAIER_DIR/$item"
  rm -rf -- "$target"
  mkdir -p "$(dirname "$target")"
  cp -a -- "$STAGE/$item" "$target"
done
mkdir -p "$OVERRIDE_DIR"
cat > "$OVERRIDE_FILE" <<'UNIT'
[Unit]
Description=HaierPi 1.4.5 - heat-pump controller
[Service]
SyslogIdentifier=HaierPi
UNIT
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null
systemctl start "$SERVICE"
sleep 3
systemctl is-active --quiet "$SERVICE" || die 'Usluga nie uruchomila sie poprawnie'
COMMITTED=1
CHANGING=0
say 'Gotowe: HaierPi 1.4.5 Stable. Autostart wlaczony.'
say "Kopia sprzed aktualizacji: $BACKUP"
