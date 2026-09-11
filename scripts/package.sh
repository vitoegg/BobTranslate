#!/usr/bin/env sh
set -eu
export TZ=UTC LC_ALL=C

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/.build"
DIST_DIR="$ROOT_DIR/dist"

build_plugin() {
  provider="$1"
  out_file="$DIST_DIR/$provider-bob-translate.bobplugin"
  work_dir="$BUILD_DIR/$provider"
  plugin_dir="$ROOT_DIR/plugins/$provider"

  mkdir -p "$work_dir"
  cp "$plugin_dir/info.json" "$work_dir/info.json"
  cp "$ROOT_DIR/main.js" "$work_dir/main.js"
  files="info.json main.js"

  # 图标平铺在插件根目录，info.json 的 filePath 直接引用文件名
  for icon in "$plugin_dir"/*.png; do
    [ -e "$icon" ] || continue
    cp "$icon" "$work_dir/"
    files="$files $(basename "$icon")"
  done

  # 固定权限与时间戳，保证同样内容打出的包 sha256 稳定
  chmod 0644 "$work_dir"/*
  touch -t 202001010000 "$work_dir"/*

  rm -f "$out_file"
  (cd "$work_dir" && zip -Xqr "$out_file" $files)
  echo "$out_file"
}

cd "$ROOT_DIR"
rm -rf "$BUILD_DIR"
mkdir -p "$DIST_DIR"
trap 'rm -rf "$BUILD_DIR"' EXIT

for plugin_dir in "$ROOT_DIR"/plugins/*; do
  [ -f "$plugin_dir/info.json" ] || continue
  build_plugin "$(basename "$plugin_dir")"
done
