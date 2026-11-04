#!/usr/bin/env bash
# HaierPi Alpha13: bootstrapping menu installer from the latest GitHub Release.
# Repository: https://github.com/kamilostatek/hpi
set -Eeuo pipefail

REPO="kamilostatek/hpi"
ASSET="HaierPi_Alpha13_Installer.tar.gz"
RELEASE_BASE="https://github.com/${REPO}/releases/latest/download"

for cmd in curl tar sha256sum mktemp; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Brakuje programu: $cmd" >&2
    exit 1
  }
done

[[ -r /dev/tty ]] || {
  echo 'Uruchom skrypt w interaktywnym terminalu (SSH lub konsola).' >&2
  exit 1
}

TMPDIR_INSTALL=$(mktemp -d)
trap 'rm -rf -- "$TMPDIR_INSTALL"' EXIT
cd "$TMPDIR_INSTALL"

echo 'Pobieram najnowszy instalator HaierPi Alpha13 z GitHub Releases...'
curl -fSL --retry 3 --connect-timeout 15 "${RELEASE_BASE}/${ASSET}" -o "${ASSET}"
curl -fSL --retry 3 --connect-timeout 15 "${RELEASE_BASE}/${ASSET}.sha256" -o "${ASSET}.sha256"

echo 'Sprawdzam sumę SHA256...'
sha256sum -c "${ASSET}.sha256"

echo 'Rozpakowuję instalator...'
mkdir -p extracted
tar -xzf "${ASSET}" -C extracted
[[ -f extracted/HaierPi_Alpha13_Installer/install.sh ]] || {
  echo 'Błąd: w paczce nie znaleziono install.sh.' >&2
  exit 1
}

cd extracted/HaierPi_Alpha13_Installer
printf '\nUruchamiam menu HaierPi Alpha13...\n\n'
if [[ "$EUID" -eq 0 ]]; then
  bash ./install.sh
elif command -v sudo >/dev/null 2>&1; then
  sudo bash ./install.sh
else
  echo 'Brakuje sudo. Uruchom ponownie jako root.' >&2
  exit 1
fi
