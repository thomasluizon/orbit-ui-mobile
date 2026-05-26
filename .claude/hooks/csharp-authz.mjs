#!/usr/bin/env node
// PostToolUse hook: warn when an orbit-api Controller is edited without an
// explicit [Authorize] or [AllowAnonymous] on the action(s) being touched.
// Any unexpected error exits 0 so the hook never surfaces as a crash.

import { readFileSync, existsSync } from "node:fs"

try {
  let input
  try {
    input = JSON.parse(readFileSync(0, "utf8"))
  } catch {
    process.exit(0)
  }

  const filePath = input?.tool_input?.file_path ?? input?.tool_response?.filePath
  if (!filePath || !existsSync(filePath)) process.exit(0)

  const normalized = String(filePath).replace(/\\/g, "/")
  if (!/\/orbit-api\/src\/Orbit\.Api\/Controllers\/.*\.cs$/.test(normalized)) process.exit(0)

  let contents
  try {
    contents = readFileSync(filePath, "utf8")
  } catch {
    process.exit(0)
  }

  const hasControllerAuthorize = /^\s*\[Authorize[^\]]*\]\s*$[\s\S]*?(public\s+(?:partial\s+)?class\s+\w+Controller)/m.test(contents)
  const hasAnyAuthorize = /\[Authorize/.test(contents)
  const hasAnyAllowAnonymous = /\[AllowAnonymous/.test(contents)

  if (hasControllerAuthorize || hasAnyAuthorize || hasAnyAllowAnonymous) process.exit(0)

  process.stderr.write(
    `${filePath}: no [Authorize] or [AllowAnonymous] decorator found.\n` +
      `\nDefault for orbit-api Controllers is [Authorize] at the class level.\n` +
      `Use [AllowAnonymous] on individual actions ONLY when truly public (e.g. POST /api/auth/send-code).\n` +
      `If this is intentional (e.g. webhook with signature verification), add a one-line WHY comment.\n`,
  )
  process.exit(2)
} catch {
  process.exit(0)
}
