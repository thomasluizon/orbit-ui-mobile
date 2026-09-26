import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
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
  mkdirSync(join(root, path, ".."), { recursive: true })
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

  const datedComments = [
    ["project XML", "sample.csproj", `<Project><!-- ${date} --></Project>\n`],
    ["props XML", "sample.props", `<Project><!-- ${date} --></Project>\n`],
    ["NuGet XML", "nuget.config", `<configuration><!-- ${date} --></configuration>\n`],
    ["Astro frontmatter", "sample.astro", `---\n// ${date}\n---\n<div>clean</div>\n`],
    ["Astro script", "sample.astro", `<script>\n// ${date}\n</script>\n`],
  ]
  for (const [label, name, content] of datedComments) {
    const root = fixture("dated-comment", name, content)
    if (name.endsWith(".astro")) symlinkSync(join(checker, "..", "..", "node_modules"), join(root, "node_modules"), "dir")
    const result = run(root, ["--all"])
    T(`${label} date comment fails --all`, result.status === 1 && result.stderr.includes("dated-anecdote"), result.stderr)
    rmSync(root, { recursive: true, force: true })
  }

  const safe = fixture("literals", "sample.js", `const message = "${date}";\nconst pattern = /${date}/;\n// one\n// two\n// three\n// four\n// five\n// six\n`)
  const editRoot = fixture("edit-payloads", "sample.md", "clean\n")
  const editInput = { file_path: join(editRoot, "sample.md"), old_string: "clean", new_string: owner }
  T("Edit rejects an added finding", run(editRoot, ["--hook"], JSON.stringify({ tool_name: "Edit", tool_input: editInput, cwd: editRoot })).status === 2)
  T("the hook does not depend on envelope field names", run(editRoot, ["--hook"], JSON.stringify({ nested: editInput })).status === 2)
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
  const jsx = fixture("jsx-text", "sample.tsx", "export const Sample = () => <span>clean</span>\n")
  symlinkSync(join(checker, "..", "..", "node_modules"), join(jsx, "node_modules"), "dir")
  const writeJsx = (content) => run(jsx, ["--hook"], JSON.stringify({ tool_name: "Write", tool_input: { file_path: join(jsx, "sample.tsx"), content }, cwd: jsx }))
  const rendered = `export const Sample = () => <span>// ${date}</span>\n`
  T("JSX text with a date passes Write hook", writeJsx(rendered).status === 0)
  writeFileSync(join(jsx, "sample.tsx"), rendered)
  git(jsx, "add", "sample.tsx")
  T("JSX text with a date passes all and staged", run(jsx, ["--all"]).status === 0 && run(jsx, ["--staged"]).status === 0)
  const jsxComment = `export const Sample = () => <span>{/* ${date} */}</span>\n`
  T("a real JSX comment fails Write hook", writeJsx(jsxComment).status === 2)
  const jsxExpression = `export const Sample = () => <span>{value && (\n// ${date}\nvalue)}</span>\n`
  T("a comment inside a JSX expression fails Write hook", writeJsx(jsxExpression).status === 2)
  const jsxAttribute = `export const Sample = () => <span title="// ${date}">clean</span>\n`
  T("JSX attribute strings pass Write hook", writeJsx(jsxAttribute).status === 0)
  const nestedTernary = `export const Sample = () => <div>{ok ? <span>x</span> : /* ${date} */ null}</div>\n`
  T("a comment after nested JSX in a ternary fails Write hook", writeJsx(nestedTernary).status === 2)
  const nestedMap = `export const Sample = () => <div>{items.map(item => <span>{item}</span> /* ${date} */)}</div>\n`
  T("a comment after nested JSX in a map callback fails Write hook", writeJsx(nestedMap).status === 2)
  const nestedAttribute = `export const Sample = () => <div title={ok ? <span>x</span> : /* ${date} */ null}>clean</div>\n`
  T("a comment after nested JSX in an attribute expression fails Write hook", writeJsx(nestedAttribute).status === 2)
  const emptyCall = `export const Sample = () => run(/* ${date} */)\n`
  writeFileSync(join(jsx, "sample.tsx"), emptyCall)
  T("a dated comment inside an empty call fails --all", run(jsx, ["--all"]).status === 1)
  const parserLiterals = `export const Sample = () => <span>{"${date}"}{/${date}/.test(value)}</span>\n`
  T("the TypeScript parser ignores dates in strings and regex literals", writeJsx(parserLiterals).status === 0)
  const sixLines = Array.from({ length: 6 }, (_, index) => `// reason ${index}`).join("\n")
  T("six TypeScript comment lines pass", writeJsx(`${sixLines}\n${rendered}`).status === 0)
  T("seven TypeScript comment lines fail", writeJsx(`${sixLines}\n// reason 6\n${rendered}`).status === 2)
  writeFileSync(join(jsx, "sample.tsx"), jsxComment)
  git(jsx, "add", "sample.tsx")
  T("a real JSX comment fails all and staged", run(jsx, ["--all"]).status === 1 && run(jsx, ["--staged"]).status === 1)
  rmSync(jsx, { recursive: true, force: true })
  const noParser = fixture("jsx-without-parser", "sample.tsx", "export const Sample = () => <span>clean</span>\n")
  const missingParser = run(noParser, ["--all"])
  T("TSX without TypeScript fails closed", missingParser.status === 2 && /TypeScript/.test(missingParser.stderr))
  rmSync(noParser, { recursive: true, force: true })

  const wrapped = fixture("wrapped-literal", "sample.js", `const value = new Date("${date}")\n`)
  symlinkSync(join(checker, "..", "..", "node_modules"), join(wrapped, "node_modules"), "dir")
  const sourceLine = `const value = new Date("${date}")`
  const wrapWrite = { file_path: join(wrapped, "sample.js"), content: `/*\n${sourceLine}\n*/\n` }
  const wrapResult = run(wrapped, ["--hook"], JSON.stringify({ tool_name: "Write", tool_input: wrapWrite, cwd: wrapped }))
  T("wrapping an existing date literal in a comment fails Write hook", wrapResult.status === 2 && wrapResult.stderr.includes("dated-anecdote"), wrapResult.stderr)
  rmSync(wrapped, { recursive: true, force: true })

  const moved = fixture("moved-comment", "sample.js", `// ${date}\nconst value = 1\n`)
  symlinkSync(join(checker, "..", "..", "node_modules"), join(moved, "node_modules"), "dir")
  const moveEdit = { file_path: join(moved, "sample.js"), old_string: `// ${date}\nconst value = 1`, new_string: `const value = 1\n// ${date}` }
  const moveResult = run(moved, ["--hook"], JSON.stringify({ tool_name: "Edit", tool_input: moveEdit, cwd: moved }))
  T("moving an existing dated comment down one line passes Edit hook", moveResult.status === 0, moveResult.stderr)
  rmSync(moved, { recursive: true, force: true })

  const scoped = fixture("directory-scope", "design/canvas/example.md", `Ask ${owner} on ${date}.\n`)
  const scopedAllowlist = ["owner-name", "dated-anecdote"].map((rule) => ({ path: "design/canvas/", rule, match: null, scope: "directory", exclude: ["design/canvas/tools/"], reason: "granted export" }))
  writeFileSync(join(scoped, "tools", "timeless-allowlist.json"), JSON.stringify(scopedAllowlist))
  T("directory entries exempt their rules in --all", run(scoped, ["--all"]).status === 0)
  mkdirSync(join(scoped, "design", "canvas", "tools"), { recursive: true })
  writeFileSync(join(scoped, "design", "canvas", "tools", "example.md"), `Ask ${owner}.\n`)
  git(scoped, "add", "design/canvas/tools/example.md")
  T("directory entries do not exempt an excluded subdirectory", run(scoped, ["--all"]).status === 1)
  git(scoped, "rm", "-q", "design/canvas/tools/example.md")
  writeFileSync(join(scoped, "design/canvas/example.md"), `Ask ${owner} on ${date} at ${path}.\n`)
  T("directory entries never exempt machine paths", run(scoped, ["--all"]).status === 1)
  writeFileSync(join(scoped, "design/canvas/example.md"), "clean\n")
  T("unused directory entries fail --all", run(scoped, ["--all"]).status === 1)
  rmSync(scoped, { recursive: true, force: true })
  const longComment = Array.from({ length: 7 }, (_, index) => `// reason ${index}`).join("\n") + "\n"
  const scopedLength = fixture("scoped-length", "design/canvas/example.js", longComment)
  const scopedEntry = { path: "design/canvas/", rule: "comment-length", match: null, scope: "directory", reason: "reviewed export" }
  writeFileSync(join(scopedLength, "tools", "timeless-allowlist.json"), JSON.stringify([scopedEntry]))
  T("a directory entry may exempt comment-length", run(scopedLength, ["--all"]).status === 0)
  writeFileSync(join(scopedLength, "tools", "timeless-allowlist.json"), JSON.stringify([{ ...scopedEntry, rule: "machine-path" }]))
  const forbiddenScope = run(scopedLength, ["--all"])
  T("a directory entry cannot exempt machine-path", forbiddenScope.status === 2 && forbiddenScope.stderr.includes("valid exact or directory-scoped entries"), forbiddenScope.stderr)
  rmSync(scopedLength, { recursive: true, force: true })
  writeFileSync(join(safe, "tools", "timeless-allowlist.json"), JSON.stringify([{ path: "sample.js", rule: "owner-name", match: owner, reason: "unused" }]))
  T("an unused allowlist entry fails", run(safe, ["--all"]).status === 1)
  const scratch = join(tmpdir(), "timeless-scratchpad.txt")
  T("a scratchpad path passes the hook", run(safe, ["--hook"], JSON.stringify({ tool_name: "Write", tool_input: { file_path: scratch, content: path }, cwd: safe })).status === 0)
  rmSync(safe, { recursive: true, force: true })

  const yaml = fixture("yaml-escape", "sample.yml", "value: clean\n")
  writeFileSync(join(yaml, "sample.yml"), `value: "foo\\\\" # ${date}\n`)
  git(yaml, "add", "sample.yml")
  const yamlAll = run(yaml, ["--all"])
  T("a comment after an escaped backslash fails", yamlAll.status === 1 && yamlAll.stderr.includes("sample.yml:1: dated-anecdote"))
  rmSync(yaml, { recursive: true, force: true })

  const removed = fixture("staged-removed", "sample.md", "clean\n")
  writeFileSync(join(removed, "sample.md"), `Ask ${owner}.\n`)
  git(removed, "add", "sample.md")
  rmSync(join(removed, "sample.md"))
  const removedStaged = run(removed, ["--staged"])
  T("--staged checks a staged file whose working copy is gone", removedStaged.status === 1 && removedStaged.stderr.includes("sample.md:1: owner-name"))
  rmSync(removed, { recursive: true, force: true })
}
