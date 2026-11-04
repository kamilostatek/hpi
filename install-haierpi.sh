#!/usr/bin/env bash
# HaierPi Alpha13 bootstrap: GitHub Release, then fallback to repository main.
set -Eeuo pipefail

REPO="kamilostatek/hpi"
ASSET="HaierPi_Alpha13_Installer.tar.gz"
RELEASE_BASE="https://github.com/${REPO}/releases/latest/download"
MAIN_BASE="https://raw.githubusercontent.com/${REPO}/main"

for cmd in curl tar sha256sum mktemp; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf 'Brakuje programu: %s\n' "$cmd" >&2
    exit 1
  fi
done

if [[ ! -r /dev/tty ]]; then
  echo 'Uruchom skrypt w interaktywnej konsoli lub przez SSH.' >&2
  exit 1
fi

WORKDIR=$(mktemp -d)
trap 'rm -rf -- "$WORKDIR"' EXIT
cd "$WORKDIR"

download_pair() {
  local base="$1"
  rm -f -- "$ASSET" "${ASSET}.sha256"
  curl -fsSL --retry 2 --connect-timeout 15 \
    "${base}/${ASSET}" -o "$ASSET" 2>/dev/null || return 1
  curl -fsSL --retry 2 --connect-timeout 15 \
    "${base}/${ASSET}.sha256" -o "${ASSET}.sha256" 2>/dev/null || return 1
}

printf 'Szukam HaierPi Alpha13 w GitHub Releases...\n'
if download_pair "$RELEASE_BASE"; then
  echo 'Pobrano paczke z najnowszego Release.'
else
  printf 'Brak plikow w GitHub Releases. Probuje pobrac z galezi main...\n'
  if ! download_pair "$MAIN_BASE"; then
    echo 'Blad: nie znaleziono paczki i sumy SHA256 ani w Releases, ani w katalogu glownym galezi main.' >&2
    echo 'Sprawdz, czy pliki maja dokladnie nazwy:' >&2
    printf '  %s\n  %s\n' "$ASSET" "${ASSET}.sha256" >&2
    exit 1
  fi
  echo 'Pobrano paczke z galezi main.'
fi

printf 'Sprawdzam SHA256...\n'
sha256sum -c "${ASSET}.sha256" || {
  echo 'Blad: suma SHA256 sie nie zgadza. Instalator nie zostanie uruchomiony.' >&2
  exit 1
}

mkdir extracted
tar -xzf "$ASSET" -C extracted
INSTALL_DIR="$WORKDIR/extracted/HaierPi_Alpha13_Installer"
if [[ ! -f "$INSTALL_DIR/install.sh" ]]; then
  echo 'Blad: w archiwum nie ma HaierPi_Alpha13_Installer/install.sh.' >&2
  exit 1
fi

cd "$INSTALL_DIR"
printf '\nUruchamiam menu HaierPi Alpha13...\n\n'
if [[ $EUID -eq 0 ]]; then
  bash ./install.sh
elif command -v sudo >/dev/null 2>&1; then
  sudo bash ./install.sh
else
  echo 'Uruchom skrypt jako root lub zainstaluj sudo.' >&2
  exit 1
fi
