import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { REPO_ROOT, T, check, root } from "./_harness.mjs"

const TOOL = "comment-fix.mjs"

/** A flat config whose inline `local/no-comments` rule removes a line comment that starts with `drop`, and only reports one that starts with `keep`. */
const ESLINT_CONFIG = `export default [{
  files: ["**/*.mjs"],
  plugins: { local: { rules: { "no-comments": { meta: { type: "suggestion", fixable: "code" }, create: (context) => ({
    Program: () => {
      for (const comment of context.sourceCode.getAllComments()) {
        const text = comment.value.trim()
        if (text.startsWith("drop")) context.report({ loc: comment.loc, message: "no comment", fix: (fixer) => fixer.remove(comment) })
        else if (text.startsWith("keep")) context.report({ loc: comment.loc, message: "no comment" })
      }
    },
  }) } } } },
  rules: { "local/no-comments": "error", "no-unused-vars": "error" },
}]
`

const repository = (label) => {
  const directory = join(root, "comment-fix", label)
  mkdirSync(join(directory, "apps", "web"), { recursive: true })
  mkdirSync(join(directory, "node_modules"), { recursive: true })
  // The workspace resolves ESLint the way the real workspaces do, from a node_modules above it.
  symlinkSync(join(REPO_ROOT, "node_modules", "eslint"), join(directory, "node_modules", "eslint"), "dir")
  writeFileSync(join(directory, "apps", "web", "package.json"), "{\"type\":\"module\"}\n")
  writeFileSync(join(directory, "apps", "web", "eslint.config.mjs"), ESLINT_CONFIG)
  writeFileSync(join(directory, "apps", "web", "untouched.mjs"), "// drop me\nexport const untouched = 1\n")
  const git = (...args) => {
    const result = spawnSync("git", ["-C", directory, ...args], { encoding: "utf8" })
    if (result.status !== 0) throw new Error(result.stderr)
    return result.stdout.trim()
  }
  git("init", "-q", "--initial-branch=main")
  git("add", "apps/web/package.json", "apps/web/eslint.config.mjs", "apps/web/untouched.mjs")
  git("-c", "user.email=gate@orbit.test", "-c", "user.name=Orbit Gate", "commit", "-q", "-m", "base")
  return { directory, git, base: git("rev-parse", "HEAD") }
}

export const cases = () => {
  const fixable = repository("fixable")
  writeFileSync(join(fixable.directory, "apps", "web", "changed.mjs"), "// drop this comment\nconst unused = 1\nexport const value = 2\n")
  writeFileSync(join(fixable.directory, "notes.md"), "// drop is not source\n")
  fixable.git("add", "apps/web/changed.mjs", "notes.md")
  fixable.git("-c", "user.email=gate@orbit.test", "-c", "user.name=Orbit Gate", "commit", "-q", "-m", "change")
  check(TOOL, "a fixable comment in a changed file is removed and the tool exits 0", ["--root", fixable.directory, "--base", fixable.base],
    { status: 0, stdout: /^apps\/web: 1 files, 1 fixed, 0 local\/no-comments left$/m })
  T(`${TOOL}: only the comment rule is fixed, never another rule`, readFileSync(join(fixable.directory, "apps", "web", "changed.mjs"), "utf8") === "\nconst unused = 1\nexport const value = 2\n")
  T(`${TOOL}: a file outside the diff is never touched`, readFileSync(join(fixable.directory, "apps", "web", "untouched.mjs"), "utf8").startsWith("// drop me"))

  const stubborn = repository("stubborn")
  writeFileSync(join(stubborn.directory, "apps", "web", "changed.mjs"), "// keep this comment\nexport const value = 2\n")
  stubborn.git("add", "apps/web/changed.mjs")
  stubborn.git("-c", "user.email=gate@orbit.test", "-c", "user.name=Orbit Gate", "commit", "-q", "-m", "change")
  check(TOOL, "a comment the autofix cannot remove exits 1 and names its line", ["--root", stubborn.directory, "--base", stubborn.base],
    { status: 1, stdout: /^ {2}apps\/web\/changed\.mjs:1 no comment$/m })
  check(TOOL, "a change with no source file exits 0 and prints nothing", ["--root", stubborn.directory, "--base", "HEAD"], { status: 0, stdout: /^$/ })
  check(TOOL, "an unknown base is an input error", ["--root", stubborn.directory, "--base", "no-such-ref"], { status: 2, stderr: /git diff no-such-ref HEAD failed/ })
  check(TOOL, "a missing base is a usage error", ["--root", stubborn.directory], { status: 2, stderr: /--base is required/ })
  check(TOOL, "a flag without a value is a usage error", ["--base"], { status: 2, stderr: /--base requires a value/ })
}
