#!/usr/bin/env bash
# Jeden punkt startowy dla instalatora HaierPi Alpha13 v9.
set -Eeuo pipefail
REPO='kamilostatek/hpi'
PAKIET='HaierPi_Alpha13_Installer.tar.gz'
BASE_RELEASE="https://github.com/${REPO}/releases/latest/download"
BASE_MAIN="https://raw.githubusercontent.com/${REPO}/main"
for narzedzie in curl tar sha256sum mktemp; do
  command -v "$narzedzie" >/dev/null 2>&1 || {
    printf 'BŁĄD: brakuje programu %s.\n' "$narzedzie" >&2; exit 1;
  }
done
[[ -r /dev/tty ]] || { echo 'BŁĄD: uruchom w terminalu SSH albo konsoli.' >&2; exit 1; }
KATALOG=$(mktemp -d)
trap 'rm -rf -- "$KATALOG"' EXIT
cd "$KATALOG"

pobierz_z() {
  local baza="$1"
  rm -f "$PAKIET" "${PAKIET}.sha256"
  curl -fsSL --retry 2 --connect-timeout 15 "${baza}/${PAKIET}" -o "$PAKIET" >/dev/null 2>&1 || return 1
  curl -fsSL --retry 2 --connect-timeout 15 "${baza}/${PAKIET}.sha256" -o "${PAKIET}.sha256" >/dev/null 2>&1 || return 1
}
printf 'Sprawdzam instalator HaierPi Alpha13 w repozytorium GitHub...\n'
if pobierz_z "$BASE_MAIN"; then
  echo 'Pobrano instalator z gałęzi main.'
else
  echo 'Nie znaleziono kompletu plików w gałęzi main. Sprawdzam GitHub Releases...'
  pobierz_z "$BASE_RELEASE" || { echo 'BŁĄD: nie udało się pobrać archiwum i sumy SHA256 z GitHuba.' >&2; exit 1; }
  echo 'Pobrano instalator z GitHub Releases.'
fi
printf 'Sprawdzam sumę kontrolną SHA256...\n'
if sha256sum --status -c "${PAKIET}.sha256"; then
  echo 'Suma SHA256 jest poprawna.'
else
  echo 'BŁĄD: niezgodna suma SHA256! Przerwano.' >&2
  exit 1
fi
printf 'Rozpakowuję archiwum...\n'
mkdir -p extracted
tar -xzf "$PAKIET" -C extracted || { echo 'BŁĄD: nie udało się rozpakować archiwum.' >&2; exit 1; }
[[ -f extracted/HaierPi_Alpha13_Installer/install.sh ]] || { echo 'BŁĄD: w archiwum brakuje instalatora.' >&2; exit 1; }
cd extracted/HaierPi_Alpha13_Installer
printf '\nUruchamiam polskie menu HaierPi Alpha13...\n\n'
if [[ $EUID -eq 0 ]]; then
  bash ./install.sh
elif command -v sudo >/dev/null 2>&1; then
  sudo bash ./install.sh
else
  echo 'BŁĄD: uruchom jako administrator lub zainstaluj sudo.' >&2
  exit 1
fi
