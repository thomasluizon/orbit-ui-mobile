import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, check, root, toolPath } from "./_harness.mjs"

// Every fixture stages the tool into its own `tools/` directory, so `tools` is declared for all of
// them. Nothing else is, which is what makes the undeclared cases below meaningful.
const stageRepository = (label, allowedFiles = [], allowedDirectories = []) => {
  const repository = join(root, "root-allowlist", label)
  const tools = join(repository, "tools")
  mkdirSync(tools, { recursive: true })
  cpSync(toolPath("check-root-allowlist.mjs"), join(tools, "check-root-allowlist.mjs"))
  const allowlist = { files: allowedFiles, directories: ["tools", ...allowedDirectories] }
  writeFileSync(join(tools, "root-allowlist.json"), `${JSON.stringify(allowlist, null, 2)}\n`)
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

  // A local .env blocked every commit through the pre-commit hook before it was declared: the scan
  // sees ignored and untracked files by design, and .gitignore blesses .env at the root.
  const localEnvironment = stageRepository("local-env", [".env", ".env.local"])
  writeFileSync(join(localEnvironment.repository, ".env"), "SECRET=1\n")
  writeFileSync(join(localEnvironment.repository, ".env.local"), "SECRET=2\n")
  check(
    "check-root-allowlist.mjs",
    "accepts declared local environment files at the root",
    [],
    { status: 0 },
    { path: localEnvironment.script, cwd: localEnvironment.repository },
  )

  // The directory half of the closed set. Gating files alone let the same scratch land one level
  // down, so an undeclared root directory has to fail exactly like an undeclared root file.
  const scratchDirectory = stageRepository("undeclared-directory")
  mkdirSync(join(scratchDirectory.repository, ".artifacts"), { recursive: true })
  writeFileSync(join(scratchDirectory.repository, ".artifacts", "transcript.mjs"), "throwaway\n")
  check(
    "check-root-allowlist.mjs",
    "rejects an undeclared root directory",
    [],
    { status: 1, stderr: /\.artifacts\// },
    { path: scratchDirectory.script, cwd: scratchDirectory.repository },
  )

  const plainDirectory = stageRepository("undeclared-directory-no-dot")
  mkdirSync(join(plainDirectory.repository, "temporary screenshots"), { recursive: true })
  check(
    "check-root-allowlist.mjs",
    "rejects an undeclared root directory carrying no leading dot",
    [],
    { status: 1, stderr: /temporary screenshots\// },
    { path: plainDirectory.script, cwd: plainDirectory.repository },
  )

  const declaredDirectory = stageRepository("declared-directory", [], ["apps", "node_modules"])
  mkdirSync(join(declaredDirectory.repository, "apps"), { recursive: true })
  mkdirSync(join(declaredDirectory.repository, "node_modules"), { recursive: true })
  check(
    "check-root-allowlist.mjs",
    "accepts root directories named in the allowlist data",
    [],
    { status: 0 },
    { path: declaredDirectory.script, cwd: declaredDirectory.repository },
  )

  const legacyShape = stageRepository("legacy-array-shape")
  writeFileSync(join(legacyShape.repository, "tools", "root-allowlist.json"), '["README.md"]\n')
  check(
    "check-root-allowlist.mjs",
    "rejects a bare-array allowlist, which declares no directories",
    [],
    { status: 2, stderr: /files.*directories/ },
    { path: legacyShape.script, cwd: legacyShape.repository },
  )
}
