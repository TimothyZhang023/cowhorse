#!/bin/bash

set -euo pipefail

if [[ "${OSTYPE:-}" != darwin* ]]; then
  echo "This installer only supports macOS." >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <dmg-path-or-url> [target-directory]" >&2
  exit 1
fi

SOURCE="$1"
TARGET_DIR="${2:-/Applications}"
TMP_DIR="$(mktemp -d /tmp/workhorse-install.XXXXXX)"
DMG_PATH=""
MOUNT_POINT=""
SUDO=""

cleanup() {
  if [[ -n "$MOUNT_POINT" ]] && mount | grep -Fq "on $MOUNT_POINT "; then
    hdiutil detach "$MOUNT_POINT" -quiet || true
  fi
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

if [[ ! -w "$TARGET_DIR" ]]; then
  SUDO="sudo"
fi

if [[ "$SOURCE" =~ ^https?:// ]]; then
  DMG_PATH="$TMP_DIR/app.dmg"
  echo "Downloading DMG from $SOURCE..."
  curl --fail --location --output "$DMG_PATH" "$SOURCE"
else
  if [[ ! -f "$SOURCE" ]]; then
    echo "DMG not found: $SOURCE" >&2
    exit 1
  fi
  DMG_PATH="$(cd "$(dirname "$SOURCE")" && pwd)/$(basename "$SOURCE")"
fi

echo "Mounting DMG..."
MOUNT_POINT="$(
  hdiutil attach "$DMG_PATH" -nobrowse -readonly \
    | awk '/\/Volumes\// {print substr($0, index($0, "/Volumes/"))}' \
    | tail -n 1
)"

if [[ -z "$MOUNT_POINT" ]]; then
  echo "Unable to determine mounted DMG path." >&2
  exit 1
fi

APP_PATH="$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" -print -quit)"

if [[ -z "$APP_PATH" ]]; then
  echo "No .app bundle found in $MOUNT_POINT." >&2
  exit 1
fi

APP_NAME="$(basename "$APP_PATH")"
TARGET_APP="$TARGET_DIR/$APP_NAME"

echo "Installing $APP_NAME to $TARGET_DIR..."
$SUDO rm -rf "$TARGET_APP"
$SUDO ditto "$APP_PATH" "$TARGET_APP"

echo "Removing quarantine attribute..."
$SUDO xattr -rd com.apple.quarantine "$TARGET_APP" || true

echo "Installed at $TARGET_APP"
echo "You can now launch it from Finder or run:"
echo "open \"$TARGET_APP\""
