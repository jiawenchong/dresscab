#!/usr/bin/env bash
# 重新產生 vendor/bg-removal/：把 @imgly/background-removal 打包成單一 ES module，
# 並只複製 iPhone 會用到的模型與 wasm 檔（GitHub Pages 無法開 cross-origin isolation，所以不需要 threaded 版本）。
set -euo pipefail

VERSION=1.4.5
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/vendor/bg-removal"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$WORK"
npm init -y >/dev/null
npm install --silent "@imgly/background-removal@$VERSION" "@imgly/background-removal-data@$VERSION" esbuild
echo "export { removeBackground } from '@imgly/background-removal';" > entry.js

rm -rf "$OUT"
mkdir -p "$OUT/data"
npx esbuild entry.js --bundle --format=esm --platform=browser --minify --legal-comments=eof --outfile="$OUT/bg-removal.js"
cp node_modules/@imgly/background-removal/LICENSE.md "$OUT/LICENSE.md"

DATA=node_modules/@imgly/background-removal-data/dist
node - "$DATA" "$OUT/data" <<'JS'
const fs = require('fs');
const path = require('path');
const [src, dst] = process.argv.slice(2);
const keep = ['/models/small', '/onnxruntime-web/ort-wasm-simd.wasm', '/onnxruntime-web/ort-wasm.wasm'];
const all = JSON.parse(fs.readFileSync(path.join(src, 'resources.json'), 'utf8'));
const out = {};
for (const key of keep) {
  out[key] = all[key];
  for (const chunk of all[key].chunks) fs.copyFileSync(path.join(src, chunk.hash), path.join(dst, chunk.hash));
}
fs.writeFileSync(path.join(dst, 'resources.json'), JSON.stringify(out, null, 2) + '\n');
JS
du -sh "$OUT"
