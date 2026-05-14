#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/.build"
DIST_DIR="$ROOT_DIR/dist"
OPENAI_OUT="$DIST_DIR/openai-bob-translate.bobplugin"
FIREWORKS_OUT="$DIST_DIR/fireworks-bob-translate.bobplugin"

build_plugin() {
  name="$1"
  provider="$2"
  out_file="$3"
  work_dir="$BUILD_DIR/$name"

  mkdir -p "$work_dir"
  cp "$ROOT_DIR/plugins/$provider/info.json" "$work_dir/info.json"
  cp "$ROOT_DIR/README.md" "$work_dir/README.md"
  cp "$ROOT_DIR/main.js" "$work_dir/main.js"
  chmod 0644 "$work_dir/info.json" "$work_dir/main.js" "$work_dir/README.md"
  touch -t 202001010000 "$work_dir/info.json" "$work_dir/main.js" "$work_dir/README.md"

  rm -f "$out_file"
  (cd "$work_dir" && zip -Xqr "$out_file" info.json main.js README.md)
  echo "$out_file"
}

cd "$ROOT_DIR"
rm -rf "$BUILD_DIR"
mkdir -p "$DIST_DIR"

build_plugin "openai-bob-translate" "openai" "$OPENAI_OUT"
build_plugin "fireworks-bob-translate" "fireworks" "$FIREWORKS_OUT"
rm -rf "$BUILD_DIR"
