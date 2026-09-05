# Ticket 434: Expo pin decision

Round 2 requires preserving every Expo resolution from `redesign/main` and passing
`CI=1 npx expo install --check`. Those requirements currently conflict.

On 2026-09-05, after `git fetch origin redesign/main`, the base was
`0be74abf2579bbe30c22524916e74123fc9bc62e` and this branch was `3e3bf06b`.
Comparing the complete parsed package entries in both lockfiles found zero Expo
entry differences. The mobile manifest differs only by removing `nativewind` and
`tailwindcss`. Metro and Babel are unchanged.

Running the required check from `apps/mobile` with `CI=1` exits 1:

| Package | Base, branch, and installed version | Expected by Expo check |
| --- | --- | --- |
| expo | 57.0.19 | ~57.0.20 |
| expo-build-properties | 57.0.16 | ~57.0.17 |
| expo-image-picker | 57.0.15 | ~57.0.16 |
| expo-modules-core | 57.0.15 | ~57.0.16 |
| expo-notifications | 57.0.16 | ~57.0.17 |
| expo-router | 57.0.18 | ~57.0.19 |
| expo-sharing | 57.0.17 | ~57.0.18 |

The command ends with `Found outdated dependencies`. This reproduces the
`Expo SDK Pin` failure in GitHub Actions run `33996002502`, job `101386559663`.
This is a compatibility-check conflict, not an npm dependency resolution error.

The installed Expo CLI reads remote compatibility versions in
`node_modules/@expo/cli/build/src/start/doctor/dependencies/bundledNativeModules.js:83`
and prioritizes remote SDK versions in
`node_modules/@expo/cli/build/src/start/doctor/dependencies/getVersionedPackages.js:62`.
Keeping the base's resolutions therefore does not guarantee that the current
online compatibility check passes.

Reproduce the lockfile comparison from the repository root in PowerShell:

```powershell
@'
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const base = JSON.parse(execFileSync('git', ['show', '0be74abf2579bbe30c22524916e74123fc9bc62e:package-lock.json'], { encoding: 'utf8' }));
const branch = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const keys = [...new Set([...Object.keys(base.packages), ...Object.keys(branch.packages)])];
const changed = keys.filter(key => JSON.stringify(base.packages[key]) !== JSON.stringify(branch.packages[key]));
console.log(changed.filter(key => /(?:^|\/)(?:expo(?:-|\/|$)|@expo\/)/.test(key)));
'@ | node
```

Result: `[]`. The existing 341-line diff prunes NativeWind, its private dependency
tree, and mobile Tailwind, and changes the retained `esprima` entry to development
only. It does not change any retained package version. No lockfile regeneration,
Expo upgrade, `expo install --fix`, offline check, or gate exemption was performed
in round 2.

The existing commit's Android release build passed in run `33995644862`, job
`101385605991`. Mobile StyleSheet Guard also passes. The PR still has a separate
Pullfrog finding about stale NativeWind references in repository guidance and
Sonar configuration; this decision record does not claim delivery is green.

Decision needed: should the Expo patch alignment be handled in a separate ticket
before resuming #434? Recommended: yes, preserve #434's current Expo resolutions
and resolve the compatibility requirement separately, as round 2 instructs.

This file lives under `apps/mobile` because the root allowlist does not permit a
root `questions.md`, and this work order forbids editing the tooling.
