#!/usr/bin/env bash
# HaierPi 1.4.5 Stable - aktualizacja z kopia zapasowa i automatycznym rollbackiem.
set -Eeuo pipefail

REPO_RAW="https://raw.githubusercontent.com/kamilostatek/hpi/main"
PACKAGE="1.4.5_stable.tar.gz"
EXPECTED_SHA256="ca803a3f8777efa75a40739d2efeb0362365ffa4291d3eb76d9a231c6cb53976"
HAIER_DIR="/opt/haier"
SERVICE="haier.service"
OVERRIDE_DIR="/etc/systemd/system/haier.service.d"
OVERRIDE_FILE="$OVERRIDE_DIR/20-haierpi-145-stable.conf"
ITEMS=("main.py" "static" "templates" "env/lib/python3.9/site-packages/PyHaier")

say() { printf '%s\n' "[HaierPi] $*"; }
die() { say "BLAD: $*" >&2; exit 1; }

CHECK_ONLY=0
LOCAL_ARCHIVE=""
case "${1:-}" in
  --check)
    CHECK_ONLY=1
    LOCAL_ARCHIVE="${2:-}"
    [ -n "$LOCAL_ARCHIVE" ] || die "Podaj plik tar.gz po --check"
    [ "$#" -eq 2 ] || die "Uzycie: $0 --check PLIK.tar.gz"
    ;;
  "") ;;
  *)
    LOCAL_ARCHIVE="$1"
    [ "$#" -eq 1 ] || die "Uzycie: $0 [PLIK.tar.gz] lub $0 --check PLIK.tar.gz"
    ;;
esac

if [ "$CHECK_ONLY" -ne 1 ]; then
  [ "$(id -u)" -eq 0 ] || die "Uruchom jako root (sudo bash ...)"
fi

for tool in tar sha256sum python3 mktemp; do
  command -v "$tool" >/dev/null 2>&1 || die "Brakuje programu: $tool"
done
if [ -z "$LOCAL_ARCHIVE" ]; then
  command -v curl >/dev/null 2>&1 || die "Brakuje curl"
fi

WORK="$(mktemp -d /tmp/haierpi145stable.XXXXXXXX)"
STAGE="$WORK/stage"
mkdir -p "$STAGE"
BACKUP=""
CHANGING=0
COMMITTED=0

rollback() {
  [ "$CHANGING" -eq 1 ] || return 0
  say "Przywracanie plikow sprzed aktualizacji..."
  systemctl stop "$SERVICE" >/dev/null 2>&1 || true
  for item in "${ITEMS[@]}"; do
    rm -rf -- "$HAIER_DIR/$item"
    if [ -e "$BACKUP/items/$item" ]; then
      mkdir -p -- "$(dirname "$HAIER_DIR/$item")"
      cp -a -- "$BACKUP/items/$item" "$HAIER_DIR/$item"
    fi
  done
  if [ -e "$BACKUP/original_override" ]; then
    cp -a "$BACKUP/original_override" "$OVERRIDE_FILE"
  else
    rm -f -- "$OVERRIDE_FILE"
  fi
  systemctl daemon-reload >/dev/null 2>&1 || true
  systemctl start "$SERVICE" >/dev/null 2>&1 || true
  say "Przywrocono pliki. Kopia: $BACKUP"
}
finish() {
  code=$?
  trap - EXIT
  if [ "$code" -ne 0 ] && [ "$COMMITTED" -ne 1 ]; then
    rollback || true
  fi
  rm -rf -- "$WORK"
  exit "$code"
}
trap finish EXIT

if [ -n "$LOCAL_ARCHIVE" ]; then
  [ -f "$LOCAL_ARCHIVE" ] || die "Brak pliku: $LOCAL_ARCHIVE"
  cp -- "$LOCAL_ARCHIVE" "$WORK/$PACKAGE"
else
  say "Pobieram paczke z repozytorium kamilostatek/hpi..."
  curl -fsSL --retry 2 --connect-timeout 15 --max-time 120 \
    "$REPO_RAW/$PACKAGE" -o "$WORK/$PACKAGE" || die "Nie mozna pobrac paczki; sprawdz czy plik dodano do galezi main"
fi

printf '%s  %s\n' "$EXPECTED_SHA256" "$WORK/$PACKAGE" | sha256sum -c - >/dev/null \
  || die "Suma SHA256 nie zgadza sie. Nie instalowano niczego."
say "Suma SHA256 poprawna."

# Sprawdzamy liste plikow archiwum przed rozpakowaniem.
while IFS= read -r path; do
  path="${path%/}"
  case "$path" in
    ""|"."|"./"|./main.py|./static/*|./templates/*|./env/lib/python3.9/site-packages/PyHaier/*|./static|./templates|./env|./env/lib|./env/lib/python3.9|./env/lib/python3.9/site-packages|./env/lib/python3.9/site-packages/PyHaier) ;;
    *) die "Nieoczekiwana sciezka w archiwum: $path" ;;
  esac
  case "/$path/" in
    */../*|*/./../*|*/../*) die "Niebezpieczna sciezka w archiwum: $path" ;;
  esac
done < <(tar -tzf "$WORK/$PACKAGE")

# Archiwum jest zweryfikowane SHA256, ale dodatkowo bronimy sie przed symlinkami.
if tar -tvzf "$WORK/$PACKAGE" | grep -Eq '^l'; then
  die "Archiwum zawiera linki symboliczne"
fi

tar -xzf "$WORK/$PACKAGE" -C "$STAGE"
for item in "${ITEMS[@]}"; do
  [ -e "$STAGE/$item" ] || die "Brakuje w paczce: $item"
done

# Sprawdzenie skladni bez uruchamiania kodu i bez generowania __pycache__.
STAGE="$STAGE" python3 - <<'PY'
import ast
import os
from pathlib import Path
base = Path(os.environ['STAGE'])
main = (base/'main.py').read_text(encoding='utf-8')
assert 'version="1.4.5"' in main, 'Bledna wersja main.py'
assert 'def mqtt_pump_freshness_tick():' in main, 'Brak PR #4'
assert '"HaierPi_R141Fresh"' in main, 'Brak diagnostyki MQTT'
for p in [base/'main.py', *(base/'env/lib/python3.9/site-packages/PyHaier').glob('*.py')]:
    ast.parse(p.read_text(encoding='utf-8'), filename=str(p))
print('[HaierPi] Python: kontrola skladni OK')
PY

if [ "$CHECK_ONLY" -eq 1 ]; then
  say "Kontrola zakonczona: paczka jest poprawna. Niczego nie zmieniono."
  exit 0
fi

command -v systemctl >/dev/null 2>&1 || die "Brakuje systemctl"
[ -d "$HAIER_DIR" ] || die "Brak istniejacej instalacji $HAIER_DIR"
[ -d "$HAIER_DIR/env/lib/python3.9/site-packages" ] || die "Wymagany istniejacy Python 3.9 venv w $HAIER_DIR/env"
systemctl cat "$SERVICE" >/dev/null 2>&1 || die "Nie znaleziono uslugi $SERVICE"

BACKUP="/var/backups/haierpi-1.4.5-stable-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$BACKUP/items"
for item in "${ITEMS[@]}"; do
  if [ -e "$HAIER_DIR/$item" ]; then
    mkdir -p -- "$(dirname "$BACKUP/items/$item")"
    cp -a -- "$HAIER_DIR/$item" "$BACKUP/items/$item"
  fi
done
for keep in /opt/config.ini "$HAIER_DIR/users.json"; do
  if [ -f "$keep" ]; then
    cp -a -- "$keep" "$BACKUP/$(basename "$keep").backup"
  fi
done
if [ -e "$OVERRIDE_FILE" ]; then
  cp -a "$OVERRIDE_FILE" "$BACKUP/original_override"
fi
say "Zapisano kopie zapasowa: $BACKUP"

say "Zatrzymuje $SERVICE..."
systemctl stop "$SERVICE"
CHANGING=1
for item in "${ITEMS[@]}"; do
  target="$HAIER_DIR/$item"
  rm -rf -- "$target"
  mkdir -p -- "$(dirname "$target")"
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
say "Uruchamiam $SERVICE..."
systemctl start "$SERVICE"
sleep 3
systemctl is-active --quiet "$SERVICE" || die "Usluga nie uruchomila sie poprawnie"
COMMITTED=1
CHANGING=0
say "Gotowe: HaierPi 1.4.5 Stable. Autostart wlaczony."
say "Kopia sprzed aktualizacji: $BACKUP"
