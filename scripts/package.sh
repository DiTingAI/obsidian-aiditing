#!/usr/bin/env bash
# 打内测分发包：dist/aiditing-<version>.zip
#
# 压缩包里只有三个文件（main.js / manifest.json / styles.css），解开就是插件目录内容，
# 用户直接挪进 <Vault>/.obsidian/plugins/aiditing/ 即可——不要多套一层目录名，
# 否则用户会得到 plugins/aiditing/aiditing/main.js 这种装不上的结构。
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="$(node -e 'process.stdout.write(require("./manifest.json").version)')"
OUT="dist/aiditing-${VERSION}.zip"

if [ ! -f main.js ]; then
  echo "main.js 不存在，先跑 npm run build" >&2
  exit 1
fi

mkdir -p dist
rm -f "$OUT"
zip -q "$OUT" main.js manifest.json styles.css

echo "已生成 ${OUT}"
unzip -l "$OUT"
