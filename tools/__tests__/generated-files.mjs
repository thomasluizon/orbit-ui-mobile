import { spawnSync } from "node:child_process"

import { REPO_ROOT, T, same } from "./_harness.mjs"

const git = (args) => spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", windowsHide: true })

const BYTECODE = /(^|\/)__pycache__\/|\.py[co]$/

export const cases = () => {
  const listed = git(["ls-files", "-z"])
  T("git ls-files runs", listed.status === 0, listed.stderr)
  const tracked = listed.stdout.split("\0").filter((path) => BYTECODE.test(path))
  same("no tracked Python bytecode file", tracked, [])

  for (const path of ["__pycache__/a.cpython-315.pyc", ".claude/skills/unslop-ui/scripts/__pycache__/count_tells.cpython-315.pyc", "tools/a.pyc"]) {
    const ignored = git(["check-ignore", "--quiet", "--no-index", path])
    T(`.gitignore covers ${path}`, ignored.status === 0, `git check-ignore exit ${ignored.status}`)
  }
}
