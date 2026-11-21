import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, root, run, check } from "./_harness.mjs"

const orcaWebPortCases = () => {
  check("orca-web-port.mjs", "rejects multiple operation flags", ["--setup", "--next-dev"], { status: 2, stderr: /alternatives/ })

  const fixture = join(root, "orca-web-port")
  const gitFixture = (argv, cwd = fixture) => spawnSync("git", argv, { cwd, encoding: "utf8" })
  mkdirSync(join(fixture, "apps", "web"), { recursive: true })
  gitFixture(["init", "--initial-branch=main"])
  gitFixture(["config", "user.email", "tools@example.test"])
  gitFixture(["config", "user.name", "Orbit tools gate"])
  writeFileSync(join(fixture, "README.md"), "fixture\n")
  gitFixture(["add", "README.md"])
  gitFixture(["commit", "-m", "fixture"])
  gitFixture(["worktree", "add", "-b", "feature/one", "one"])
  gitFixture(["worktree", "add", "-b", "feature/two", "two"])
  gitFixture(["worktree", "add", "-b", "feature/collision-one", "collision-worktree-29"])
  gitFixture(["worktree", "add", "-b", "feature/collision-two", "collision-worktree-32"])
  const first = join(fixture, "one")
  const second = join(fixture, "two")
  const collision = join(fixture, "collision-worktree-32")
  mkdirSync(join(first, "apps", "web"), { recursive: true })
  mkdirSync(join(second, "apps", "web"), { recursive: true })
  writeFileSync(join(first, "apps", "web", ".env.local"), "API_BASE=http://example.test\n")
  check("orca-web-port.mjs", "a linked worktree without setup refuses to guess", [], { status: 1, stderr: /no assigned port/ }, { cwd: first })
  check("orca-web-port.mjs", "setup assigns the first linked worktree", ["--setup"], { status: 0, stdout: /^3\d{3}/ }, { cwd: first })
  check("orca-web-port.mjs", "setup assigns a different linked worktree", ["--setup"], { status: 0, stdout: /^3\d{3}/ }, { cwd: second })
  const firstPort = Number(run("orca-web-port.mjs", [], { cwd: first }).stdout.trim())
  const secondPort = Number(run("orca-web-port.mjs", [], { cwd: second }).stdout.trim())
  T("orca-web-port.mjs: linked worktrees report their own distinct assignments", firstPort !== secondPort && firstPort >= 3100 && secondPort >= 3100)
  T("orca-web-port.mjs: setup does not clobber an existing local environment file", readFileSync(join(first, "apps", "web", ".env.local"), "utf8") === "API_BASE=http://example.test\n")
  check("orca-web-port.mjs", "refuses a deterministic port collision before persisting", ["--setup"], { status: 1, stderr: /collides with linked worktree collision-worktree-29/ }, { cwd: collision })
  T("orca-web-port.mjs: collision refusal leaves no marker behind", !existsSync(join(collision, ".orca", "web-port")))

  const primary = join(root, "orca-web-port-primary")
  mkdirSync(primary, { recursive: true })
  const gitPrimary = (argv) => spawnSync("git", argv, { cwd: primary, encoding: "utf8" })
  gitPrimary(["init", "--initial-branch=main"])
  check("orca-web-port.mjs", "the primary checkout keeps the default port", [], { status: 0, stdout: /^3000\s*$/ }, { cwd: primary })
  check("orca-web-port.mjs", "setup refuses the primary checkout", ["--setup"], { status: 1, stderr: /keeps the default web port/ }, { cwd: primary })
}

export { orcaWebPortCases as cases }
