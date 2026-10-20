import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

import { T, root } from "./_harness.mjs"
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

  const quotedExe = resolve("/virtual/Program Files;x/bin/tool.exe")
  const quotedTarget = resolveSpawnTarget("tool", {
    platform: "win32",
    cwd: "/virtual/worktree",
    pathValue: "/virtual/shim;\"/virtual/Program Files;x/bin\"",
    pathExt: ".CMD;.EXE",
    isFile: (candidate) => candidate === resolve("/virtual/shim/tool.CMD") || candidate === quotedExe,
  })
  T("win-spawn-target.mjs: a quoted PATH entry is one directory without its quotes, even holding a separator",
    quotedTarget === quotedExe, `resolved ${quotedTarget}`)

  const sandbox = mkdtempSync(join(root, "win-spawn-target-"))
  mkdirSync(join(sandbox, "linked"))
  mkdirSync(join(sandbox, "shim"))
  writeFileSync(join(sandbox, "real.exe"), "")
  symlinkSync(join(sandbox, "real.exe"), join(sandbox, "linked", "tool.exe"))
  writeFileSync(join(sandbox, "shim", "tool.CMD"), "")
  const linkedTarget = resolveSpawnTarget("tool", {
    platform: "win32",
    cwd: sandbox,
    pathValue: `${join(sandbox, "linked")};${join(sandbox, "shim")}`,
    pathExt: ".CMD;.EXE",
  })
  T("win-spawn-target.mjs: an earlier symlinked executable wins over a later command shim",
    linkedTarget === join(sandbox, "linked", "tool.exe"), `resolved ${linkedTarget}`)
  mkdirSync(join(sandbox, "dangling"))
  const danglingDirectory = join(sandbox, "dangling", "tool.exe")
  symlinkSync(join(sandbox, "missing-directory"), danglingDirectory, "dir")
  let probedDirectory = false
  const danglingTarget = resolveSpawnTarget("tool", {
    platform: "win32",
    cwd: sandbox,
    pathValue: `${join(sandbox, "dangling")};${join(sandbox, "shim")}`,
    pathExt: ".CMD;.EXE",
    danglingLinkIsDirectory: (candidate) => {
      probedDirectory = candidate === danglingDirectory
      return true
    },
  })
  T("win-spawn-target.mjs: an earlier dangling link is skipped, so a later command shim still reaches its diagnostic",
    probedDirectory && danglingTarget === join(sandbox, "shim", "tool.CMD"), `probed ${probedDirectory}, resolved ${danglingTarget}`)

  mkdirSync(join(sandbox, "dangling-file"))
  const danglingFile = join(sandbox, "dangling-file", "tool.exe")
  symlinkSync(join(sandbox, "missing-file"), danglingFile, "file")
  let probedFile = false
  const fileTarget = resolveSpawnTarget("tool", {
    platform: "win32",
    cwd: sandbox,
    pathValue: `${join(sandbox, "dangling-file")};${join(sandbox, "shim")}`,
    pathExt: ".CMD;.EXE",
    danglingLinkIsDirectory: (candidate) => {
      probedFile = candidate === danglingFile
      return false
    },
  })
  T("win-spawn-target.mjs: an earlier dangling file link is selected before a later command shim",
    probedFile && fileTarget === danglingFile, `probed ${probedFile}, resolved ${fileTarget}`)
}
