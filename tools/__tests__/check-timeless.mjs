import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { REPO_ROOT, T, toolPath } from "./_harness.mjs"

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

const landedEdit = (root, name, written, { session = root, filePath = join(root, name), edit = { old_string: "unrelated", new_string: "unrelated" }, envelope } = {}) => {
  writeFileSync(join(root, name), written)
  const payload = envelope ?? { tool_name: "Edit", tool_input: { file_path: filePath, ...edit }, tool_response: {} }
  return run(session, ["--hook"], JSON.stringify({ hook_event_name: "PostToolUse", ...payload }))
}

export const cases = () => {
  const date = ["2026", "-08-12"].join("")
  const owner = ["Tho", "mas"].join("")
  const path = ["/", "Users/alex/project"].join("")
  const windowsPath = ["C:", "\\", "Users", "\\", "alex"].join("")
  const carryPath = ["$HOME/.orbit-", "run-carry/carry.sh"].join("")
  const scratchpadRoot = ["~/.claude-", "tmp/session/scratchpad/note.md"].join("")
  const plantedFindings = [
    ["machine-path", "sample.md", `Use ${path}.\n`],
    ["machine-path-windows", "sample.md", `Use ${windowsPath}.\n`],
    ["machine-path-carry", "sample.md", `Run ${carryPath}.\n`],
    ["machine-path-scratchpad", "sample.md", `Read ${scratchpadRoot}.\n`],
    ["owner-name", "sample.md", `Ask ${owner}.\n`],
    ["dated-anecdote", "sample.md", `On ${date}, the run failed.\n`],
    ["comment-length", "sample.js", Array.from({ length: 7 }, (_, index) => `// reason ${index}`).join("\n") + "\n"],
  ]
  for (const [rule, name, planted] of plantedFindings) {
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
  const ownerFinding = (name) => `${name}:1: owner-name: ${owner}`
  const rejects = (result, finding) => result.status === 2 && result.stderr.trim() === finding

  const repeated = fixture("replace-all", "sample.js", 'const word = "clean";\n// clean\n')
  const everyOccurrence = landedEdit(repeated, "sample.js", `const word = "${date}";\n// ${date}\n`, { edit: { old_string: "clean", new_string: date, replace_all: true } })
  T("a landed replace_all Edit is checked at the later occurrence", rejects(everyOccurrence, `sample.js:2: dated-anecdote: ${date}`), everyOccurrence.stderr)
  rmSync(repeated, { recursive: true, force: true })
  const literal = fixture("literal-replacement", "sample.md", `${owner} clean\n`)
  const dollarPrefix = landedEdit(literal, "sample.md", `${owner} $\`\n`, { edit: { old_string: "clean", new_string: "$`" } })
  T("a landed replacement dollar stays literal", dollarPrefix.status === 0, dollarPrefix.stderr)
  writeFileSync(join(literal, "sample.md"), `clean ${owner}\n`)
  git(literal, "commit", "-qam", "suffix")
  const dollarSuffix = landedEdit(literal, "sample.md", `$' ${owner}\n`, { edit: { old_string: "clean", new_string: "$'" } })
  T("a landed replacement dollar suffix stays literal", dollarSuffix.status === 0, dollarSuffix.stderr)
  rmSync(literal, { recursive: true, force: true })

  const editRoot = fixture("edit-payloads", "sample.md", "clean\n")
  const editFile = join(editRoot, "sample.md")
  const editInput = { file_path: editFile, old_string: "clean", new_string: owner }
  const planted = landedEdit(editRoot, "sample.md", `${owner}\n`, { edit: editInput })
  T("a landed Edit is checked on the bytes in the file", rejects(planted, ownerFinding("sample.md")), planted.stderr)
  const claimed = landedEdit(editRoot, "sample.md", "clean\n", { edit: editInput })
  T("a landed Edit is not checked on its old_string and new_string", claimed.status === 0, claimed.stderr)
  const beforeLanding = run(editRoot, ["--hook"], JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: editInput, cwd: editRoot }))
  T("an Edit before it lands is not checked", beforeLanding.status === 0, beforeLanding.stderr)
  const nested = landedEdit(editRoot, "sample.md", `${owner}\n`, { envelope: { nested: { file_path: editFile } } })
  T("the hook does not depend on envelope field names", rejects(nested, ownerFinding("sample.md")), nested.stderr)
  const multiEdit = landedEdit(editRoot, "sample.md", `${owner}\n`, { envelope: { tool_name: "MultiEdit", tool_input: { file_path: editFile, operations: [editInput] }, cwd: editRoot } })
  T("a landed MultiEdit rejects an added finding without a container-field assumption", rejects(multiEdit, ownerFinding("sample.md")), multiEdit.stderr)
  rmSync(editRoot, { recursive: true, force: true })

  const created = fixture("empty-old-string", "sample.md", "clean\n")
  const emptyOldString = landedEdit(created, "new.md", `Ask ${owner}.\n`, { edit: { old_string: "", new_string: `Ask ${owner}.\n`, replace_all: true } })
  T("a landed Edit with an empty old_string is checked on the file it set", rejects(emptyOldString, ownerFinding("new.md")), emptyOldString.stderr)
  rmSync(created, { recursive: true, force: true })

  const commentLines = (tag, count) => Array.from({ length: count }, (_, index) => `// ${tag} ${index}\n`).join("")
  const joined = fixture("deletion-line-break", "sample.js", `${commentLines("first", 3)}const value = 1\n${commentLines("second", 4)}`)
  const deletion = landedEdit(joined, "sample.js", `${commentLines("first", 3)}${commentLines("second", 4)}`, { edit: { old_string: "const value = 1", new_string: "" } })
  T("a landed deletion that also removes the line break is checked on the joined comment lines", rejects(deletion, "sample.js:1: comment-length: 7 lines"), deletion.stderr)
  rmSync(joined, { recursive: true, force: true })

  const carriage = fixture("crlf-match", "sample.md", "clean\r\nline\r\n")
  git(carriage, "config", "core.autocrlf", "false")
  const crlfMatch = landedEdit(carriage, "sample.md", `Ask ${owner}.\r\nline\r\n`, { edit: { old_string: "clean\nline", new_string: `Ask ${owner}.\nline` } })
  T("a landed Edit whose old_string has a line break is checked in a CRLF file", rejects(crlfMatch, ownerFinding("sample.md")), crlfMatch.stderr)
  rmSync(carriage, { recursive: true, force: true })

  const curly = fixture("curly-quotes", "sample.md", "The note is \u201cclean\u201d.\n")
  const quoteMatch = landedEdit(curly, "sample.md", `The note is \u201cAsk ${owner}\u201d.\n`, { edit: { old_string: '"clean"', new_string: `"Ask ${owner}"` } })
  T("a landed Edit whose straight quotes matched curly quotes is checked", rejects(quoteMatch, ownerFinding("sample.md")), quoteMatch.stderr)
  rmSync(curly, { recursive: true, force: true })

  const escaped = fixture("unicode-escape", "sample.md", "caf\u00e9 clean\n")
  const escapeMatch = landedEdit(escaped, "sample.md", `Ask ${owner}.\n`, { edit: { old_string: "caf\\u00e9 clean", new_string: `Ask ${owner}.` } })
  T("a landed Edit whose escape matched the decoded text is checked", rejects(escapeMatch, ownerFinding("sample.md")), escapeMatch.stderr)
  rmSync(escaped, { recursive: true, force: true })

  const baseline = fixture("head-baseline", "sample.mjs", `// ${date}\nconst other = 1\n`)
  const movedFinding = landedEdit(baseline, "sample.mjs", `const other = 2\n// ${date}\n`)
  T("a landed Edit does not report a finding the HEAD blob already has", movedFinding.status === 0, movedFinding.stderr)
  writeFileSync(join(baseline, "sample.md"), `Ask ${owner}.\n`)
  git(baseline, "add", "sample.md")
  const stagedFinding = landedEdit(baseline, "sample.md", `Ask ${owner}.\nmore\n`)
  T("a landed Edit is judged against HEAD, not the index", rejects(stagedFinding, ownerFinding("sample.md")), stagedFinding.stderr)
  rmSync(baseline, { recursive: true, force: true })

  const marker = ["ses", "sion"].join("")
  const lineFeedBlob = fixture("crlf-checkout", "Sample.cs", `/* ${marker}\n   abcdef1234 */\nvar x = 1;\n`)
  const crlfCheckout = landedEdit(lineFeedBlob, "Sample.cs", `/* ${marker}\r\n   abcdef1234 */\r\nvar x = 2;\r\n`)
  T("a landed Edit in a CRLF checkout of an LF blob does not report a finding the blob already has", crlfCheckout.status === 0, crlfCheckout.stderr)
  rmSync(lineFeedBlob, { recursive: true, force: true })
  const carriageBlob = fixture("crlf-blob", "Sample.cs", "clean\n")
  git(carriageBlob, "config", "core.autocrlf", "false")
  writeFileSync(join(carriageBlob, "Sample.cs"), `/* ${marker}\r\n   abcdef1234 */\r\nvar x = 1;\r\n`)
  git(carriageBlob, "add", "Sample.cs")
  git(carriageBlob, "commit", "-qm", "crlf")
  T("the fixture commits a CRLF blob", git(carriageBlob, "cat-file", "-p", "HEAD:Sample.cs").stdout.includes(`${marker}\r\n`))
  const crlfBlob = landedEdit(carriageBlob, "Sample.cs", `/* ${marker}\r\n   abcdef1234 */\r\nvar x = 2;\r\n`)
  T("a landed Edit on a CRLF blob does not report a finding the blob already has", crlfBlob.status === 0, crlfBlob.stderr)
  rmSync(carriageBlob, { recursive: true, force: true })

  const writeHook = (session, filePath, content) => run(session, ["--hook"], JSON.stringify({ tool_name: "Write", tool_input: { file_path: filePath, content } }))
  const otherLabel = "a hook judges a file of another repository"
  const sessionRoot = fixture("session-repository", "sample.md", "clean\n")
  const otherRoot = fixture("other-repository", "kept.md", `Ask ${owner}.\n`)
  writeFileSync(join(otherRoot, "tools", "check-timeless.mjs"), "process.exit(0)\n")
  writeFileSync(join(otherRoot, ".gitignore"), "local/\n")
  const otherKept = landedEdit(otherRoot, "kept.md", `Ask ${owner}.\nmore\n`, { session: sessionRoot })
  T(`${otherLabel} against the HEAD blob of that repository`, otherKept.status === 0, otherKept.stderr)
  const otherPlanted = landedEdit(otherRoot, "sample.md", `Ask ${owner}.\n`, { session: sessionRoot })
  T(`${otherLabel} itself, not through its checker`, rejects(otherPlanted, ownerFinding("sample.md")), otherPlanted.stderr)
  const otherWritten = writeHook(sessionRoot, join(otherRoot, "new.md"), `Ask ${owner}.\n`)
  T(`${otherLabel} at a Write before it lands`, rejects(otherWritten, ownerFinding("new.md")), otherWritten.stderr)
  mkdirSync(join(otherRoot, "local"))
  const otherIgnored = landedEdit(otherRoot, "local/notes.md", `Ask ${owner}.\n`, { session: sessionRoot })
  T(`${otherLabel} with the ignored paths of that repository`, otherIgnored.status === 0, otherIgnored.stderr)
  writeFileSync(join(otherRoot, "tools", "timeless-allowlist.json"), JSON.stringify([{ path: "sample.md", rule: "owner-name", match: owner, reason: "reviewed" }]))
  const otherAllowed = landedEdit(otherRoot, "sample.md", `Ask ${owner}.\n`, { session: sessionRoot })
  T(`${otherLabel} with the allowlist of that repository`, otherAllowed.status === 0, otherAllowed.stderr)
  rmSync(sessionRoot, { recursive: true, force: true })
  rmSync(otherRoot, { recursive: true, force: true })

  const cased = fixture("path-case", "README.md", `Ask ${owner}.\n`)
  const misCased = cased.replace(/[^/\\]+$/, (name) => name.toUpperCase())
  if (existsSync(join(misCased, "readme.md"))) {
    const misCasedWrite = writeHook(cased, join(misCased, "sample.md"), `Ask ${owner}.\n`)
    T("a Write through a mis-cased directory is judged at the case the file system stores", rejects(misCasedWrite, ownerFinding("sample.md")), misCasedWrite.stderr)
    const misCasedEdit = landedEdit(cased, "sample.md", `Ask ${owner}.\n`, { filePath: join(misCased, "sample.md") })
    T("a landed Edit through a mis-cased directory is judged at the case the file system stores", rejects(misCasedEdit, ownerFinding("sample.md")), misCasedEdit.stderr)
    const misCasedName = landedEdit(cased, "README.md", `Ask ${owner}.\nmore\n`, { filePath: join(cased, "readme.md") })
    T("a landed Edit through a mis-cased file name reads the HEAD blob at the stored case", misCasedName.status === 0, misCasedName.stderr)
  } else console.log("SKIP check-timeless.mjs: a mis-cased path names another file (this file system is case-sensitive)")
  rmSync(cased, { recursive: true, force: true })

  const skipped = fixture("skipped-paths", "sample.md", "clean\n")
  const outside = mkdtempSync(join(tmpdir(), "timeless-outside-"))
  writeFileSync(join(skipped, ".gitignore"), "local/\n")
  mkdirSync(join(skipped, "local"))
  T("a Write to a path git ignores is not checked", writeHook(skipped, join(skipped, "local/new.md"), `Ask ${owner}.\n`).status === 0)
  T("a landed Edit of a path git ignores is not checked", landedEdit(skipped, "local/notes.md", `Ask ${owner}.\n`).status === 0)
  writeFileSync(join(outside, "target.md"), "clean\n")
  symlinkSync(join(outside, "target.md"), join(skipped, "outside.md"))
  T("a landed Edit of a path in no repository is not checked", landedEdit(skipped, "outside.md", `Ask ${owner}.\n`).status === 0)
  git(outside, "init", "-q")
  T("a landed Edit in a repository without the checker is not checked", landedEdit(skipped, "outside.md", `Ask ${owner}.\n`).status === 0)
  T("a Write in a repository without the checker is not checked", writeHook(skipped, join(outside, "new.md"), `Ask ${owner}.\n`).status === 0)
  rmSync(skipped, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })

  const settings = JSON.parse(readFileSync(join(REPO_ROOT, ".claude", "settings.json"), "utf8"))
  const staleTextMatchers = (event) => (settings.hooks[event] ?? [])
    .filter(({ hooks }) => hooks.some(({ command }) => command.includes("forbid-stale-text.mjs")))
    .map(({ matcher }) => matcher)
  T("the settings check a Write before it lands", JSON.stringify(staleTextMatchers("PreToolUse")) === JSON.stringify(["Write"]), JSON.stringify(staleTextMatchers("PreToolUse")))
  T("the settings check an Edit after it lands", JSON.stringify(staleTextMatchers("PostToolUse")) === JSON.stringify(["Edit|MultiEdit"]), JSON.stringify(staleTextMatchers("PostToolUse")))

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
  const parserLiterals = `export const Sample = () => <span>{"${date}"}{/${date}/.test(value)}</span>\n`
  T("the TypeScript parser ignores dates in strings and regex literals", writeJsx(parserLiterals).status === 0)
  const sixLines = Array.from({ length: 6 }, (_, index) => `// reason ${index}`).join("\n")
  T("six TypeScript comment lines pass", writeJsx(`${sixLines}\n${rendered}`).status === 0)
  T("seven TypeScript comment lines fail", writeJsx(`${sixLines}\n// reason 6\n${rendered}`).status === 2)
  for (const [label, content] of [
    ["empty call", `fn(/* ${date} */)\n`],
    ["empty array", `const values = [/* ${date} */]\n`],
    ["empty object", `const value = {/* ${date} */}\n`],
    ["empty JSX expression", `export const Sample = () => <span>{/* ${date} */}</span>\n`],
  ]) {
    writeFileSync(join(jsx, "sample.tsx"), "export const Sample = () => <span>clean</span>\n")
    T(`${label} comment fails hook`, writeJsx(content).status === 2)
    writeFileSync(join(jsx, "sample.tsx"), content)
    T(`${label} comment fails all`, run(jsx, ["--all"]).status === 1)
  }
  writeFileSync(join(jsx, "sample.tsx"), jsxComment)
  git(jsx, "add", "sample.tsx")
  T("a real JSX comment fails all and staged", run(jsx, ["--all"]).status === 1 && run(jsx, ["--staged"]).status === 1)
  rmSync(jsx, { recursive: true, force: true })

  const sourceLine = `const value = new Date("${date}T12:00:00.000Z")`
  const wrapped = `/* ${sourceLine} */\n`
  const wrapRoot = fixture("comment-wrap", "sample.js", `${sourceLine}\n`)
  symlinkSync(join(checker, "..", "..", "node_modules"), join(wrapRoot, "node_modules"), "dir")
  const wrapEdit = landedEdit(wrapRoot, "sample.js", wrapped, { edit: { old_string: sourceLine, new_string: `/* ${sourceLine} */` } })
  T("wrapping an existing source line in a comment fails a landed Edit", rejects(wrapEdit, `sample.js:1: dated-anecdote: ${date}`), wrapEdit.stderr)
  const wrapBase = git(wrapRoot, "rev-parse", "HEAD").stdout.trim()
  git(wrapRoot, "add", "sample.js")
  T("wrapping an existing source line in a comment fails staged", run(wrapRoot, ["--staged"]).status === 1)
  git(wrapRoot, "commit", "-qm", "wrap")
  T("wrapping an existing source line in a comment fails base", run(wrapRoot, ["--base", wrapBase]).status === 1)
  rmSync(wrapRoot, { recursive: true, force: true })

  const oldFinding = `// ${date}\n`
  const existing = fixture("existing-comment", "sample.js", oldFinding)
  symlinkSync(join(checker, "..", "..", "node_modules"), join(existing, "node_modules"), "dir")
  const existingFile = join(existing, "sample.js")
  const editExisting = (content) => run(existing, ["--hook"], JSON.stringify({ tool_name: "Write", tool_input: { file_path: existingFile, content } }))
  T("moving an existing finding passes hook", editExisting(`\n${oldFinding}`).status === 0)
  T("an unrelated edit beside an existing finding passes hook", editExisting(`${oldFinding}const safe = true\n`).status === 0)
  T("a second copy of an existing finding fails hook", editExisting(`${oldFinding}${oldFinding}`).status === 2)
  writeFileSync(existingFile, `\n${oldFinding}`)
  git(existing, "add", "sample.js")
  T("moving an existing finding passes staged", run(existing, ["--staged"]).status === 0)
  rmSync(existing, { recursive: true, force: true })
  const noParser = fixture("jsx-without-parser", "sample.tsx", "export const Sample = () => <span>clean</span>\n")
  const missingParser = run(noParser, ["--all"])
  T("TSX without TypeScript fails closed", missingParser.status === 2 && /TypeScript/.test(missingParser.stderr))
  rmSync(noParser, { recursive: true, force: true })

  const scoped = fixture("directory-scope", "design/canvas/example.md", `Ask ${owner} on ${date}.\n`)
  const scopedAllowlist = ["owner-name", "dated-anecdote"].map((rule) => ({ path: "design/canvas/", rule, match: null, scope: "directory", exclude: ["design/canvas/tools/"], reason: "granted export" }))
  writeFileSync(join(scoped, "tools", "timeless-allowlist.json"), JSON.stringify(scopedAllowlist))
  T("directory entries exempt their rules in --all", run(scoped, ["--all"]).status === 0)
  mkdirSync(join(scoped, "design", "canvas", "tools"), { recursive: true })
  writeFileSync(join(scoped, "design", "canvas", "tools", "example.md"), `Ask ${owner}.\n`)
  git(scoped, "add", "design/canvas/tools/example.md")
  T("directory entries do not exempt an excluded subdirectory", run(scoped, ["--all"]).status === 1)
  git(scoped, "rm", "-q", "-f", "design/canvas/tools/example.md")
  writeFileSync(join(scoped, "design/canvas/example.md"), `Ask ${owner} on ${date} at ${path}.\n`)
  T("directory entries never exempt machine paths", run(scoped, ["--all"]).status === 1)
  writeFileSync(join(scoped, "design/canvas/example.md"), "clean\n")
  T("unused directory entries fail --all", run(scoped, ["--all"]).status === 1)
  writeFileSync(join(scoped, "tools", "timeless-allowlist.json"), JSON.stringify([{ path: "design/canvas/", rule: "comment-length", match: null, scope: "directory", reason: "granted export" }]))
  writeFileSync(join(scoped, "design/canvas/example.ts"), Array.from({ length: 7 }, (_, index) => `// export note ${index}`).join("\n") + "\n")
  git(scoped, "add", "design/canvas/example.ts")
  T("a directory entry can exempt comment-length", run(scoped, ["--all"]).status === 0)
  writeFileSync(join(scoped, "tools", "timeless-allowlist.json"), JSON.stringify([{ path: "design/canvas/", rule: "machine-path", match: null, scope: "directory", reason: "never allowed" }]))
  T("a directory entry for machine-path is refused", run(scoped, ["--all"]).status === 2)
  rmSync(scoped, { recursive: true, force: true })

  const canvasEntries = ["owner-name", "dated-anecdote"].map((rule) => ({ path: "design/canvas/", rule, match: null, scope: "directory", reason: "granted export" }))
  const unusedDate = "unused allowlist: design/canvas/ dated-anecdote null"
  const canvasFixture = (label) => {
    const root = fixture(label, "design/canvas/kept.md", `Ask ${owner}.\n`)
    writeFileSync(join(root, "design/canvas/only.md"), `On ${date}, the export ran.\n`)
    writeFileSync(join(root, "tools", "timeless-allowlist.json"), JSON.stringify(canvasEntries))
    git(root, "add", "design/canvas/only.md", "tools/timeless-allowlist.json")
    git(root, "commit", "-qm", "allow")
    return { root, base: git(root, "rev-parse", "HEAD").stdout.trim() }
  }
  const { root: pull, base: pullBase } = canvasFixture("pull-request-unused")
  const pullAllowlist = (entries) => {
    writeFileSync(join(pull, "tools", "timeless-allowlist.json"), JSON.stringify(entries))
    git(pull, "add", "tools/timeless-allowlist.json")
  }
  T("both directory entries are used before the deletion", run(pull, ["--all"]).status === 0)
  git(pull, "rm", "-q", "design/canvas/only.md")
  const stagedDeletion = run(pull, ["--staged"])
  T("deleting the only file an allowlist entry covers fails staged",
    stagedDeletion.status === 1 && stagedDeletion.stderr.includes(unusedDate))
  git(pull, "commit", "-qm", "delete")
  const baseDeletion = run(pull, ["--base", pullBase])
  T("deleting the only file an allowlist entry covers fails base",
    baseDeletion.status === 1 && baseDeletion.stderr.includes(unusedDate))
  T("an unchanged file in the scope still counts as use in base", !baseDeletion.stderr.includes("owner-name"))
  writeFileSync(join(pull, "other.md"), "clean\n")
  git(pull, "add", "other.md")
  git(pull, "commit", "-qm", "unrelated")
  T("a pull request outside every entry scope skips the unused check", run(pull, ["--base", "HEAD~1"]).status === 0)
  pullAllowlist(canvasEntries.slice(0, 1))
  git(pull, "commit", "-qm", "drop entry")
  T("removing the entry the deletion made unused passes base", run(pull, ["--base", pullBase]).status === 0)
  const entryBase = git(pull, "rev-parse", "HEAD").stdout.trim()
  pullAllowlist([...canvasEntries.slice(0, 1), { path: "notes.md", rule: "dated-anecdote", match: date, reason: "unused" }])
  git(pull, "commit", "-qm", "add entry")
  const addedEntry = run(pull, ["--base", entryBase])
  T("a pull request that adds an unused entry fails base",
    addedEntry.status === 1 && addedEntry.stderr.includes(`unused allowlist: notes.md dated-anecdote ${date}`))
  rmSync(pull, { recursive: true, force: true })

  const { root: moved, base: movedBase } = canvasFixture("pull-request-move")
  mkdirSync(join(moved, "docs"))
  git(moved, "mv", "design/canvas/only.md", "docs/only.md")
  git(moved, "commit", "-qm", "move")
  const baseMove = run(moved, ["--base", movedBase])
  T("moving the only covered file out of the scope fails base on the unused entry and the moved finding",
    baseMove.status === 1 && baseMove.stderr.includes(unusedDate) && baseMove.stderr.includes("docs/only.md:1: dated-anecdote"))
  rmSync(moved, { recursive: true, force: true })

  const { root: narrowed, base: narrowedBase } = canvasFixture("pull-request-checker")
  const narrowedChecker = join(narrowed, "tools", "check-timeless.mjs")
  const fullChecker = readFileSync(narrowedChecker, "utf8")
  const withoutDateRule = fullChecker.replace('["dated-anecdote", date], ', "")
  T("the fixture removes the date rule from its checker copy", withoutDateRule !== fullChecker)
  writeFileSync(narrowedChecker, withoutDateRule)
  git(narrowed, "commit", "-qam", "narrow")
  const baseNarrow = run(narrowed, ["--base", narrowedBase])
  T("a checker change that leaves an entry unused fails base", baseNarrow.status === 1 && baseNarrow.stderr.includes(unusedDate))
  rmSync(narrowed, { recursive: true, force: true })

  const { root: split, base: splitBase } = canvasFixture("pull-request-split-state")
  git(split, "rm", "-q", "design/canvas/only.md")
  writeFileSync(join(split, "tools", "timeless-allowlist.json"), JSON.stringify(canvasEntries.slice(0, 1)))
  const stagedSplit = run(split, ["--staged"])
  git(split, "commit", "-qm", "delete")
  const baseSplit = run(split, ["--base", splitBase])
  T("staged and base read the allowlist at the state they scan, not in the working tree",
    stagedSplit.status === 1 && stagedSplit.stderr.includes(unusedDate) && baseSplit.status === 1 && baseSplit.stderr.includes(unusedDate))
  git(split, "reset", "-q", "--hard", splitBase)
  writeFileSync(join(split, "tools", "timeless-allowlist.json"), JSON.stringify([...canvasEntries, { path: "notes.md", rule: "dated-anecdote", match: date, reason: "draft" }]))
  writeFileSync(join(split, "notes.md"), `On ${date}.\n`)
  const splitChecker = join(split, "tools", "check-timeless.mjs")
  writeFileSync(splitChecker, `${readFileSync(splitChecker, "utf8")}// note\n`)
  git(split, "add", "tools/check-timeless.mjs")
  T("an allowlist entry only in the working tree does not block a staged commit", run(split, ["--staged"]).status === 0)
  rmSync(split, { recursive: true, force: true })

  const { root: dropped, base: droppedBase } = canvasFixture("pull-request-used-entry")
  writeFileSync(join(dropped, "tools", "timeless-allowlist.json"), JSON.stringify(canvasEntries.slice(1)))
  git(dropped, "add", "tools/timeless-allowlist.json")
  const keptFinding = `design/canvas/kept.md:1: owner-name: ${owner}`
  const stagedDrop = run(dropped, ["--staged"])
  git(dropped, "commit", "-qm", "drop used entry")
  const baseDrop = run(dropped, ["--base", droppedBase])
  T("removing an allowlist entry that is still in use fails staged and base",
    stagedDrop.status === 1 && stagedDrop.stderr.includes(keptFinding) && baseDrop.status === 1 && baseDrop.stderr.includes(keptFinding))
  rmSync(dropped, { recursive: true, force: true })

  const { root: widened } = canvasFixture("pull-request-wider-rule")
  writeFileSync(join(widened, "notes.md"), "Released 2025/01/02.\n")
  git(widened, "add", "notes.md")
  git(widened, "commit", "-qm", "notes")
  const widenedBase = git(widened, "rev-parse", "HEAD").stdout.trim()
  const widenedChecker = join(widened, "tools", "check-timeless.mjs")
  const hyphenOnly = readFileSync(widenedChecker, "utf8")
  const slashToo = hyphenOnly.replace("\\d{2}-(?:0[1-9]|1[0-2])-(", "\\d{2}[-/](?:0[1-9]|1[0-2])[-/](")
  T("the fixture widens the date rule in its checker copy", slashToo !== hyphenOnly)
  writeFileSync(widenedChecker, slashToo)
  git(widened, "commit", "-qam", "widen")
  const baseWiden = run(widened, ["--base", widenedBase])
  T("a checker change that matches an unchanged file fails base",
    baseWiden.status === 1 && baseWiden.stderr.includes("notes.md:1: dated-anecdote: 2025/01/02"))
  rmSync(widened, { recursive: true, force: true })

  const touchChecker = (root) => {
    const file = join(root, "tools", "check-timeless.mjs")
    writeFileSync(file, `${readFileSync(file, "utf8")}// note\n`)
    git(root, "add", "tools/check-timeless.mjs")
  }
  const gitlinked = fixture("gitlink", "a.md", "clean\n")
  const gitlinkBase = git(gitlinked, "rev-parse", "HEAD").stdout.trim()
  git(gitlinked, "update-index", "--add", "--cacheinfo", `160000,${"1".repeat(40)},b-sub`)
  mkdirSync(join(gitlinked, "b-sub"))
  writeFileSync(join(gitlinked, "z.md"), `Ask ${owner}.\n`)
  git(gitlinked, "add", "z.md")
  touchChecker(gitlinked)
  const gitlinkRuns = [run(gitlinked, ["--staged"]), run(gitlinked, ["--all"])]
  git(gitlinked, "commit", "-qm", "gitlink")
  gitlinkRuns.push(run(gitlinked, ["--base", gitlinkBase]))
  T("a gitlink does not shift the later files in staged, all and base",
    gitlinkRuns.every((result) => result.status === 1 && result.stderr.trim() === ownerFinding("z.md")))
  rmSync(gitlinked, { recursive: true, force: true })

  const oddNames = fixture("odd-path-names", "design/canvas/x.md", `On ${date}.\n`)
  writeFileSync(join(oddNames, "tools", "timeless-allowlist.json"), JSON.stringify(canvasEntries.slice(1)))
  writeFileSync(join(oddNames, "a\nb.md"), "clean\n")
  writeFileSync(join(oddNames, "c\r"), `Ask ${owner}.\n`)
  git(oddNames, "add", "-A")
  git(oddNames, "commit", "-qm", "names")
  const oddBase = git(oddNames, "rev-parse", "HEAD").stdout.trim()
  touchChecker(oddNames)
  const oddRuns = [run(oddNames, ["--staged"]), run(oddNames, ["--all"])]
  git(oddNames, "commit", "-qm", "checker")
  oddRuns.push(run(oddNames, ["--base", oddBase]))
  T("a path with a newline or a carriage return keeps its own content in staged, all and base",
    oddRuns.every((result) => result.status === 1 && result.stderr.trim() === ownerFinding("c\r")))
  rmSync(oddNames, { recursive: true, force: true })

  const linked = fixture("symlinks", "design/canvas/kept.md", `Ask ${owner}.\n`)
  writeFileSync(join(linked, "tools", "timeless-allowlist.json"), JSON.stringify(canvasEntries.slice(0, 1)))
  git(linked, "add", "tools/timeless-allowlist.json")
  git(linked, "commit", "-qm", "allow")
  const linkBase = git(linked, "rev-parse", "HEAD").stdout.trim()
  mkdirSync(join(linked, "docs"))
  symlinkSync("../design/canvas/kept.md", join(linked, "docs", "link.md"))
  symlinkSync("design/canvas", join(linked, "canvaslink"))
  symlinkSync(path, join(linked, "machine-link"))
  git(linked, "add", "-A")
  const linkRuns = [run(linked, ["--staged"])]
  touchChecker(linked)
  linkRuns.push(run(linked, ["--staged"]), run(linked, ["--all"]))
  git(linked, "commit", "-qm", "links")
  linkRuns.push(run(linked, ["--base", linkBase]))
  const linkFinding = `machine-link:1: machine-path: ${["/", "Users/"].join("")}`
  T("a tracked symlink is scanned as its link text, never followed, in staged, all and base",
    linkRuns.every((result) => result.status === 1 && result.stderr.trim() === linkFinding))
  rmSync(linked, { recursive: true, force: true })

  const commentBlock = (count, tag) => Array.from({ length: count }, (_, index) => `// ${tag} ${index}`).join("\n") + "\n"
  const shortened = fixture("comment-shortened", "src/a.js", `${commentBlock(12, "first")}const a = 1\n${commentBlock(12, "second")}`)
  writeFileSync(join(shortened, "tools", "timeless-allowlist.json"), JSON.stringify([{ path: "src/a.js", rule: "comment-length", match: "12 lines", reason: "reviewed" }]))
  git(shortened, "add", "tools/timeless-allowlist.json")
  git(shortened, "commit", "-qm", "allow")
  const shortenedBase = git(shortened, "rev-parse", "HEAD").stdout.trim()
  writeFileSync(join(shortened, "src", "a.js"), `${commentBlock(9, "first")}const a = 1\n${commentBlock(12, "second")}`)
  git(shortened, "add", "src/a.js")
  const shortenedRuns = [run(shortened, ["--staged"])]
  git(shortened, "commit", "-qm", "shorten")
  shortenedRuns.push(run(shortened, ["--base", shortenedBase]))
  T("a long comment that gets shorter but stays over the limit fails staged and base",
    shortenedRuns.every((result) => result.status === 1 && result.stderr.includes("src/a.js:1: comment-length: 9 lines")))
  rmSync(shortened, { recursive: true, force: true })
  writeFileSync(join(safe, "tools", "timeless-allowlist.json"), JSON.stringify([{ path: "sample.js", rule: "owner-name", match: owner, reason: "unused" }]))
  T("an unused allowlist entry fails", run(safe, ["--all"]).status === 1)
  const scratch = join(tmpdir(), "timeless-scratchpad.txt")
  T("a scratchpad path passes the hook", run(safe, ["--hook"], JSON.stringify({ tool_name: "Write", tool_input: { file_path: scratch, content: path }, cwd: safe })).status === 0)
  rmSync(safe, { recursive: true, force: true })
}
