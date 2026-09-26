import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { T, toolPath } from "./_harness.mjs"

const checker = toolPath("check-timeless.mjs")
const run = (cwd, args, input) => spawnSync(process.execPath, [join(cwd, "tools", "check-timeless.mjs"), ...args], { cwd, input, encoding: "utf8" })
const git = (cwd, ...args) => spawnSync("git", args, { cwd, encoding: "utf8" })

const fixture = (label, path, content) => {
  const root = mkdtempSync(join(tmpdir(), `timeless-${label}-`))
  mkdirSync(join(root, "tools"))
  cpSync(checker, join(root, "tools", "check-timeless.mjs"))
  writeFileSync(join(root, "tools", "timeless-allowlist.json"), "[]\n")
  git(root, "init", "-q", "--initial-branch=main")
  git(root, "config", "user.email", "gate@orbit.test")
  git(root, "config", "user.name", "Orbit Gate")
  writeFileSync(join(root, path), content)
  git(root, "add", "tools/check-timeless.mjs", "tools/timeless-allowlist.json", path)
  git(root, "commit", "-qm", "base")
  return root
}

export const cases = () => {
  const date = ["2026", "-08-12"].join("")
  const owner = ["Tho", "mas"].join("")
  const path = ["/", "Users/alex/project"].join("")
  const windowsPath = ["C:", "\\", "Users", "\\", "alex"].join("")
  const cases = [
    ["machine-path", "sample.md", `Use ${path}.\n`],
    ["machine-path-windows", "sample.md", `Use ${windowsPath}.\n`],
    ["owner-name", "sample.md", `Ask ${owner}.\n`],
    ["dated-anecdote", "sample.md", `On ${date}, the run failed.\n`],
    ["comment-length", "sample.js", Array.from({ length: 7 }, (_, index) => `// reason ${index}`).join("\n") + "\n"],
  ]
  for (const [rule, name, planted] of cases) {
    const root = fixture(rule, name, "clean\n")
    const base = git(root, "rev-parse", "HEAD").stdout.trim()
    const file = join(root, name)
    const payload = { tool_name: "Write", tool_input: { file_path: file, content: planted }, cwd: root }
    T(`${rule}: hook rejects a new finding`, run(root, ["--hook"], JSON.stringify(payload)).status === 2)
    writeFileSync(file, planted)
    git(root, "add", name)
    T(`${rule}: all rejects a planted finding`, run(root, ["--all"]).status === 1)
    T(`${rule}: staged rejects a planted finding`, run(root, ["--staged"]).status === 1)
    git(root, "commit", "-qm", "plant")
    T(`${rule}: base rejects a planted finding`, run(root, ["--base", base]).status === 1)
    writeFileSync(file, "clean\n")
    git(root, "add", name)
    T(`${rule}: all passes after removal`, run(root, ["--all"]).status === 0)
    T(`${rule}: staged passes after removal`, run(root, ["--staged"]).status === 0)
    git(root, "commit", "-qm", "remove")
    T(`${rule}: base passes after removal`, run(root, ["--base", base]).status === 0)
    T(`${rule}: hook passes after removal`, run(root, ["--hook"], JSON.stringify({ ...payload, tool_input: { file_path: file, content: "clean\n" } })).status === 0)
    rmSync(root, { recursive: true, force: true })
  }

  const safe = fixture("literals", "sample.js", `const message = "${date}";\nconst pattern = /${date}/;\n// one\n// two\n// three\n// four\n// five\n// six\n`)
  const editRoot = fixture("edit-payloads", "sample.md", "clean\n")
  const editInput = { file_path: join(editRoot, "sample.md"), old_string: "clean", new_string: owner }
  T("Edit rejects an added finding", run(editRoot, ["--hook"], JSON.stringify({ tool_name: "Edit", tool_input: editInput, cwd: editRoot })).status === 2)
  T("MultiEdit rejects an added finding without a container-field assumption", run(editRoot, ["--hook"], JSON.stringify({ tool_name: "MultiEdit", tool_input: { file_path: editInput.file_path, operations: [editInput] }, cwd: editRoot })).status === 2)
  T("a hook opened in another repository delegates to the target checker", run(safe, ["--hook"], JSON.stringify({ tool_name: "Edit", tool_input: editInput, cwd: safe })).status === 2)
  rmSync(editRoot, { recursive: true, force: true })

  const growing = fixture("growing-comment", "sample.js", Array.from({ length: 6 }, (_, index) => `// reason ${index}`).join("\n") + "\n")
  const seventh = "// reason 6\n"
  writeFileSync(join(growing, "sample.js"), Array.from({ length: 6 }, (_, index) => `// reason ${index}`).join("\n") + "\n" + seventh)
  git(growing, "add", "sample.js")
  T("adding only the seventh comment line fails staged mode", run(growing, ["--staged"]).status === 1)
  rmSync(growing, { recursive: true, force: true })
  writeFileSync(join(safe, "sample.json"), JSON.stringify({ date }))
  git(safe, "add", "sample.json")
  T("string, regex, JSON, and six comment lines pass", run(safe, ["--all"]).status === 0)
  writeFileSync(join(safe, "tools", "timeless-allowlist.json"), JSON.stringify([{ path: "sample.js", rule: "owner-name", match: owner, reason: "unused" }]))
  T("an unused allowlist entry fails", run(safe, ["--all"]).status === 1)
  const scratch = join(tmpdir(), "timeless-scratchpad.txt")
  T("a scratchpad path passes the hook", run(safe, ["--hook"], JSON.stringify({ tool_name: "Write", tool_input: { file_path: scratch, content: path }, cwd: safe })).status === 0)
  rmSync(safe, { recursive: true, force: true })
}
