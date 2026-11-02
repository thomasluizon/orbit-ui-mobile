#!/usr/bin/env node

import { filePathFrom, readStdinJson } from "./_lib/io.mjs"
import { checkDependencyCommand, checkDependencyFileWrite } from "./_lib/rules-dependencies.mjs"

try {
  const input = readStdinJson()
  const cwd = input?.cwd ?? ""
  const editTarget = filePathFrom(input) ?? input?.tool_input?.notebook_path ?? null
  const verdict =
    checkDependencyFileWrite(editTarget, { cwd }) ?? checkDependencyCommand(input?.tool_input?.command, { cwd })
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  process.exit(0)
} catch (error) {
  process.stderr.write(`forbid-node-modules-write: ${error.message}\n`)
  process.exit(2)
}
