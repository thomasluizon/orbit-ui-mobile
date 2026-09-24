import { resolve } from "node:path"

import { T } from "./_harness.mjs"
import { resolveSpawnTarget } from "../lib/win-spawn-target.mjs"

export const cases = () => {
  const earlier = resolve("/virtual/early/tool.cmd")
  const later = resolve("/virtual/later/tool.exe")
  const target = resolveSpawnTarget("tool", {
    platform: "win32",
    cwd: "/virtual/worktree",
    pathValue: "/virtual/early;/virtual/later",
    pathExt: ".CMD;.EXE",
    isFile: (candidate) => candidate.toLowerCase() === earlier || candidate === later,
  })
  T("win-spawn-target.mjs: a later directly spawnable executable wins over an earlier command shim", target === later, `resolved ${target}`)

  const exact = resolve("/virtual/worktree/.tool")
  const dotted = resolveSpawnTarget(".tool", {
    platform: "win32",
    cwd: "/virtual/worktree",
    pathValue: "",
    pathExt: ".CMD",
    isFile: (candidate) => candidate === exact || candidate === `${exact}.CMD`,
  })
  T("win-spawn-target.mjs: a dotted exact filename is checked before shim diagnostics", dotted === exact, `resolved ${dotted}`)

  const relativeExe = resolve("/virtual/worktree/later/tool.exe")
  const relativeTarget = resolveSpawnTarget("tool", {
    platform: "win32",
    cwd: "/virtual/worktree",
    pathValue: "early;later",
    pathExt: ".CMD;.EXE",
    isFile: (candidate) => candidate === resolve("/virtual/worktree/early/tool.CMD") || candidate === relativeExe,
  })
  T("win-spawn-target.mjs: relative PATH entries resolve against the child cwd", relativeTarget === relativeExe, `resolved ${relativeTarget}`)
}
