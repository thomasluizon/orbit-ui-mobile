import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, check, root, toolPath } from "./_harness.mjs"

const stageRepository = (label, allowedFiles = []) => {
  const repository = join(root, "root-allowlist", label)
  const tools = join(repository, "tools")
  mkdirSync(tools, { recursive: true })
  cpSync(toolPath("check-root-allowlist.mjs"), join(tools, "check-root-allowlist.mjs"))
  writeFileSync(join(tools, "root-allowlist.json"), `${JSON.stringify(allowedFiles, null, 2)}\n`)
  return { repository, script: join(tools, "check-root-allowlist.mjs") }
}

const checkUndeclaredFile = (name) => {
  const fixture = stageRepository(name.replaceAll(/[^a-z]/g, "-"))
  writeFileSync(join(fixture.repository, name), "throwaway\n")
  check(
    "check-root-allowlist.mjs",
    `rejects undeclared root file ${name}`,
    [],
    { status: 1, stderr: new RegExp(name.replaceAll(".", "\\.")) },
    { path: fixture.script, cwd: fixture.repository },
  )
}

export const cases = () => {
  const clean = stageRepository("clean-linked-worktree")
  writeFileSync(join(clean.repository, ".git"), "gitdir: elsewhere\n")
  check(
    "check-root-allowlist.mjs",
    "accepts a clean linked worktree where .git is a file",
    [],
    { status: 0 },
    { path: clean.script, cwd: clean.repository },
  )

  checkUndeclaredFile(".agent-scratch-extract.mjs")
  checkUndeclaredFile(".tmp-extract.mjs")
  checkUndeclaredFile("extract-tmp.mjs")

  const ignored = stageRepository("ignored-untracked", [".gitignore"])
  writeFileSync(join(ignored.repository, ".gitignore"), ".tmp-*\n")
  writeFileSync(join(ignored.repository, ".tmp-extract.mjs"), "throwaway\n")
  spawnSync("git", ["init", "-q"], { cwd: ignored.repository })
  const checkIgnored = spawnSync("git", ["check-ignore", ".tmp-extract.mjs"], { cwd: ignored.repository })
  const checkUntracked = spawnSync("git", ["ls-files", "--error-unmatch", ".tmp-extract.mjs"], { cwd: ignored.repository })
  T("check-root-allowlist.mjs: fixture is gitignored and untracked", checkIgnored.status === 0 && checkUntracked.status !== 0)
  check(
    "check-root-allowlist.mjs",
    "rejects a gitignored and untracked root file",
    [],
    { status: 1, stderr: /\.tmp-extract\.mjs/ },
    { path: ignored.script, cwd: ignored.repository },
  )

  const declared = stageRepository("declared", ["deliberate-root-file.md"])
  writeFileSync(join(declared.repository, "deliberate-root-file.md"), "architecture\n")
  check(
    "check-root-allowlist.mjs",
    "accepts a root file named in the allowlist data",
    [],
    { status: 0 },
    { path: declared.script, cwd: declared.repository },
  )
}
