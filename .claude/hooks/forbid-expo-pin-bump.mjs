#!/usr/bin/env node
// PreToolUse(Bash) hook: block npm commands that would bump an Expo-SDK-pinned
// package or bulk-update the mobile dependency tree. The Expo SDK 57 set is
// version-locked (worklets<->reanimated ABI, RNGMA/Kotlin, the expo-* family);
// a stray `npm update` or `npm install <pkg>@<ver>` breaks the native build and
// drops RN transitive deps. Use `npx expo install <pkg>` (SDK-correct versions)
// or the /dep-sweep skill for a controlled sweep. Exits 0 (allow) or 2 (block).
// Any error exits 0 so the hook never wedges the Bash tool.

import { readFileSync } from "node:fs"

try {
  let input
  try {
    input = JSON.parse(readFileSync(0, "utf8"))
  } catch {
    process.exit(0)
  }

  const command = input?.tool_input?.command
  if (typeof command !== "string" || !/\bnpm\b/.test(command)) process.exit(0)

  if (/\bnpm\s+(?:update|upgrade|up)\b/.test(command)) {
    process.stderr.write(
      `BLOCKED npm command (Expo SDK pin):\n  ${command}\n\n` +
        "`npm update`/`upgrade` bulk-bumps the Expo-pinned tree. Use `npx expo install` for SDK packages, or the /dep-sweep skill for a controlled sweep.\n",
    )
    process.exit(2)
  }

  if (
    /\bnpm\s+(?:i|install|add)\b[^&|;]*\s(?:expo(?:-[\w.-]+)?|react-native(?:-[\w.-]+)?|hermes-compiler|nativewind)@/.test(
      command,
    )
  ) {
    process.stderr.write(
      `BLOCKED npm command (Expo SDK pin):\n  ${command}\n\n` +
        "That package's version is managed by the Expo SDK 57 pin. Install it with `npx expo install <pkg>` so it resolves to the SDK-correct, ABI-compatible version.\n",
    )
    process.exit(2)
  }

  process.exit(0)
} catch {
  process.exit(0)
}
