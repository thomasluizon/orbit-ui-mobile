#!/usr/bin/env bash

set -euo pipefail

adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk

# Prove the protected route on the first, cold app launch. Expo Router's protected-route guard
# rejects a protected warm link by retaining the current public route; a cold launch has no prior
# public route and therefore positively lands on login.
about_link=$(node --input-type=module -e "
  import { readFileSync } from 'node:fs'
  import { buildCaptureDeepLink } from './tools/capture-surfaces-mobile.mjs'
  const manifest = JSON.parse(readFileSync('.claude/manifests/surfaces.json', 'utf8'))
  const cell = manifest.cells.find((entry) => entry.platform === 'mobile' && entry.surfaceId === 'm-route-about')
  if (!cell) { console.error('m-route-about is not in the manifest'); process.exit(1) }
  console.log(buildCaptureDeepLink(cell, 'dark', 'en'))
")
echo "Protected route deep link: ${about_link}"

maestro test \
    -e "CAPTURE_LINK=${about_link}" \
    -e CAPTURE_PATH=protected-route-redirect \
    --debug-output .artifacts/mobile-capture/protected \
    --flatten-debug-output \
    .maestro/protected-route-redirect.yaml

capture_args=(
  --surface m-route-login
  --surface m-route-privacy
  --surface m-route-terms
)
node tools/capture-surfaces-mobile.mjs "${capture_args[@]}" --output .artifacts/mobile-capture/run-a
node tools/capture-surfaces-mobile.mjs "${capture_args[@]}" --output .artifacts/mobile-capture/run-b

mapfile -t screenshots < <(find .artifacts/mobile-capture/run-a -maxdepth 1 -type f -name '*.png' -printf '%f\n' | sort)
if [ "${#screenshots[@]}" -ne 12 ]; then
  echo "Expected 12 screenshots, found ${#screenshots[@]}." >&2
  exit 1
fi
for screenshot in "${screenshots[@]}"; do
  cmp --silent \
    ".artifacts/mobile-capture/run-a/${screenshot}" \
    ".artifacts/mobile-capture/run-b/${screenshot}"
done

node tools/capture-surfaces-mobile.mjs \
  --surface m-route-privacy \
  --theme dark \
  --locale en \
  --driver adb \
  --output .artifacts/mobile-capture/adb-fallback
