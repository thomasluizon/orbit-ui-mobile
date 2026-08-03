import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { root, check } from "./_harness.mjs"

const skillNames = [
  "android-generate", "audit-code-quality", "audit-performance", "audit-security", "audit-tests", "commit-sweep", "deep-research", "dep-sweep", "dev-server", "feature", "investigate", "lesson", "llm-council", "make-tool", "next", "orchestrate", "pr-review", "prod-readiness", "profile", "quota", "rollup", "second-opinion", "ticket", "validate", "watch",
]
const agentNames = ["Explore", "audit-readonly", "completeness-critic", "contract-aligner", "design-reviewer", "design-specialist", "i18n-syncer", "parity-checker", "product-manager", "security-reviewer", "web-researcher"]

const fixtureRoot = join(root, "codex-adapters")
const write = (path, contents = "adapter\n") => {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, contents)
}
const resetFixture = () => {
  rmSync(fixtureRoot, { recursive: true, force: true })
  for (const name of skillNames) {
    write(join(fixtureRoot, ".claude", "skills", name, "SKILL.md"), "canonical skill\n")
    write(join(fixtureRoot, ".agents", "skills", name, "SKILL.md"))
  }
  mkdirSync(join(fixtureRoot, ".claude", "skills", "_shared"), { recursive: true })
  for (const name of agentNames) {
    write(join(fixtureRoot, ".claude", "agents", `${name}.md`), "canonical agent\n")
    write(join(fixtureRoot, ".codex", "agents", `${name}.toml`))
  }
}

export const cases = () => {
  resetFixture()
  check("check-codex-adapters.mjs", "accepts the complete bidirectional inventory", ["--root", fixtureRoot], { status: 0, stdout: /25 skills and 11 agents/ })

  resetFixture()
  rmSync(join(fixtureRoot, ".agents", "skills", "orchestrate"), { recursive: true })
  check("check-codex-adapters.mjs", "names a missing skill adapter and its canonical source", ["--root", fixtureRoot], { status: 1, stderr: /missing skill adapter: \.agents\/skills\/orchestrate\/SKILL\.md for \.claude\/skills\/orchestrate\/SKILL\.md/ })

  resetFixture()
  write(join(fixtureRoot, ".agents", "skills", "retired", "SKILL.md"))
  check("check-codex-adapters.mjs", "names an orphan skill adapter and absent canonical source", ["--root", fixtureRoot], { status: 1, stderr: /orphan skill adapter: \.agents\/skills\/retired\/SKILL\.md has no canonical \.claude\/skills\/retired\/SKILL\.md/ })

  resetFixture()
  rmSync(join(fixtureRoot, ".codex", "agents", "web-researcher.toml"))
  check("check-codex-adapters.mjs", "names a missing agent adapter and its canonical source", ["--root", fixtureRoot], { status: 1, stderr: /missing agent adapter: \.codex\/agents\/web-researcher\.toml for \.claude\/agents\/web-researcher\.md/ })

  resetFixture()
  write(join(fixtureRoot, ".codex", "agents", "retired.toml"))
  check("check-codex-adapters.mjs", "names an orphan agent adapter and absent canonical source", ["--root", fixtureRoot], { status: 1, stderr: /orphan agent adapter: \.codex\/agents\/retired\.toml has no canonical \.claude\/agents\/retired\.md/ })
}
