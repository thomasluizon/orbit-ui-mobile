#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs"
import { spawn, spawnSync } from "node:child_process"
import { performance } from "node:perf_hooks"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { PLAIN_SUBSET_ADVICE, readCommand, walkCommands } from "./_lib/command-expander.mjs"
import { checkGitCommand, checkGitWorktreeRemove, GIT_SUBCOMMANDS } from "./_lib/rules-git.mjs"
import { countUnreviewedPendingLessons, isDriftReviewOverdue } from "./_lib/rules-lessons.mjs"
import { checkEfMigrationRawIndex } from "./_lib/rules-source.mjs"
import { checkTicketMutation } from "./_lib/rules-tickets.mjs"
import { checkInventedIdentifier, extractNodeIds } from "./_lib/rules-identifier.mjs"
import { checkAdminMerge, checkBroadStaging, checkEngineInvocation } from "./_lib/rules-orchestrator.mjs"
import { checkSleepStop } from "./_lib/rules-sleep.mjs"
import { checkHandoffCommit, checkHandoffStop, gitCommitChains } from "./_lib/rules-handoff.mjs"
import { newestCommittedPrompt, promptsForCommit, specsForCommit, topLevelOf } from "./_lib/handoff-git.mjs"
import { adoptOwnerHandoffRun, parseHandoffRequest, prepareOwnerHandoffRun, readHandoffRequest, recordHandoffRequest, validateHandoffPrompt } from "../../tools/lib/handoff-prompt.mjs"
import { checkDependencyCommand, checkDependencyFileWrite } from "./_lib/rules-dependencies.mjs"
import { checkWorkerBrowser } from "./_lib/rules-worker.mjs"
import { PERSON_PROMPT_TOOLS, REMOVAL_CHECK_TOOLS, REMOVAL_RULES, checkApprovalPrompt, checkPersonPrompt, isUnattendedRun } from "./_lib/rules-approval.mjs"
import { additionalWorkingDirectories } from "./_lib/working-directories.mjs"
import { declaredRepoRoots } from "./_lib/repo-roots.mjs"
import { operationInProgress } from "../../tools/lib/relay-checkout.mjs"
import { readRunState, writeRunState } from "../../tools/lib/run-state.mjs"
import { checkRelayStop } from "./_lib/rules-relay.mjs"
import { adoptRelayRun, appendChainEntry, closeSessionChain, confirmChainSuccessor, openSessionChain } from "../../tools/lib/session-chain.mjs"

const hooksDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(hooksDir, "..", "..")
const primaryCommonDirectory = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim()
const siblingRoots = declaredRepoRoots(repoRoot)
let fails = 0
const T = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fails++
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}
const blocks = (verdict) => !!verdict?.block
/** True for a command that the modelled subset reads. The hooks refuse each other command as not modelled. */
const isModelled = (command) => readCommand(command).notModelled === ""
const HERE_STRING = "a here-string (`<<<`)"
const ANSI_C_QUOTE = "an ANSI-C quote `$'...'`"
const NV = "--no-" + "verify"
const ADMIN = "--" + "admin"

// One unique fixture root per run, removed best-effort on exit: a leaked tmp dir
// is garbage, never a verdict.
const root = mkdtempSync(join(tmpdir(), "orbit-hooks-"))
process.on("exit", () => {
  try {
    rmSync(root, { recursive: true, force: true })
  } catch {
    /* a transient lock on the fixture root must never mask the suite's verdict */
  }
})

// ---------------------------------------------------------------------------
// 1. Wiring: settings.json and the hooks directory agree, both directions
// ---------------------------------------------------------------------------
console.log("# wiring (settings.json <-> hooks on disk)")
const settings = JSON.parse(readFileSync(join(repoRoot, ".claude", "settings.json"), "utf8"))
const wired = new Set(
  Object.values(settings.hooks ?? {})
    .flat()
    .flatMap((entry) => entry?.hooks ?? [])
    .map((hook) => /\.claude[/\\]hooks[/\\]([A-Za-z0-9._-]+\.mjs)/.exec(hook?.command ?? "")?.[1])
    .filter(Boolean),
)
const onDisk = readdirSync(hooksDir).filter((name) => name.endsWith(".mjs") && name !== "test-hooks.mjs")
T("wiring: every hook settings.json names exists on disk", [...wired].filter((name) => !existsSync(join(hooksDir, name))), [])
T("wiring: every hook on disk is wired in settings.json", onDisk.filter((name) => !wired.has(name)), [])
T("wiring: the scan is not vacuous", wired.size > 0 && onDisk.length > 0, true)
const staleMatchers = (event) => settings.hooks[event].filter((entry) => entry.hooks.some((hook) => hook.command.includes("forbid-stale-text.mjs"))).map((entry) => entry.matcher)
T("wiring: stale text hook checks a Write before it lands", staleMatchers("PreToolUse"), ["Write"])
T("wiring: stale text hook checks an Edit after it lands", staleMatchers("PostToolUse"), ["Edit|MultiEdit"])
// The Monitor tool runs its `tool_input.command` through the same permission check as the Bash tool, so every
// shell guard runs for both. Claude Code 2.1.325 also selects a `Bash` matcher for a Monitor call that has a command
// and sends it `tool_name: "Bash"`. That rule is internal, so the matcher names `Monitor` and this check keeps it there.
const hookFileOf = (hook) => /\.claude[/\\]hooks[/\\]([A-Za-z0-9._-]+\.mjs)/.exec(hook?.command ?? "")?.[1]
const guardsOn = (entries, tool) => entries.filter((entry) => (entry.matcher ?? "").split("|").includes(tool)).flatMap((entry) => entry.hooks.map(hookFileOf))
const missingFromMonitor = (entries) => guardsOn(entries, "Bash").filter((file) => !guardsOn(entries, "Monitor").includes(file))
const BASH_GUARDS = guardsOn(settings.hooks.PreToolUse, "Bash")
T("wiring: every guard on the Bash matcher also runs for the Monitor tool", missingFromMonitor(settings.hooks.PreToolUse), [])
T("wiring: the Monitor tool runs the guards of the Bash tool in the same order", guardsOn(settings.hooks.PreToolUse, "Monitor"), BASH_GUARDS)
T("wiring: every shell guard on the Bash matcher also runs for the PowerShell tool, except the approval hook",
  guardsOn(settings.hooks.PreToolUse, "PowerShell"), BASH_GUARDS.filter((file) => file !== "forbid-approval-prompt.mjs"))
// The check broken: a copy that moves Monitor to its own entry without git-guardrails must name that guard.
const monitorSplit = settings.hooks.PreToolUse.flatMap((entry) => guardsOn([entry], "Bash").length && guardsOn([entry], "Monitor").length
  ? [{ ...entry, matcher: "Bash" }, { ...entry, matcher: "Monitor", hooks: entry.hooks.filter((hook) => hookFileOf(hook) !== "git-guardrails.mjs") }]
  : [entry])
T("wiring: the Monitor check names a Bash guard that a copy leaves off Monitor", missingFromMonitor(monitorSplit), ["git-guardrails.mjs"])
T("wiring: the Monitor check is not vacuous", BASH_GUARDS.length >= 8 && BASH_GUARDS.every(Boolean), true)

const metadataWorkflow = readFileSync(join(repoRoot, ".github/workflows/pr-metadata.yml"), "utf8")
T("parity gate: metadata invokes the live-label validator", metadataWorkflow.includes("node .github/scripts/check-pr-metadata.mjs"), true)
T("parity gate: edits and label changes refresh their own check", metadataWorkflow.includes("types: [opened, synchronize, reopened, edited, labeled, unlabeled]"), true)
const parityFixture = join(root, "parity")
mkdirSync(parityFixture)
const runParity = (paths, labels, body) => {
  const metadata = join(parityFixture, "metadata.json")
  const changed = join(parityFixture, "paths.txt")
  writeFileSync(metadata, JSON.stringify({ title: "Parity fixture", body, labels }))
  writeFileSync(changed, paths.join("\n"))
  return spawnSync(process.execPath, [join(repoRoot, ".github/scripts/check-pr-metadata.mjs"), metadata,
    join(parityFixture, "body.md"), "--changed-files-file", changed], { encoding: "utf8" }).status
}
const webParityPath = "apps/web/components/control.tsx"
const mobileParityPath = "apps/mobile/components/control.tsx"
T("parity gate: web alone fails", runParity([webParityPath], [], ""), 1)
T("parity gate: mobile alone fails", runParity([mobileParityPath], [], ""), 1)
T("parity gate: mirrored changes pass", runParity([webParityPath, mobileParityPath], [], ""), 0)
T("parity gate: an ordinary label cannot exempt a one-sided change", runParity([webParityPath], ["feature"], ""), 1)
T("parity gate: parity:exempt needs a specific justification", runParity([webParityPath], ["parity:exempt"], ""), 1)
T("parity gate: a named platform adapter passes", runParity([webParityPath], ["parity:exempt"], "## Parity\n\nBFF cookie adapter."), 0)

// ---------------------------------------------------------------------------
// 2. Rule units
// ---------------------------------------------------------------------------
console.log("\n# git-guardrails (_lib/rules-git.mjs)")
T("git: push to main blocks", blocks(checkGitCommand("git push origin main")), true)
T("git: force push to main blocks", blocks(checkGitCommand("git push --force origin main")), true)
T("git: force-with-lease to main blocks", blocks(checkGitCommand("git push --force-with-lease origin main")), true)
T("git: push to a feature branch allows", checkGitCommand("git push origin feature/x"), null)
// A ref ENDING in /main is a different branch. redesign/main takes direct pushes by convention,
T("git: push to redesign/main allows", checkGitCommand("git push origin redesign/main"), null)
T("git: push to refs/heads/redesign/main allows", checkGitCommand("git push origin refs/heads/redesign/main"), null)
T("git: push to refs/heads/main still blocks", blocks(checkGitCommand("git push origin refs/heads/main")), true)
T("git: HEAD:main still blocks", blocks(checkGitCommand("git push origin HEAD:main")), true)
T("git: deleting main still blocks", blocks(checkGitCommand("git push origin :main")), true)
T("git: +main force syntax still blocks", blocks(checkGitCommand("git push origin +main")), true)
// The destination decides, not the source: this one really does land on main.
T("git: redesign/main:refs/heads/main still blocks", blocks(checkGitCommand("git push origin redesign/main:refs/heads/main")), true)
// A refspec with `:` other than `HEAD:<branch>` is outside the push forms that a protected repository allows, also when it lands on another branch.
T("git: main:refs/heads/redesign/main blocks", blocks(checkGitCommand("git push origin main:refs/heads/redesign/main")), true)
// The rule reads the git SUBCOMMAND, not the word push anywhere on the line. A branch name carrying
T("git: checkout of a branch named for push allows", checkGitCommand("git checkout -b chore/x-push-guard main"), null)
T("git: log naming a push branch allows", checkGitCommand("git log --oneline main..chore/push-guard"), null)
T("git: -C before push still blocks", blocks(checkGitCommand("git -C . push origin main")), true)
T("git: a quoted push subcommand still blocks", blocks(checkGitCommand('git "push" origin main')), true)
T("git: a quoted main ref still blocks", blocks(checkGitCommand('git push origin "main"')), true)
T("git: single-quoted push still blocks", blocks(checkGitCommand("git 'push' origin main")), true)
T("git: quoted bare push while HEAD is on main blocks", blocks(checkGitCommand('git "push" origin', { cwd: "." })), true)
// The shell removes escapes and embedded quotes before git sees argv, so these are all one command.
T("git: backslash-escaped push still blocks", blocks(checkGitCommand("git \\push origin main")), true)
T("git: embedded quotes in the subcommand still block", blocks(checkGitCommand("git p''ush origin main")), true)
T("git: embedded quotes in the ref still block", blocks(checkGitCommand('git push origin "ma"in')), true)
T("git: an escaped ref still blocks", blocks(checkGitCommand("git push origin ma\\in")), true)
// And normalizing must not invent a match where none exists.
T("git: escaped redesign/main still allows", checkGitCommand("git push origin redesign/\\main"), null)
T("git: env assignment naming git still blocks", blocks(checkGitCommand("FOO=git git push origin main")), true)
T("git: a PATH prefix naming git still blocks", blocks(checkGitCommand("PATH=/opt/git/bin:$PATH git push origin main")), true)
T("git: an absolute git path still blocks", blocks(checkGitCommand("/usr/bin/git push origin main")), true)
T("git: a wrapper before git still blocks", blocks(checkGitCommand("sudo git push origin main")), true)
T("git: bare push while HEAD is on main blocks", blocks(checkGitCommand("git push", { cwd: "." })), true)
T("git: a bare push blocks in a protected repository, also while HEAD is on a feature branch", blocks(checkGitCommand("git push", { cwd: "." })), true)
T(`git: ${NV} blocks`, blocks(checkGitCommand("git commit -m x " + NV)), true)
// Branch protection is Orbit's, not universal: a session driven from this repo
// routinely pushes sibling repos whose sanctioned workflow IS direct-to-main.
const brainRemote = () => "https://github.com/thomasluizon/brain.git"
// The rule gives a remote reader the chain of directories that git changes to. A fixture with no symlink reads it by text; the symlink rows use real git.
const byTextDirectory = (fixture) => (chain, remote) => fixture(chain.reduce((directory, word) => resolve(directory, word)), remote)
T("git: push to main in a non-Orbit repo allows", checkGitCommand("git push origin main", { resolveRemoteUrl: brainRemote, cwd: "." }), null)
T("git: an unresolvable remote still blocks (fails safe)", blocks(checkGitCommand("git push origin main", { resolveRemoteUrl: () => "", cwd: "." })), true)
// The shell cuts a redirect from a word before git reads argv, with or without a space, so a redirect hides no ref, subcommand or flag.
for (const tail of ["main&>/dev/null", "main>/dev/null", "main 2>&1", "main>|log", "main>>log", "main<input", "main>&2", "main 2>/dev/null", "HEAD:main&>log", "+main>log"]) {
  T(`git: push origin ${tail} still blocks`, blocks(checkGitCommand(`git push origin ${tail}`)), true)
}
T("git: a redirect on the push subcommand still blocks", blocks(checkGitCommand("git push>/dev/null origin main")), true)
T("git: a redirect on --all still blocks", blocks(checkGitCommand("git push --all>/dev/null origin")), true)
T("git: a redirect on the -n of a commit still blocks", blocks(checkGitCommand("git commit -n>/dev/null -m x")), true)
T("git: &> on the -n of a commit still blocks", blocks(checkGitCommand("git commit -m x -an&>/dev/null")), true)
// A quoted or escaped `>` is a character of the ref name, which git permits, so it cuts nothing.
T("git: a quoted > in the source ref still blocks", blocks(checkGitCommand('git push origin "a>b:main"')), true)
// A ref with a character outside a plain branch name is outside the push forms that a protected repository allows.
T("git: a quoted > in a branch name blocks", blocks(checkGitCommand('git push origin "main>x"')), true)
T("git: an escaped > in a branch name blocks", blocks(checkGitCommand("git push origin main\\>x")), true)
T("git: main2 before >&1 is another branch", checkGitCommand("git push origin main2>&1"), null)
T("git: a redirect to a file named main allows", checkGitCommand("git push origin feature/x > main"), null)
T("git: a force push of a feature branch blocks in a protected repository", blocks(checkGitCommand("git push -f origin feature/x&>/dev/null")), true)
T("git: a feature push with a redirect on the ref allows", checkGitCommand("git push origin feature/x&>/dev/null"), null)
T("git: a here-string to a shell still blocks", blocks(checkGitCommand('bash <<< "git push origin main"')), true)
// The shell reads a here-string with or without a space around its operator.
T("git: a here-string with no space before its word still blocks", blocks(checkGitCommand('bash <<<"git push origin main"')), true)
T("git: a here-string with no space on either side still blocks", blocks(checkGitCommand("bash<<<'git push origin main'")), true)
// A here-string is no heredoc, so a later line that repeats its word ends nothing and the lines between are commands.
T("git: a here-string word that a later line repeats opens no heredoc", blocks(checkGitCommand("cat <<<x\ngit push origin main\nx")), true)
// A here-string is a redirect of standard input, so git reads no argument from it: its operator and its word are no ref and no flag.
const inProtectedRepo = { resolveRemoteUrl: () => "git@github.com:o/orbit-ui-mobile.git", cwd: "." }
for (const command of ["git push <<<x", "git push -u <<<x", "git push <<<x 2>&1", "git push <<< x", "git push origin <<<x", "git <<<x push", 'bash <<<"git push"']) {
  T(`git: ${command} while HEAD is on main blocks`, blocks(checkGitCommand(command, inProtectedRepo)), true)
}
for (const command of ["git <<<x push origin main", "git <<< x push origin main", "git <<<x commit -n -m x", 'bash <<<"git push origin main>/dev/null"', 'bash -s git <<<"git push origin main"', 'bash <<<"git commit -m x -n"',
  // The shell removes each quote and each escape from the word of a here-string before the command reads it.
  "bash <<<git\\ push\\ origin\\ main", "bash <<<git\\ commit\\ -m\\ x\\ -n", "bash <<<$'git push origin main\\n'", "bash <<<$'true\\ngit commit -m x -n'"]) {
  T(`git: ${command} still blocks`, blocks(checkGitCommand(command)), true)
}
// The shell removes a quote in the command word too, and an escape can hide the word `git` in the text of the command.
T("git: g''it push origin main still blocks", blocks(checkGitCommand("g''it push origin main")), true)
// A here-string is outside the modelled subset, so each command with one is refused, also a command that runs nothing forbidden.
T("git: push <<<x while HEAD is on a feature branch is not modelled", checkGitCommand("git push <<<x", inProtectedRepo)?.notModelled, HERE_STRING)
T("git: push origin feature/x <<<x while HEAD is on main is not modelled", checkGitCommand("git push origin feature/x <<<x", inProtectedRepo)?.notModelled, HERE_STRING)
T("git: a here-string word that names main is not modelled", checkGitCommand("git push origin feature/x <<<main")?.notModelled, HERE_STRING)
T("git: a here-string word that names -n is not modelled", checkGitCommand("git commit -m x <<< -n")?.notModelled, HERE_STRING)
// The shell reads a heredoc operator only outside a quote, an escape and a comment. Each other `<<EOF` is text, so the next lines are commands.
for (const [name, command] of [
  ["a single quote", "echo '<<EOF'\ngit push origin main\nEOF"],
  ["a double quote", 'echo "<<EOF"\ngit push origin main\nEOF'],
  ["an ANSI-C quote", "echo $'it\\'s <<EOF'\ngit push origin main\nEOF"],
  ["an escape", "echo a\\<<EOF\ngit push origin main\nEOF"],
  ["a comment", "true # <<EOF\ngit push origin main\nEOF"],
  ["a quote that spans lines", 'echo "a\n<<EOF"\ngit push origin main\nEOF'],
]) T(`git: <<EOF in ${name} opens no heredoc`, blocks(checkGitCommand(command)), true)
// A substitution that opens on an earlier line still gives the heredoc body to its command.
T("git: a heredoc on a later line of a command string keeps its body in scope", blocks(checkGitCommand("bash -c \"$(\ncat <<'EOF'\ngit push origin main\nEOF\n)\"")), true)
// In an ANSI-C quote a backslash escapes the next character, so `\'` does not end the quote, and a `>`, `;` or `$(` in it is text.
for (const [name, command] of [
  ["commit -n after $'it\\'s > x'", "git commit -m $'it\\'s > x' -n -m it\\'s"],
  [`commit ${NV} after $'it\\'s > x'`, `git commit -m $'it\\'s > x' ${NV} -m it\\'s`],
  ["push origin main after $'it\\'s > x'", "git push -o $'it\\'s > x' origin main -o it\\'s"],
  ["push origin HEAD:main after $'it\\'s > x'", "git push -o $'it\\'s > x' origin HEAD:main -o it\\'s"],
  ["commit -n after $'don\\'t; x'", "git commit -m $'don\\'t; x' -n"],
  ["push origin main after $'don\\'t; x'", "git push -o $'don\\'t; x' origin main"],
  ["commit -n after $'it\\'s $(x'", "git commit -m $'it\\'s $(x' -n"],
]) T(`git: ${name} still blocks`, blocks(checkGitCommand(command)), true)
// An ANSI-C quote is outside the modelled subset. The same messages in a plain quote are data.
T("git: an ANSI-C message that names -n after > is not modelled", checkGitCommand("git commit -m $'it\\'s > -n'")?.notModelled, ANSI_C_QUOTE)
T("git: an ANSI-C message that names a push after ; is not modelled", checkGitCommand("git commit -m $'don\\'t; git push origin main'")?.notModelled, ANSI_C_QUOTE)
T("git: a redirect to an ANSI-C target is not modelled", checkGitCommand("git push origin feature/x > $'it\\'s main'")?.notModelled, ANSI_C_QUOTE)
T("git: a quoted message that names -n after > allows", checkGitCommand('git commit -m "it is > -n"'), null)
T("git: a quoted message that names a push after ; allows", checkGitCommand('git commit -m "do not; git push origin main"'), null)
T("git: a redirect to a quoted target cuts the whole target", checkGitCommand('git push origin feature/x > "its main"'), null)
// The shell removes an ANSI-C quote from a word before git reads argv, as it removes each other quote.
for (const command of ["$'git' push origin main", "git $'push' origin main", "git push origin $'main'", "bash -c $'git push origin main'"]) {
  T(`git: ${command} still blocks`, blocks(checkGitCommand(command)), true)
}
// In a single quote a backslash is text, so the quote ends at the next `'` and the substitution holds the push.
T("git: a single quote that ends in a backslash hides no command of its substitution", blocks(checkGitCommand("echo $(echo 'a\\' ; git push origin main)")), true)
for (const tail of ["2>&1", "2>/dev/null", "> /dev/null", ">/dev/null", "&>/dev/null", "2>&1 | tail -3"]) {
  T(`git: push origin ${tail} while HEAD is on main blocks`, blocks(checkGitCommand(`git push origin ${tail}`, { cwd: "." })), true)
}
T("git: push origin feature/x 2>&1 while HEAD is on main allows", checkGitCommand("git push origin feature/x 2>&1", { cwd: "." }), null)
// A heredoc body is data: writing ABOUT a banned flag is not using it.
T(`git: a heredoc message naming ${NV} allows`, checkGitCommand(`git commit -F - <<'EOF'\nfix: stop passing ${NV} in CI\nEOF`), null)
T("git: a heredoc feeding a shell keeps its body in scope", blocks(checkGitCommand("bash <<'EOF'\ngit push origin main\nEOF")), true)
// A file named for a shell is not a shell: the body is data that the command writes.
T("git: a heredoc written to a .sh file is data", checkGitCommand("cat > push.sh <<'EOF'\ngit push origin main\nEOF"), null)
T("git: a heredoc feeding a shell by path keeps its body in scope", blocks(checkGitCommand("/bin/bash <<'EOF'\ngit push origin main\nEOF")), true)
// A shell reads the heredoc as its script whatever options sit between the shell word and the operator.
// An option can take the next word (`-o`, `-O`, `-R`, `-T`, `--rcfile`, `--emulate`), and after `-s` each other word is a positional argument.
const HEREDOC_SHELLS = [
  "bash -e",
  "bash -s",
  "sh -x",
  "/bin/bash -euo pipefail",
  "bash -o pipefail -e",
  "zsh +o nomatch",
  "ksh",
  "dash -e",
  "bash -O extglob",
  "bash +O extglob",
  "bash -oe pipefail",
  "bash -s -- one two",
  "bash -es one",
  "bash --rcfile /dev/null",
  "zsh --emulate sh",
  "ksh -R xref",
  "mksh -T tty",
]
for (const shell of HEREDOC_SHELLS) T(`git: a heredoc feeding ${shell} keeps its body in scope`, blocks(checkGitCommand(`${shell} <<'EOF'\ngit push origin main\nEOF`)), true)
// A redirect in any order is not an argument, and a pipeline from the heredoc into a shell that reads standard input runs the body.
const HEREDOC_SHELL_LINES = [
  "bash -x 2>log <<'EOF'",
  "bash <<'EOF' 2>log",
  "bash 2> log <<'EOF'",
  "bash &>log <<'EOF'",
  "bash -s <<'EOF' one two",
  "cat <<'EOF' | bash",
  "cat <<'EOF' | sh -s -- a",
  "cat <<'EOF' | tee copy.sh | bash",
  "cat <<'EOF' | (cd /tmp && bash)",
  "(bash -e) <<'EOF'",
  "bash>/dev/null <<'EOF'",
  "bash&>/dev/null <<'EOF'",
  "cat <<'EOF' | bash>log",
  "cat <<'EOF' |& bash",
  "cat <<'EOF' |& tee copy.sh | bash",
  // A command substitution gives the body to its command as text, and a command string or `eval` runs that text.
  ["bash -c \"$(cat <<'EOF'", ")\""],
  ["sh -c \"$(cat <<'EOF'", ")\""],
  ["bash -euc \"$(cat <<'EOF'", ")\""],
  ["/bin/bash -o pipefail -c \"$(cat <<'EOF'", ")\""],
  ["bash -c -o pipefail \"$(cat <<'EOF'", ")\""],
  ["bash -c \"echo first $(cat <<'EOF'", ")\""],
  ["eval \"$(cat <<'EOF'", ")\""],
  ["eval `cat <<'EOF'", "`"],
  // A here-string is one more redirect of standard input: bash gives the shell the last one, and zsh gives it each one.
  "bash <<<\"\" <<'EOF'",
  "bash <<<x <<'EOF'",
  "bash <<< x <<'EOF'",
  "bash <<'EOF' <<<x",
  // A command substitution in the command word runs the words of its output as a command, also after an assignment.
  ["$(cat <<'EOF'", ")"],
  ["`cat <<'EOF'", "`"],
  ["y=1 $(cat <<'EOF'", ")"],
  ["y+=1 $(cat <<'EOF'", ")"],
  // A backslash at the end of the operator line continues the line, so the reader of the body can be on the next line.
  "cat <<'EOF' \\\n| bash",
]
/** A row is the operator line, or the operator line and the text after the terminator. */
const heredocCommand = (row, body) => {
  const [line, afterTerminator] = [row].flat()
  return `${line}\n${body}\nEOF${afterTerminator ? `\n${afterTerminator}` : ""}`
}
const heredocName = (row) => [row].flat().join(" ... ")
for (const row of HEREDOC_SHELL_LINES) T(`git: the heredoc of ${heredocName(row)} keeps its body in scope`, blocks(checkGitCommand(heredocCommand(row, "git push origin main"))), true)
// A shell that runs a script file or a command string, a command after a separator, and a pipeline with no shell read the heredoc as data.
const HEREDOC_DATA = [
  "bash script.sh <<'EOF'",
  "bash -O extglob script.sh <<'EOF'",
  "bash --rcfile rc script.sh <<'EOF'",
  "bash -- script.sh <<'EOF'",
  "bash -c cat <<'EOF'",
  "bash -s one; cat <<'EOF'",
  "bash <<'EOF' script.sh",
  "cat > bash <<'EOF'",
  "cat <<'EOF' | grep push",
  "cat <<'EOF' | bash script.sh",
  "cat <<'EOF' && bash",
  "cat <<'EOF' > run.sh",
  "cat <<'EOF' >bash",
  "cat <<'EOF' |& grep push",
  ["echo \"$(cat <<'EOF'", ")\""],
  ["git commit -m \"$(cat <<'EOF'", ")\""],
  ["gh pr create --body \"$(cat <<'EOF'", ")\""],
  ["x=$(cat <<'EOF'", ")"],
  ["x=\"$(cat <<'EOF'", ")\""],
  ["y=1 x=$(cat <<'EOF'", ")"],
  ["echo $(cat <<'EOF'", ")"],
  ["bash script.sh \"$(cat <<'EOF'", ")\""],
  // A quoted `<<A` before the operator is text: the heredoc is the one that has a terminator line.
  "git commit -m 'x <<A' -F - <<'EOF'",
  "git commit -m \"it's <<A\" -F - <<'EOF'",
  // A `<<` with no terminator line, such as a shift, opens no heredoc, and the reader goes on to the next operator.
  "echo $((1<<x)); git commit -F - <<'EOF'",
  "cat <<'EOF' \\\n| grep push",
  // The shell expands `$(cat)` before it applies the heredoc, so the command string comes from the input of the caller, not from the body.
  "bash -c \"$(cat)\" <<'EOF'",
  "eval \"$(cat)\" <<'EOF'",
]
for (const row of HEREDOC_DATA) {
  const command = heredocCommand(row, "git push origin main")
  if (isModelled(command)) T(`git: the heredoc of ${heredocName(row)} is data`, checkGitCommand(command), null)
  else T(`git: the heredoc of ${heredocName(row)} is not modelled`, typeof checkGitCommand(command)?.notModelled, "string")
}
T("subset: the heredoc data rows that the subset models", HEREDOC_DATA.filter((row) => isModelled(heredocCommand(row, "x"))).map(heredocName), ["cat > bash <<'EOF'", "cat <<'EOF' | grep push", "cat <<'EOF' > run.sh",
  "cat <<'EOF' >bash", "git commit -m 'x <<A' -F - <<'EOF'", "git commit -m \"it's <<A\" -F - <<'EOF'"])
// A shell with a here document of its own is outside the subset: the hook never reads a script that a shell gets from standard input.
T("subset: the heredoc shell rows that the subset models", [...HEREDOC_SHELLS.map((shell) => `${shell} <<'EOF'`), ...HEREDOC_SHELL_LINES].filter((row) => isModelled(heredocCommand(row, "x"))).map(heredocName), [])
// A hygiene flag counts only as a word of a git command. The same text in an argument of another command is data.
const NO_SIGN = "--no-gpg-" + "sign"
for (const command of [`grep -rn -- '${NV}' .claude/hooks`, `rg -n -e '${NV}' .claude`, `echo 'Never use ${NV}.'`, `printf '%s\\n' 'Never use ${NV}.' >> notes.md`,
  `gh pr comment 1 --body 'The hook refuses ${NV}.'`, `grep -c -- '${NV}' $(git ls-files)`]) {
  T(`git: ${command} allows`, checkGitCommand(command), null)
}
// A command word that the hook does not know, such as a PowerShell cmdlet, is refused in an unattended run, and passes in an attended session when it names no git.
T("git: a PowerShell cmdlet that names a flag allows in an attended session", checkGitCommand(`Select-String -Pattern '${NO_SIGN}' -Path .claude/hooks/*.mjs`, { unattended: false }), null)
T("git: a PowerShell cmdlet is an unknown command word in an unattended run", checkGitCommand(`Select-String -Pattern '${NO_SIGN}' -Path .claude/hooks/*.mjs`)?.notModelled?.startsWith("the command word `select-string`"), true)
for (const command of [`git commit ${NV} -m x`, "git commit -n -m x", `git commit ${NO_SIGN} -m x`, "git -c commit.gpgsign=false commit -m x", `git push ${NV} origin feature/x`,
  `git commit --no-ver''ify -m x`, `sudo git commit -m x ${NV}`, `npm run lint && git commit -m x ${NV}`]) {
  T(`git: ${command} still blocks`, blocks(checkGitCommand(command)), true)
}
// The reader is an allow list. A command with a construct outside the modelled subset is refused, so no reading of it can run a forbidden git command.
for (const [name, command] of [
  ['a here-string in a $"..." quote to bash', 'bash <<<$"git push origin main"'],
  ['a here-string in a $"..." quote to zsh', 'zsh <<<$"git push origin main"'],
  ["a heredoc operator after $$'", "echo $$'x\\' <<EOF ; echo '\ngit push origin main\nEOF"],
  ["a <<- end marker after a tab", "cat <<-'EOF'\n\tdata\n\tEOF\ngit push origin main\nEOF"],
  ["a line that looks like the end marker", "cat <<'EOF'\ndata\nEOF \ngit push origin main\nEOF"],
  ["an end marker that is not one plain word", "cat <<E\"O\"F\ndata\nE\nit's\nEOF\ngit push origin main\necho it's"],
  ["a line continuation inside the word git", "gi\\\nt push origin main"],
  ["an ANSI-C quote that spells git as a code", "$'\\x67it' push origin main"],
  ["a quoted shell name before -c", "b''ash -c 'git push origin main'"],
  ["a script from /dev/stdin", "source /dev/stdin <<'EOF'\ngit push origin main\nEOF"],
  ["a process substitution to a shell", "bash <(cat <<'EOF'\ngit push origin main\nEOF\n)"],
]) T(`git: ${name} still blocks`, blocks(checkGitCommand(command)), true)
// The modelled subset: `readCommand` names the first construct outside it, and names none for a plain command.
for (const [name, command] of [
  ["a here-string", 'grep -c x <<<"$output"'],
  ['a `$"..."` quote', 'echo $"hello"'],
  ["a run of `$` before a quote", "echo $$'x'"],
  ["an ANSI-C quote", "echo $'\\x41'"],
  ["an ANSI-C quote", "echo $'it\\'s'"],
  ["a line continuation", "ec\\\nho x"],
  ["a line continuation", "git commit -m x \\\n  -m y"],
  ["a line continuation", 'echo "a\\\nb"'],
  ["a here document with a delimiter that is not one quoted literal word", "cat <<\\EOF\nx\nEOF"],
  ["a here document with a delimiter that is not one quoted literal word", "cat <<EOF\nx\nEOF"],
  ["a here document with a delimiter that is not one quoted literal word", "cat <<E\"O\"F\nx\nEOF"],
  ["a here document with no end marker line", "cat <<'EOF'\nx"],
  ["a here document with a line that looks like its end marker", "cat <<'EOF'\nx\nEOF "],
  ["a subshell", "(cat <<'EOF'\nx\nEOF\n)"],
  ["the redirect `<<-`", "cat <<-'EOF'\n\tx\n\tEOF"],
  ["a here document inside a substitution", "git commit -m \"$(cat <<'EOF'\nfix: x\nEOF\n)\""],
  ["an arithmetic expansion `$((`", "echo $((1<<2))"],
  ["an arithmetic expansion `$[`", "echo $[ 1 <<true ]"],
  ["a function, an array or an arithmetic command", "(( x = 1 <<true ))"],
  ["a function, an array or an arithmetic command", "wipe() { ls; }"],
  ["a function, an array or an arithmetic command", "list=(a b)"],
  ["a `${...}` expansion with an operator", "echo ${x:- <<true }"],
  ["a `${...}` expansion with an operator", 'echo "${name%/*}"'],
  ["the builtin `eval`", 'eval "$COMMAND"'],
  ["the builtin `eval`", "eval 'echo ok'"],
  ["the builtin `alias`", "alias wipe=ls"],
  ["the builtin `trap`", "trap 'echo ok' EXIT"],
  ["in the words of a shell command", 'bash -c "echo $NAME"'],
  ["in the words of a shell command", "/bin/sh -euc $SCRIPT"],
  ["a shell that reads its script from standard input", "echo 'echo ok' | bash"],
  ["the shell keyword `while`", "cat run.sh | while read -r line; do bash; done"],
  ["the word `{`", "{ bash; } <<'EOF'\necho ok\nEOF"],
  ["a subshell", "(sh -s) <<'EOF'\necho ok\nEOF"],
  ["an `xargs` that runs `bash`", "echo ok | xargs -I{} bash -c '{}'"],
  ["a shell `-c`", "bash -c"],
  ["the builtin `source`", "source /dev/stdin <<'EOF'\necho ok\nEOF"],
  ["a shell with a script under `/dev` or `/proc`", "bash /dev/stdin <<'EOF'\necho ok\nEOF"],
  ["a shell `-c`", Array.from({ length: 10 }).reduce((script) => `bash -c ${JSON.stringify(script)}`, "true")],
  ["the shell keyword `case`", "case x in x) echo ok;; esac"],
  ["the shell keyword `function`", "function wipe { ls; }"],
  ["a process substitution", "diff <(sort a) <(sort b)"],
  ["a backtick substitution", "echo `date`"],
  ["a backtick substitution", 'echo "`date`"'],
  ["a word that starts with `=` in a command word", "=git status"],
  ["a word that starts with `=` in a command word", "env =git status"],
  ["a word that starts with `=` in a `git` argument", "git push origin =main"],
  ["a glob in a command word", "/usr/bin/gi? status"],
  ["a glob in a command word", "/usr/bin/gi[t] status"],
  ["a variable in a command word", "$g status"],
  ["a variable in a command word", 'nice "$USER" ls'],
  ["a command substitution in a command word", "$(which git) status"],
  ["a brace expansion in a command word", "{git,status}"],
  ["a variable in a `git` argument", 'git log "$BRANCH"'],
  ["a glob in a `git` argument", "git add *.md"],
  ["a brace expansion in a `git` argument", "git push origin m{a,}in"],
  ["a command substitution in a `git` argument", "git push origin $(echo x)"],
  ["an `xargs` that runs `git`", "echo main | xargs git push origin"],
  ["the operator `|&`", "make |& tail"],
  ["a quote with no end", "echo 'x"],
  ["a quote with no end", 'echo "x'],
  ["to a target that is not a literal path", 'echo x > "$OUT"'],
  ["to a target that is not a literal path", "echo x > out-*.log"],
  ["to a target that is no file descriptor", "echo x >&out.log"],
  ["a `{name}>` redirect", "echo x {fd}>/dev/null"],
  ["a comment inside a substitution", "echo $(date # now\n)"],
  ["a shell `-c`", "bash -c 'echo \"$1\"' name value"],
  ["a shell `-c`", "bash -c 'for f in a b; do echo $f; done'"],
  ["the builtin `source`", "source .venv/bin/activate && python tool.py"],
  ["the shell keyword `while`", "while IFS= read -r line; do echo \"$line\"; done < in.txt"],
  ["the shell keyword `elif`", "if [ -f x ]; then echo yes; elif [ -d x ]; then echo dir; else echo no; fi"],
  ["the word `[[`", "if [[ -d x ]]; then echo dir; fi"],
  ["the word `{`", "{ echo x; echo y; } > out.log"],
  ["a subshell", "(cd apps && ls) | tail -1"],
  ["a background `&`", "sleep 5 & wait"],
  ["the shell keyword `until`", 'until test -f "$OUT/done"; do sleep 5; done'],
  ["the shell keyword `!`", "! grep -q x notes.md"],
  ["a shell that reads its script from standard input", "bash < scripts/run.sh"],
  ["a `$(` with no `)`", "echo $(date"],
  ["a `)` with no `$(`", "echo x)"],
  ["a `$` before a character that zsh can read as an expansion flag", 'echo "$=NAME"'],
  ["a `$` before a character that zsh can read as an expansion flag", "git $=verb origin"],
]) T(`subset: ${command} holds ${name}`, readCommand(command).notModelled.includes(name), true)
for (const command of ['grep -c "$pattern" notes.md', 'head -c "$count" notes.md', "git commit -F - <<'EOF'\nfix: read bash <<<$\"x\" and echo $$'y' and <(z) and `w`\nEOF", 'printf "%s\\n" "$$"',
  "npm test 2>&1 | tail -n 5", 'grep -rn "rm" notes.md', "cd apps/web && npx vitest run src/x.test.ts > /tmp/out.log 2>&1", "ls -la *.md | head -3",
  'echo "$HOME" "${TMPDIR:?}" "${TMPDIR:?not set}" $(date) "at $(date +%s)"', "CI=1 NAME='a b' npm test", "[ -f package.json ] && echo yes || echo no", "find . -name '*.ts' -exec grep -l x {} \;",
  "echo ok &>/dev/null", "echo ok >&2", "echo ok 2>/dev/null >> out.log < in.txt", "true # a comment with $(x) and 'y", "cat > notes.md <<'EOF'\n$(x) `y` <<<z ${a:-b}\nEOF\necho ok",
  "git log --oneline -5 main..HEAD", "git commit -m \"fix: a 'quoted' word; and more\"", "git show HEAD@{1} --stat", 'grep -E "^a$" notes.md', "echo a |\n  tail -1", "bash scripts/run.sh --flag value",
  "cat <<'A' <<\"B\"\nx\nA\ny\nB", "ROOT=$(pwd); ls", 'export OUT="$HOME/out"',
  "for f in a b; do echo \"$f\"; done", "if [ -f x ]; then echo yes; else echo no; fi", "echo ==== section ====; [ a = b ]", "bash scripts/run.sh"]) {
  T(`subset: ${command} is modelled`, readCommand(command).notModelled, "")
}
/** The words of each command that the walk visits, as argv carries them, in the order in which the shell runs them. */
const wordTexts = (command) => {
  const visited = []
  walkCommands(readCommand(command).list, null, ({ words }) => { visited.push(words.map((word) => word.text)); return null })
  return visited
}
T("subset: a word is read with no quote and no escape, as argv carries it", wordTexts(`g''it p"us"h ori\\gin 'ma'in`), [["git", "push", "origin", "main"]])
T("subset: a list divides at each operator, and a pipeline keeps its commands in order", wordTexts("echo 1; ls 2 && cat | wc\ntrue || pwd"), [["echo", "1"], ["ls", "2"], ["cat"], ["wc"], ["true"], ["pwd"]])
T("subset: a redirect, its file descriptor and its target are no words", wordTexts("git push origin main2>&1 >out.log 2>/dev/null"), [["git", "push", "origin", "main2"]])
T("subset: an assignment before the command word is no word", [wordTexts("A=1 B='x y' git status"), readCommand("A=1 B='x y' git status").list[0][0].node.commands[0].assignments.map(({ name }) => name)], [[["git", "status"]], ["A", "B"]])
T("subset: a heredoc body is no word, and the text after its end marker is read", wordTexts("cat > x.sh <<'EOF'\ngit push origin main\nEOF\necho ok"), [["cat"], ["echo", "ok"]])
T("subset: a loop runs its body once for each literal word, and a condition gives each branch", wordTexts("for w in a b; do echo $w; done; if test -f a; then true; else false; fi"), [["echo", "a"], ["echo", "b"], ["test", "-f", "a"], ["true"], ["false"]])
T("subset: a structure word is a plain word after the command word, and in a quote", wordTexts("echo done fi; echo 'if' fi"), [["echo", "done", "fi"], ["echo", "if", "fi"]])
T("subset: a quoted structure word in the place of a command word is an unknown command word", readCommand("'if' x").notModelled.startsWith("the command word `if`"), true)
T("subset: a variable that the line sets to a literal value is read as its value; another variable stays as written", wordTexts('d=/work/x; git -C "$d" status; echo "$HOME" $d'), [[], ["git", "-C", "/work/x", "status"], ["echo", "$HOME", "/work/x"]])
T("subset: a shell with a script file is a plain command, and `-c` or a here document of its own is not modelled", [readCommand("bash scripts/run.sh").notModelled, readCommand("bash -c 'git status'").notModelled, readCommand("bash -e <<'EOF'\ngit status\nEOF").notModelled],
  ["", "a shell `-c`, which runs its next word as a script", "a shell that reads its script from standard input"])
T("git: a data heredoc that names a push, after a plain command with -c and a variable, allows", checkGitCommand("grep -c \"$pattern\" notes.md && git commit -F - <<'EOF'\nNever run git push origin main.\nEOF"), null)
T(`git: cat <<<'${NV}' is not modelled`, checkGitCommand(`cat <<<'${NV}'`)?.notModelled, HERE_STRING)
T("git: the not-modelled refusal names the construct, the plain subset and the script file", ["a here-string", "plain subset", "bash /abs/path.sh"].every((text) => (checkGitCommand('bash <<<$"git push origin main"')?.message ?? "").includes(text)), true)
// The same constructs with no forbidden git command in the text are refused too: the reader does not read them, so it proves nothing about them.
for (const command of ['bash <<<$"git status"', 'grep -c push <<<"$output"', "echo $$'x' ; git push origin feature/x", "cat <<-'EOF'\n\tgit push origin main\n\tEOF", "echo $((1<<2)) && git status",
  "printf $'\\x1b[31m%s\\n' red && git log -1", "diff <(sort a) <(sort b) && git status"]) {
  T(`git: ${command} is not modelled`, typeof checkGitCommand(command)?.notModelled, "string")
}
// Each command of the round 12 review. The reader at that head allowed each of the first two groups.
const REVIEW_GIT_REFUSED = [
  "bash -c $'git\\tpush\\torigin\\tm\\x61in'", "bash <<<$'git\\tpush\\torigin\\tm\\x61in'", "bash -c $'git\\cIpush\\cIorigin\\cImain'", "bash -c $'echo\\cJgit push origin main'",
  "(( x = 1 <<true ))\ngit push origin main\ntrue", "echo ${x:- <<true }\ngit push origin main\ntrue", "echo $[ 1 <<true ]\ngit push origin main\ntrue",
  "git \\\npush origin main", "git \\\ncommit -n -m x", "git push \\\norigin",
  "=git push origin main", "/usr/bin/gi? push origin main", "/usr/bin/gi[t] push origin main", "git push origin $(echo main)", "git push origin `echo main`", 'B=main; git push origin "$B"', "git push origin m{a,}in",
  "git commit -m x '-n'", 'git commit -m x "-n"', "git commit -m x \\-n", "git --no-pager commit -n -m x", "git -c commit.gpgSign=false commit -m x", "git -c commit.gpgsign=no commit -m x",
  "git -c commit.gpgsign=off commit -m x", "git -c commit.gpgsign=0 commit -m x", "git -c commit.GPGSIGN= commit -m x", "git -c core.hookspath=/dev/null commit -m x", `git commit ${NV.slice(0, 9)} -m x`,
  // The limits that the round 12 body listed as allowed.
  "(cat <<'EOF'\ngit push origin main\nEOF\n) | bash", "{ cat <<'EOF'\ngit push origin main\nEOF\n} | bash", "echo \"$(cat <<'EOF'\ngit push origin main\nEOF\n)\" | bash", "cat <<'EOF' |\ngit push origin main\nEOF\nbash",
  "env $(cat <<'EOF'\ngit push origin main\nEOF\n)", "x= $(cat <<'EOF'\ngit push origin main\nEOF\n)", "git push origin {fd}>/dev/null", "{git,push,origin,main}", "g=git; $g push origin main",
  "echo 'git push origin main' | bash", "echo 'git push origin main' | while true; do bash; done", "echo 'git push origin main' | { true; bash; }", "echo main | xargs git push origin", "echo 'git push origin main' | xargs -I{} bash -c '{}'", "sudo =git push origin main", "find . -maxdepth 0 -exec =git push origin main \\;",
  "bash /dev/stdin <<'EOF'\ngit push origin main\nEOF",
  // zsh runs the words after each of these words as a command, and bash reads the name of a program.
  "nocorrect git push origin main", "repeat 1 git push origin main", "- git push origin main", "time nocorrect git push origin main", "noglob nocorrect git commit -n -m x",
  "{ true; } always { git push origin main; }",
]
for (const command of REVIEW_GIT_REFUSED) T(`git review: ${JSON.stringify(command)} is refused`, blocks(checkGitCommand(command, inProtectedRepo)), true)
for (const [name, command] of [["nocorrect", "nocorrect ls"], ["repeat", "repeat 3 ls"], ["-", "- ls"], ["always", "always ls"], ["foreach", "foreach f in a; ls; end"]]) {
  T(`subset: ${command} holds the zsh command word ${name}`, readCommand(command).notModelled, `the zsh command word \`${name}\`, which runs the words after it as a command`)
}
T("subset: a zsh command word after the command word is a plain word", readCommand("echo nocorrect repeat - always foreach").notModelled, "")
// A ref `HEAD` or `@` with no destination names the branch that HEAD is on, and the value of a push option is no repository and no ref.
// A protected repository allows only `git push [-u] origin <branch>` and `git push origin HEAD:<branch>`, with a plain branch that is not main.
for (const command of ["git push origin HEAD", "git push -u origin HEAD", "git push origin @", "git push origin +HEAD", "git push -o ci.skip origin", "git push --push-option ci.skip origin", "git push --repo origin",
  "git push --receive-pack git-receive-pack origin", "git push --recurse-submodules check origin", "git push -o ci.skip origin feature/x", "git push origin head", "git push origin heads/main", "git push origin refs/heads/Main",
  "git push -u origin HEAD:feature/x", "git push origin feature/x feature/y", "git push --force origin feature/x", "git push origin feature/x:feature/y", "git push upstream feature/x"]) {
  T(`git: ${command} blocks in a protected repository`, blocks(checkGitCommand(command, inProtectedRepo)), true)
}
for (const command of ["git push origin HEAD:feature/x", "git push origin feature/x", "git push -u origin feature/x", "git push origin HEAD:refs/heads/feature/x", "git push origin redesign/main"]) {
  T(`git: ${command} allows in a protected repository`, checkGitCommand(command, inProtectedRepo), null)
}
// A `cd` that the shell can skip leaves the push in the directory before it, so the rule judges the push in each directory that is possible.
const fromProtected = { cwd: "/work/ui", resolveRemoteUrl: byTextDirectory((directory) => (directory.startsWith("/other") ? "git@github.com:o/sandbox.git" : "git@github.com:o/orbit-ui-mobile.git")) }
for (const command of ["false && cd /other; git push origin main", "true || cd /other; git push origin main", "cd /other || git push origin main", "if false; then cd /other; fi; git push origin main",
  "for d in; do cd /other; done; git push origin main", "while false; do cd /other; done; git push origin main", "until true; do cd /other; done; git push origin main", "false &&\ncd /other\ngit push origin main",
  "if true; then cd /work/ui; else cd /other; fi; git push origin main", "bash -c 'false && cd /other; git push origin main'", "(false && cd /other; git push origin main)", "cd /other; cd /work/ui; git push origin main",
  "{ cd /other; }; git push origin main", "if true; then cd /other && git push origin main; fi", "cd /other | cat; git push origin main", "echo $(cd /other); git push origin main"]) {
  T(`git: ${JSON.stringify(command)} from a protected repository blocks`, blocks(checkGitCommand(command, fromProtected)), true)
}
for (const command of ["cd /other && git push origin main", "cd /other; git push origin main", "cd /other && npm test && git push origin main", "cd /other\ngit push origin main",
  "true && cd /other && git push origin main", "git -C /other push origin main", "cd /other; if true; then git push origin main; fi", "d=/other; cd \"$d\" && git push origin main"]) {
  T(`git: ${JSON.stringify(command)} from a protected repository allows`, checkGitCommand(command, fromProtected), null)
}
const REVIEW_APPROVAL_REFUSED = [
  "echo $((cat <<EOF\n'\nEOF\n) ); rm -rf \"$TMP\" # '", "bash <<<$'rm\\t-rf\\t\\x24TMP'", "(( x = 1 <<true ))\nrm -rf \"$TMP\"\ntrue",
  "bash -c \"cat <<X\n'\nX\nrm -rf \\\"\\$TMP\\\" # '\"", "eval \"cat <<X\n'\nX\nrm -rf \\\"\\$TMP\\\" # '\"", "bash <<'EOF'\ncat <<X\n'\nX\nrm -rf \"$TMP\" # '\nEOF",
  "echo 'rm -rf \"$TMP\"' | bash", "=rm -rf \"$TMP\"", "/bin/r? -rf \"$TMP\"", "r{m,} -rf \"$TMP\"",
  'nocorrect rm -rf "$TMP"', 'repeat 1 rm -rf "$TMP"', '- rm -rf "$TMP"', '{ true; } always { rm -rf "$TMP"; }',
]
// The approval rows run in the loop below the approval options.
// A hygiene flag counts only as a flag of a git command in the parsed words: the same text in an argument of another program is data.
const REVIEW_GIT_ALLOWED = [`grep -rn "git commit ${NV}" .claude`, `echo 'git commit ${NV} is refused'`, `gh pr comment 1 --body 'The hook refuses git push ${NV}.'`, "echo 'git commit -n skips the hooks'",
  `echo git commit ${NV}`, "git commit -mnote", "git commit -m 'run -n later'", `git commit -m 'never pass ${NV}'`, "git log -n 5", "git commit -uno -m x", "which git && man git-push"]
for (const command of REVIEW_GIT_ALLOWED) T(`git review: ${JSON.stringify(command)} allows`, checkGitCommand(command), null)
// Each command of the round 13 review. The review options: the session directory is a protected repository, `/work/brain` is not protected,
// and each other directory has no remote, so the rule treats it as protected.
const r13Remote = byTextDirectory((directory, remote = "origin") => remote !== "origin" ? "" : directory.startsWith("/work/orbit-ui-mobile") ? "https://github.com/thomasluizon/orbit-ui-mobile.git" : directory.startsWith("/work/brain") ? "https://github.com/thomasluizon/brain.git" : "")
const r13Options = { cwd: "/work/orbit-ui-mobile", resolveRemoteUrl: r13Remote }
const fromBrain = { ...r13Options, cwd: "/work/brain" }
const REVIEW_R13_GIT_REFUSED = [
  // Defect 1: a byte that the reader did not read made it loop. The rows that hold such a byte run in a child process below, with a time limit.
  // Defect 2: zsh reads a command after `[[ ... ]]` or `{ ... }` with no separator.
  "if [[ 1 ]] git push origin main", "if [[ 1 ]] { git push origin main }", "while [[ 1 ]] { git push origin main; break }", "if [[ 1 ]] then git push origin main; fi", "if { true } git push origin main",
  // Defect 3: a `cd` in a group in a pipeline or in the background changes no directory of the shell.
  "{ cd /work/brain; } | cat; git push origin main", "{ cd /work/brain; } & git push origin main",
  // Defect 4: a shell or `source` that reads its here document through another spelling of /dev/stdin.
  "source //dev/stdin <<'EOF'\ngit push origin main\nEOF", "bash /dev/./stdin <<'EOF'\ngit push origin main\nEOF", "bash //dev/stdin <<'EOF'\ngit push origin main\nEOF",
  // Defect 5: `env -S` runs its value as a command.
  "env -S 'git push origin main'", "env --split-string='git push origin main'",
  // Defect 6: quoted text that a shell later runs as code.
  "PS4='$(git push origin main)' bash -xc true", "set -o promptsubst; PS4='$(git push origin main)'; set -x; true", "printf -v 'a[$(git push origin main)]' x", "typeset 'a[$(git push origin main)]=1'",
  "read 'a[$(git push origin main)]' <<'EOF'\n1\nEOF", "bash -c \"let 'a[\\$(git push origin main)]'\"", "[[ 'a[$(git push origin main)]' -eq 0 ]]", "typeset -i x='a[$(git push origin main)]'",
  // Defect 7: push forms that push main of a protected repository.
  "git push origin :", "git push origin 'refs/heads/*:refs/heads/*'", "git -c alias.p='push origin main' p", "git -c push.default=matching push", "git -c remote.origin.push=HEAD:main push origin",
  "HP=/dev/null git --config-env=core.hooksPath=HP commit -m x",
]
for (const command of REVIEW_R13_GIT_REFUSED) T(`git review r13: ${JSON.stringify(command)} is refused`, blocks(checkGitCommand(command, r13Options)), true)
// Defect 3 from the other side, and defect 7 from a repository with no protection: each one pushes main of a protected repository.
for (const command of ["true | { cd /work/orbit-ui-mobile; }; git push origin main", "git --git-dir=/work/orbit-ui-mobile/.git push origin main", "GIT_DIR=/work/orbit-ui-mobile/.git git push origin main",
  "pushd /work/orbit-ui-mobile && git push origin main", "git push https://github.com/thomasluizon/orbit-ui-mobile.git main", "git push ../orbit-ui-mobile main", "git push upstream main",
  "git remote set-url origin https://github.com/thomasluizon/orbit-ui-mobile.git && git push origin main"]) {
  T(`git review r13: ${JSON.stringify(command)} from a repository with no protection is refused`, blocks(checkGitCommand(command, fromBrain)), true)
}
// The controls: a push to main of the repository with no protection, and a plain cd out of the protected repository, still pass.
T("git review r13: a push to main from the repository with no protection allows", checkGitCommand("git push origin main", fromBrain), null)
T("git review r13: a plain cd to the repository with no protection allows a push to its main", checkGitCommand("cd /work/brain && git push origin main", r13Options), null)
T("git review r13: a git -C to the repository with no protection allows a push to its main", checkGitCommand("git -C /work/brain push origin main", r13Options), null)
// Item 5 of the order: each command form that the coordinator uses passes both rules in an unattended run.
const COORDINATOR_FORMS = [
  "git status", "git status --short", "git log --oneline -1", "git -C /work/orbit-ui-mobile rev-parse HEAD", "node tools/run-status.mjs --json", "gh pr view 2464 --repo thomasluizon/orbit-ui-mobile --json body",
  "for w in ticket-1 ticket-2; do d=/work/worktrees/$w; git -C \"$d\" status --short; done", "for w in ticket-1 ticket-2\ndo\n  d=/work/worktrees/$w\n  git -C \"$d\" log --oneline -1\ndone",
  "if git merge --no-edit origin/main; then echo merged; else git merge --abort; fi", "if git merge --no-edit origin/main; then echo merged; fi",
  "node .claude/hooks/test-hooks.mjs 2>&1 | tail -5", "git log --oneline | head -3", "git diff --stat | grep hooks", "git log --format=%H | cut -c1-7", "gh pr view 1 --json body | node -e 'process.stdin.pipe(process.stdout)'",
  "echo \"head $(git rev-parse --short HEAD)\"", "echo head $(git rev-parse --short HEAD)", "node tools/test-tools.mjs > /tmp/tools.log 2>&1", "git --literal-pathspecs add .claude/hooks/test-hooks.mjs",
  "cd /work/orbit-ui-mobile && git fetch origin && git status -sb", "git push origin fix/ticket-2137-no-prompt", "git push -u origin fix/ticket-2137-no-prompt", "git push origin HEAD:fix/ticket-2137-no-prompt",
]
for (const command of COORDINATOR_FORMS) T(`git coordinator form: ${JSON.stringify(command)} allows`, checkGitCommand(command, r13Options), null)
T("subset: a loop over literal words gives git the value of the variable that the loop sets", wordTexts(COORDINATOR_FORMS[6]).filter((words) => words[0] === "git"), [["git", "-C", "/work/worktrees/ticket-1", "status", "--short"], ["git", "-C", "/work/worktrees/ticket-2", "status", "--short"]])
// The walk forgets a variable after a program that can set it, and a loop over words that are not literal is not modelled.
for (const [name, command] of [
  ["the builtin `read`", 'd=/work/x; read -r d; git -C "$d" status'],
  ["a variable in a `git` argument", 'git -C "$d" status'],
  ["a variable whose value bash and zsh split or expand in different ways", "d='/work/a b'; git -C $d status"],
  ["a `for` loop that is not", "for f in *.md; do git add \"$f\"; done"],
  ["a `for` loop that is not", "for f in $(ls); do echo \"$f\"; done"],
  ["a `for` loop that is not", "for f in a b; echo \"$f\""],
  ["an empty command", "if true; then; fi"],
  ["more commands than the hook reads", `for a in ${Array.from({ length: 200 }, (_, i) => i).join(" ")}; do for b in ${Array.from({ length: 200 }, (_, i) => i).join(" ")}; do echo x; done; done`],
  ["a `[` or a `:` directly after `$NAME`", "echo $d[1]"],
  ["a `[` or a `:` directly after `$NAME`", "echo $d:h"],
  ["an assignment in a pipeline", "true | d=/x"],
  ["the builtin `break`", "for w in a b; do break; done"],
]) T(`subset: ${command.slice(0, 80)} holds ${name}`, readCommand(command).notModelled.startsWith(name), true)
// A relative `cd` that the shell can skip doubles the directories that are possible, and the walk stops at its limit.
T("git: ten skippable relative cd commands are more states than the hook reads", checkGitCommand(Array.from({ length: 10 }, () => "true && cd a || cd b").join("; "), r13Options)?.notModelled, "more possible states than the hook reads")
// An attended session refuses a command outside the subset only when its text names git.
T("git attended: a command outside the subset that names no git allows", checkGitCommand("while true; do sleep 5; done", { unattended: false }), null)
T("git attended: a command outside the subset that names git blocks", blocks(checkGitCommand("{ git push origin main; }", { unattended: false })), true)
T("git attended: a quote inside the word git still names git", blocks(checkGitCommand("{ g''it push origin main; }", { unattended: false })), true)

// Each command of the round 14 review. The session directory is a protected repository, \`/work/brain\` is not protected, and the named remote \`ui\` has no URL, so the rule treats it as protected.
const REVIEW_R14_GIT_REFUSED = [
  // Defect 2: a builtin that assigns a name, and \`export\` or \`typeset\` of a refused name with no \`=\`.
  "read GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0 <<'EOF'\n1 alias.p push origin main\nEOF\nexport GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0\ngit p",
  "read PS4 <<'EOF'\n$(git push origin main)\nEOF\nset -x\ntrue", "read IFS <<'EOF'\n/\nEOF\nd=feature/main; git push origin $d", "export GIT_DIR", "typeset -x GIT_DIR", "getopts a GIT_DIR",
  "mapfile -C 'git push origin main #' -c 1 x <<'EOF'\n1\nEOF", "readarray -C 'git push origin main #' -c 1 x <<'EOF'\n1\nEOF", "export IFS", "local PATH=/tmp/evil", "unset -f git",
  // Defect 4: a git subcommand that pushes or runs a command, and an alias.
  "git rebase --exec 'git push origin main' HEAD~1", "git rebase -x 'git push origin main' HEAD~1", "git rebase -ix 'git push origin main' HEAD~1", "git submodule foreach 'git push origin main'",
  "git bisect run git push origin main", "git subtree push --prefix=apps origin main", "git send-pack git@github.com:thomasluizon/orbit-ui-mobile.git main", "git p",
  "git fetch --upload-pack='git push origin main' origin", "git grep -O'git push origin main' x", "git difftool -x 'git push origin main'",
  // Defect 5: a shell that is not a POSIX shell, by name or by path.
  "tcsh -c 'git push origin main'", "csh -c 'git push origin main'", "fish -c 'git push origin main'", "/bin/tcsh -fc 'git push origin main'", "pwsh -Command 'git push origin main'",
  // Defect 6: zsh reads \`<N-M>\` and \`<->\` as a glob that matches a number.
  "git push origin HEAD:feature <0-9> HEAD:main", "git push origin feature <-> main", "git push origin feature 2<1-9>",
  // A command word that the hook does not know.
  "caffeinate -i git push origin main", "watch git push origin main", "ssh host git push origin main",
]
for (const command of REVIEW_R14_GIT_REFUSED) T(`git review r14: ${JSON.stringify(command)} is refused`, blocks(checkGitCommand(command, r13Options)), true)
for (const command of [
  // Defect 1: another spelling of the URL of a protected repository, and \`--repo\`.
  "git push https://github.com/thomasluizon/ORBIT-UI-MOBILE.git main", "git push https://github.com/thomasluizon/Orbit-UI-Mobile main", "git push https://github.com/thomasluizon/orbit-ui-mobile.git/ main",
  "git push https://github.com/thomasluizon/orbit-ui-mobile.GIT main", "git push https://github.com/thomasluizon/orbit%2Dui-mobile main", "git push --repo https://github.com/thomasluizon/orbit-ui-mobile.git",
  "git push --repo=https://github.com/thomasluizon/orbit-ui-mobile.git", "git push --force --repo https://github.com/thomasluizon/orbit-ui-mobile.git", "git push --repo ui", "git push --repo=ui main", "git push ui main",
  // Defect 2 and defect 3 from a repository with no protection.
  "read GIT_DIR <<'EOF'\n/work/orbit-ui-mobile/.git\nEOF\nexport GIT_DIR\ngit push origin main", "zformat -f GIT_DIR /work/orbit-ui-mobile/.git; export GIT_DIR; git push origin main",
  "declare -n r=GIT_DIR; r=/work/orbit-ui-mobile/.git; export GIT_DIR; git push origin main", "chdir /work/orbit-ui-mobile; git push origin main", "chdir /work/orbit-ui-mobile && git push origin main",
  "builtin chdir /work/orbit-ui-mobile; git push origin main", "git send-pack git@github.com:thomasluizon/orbit-ui-mobile.git main", "git push --receive-pack='git push origin main' ../x main",
]) {
  T(`git review r14: ${JSON.stringify(command)} from a repository with no protection is refused`, blocks(checkGitCommand(command, fromBrain)), true)
}
T("git review r14: in an attended session, a URL with the name of a repository with no protection allows a push to its main", checkGitCommand("git push https://github.com/thomasluizon/Brain.git/ main", { ...fromBrain, unattended: false }), null)
T("git review r14: an attended session in a repository with no protection allows a subcommand that the hook does not know", checkGitCommand("git bisect run npm test", { ...fromBrain, unattended: false }), null)
T("git review r14: an attended session in a protected repository refuses a subcommand that the hook does not know", blocks(checkGitCommand("git subtree push --prefix=apps origin feature/x", { ...r13Options, unattended: false })), true)
T("git review r14: the refusal of an unknown subcommand names the subcommands that the hook knows", (checkGitCommand("git p", r13Options)?.message ?? "").includes("The hook knows only: add apply"), true)
T("git review r14: the refusal of an unknown command word names the command words that the hook knows", (checkGitCommand("caffeinate -i git status", r13Options)?.message ?? "").includes("The hook knows only: exec command"), true)
// Defect 8: a \`git\` argument can use a variable with a lower case name that the line sets. An upper case name is refused, and the advice says so.
T("git review r14: a lower case variable that the line sets passes in a git argument", checkGitCommand("wt=/work/orbit-ui-mobile; git -C \"$wt\" status --short", r13Options), null)
T("git review r14: an upper case variable that the line sets is refused in a git argument", checkGitCommand("WT=/work/orbit-ui-mobile; git -C \"$WT\" status --short", r13Options)?.notModelled, "a variable in a \`git\` argument")
T("git review r14: the advice names the lower case rule", (checkGitCommand("WT=/work/orbit-ui-mobile; git -C \"$WT\" status --short", r13Options)?.message ?? "").includes("An upper case name such as \`$WT\` is never read there"), true)

// Each defect of the round 15 review. Defect 1: git and GitHub resolve a dot segment, a repeated `/`, an escape, a query and a path, so in an unattended run
// a push names a URL only in a canonical form. In an attended session, the name reader removes each dot segment, and it treats a name that it cannot read as protected.
const REVIEW_R15_URLS = ["git push https://github.com/thomasluizon/orbit-ui-mobile.git/. main", "git push https://github.com/thomasluizon/orbit-ui-mobile/x/.. main",
  "git push --repo=https://github.com/thomasluizon/orbit-ui-mobile.git/./", "git push https://github.com/thomasluizon/orbit-ui-mobile/./ main"]
for (const command of [...REVIEW_R15_URLS, "git push https://github.com//thomasluizon/brain.git main", "git push 'https://github.com/thomasluizon/brain.git?x=1' main",
  "git push https://github.com/thomasluizon/brain.git#x main", "git push https://github.com/thomasluizon/br%61in main", "git push ../brain main", "git push ssh://git@github.com/thomasluizon/brain.git main",
  "git push https://GitHub.com/thomasluizon/brain main", "git push https://github.com/thomasluizon/brain/ main", "git push https://github.com/thomasluizon/.git main"]) {
  T(`git review r15: ${JSON.stringify(command)} from a repository with no protection is refused`, blocks(checkGitCommand(command, fromBrain)), true)
}
for (const command of REVIEW_R15_URLS) T(`git review r15: ${JSON.stringify(command)} from a repository with no protection is refused in an attended session`, blocks(checkGitCommand(command, { ...fromBrain, unattended: false })), true)
for (const command of ["git push https://github.com/thomasluizon/brain.git main", "git push https://github.com/thomasluizon/brain main", "git push git@github.com:thomasluizon/brain.git main",
  "git push git@github.com:thomasluizon/Brain main", "git push --repo=https://github.com/thomasluizon/brain.git"]) {
  T(`git review r15: the canonical form ${JSON.stringify(command)} from a repository with no protection allows a push to its main`, checkGitCommand(command, fromBrain), null)
}
T("git review r15: the refusal of a URL names the canonical forms", (checkGitCommand(REVIEW_R15_URLS[0], fromBrain)?.message ?? "").includes("`https://github.com/<owner>/<repo>` or `git@github.com:<owner>/<repo>`, each with an optional `.git`"), true)
T("git review r15: a remote URL with a dot segment from the config makes the directory protected", blocks(checkGitCommand("git push origin main", { cwd: "/work/brain", resolveRemoteUrl: () => "https://github.com/thomasluizon/orbit-ui-mobile.git/." })), true)
// The options of a wrapper are an allow list. Each option that the list does not name is not modelled, in each spelling: a short option in a
// group or with its value in the same word, and each unique prefix of a GNU long option. Both rules refuse it in an unattended run.
const WRAPPER_OPTIONS_REFUSED = ["env -P /tmp/x git status", "env -P/tmp/x git status", "env -vP /tmp/x git status", "env -P /tmp/x git push origin fix/a", "env --sp='rm -rf \"$TMP\"'",
  "env --sp='git push origin main'", "env --split git status", "env --split-s=x git status", "env --ch=/work/orbit-ui-mobile git push origin main", "env --chd /work/x git status", "env --chdi=/work/x git status",
  "env --ignore-env git push origin main", "env --ign git push origin main", "env --uns=HOME git push origin main", "env --u=HOME git push origin main", "exec -c git push origin main",
  "exec -a x git status", "exec -l git status", "nice -5 git status", "nice --adjustment=5 git status", "timeout git status", "timeout --signal=KILL 5 git status", "timeout -v 5 git status", "time -v git status",
  "stdbuf --output=L git status", "nohup -- git status", "noglob -x git status", "builtin -x echo", "setsid -w git status", "sudo -u root git status", "sudo -E git status", "doas -u root git status",
  "command -p git status", "xargs -a list.txt git status", "ionice -p 1 git status", "nice -n", "runuser git -c 'rm -rf \"$TMP\"'", "runuser -u root git status"]
for (const command of WRAPPER_OPTIONS_REFUSED) {
  T(`subset: the wrapper option in ${JSON.stringify(command)} is refused by both rules`, [Boolean(checkGitCommand(command, fromBrain)?.notModelled), checkApprovalPrompt(command, { cwd: "/work/brain" })?.rule], [true, "not-modelled"])
}
// The controls: each option that the allow list names passes, with its value in the next word or in the same word.
for (const command of ["env FOO=1 git status", "env -- FOO=1 git status", "nice git status", "nice -n 5 git status", "nice -n5 git status", "timeout 60 git fetch origin", "timeout -s KILL -k 5 60 npm test",
  "timeout --preserve-status --foreground 5m npm test", "time -p npm test", "stdbuf -oL -e 0 tail -1 notes.md", "command -v git", "xargs -0 -r -n 1 -I{} echo {}", "ionice -c 3 nice -n 10 npm test",
  "exec git status", "nohup npm test", "env FOO=1 nice -n 5 timeout 60 git status"]) {
  T(`subset: the wrapper options in ${JSON.stringify(command)} are modelled`, readCommand(command).notModelled, "")
}
// Each way that the subset can run a program in a directory other than the shell directory is refused by the git rule, the handoff gate
// and the approval rule. `find -execdir` and `-okdir` run in the directory of each found file, `env -C` and `sudo -D` in the named directory,
// `sudo` in the `runcwd` of its policy, `pkexec` in the home directory of the user, and `make -C` in the named directory.
for (const [name, command] of [
  ["`find -execdir`", "find /work/orbit-ui-mobile -maxdepth 1 -name apps -execdir git commit -m x \\;"],
  ["`find -okdir`", "find /work/orbit-ui-mobile -maxdepth 1 -name apps -okdir git commit -m x \\;"],
  ["`find -execdir` with `+`", "find /work/orbit-ui-mobile -maxdepth 1 -name apps -execdir git commit -m x {} +"],
  ["`find -execdir` after a wrapper", "nice -n 5 find /work/orbit-ui-mobile -maxdepth 1 -name apps -execdir git commit -m x \\;"],
  ["`find -execdir` after `xargs`", "echo /work/orbit-ui-mobile | xargs -I{} find {} -maxdepth 1 -name apps -execdir git commit -m x \\;"],
  ["`find -execdir` in the command of `find -exec`", "find . -maxdepth 0 -exec find /work/orbit-ui-mobile -maxdepth 1 -name apps -execdir git commit -m x \\; \\;"],
  ["`find -execdir` with a relative removal", "find /work/orbit-ui-mobile -maxdepth 1 -name apps -execdir rm -rf build \\; ; git commit -m x"],
  ["a `{}` in a `git` argument after `find -exec`", "find /work/orbit-ui-mobile -maxdepth 0 -exec git -C {} commit -m x \\;"],
  ["`env -C`", "env -C /work/orbit-ui-mobile git commit -m x"],
  ["`env --chdir`", "env --chdir=/work/orbit-ui-mobile git commit -m x"],
  ["`env --chdir` with its value in the next word", "env --chdir /work/orbit-ui-mobile git commit -m x"],
  ["`sudo`", "sudo git commit -m x"],
  ["`sudo -D`", "sudo -D /work/orbit-ui-mobile git commit -m x"],
  ["`sudo --chdir`", "sudo --chdir=/work/orbit-ui-mobile git commit -m x"],
  ["`doas`", "doas git commit -m x"],
  ["`pkexec`", "pkexec git commit -m x"],
  ["`pkexec --keep-cwd`", "pkexec --keep-cwd git commit -m x"],
  ["`make -C`", "make -C /work/orbit-ui-mobile commit GIT='git commit -m x'"],
  ["`xargs` before `git`", "echo /work/orbit-ui-mobile | xargs -I{} git -C {} commit -m x"],
  // A computed word of `find` can be `-execdir`, `-okdir`, `-exec` or `-ok`. The reader refuses each one that it cannot prove is no such action.
  ["a variable that gives `find` the word `-execdir`", "x=-execdir; find /work/orbit-ui-mobile -maxdepth 1 -name apps $x git commit -m x \\;"],
  ["a quoted variable that gives `find` the word `-execdir`", 'x=-execdir; find /work/orbit-ui-mobile -maxdepth 1 -name apps "$x" git commit -m x \\;'],
  ["an exported upper case variable that gives `find` the word `-execdir`", 'export X=-execdir; find /work/orbit-ui-mobile -maxdepth 1 -name apps "$X" git commit -m x \\;'],
  ["a variable that gives `find` the word `-okdir`", 'x=-okdir; find /work/orbit-ui-mobile -maxdepth 1 -name apps "$x" git commit -m x \\;'],
  ["a variable that gives `find` the word `-exec`", 'x=-exec; find /work/orbit-ui-mobile -maxdepth 0 "$x" git commit -m x \\;'],
  ["a brace expansion that gives `find` the word `-execdir`", "find /work/orbit-ui-mobile -maxdepth 1 -name apps -{print,execdir} git commit -m x \\;"],
  ["a glob that can give `find` the word `-execdir`", "find /work/orbit-ui-mobile -maxdepth 1 -name apps -execdi? git commit -m x \\;"],
  ["an unquoted variable after a literal prefix, which the shell splits", 'x="a -execdir"; find /work/orbit-ui-mobile -maxdepth 1 -name apps b$x git commit -m x \\;'],
  ["a variable that gives `find` its path", 'find "$DIR" -maxdepth 1 -name apps -exec git commit -m x \\;'],
  // `xargs` adds words from standard input, so the program that it runs must read no program or action from its words.
  ["`xargs find`", "printf '%s\\n' -execdir git commit -m x ';' | xargs find /work/orbit-ui-mobile -maxdepth 1 -name apps"],
  ["`xargs env`", "printf '%s\\n' git -C /work/orbit-ui-mobile commit -m x | xargs env"],
  ["`xargs env --`", "printf '%s\\n' git commit -m x | xargs env --"],
  ["`xargs nice`", "printf '%s\\n' git -C /work/orbit-ui-mobile commit -m x | xargs nice"],
  ["`xargs time`", "printf '%s\\n' git commit -m x | xargs time"],
  ["`xargs nohup`", "printf '%s\\n' git commit -m x | xargs nohup"],
  ["`xargs nice` before a program", "printf '%s\\n' x | xargs nice ls; git commit -m x"],
  ["`xargs` with no command word", "printf '%s\\n' x | xargs -n 1; git commit -m x"],
]) {
  T(`subset other directory: ${name} is refused by the git rule, the handoff gate and the approval rule`,
    [Boolean(checkGitCommand(command, fromBrain)?.notModelled), gitCommitChains(command, { cwd: "/work/brain" }).notModelled !== "", checkApprovalPrompt(command, { cwd: "/work/brain" })?.rule],
    [true, true, "not-modelled"])
}
// The controls: a computed word of `find` that cannot be an action, and an `xargs` whose program reads no program from its words, stay modelled.
for (const command of ['find "$DST/apps" -maxdepth 1 -name "*.tmp"', 'wt=/work/x; find "$wt" -name "*.tmp"', "find apps/*/src -name x", 'x=-name; find . "$x" a',
  'find . -name "*$ext"', 'find ~/x -name y', 'find . -name a"$x"', "printf '%s\\n' a b | xargs -n 1 echo", "printf '%s\\n' a | xargs -0 -r grep -l x"]) {
  T(`subset other directory: the control ${JSON.stringify(command)} is modelled`, readCommand(command).notModelled, "")
}
T("subset other directory: the refusal of a computed `find` word names the actions and the rewrite", readCommand('find . "$X" git status \\;').notModelled,
  "a variable in the words of `find`, which can be an action that runs a program (`-exec`, `-execdir`, `-ok`, `-okdir`). Write each action as a literal word, quote a pattern " +
  "such as `-name '*.mjs'`, and give a path as a literal path, as a path with a literal character such as `\"$DIR/\"`, or as a lower case variable that the line sets to a literal value")
T("subset other directory: the refusal of `xargs` names the program that it runs", readCommand("printf x | xargs env").notModelled,
  "an `xargs` that runs `env`, which can run a program or an action that the words from standard input name. Give `xargs` a program that runs no other program, such as `grep` or `rm`, or write the loop in a `.mjs` file")
T("subset other directory: the refusal of `find -execdir` names the construct and the rewrite", readCommand("find . -name apps -execdir git status \\;").notModelled,
  "`find -execdir` or `-okdir`, which runs its command in the directory of each found file, which the `cd` model cannot know. Use `-exec` with an absolute path")
T("subset other directory: the refusal of `sudo` names the wrapper", readCommand("sudo git status").notModelled,
  "the wrapper `sudo`, which runs its command as another user, in a directory, a home and a git config that the hook does not read")
T("subset other directory: `sudo` is not in the list of the command words that the hook knows", (checkGitCommand("caffeinate git status", r13Options)?.message ?? "").includes(" sudo "), false)
// The controls: each wrapper and `find -exec` and `-ok` run their command in the shell directory, so the `cd` model holds in each rule.
for (const wrapper of ["env A=1", "env --", "nice -n 5", "nohup", "time -p", "timeout 60", "stdbuf -o L", "setsid", "ionice -c 3", "exec", "command", "find . -maxdepth 0 -exec", "find . -maxdepth 0 -ok"]) {
  const tail = wrapper.startsWith("find") ? " \\;" : ""
  T(`subset other directory: \`${wrapper}\` keeps the \`cd\` model in the handoff gate, the git rule and the approval rule`, [
    gitCommitChains(`cd /work/b; ${wrapper} git commit -m x${tail}`, { cwd: "/work/brain" }),
    blocks(checkGitCommand(`cd /work/orbit-ui-mobile; ${wrapper} git push origin main${tail}`, fromBrain)),
    checkGitCommand(`cd /work/orbit-ui-mobile; ${wrapper} git push origin fix/x${tail}`, fromBrain),
    checkApprovalPrompt(`cd /work/checkouts/repo/x; ${wrapper} rm -rf ..${tail}`, { cwd: "/work/checkouts/repo", home: "/fixture-home", windows: false })?.rule,
  ], [{ chains: [{ chain: ["/work/b"], subcommand: "commit" }], notModelled: "" }, true, null, "working-directory"])
}
// A program that runs code from a file or from its arguments, such as `npm`, gives no invocation that a rule reads, in any directory:
// `./README.md` names that limit. The documented procedure `npm test --prefix evals/astra` stays modelled.
T("subset other directory: `npm --prefix` is modelled, and its only invocation is `npm`", [readCommand("npm test --prefix evals/astra").notModelled,
  readCommand("npm test --prefix evals/astra").list[0][0].node.commands[0].words.map((word) => word.text)], ["", ["npm", "test", "--prefix", "evals/astra"]])
// Defect 2: `HOME`, each `XDG_*` name and each other name that gives the shell or git a directory or a config file is refused in each assignment form.
const DIRECTORY_NAMES = ["HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "PWD", "OLDPWD", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "GIT_CONFIG_GLOBAL", "ZDOTDIR", "CDPATH"]
for (const name of DIRECTORY_NAMES) {
  const forms = [`${name}=/x git status`, `${name}=/x; git status`, `env ${name}=/x git status`, `export ${name}=/x`, `declare ${name}=/x`, `typeset ${name}`, `unset ${name}`, `for ${name} in /x; do true; done`]
  T(`subset: each assignment form of ${name} is refused`, forms.map((command) => readCommand(command).notModelled.startsWith(`an assignment to \`${name}\``)), forms.map(() => true))
}
for (const command of ["HOME=/x; cd ~/y; git push origin main", "HOME=/x git push origin main", "XDG_CONFIG_HOME=/x git push origin main", "env -i git push origin main", "env -u HOME git push origin main",
  "env --unset=HOME git push origin main", "env - git push origin main", "env --ignore-environment git push origin main", "unset HOME; git push origin main"]) {
  T(`git review r15: ${JSON.stringify(command)} from a repository with no protection is refused`, blocks(checkGitCommand(command, fromBrain)), true)
  T(`git review r15: ${JSON.stringify(command)} from a repository with no protection is refused in an attended session`, blocks(checkGitCommand(command, { ...fromBrain, unattended: false })), true)
}
// Defect 3: two states whose variable maps hold the same entries are one state, so a loop with a branch that assigns stays within the state limit.
const loopWords = Array.from({ length: 8 }, (_, index) => `w${index}`).join(" ")
const REVIEW_R15_STATE_ROWS = [`for w in ${loopWords}; do if test -f /work/x/$w; then f=/work/x/$w; git add "$f"; fi; done`,
  `for w in ${loopWords}; do d=/work/orbit-ui-mobile; git -C "$d" status && x=1; done`, `${Array.from({ length: 7 }, () => "if true; then x=/a; else x=/a; fi").join("; ")}; git -C "$x" status`]
for (const command of REVIEW_R15_STATE_ROWS) {
  T(`subset: ${JSON.stringify(command.slice(0, 90))} stays within the state limit`, checkGitCommand(command, r13Options), null)
  T(`subset: ${JSON.stringify(command.slice(0, 90))} stays within the state limit in an attended session`, checkGitCommand(command, { ...r13Options, unattended: false }), null)
}
T("subset: two maps with other values stay two states", blocks(checkGitCommand("if test -f a; then d=/work/brain; else d=/work/orbit-ui-mobile; fi; git -C \"$d\" push origin main", r13Options)), true)
T("subset: two maps with the same values in another order of assignment are one state", wordTexts("if test -f a; then x=/a; y=/b; else y=/b; x=/a; fi; git -C \"$x$y\" status").filter((words) => words[0] === "git"), [["git", "-C", "/a/b", "status"]])
// Defect 4: each git command that a procedure under .claude/ or tools/ tells a session or a worker to run passes in both modes. The placeholders hold plain values.
const PROCEDURE_GIT_FORMS = ["git fetch origin main", "git show HEAD:.claude/handoffs/NEXT.md", "git log --oneline", "git merge-tree --write-tree --name-only HEAD origin/main",
  "git merge-tree --write-tree HEAD origin/main", "git show feature/x:README.md", "git diff main...feature/x", "git diff --name-only", "git worktree prune", "git diff abc1234..def5678", "git diff",
  "git show", "git rev-parse --abbrev-ref HEAD", "git rev-parse --abbrev-ref --symbolic-full-name @{u}", "git fetch origin feature/x", "git rev-parse HEAD", "git rev-parse origin/feature/x", "git status",
  "git log @{u}..", "git worktree list", "git stash list", "git status --ignored", "git commit -m handoff -- .claude/specs/x.md .claude/handoffs/NEXT.md", "git switch -c feature/orb-1-x",
  "git switch -c feature/orb-2-y feature/orb-1-x", "git status --porcelain", "git rev-list --count main..HEAD", "git rev-list origin/feature/x..HEAD", "git -C /work/orbit-ui-mobile status --porcelain",
  "git -C /work/orbit-ui-mobile rev-parse --abbrev-ref HEAD", "git -C /work/other switch main", "git -C /work/orbit-ui-mobile fetch origin main", "git -C /work/orbit-ui-mobile merge --ff-only origin/main",
  "git -C /work/orbit-ui-mobile rev-list --count HEAD..origin/main", "git push -u origin feature/orb-1-x", "git worktree add /work/worktrees/sweep main", "git merge-base --is-ancestor abc1234 origin/main",
  "git status --short", "git worktree remove /work/worktrees/ticket-1", "git worktree list --porcelain", "git ls-files", "git --literal-pathspecs add .claude/hooks/test-hooks.mjs",
  "git commit -F - <<'EOF'\nfix: x\nEOF", "git push -u origin fix/ticket-2137-no-prompt"]
for (const command of PROCEDURE_GIT_FORMS) {
  T(`git procedure form: ${JSON.stringify(command)} allows in an unattended run`, checkGitCommand(command, r13Options), null)
  T(`git procedure form: ${JSON.stringify(command)} allows in an attended session`, checkGitCommand(command, { ...r13Options, unattended: false }), null)
}
/** Each git subcommand that a code span or a fenced line of a Markdown file under .claude/ or tools/ names. Read from the files, so a new procedure joins the check. */
const procedureSubcommands = () => {
  const found = new Map()
  const visit = (directory) => {
    for (const name of readdirSync(directory)) {
      if (name === "node_modules") continue
      const path = join(directory, name)
      if (statSync(path).isDirectory()) visit(path)
      else if (name.endsWith(".md")) {
        let fenced = false
        for (const line of readFileSync(path, "utf8").split("\n")) {
          if (/^\s*\`\`\`/.test(line)) { fenced = !fenced; continue }
          for (const span of fenced ? [line] : [...line.matchAll(/\`([^\`]+)\`/g)].map((match) => match[1])) {
            for (const piece of span.trim().split(/\s*(?:&&|\|\||;|\|)\s*/)) {
              const words = piece.split(/\s+/)
              if (words[0] !== "git") continue
              let index = 1
              while (words[index] === "-C" || words[index] === "-c" || words[index]?.startsWith("--")) index += words[index].startsWith("--") ? 1 : 2
              if (/^[a-z][a-z-]*$/.test(words[index] ?? "")) found.set(words[index], path.slice(repoRoot.length + 1))
            }
          }
        }
      }
    }
  }
  visit(join(repoRoot, ".claude"))
  visit(join(repoRoot, "tools"))
  return found
}
const namedSubcommands = procedureSubcommands()
T("git procedure: the procedure files name git subcommands", namedSubcommands.size >= 10 && namedSubcommands.has("merge-tree"), true)
T("git procedure: each git subcommand that a procedure file names is one that the hook knows", [...namedSubcommands].filter(([subcommand]) => !GIT_SUBCOMMANDS.includes(subcommand)).map(([subcommand, place]) => `${subcommand} (${place})`), [])
T("git review r15: the refusal of an unknown subcommand names the script file route", (checkGitCommand("git p", r13Options)?.message ?? "").includes("run the file by its literal path, such as `bash /abs/path.sh`"), true)
T("git attended: the same command in an unattended run blocks", blocks(checkGitCommand("while true; do sleep 5; done")), true)
T("git attended: a push to main in the subset blocks in an attended session", blocks(checkGitCommand("git push origin main", { unattended: false })), true)
// git worktree remove --force follows a Windows junction and deletes the target.
T("git-worktree: --force blocks", blocks(checkGitWorktreeRemove("git worktree remove --force .claude/worktrees/x")), true)
T("git-worktree: no force allows", checkGitWorktreeRemove("git worktree remove .claude/worktrees/x"), null)
T("git-worktree: force on a later chained command allows", checkGitWorktreeRemove("git worktree remove .claude/worktrees/x && npm test -- --force"), null)

console.log("\n# orchestrator-guardrails (_lib/rules-orchestrator.mjs)")
T("engine: Orca terminal create cannot bypass launcher", blocks(checkEngineInvocation('orca terminal create --command "claude --model opus"')), true)
T("engine: Orca Codex terminal cannot bypass launcher", blocks(checkEngineInvocation("orca terminal create --command='codex exec'")), true)
T("engine: Orca shell terminal remains permitted", checkEngineInvocation('orca terminal create --command "node tools/run-status.mjs"'), null)
// The admin-merge prohibition is absolute for every agent and takes no context:
// banning only the CLI flag would leave both raw API paths open, which is the
// exact bypass shape it exists to close. (The rule lives in rules-orchestrator,
// not rules-git; both hooks are wired to Bash, Monitor and PowerShell.)
T(`admin-merge: gh pr merge ${ADMIN} blocks`, blocks(checkAdminMerge(`gh pr merge 667 --squash ${ADMIN}`)), true)
T("admin-merge: an ordinary gh pr merge --squash allows", checkAdminMerge("gh pr merge 667 --squash --delete-branch"), null)
for (const [label, method] of [
  ["a separated short flag", "-X PUT"],
  ["a concatenated short flag", "-XPUT"],
  ["gh's long flag", "--method PUT"],
  ["a lowercase method", "-X put"],
]) {
  T(`admin-merge: ${label} on the merge endpoint blocks`, blocks(checkAdminMerge(`gh api ${method} repos/o/r/pulls/667/merge -f merge_method=squash`)), true)
}
T("admin-merge: curl PUT to the merge endpoint blocks", blocks(checkAdminMerge("curl -X PUT https://api.github.com/repos/o/r/pulls/667/merge")), true)
T("admin-merge: wget PUT to the merge endpoint blocks", blocks(checkAdminMerge("wget --method=PUT https://api.github.com/repos/o/r/pulls/667/merge")), true)
// matched only as a FLAG, so httpie's positional form `http PUT <merge-url>` is
// allowed. `httpie` is in the rule's client set but the shape it actually types
// is not covered. Fixing it belongs in _lib/rules-orchestrator.mjs, not here.
T("admin-merge: the GraphQL mergePullRequest mutation blocks", blocks(checkAdminMerge("gh api graphql -f query='mutation{mergePullRequest(input:{pullRequestId:\"x\"}){clientMutationId}}'")), true)
T("admin-merge: a PUT to another endpoint allows", checkAdminMerge("gh api -XPUT repos/o/r/issues/667/labels"), null)
T("admin-merge: reading the merge endpoint allows", checkAdminMerge("gh api repos/o/r/pulls/667/merge"), null)
T("admin-merge: another GraphQL mutation allows", checkAdminMerge("gh api graphql -f query='mutation{resolveReviewThread(input:{threadId:\"x\"}){thread{isResolved}}}'"), null)
T(`admin-merge: a commit message naming ${ADMIN} allows`, checkAdminMerge(`git commit -m "forbid gh pr merge ${ADMIN}"`), null)
T("admin-merge: the refusal says to ask the owner", checkAdminMerge(`gh pr merge 1 ${ADMIN}`)?.message.includes("ask the owner to"), true)
for (const redirect of [">$(printf worker.log)", "2>&$(printf 1)"]) {
  T(
    `admin-merge: leading dynamic redirect ${redirect} cannot hide an admin merge`,
    blocks(checkAdminMerge(`${redirect} gh pr merge 667 ${ADMIN}`)),
    true,
  )
}

const engine = (command, options) => checkEngineInvocation(command, { repoRoots: [], ...options })
const descriptorSuffixAllows = [
  ["cloud read before a redirection", "codex cloud list 2>&1 >out.log"],
  ["zero-cost query before a safe argument", "codex 2>&1 --version"],
  ["cloud read before a safe argument", "codex cloud list 2>&1 --json"],
  ["cloud read before another redirection", "codex cloud list 2>&1 3>trace.log"],
]
const descriptorSafetyRefusals = [
  ["dollar command substitution", "2>&$(codex exec 'do work')"],
  ["backtick command substitution", "2>&`codex exec 'do work'`"],
  ["dynamic leading redirect", ">$(printf worker.log) codex exec"],
  ["engine invocation before a pipeline", "codex exec | tee log"],
  ["engine invocation after a list separator", "codex cloud list && codex exec"],
]
for (const [shape, command] of descriptorSuffixAllows) {
  T(`engine: descriptor duplication ${shape} allows`, engine(command), null)
}
for (const [shape, command] of descriptorSafetyRefusals) {
  T(`engine: descriptor safety ${shape} blocks`, blocks(engine(command)), true)
}
T("engine: codex exec blocks", blocks(engine('codex exec "do the thing"')), true)
T("engine: the research launcher allows", engine("node tools/launch-worker.mjs --research --order order.md --out findings.md"), null)
T("engine: a raw engine after the research launcher blocks", blocks(engine("node tools/launch-worker.mjs --research --order order.md --out findings.md && codex exec")), true)
T("engine: cloud execution still blocks", blocks(engine("codex cloud exec")), true)
T("engine: bare claude blocks", blocks(engine("claude")), true)
T("engine: claude -p blocks", blocks(engine('claude -p "summarize"')), true)
T("engine: a Windows shim extension is still the binary", blocks(engine("codex.cmd exec")), true)
T("engine: a later chained engine call blocks", blocks(engine("npm test && codex exec")), true)
T("engine: the refusal names the launcher", engine("codex exec")?.message.includes("tools/launch-worker.mjs"), true)
T("engine: codex cloud list allows", engine("codex cloud list --json"), null)
T("engine: codex cloud status allows", engine("codex cloud status task_123"), null)
T("engine: codex cloud diff allows", engine("codex cloud diff task_123"), null)
T("engine: a piped codex cloud list allows", engine("codex cloud list --env env_1 | head -20"), null)
T("engine: an exported token before a piped cloud read allows", engine("export GH_TOKEN=; codex cloud list --env env_1 | head -20"), null)
T("engine: a redirected codex cloud list allows", engine("codex cloud list --env env_1 > tasks.txt"), null)
T("engine: a leading redirection does not hide codex exec", blocks(engine("> worker.log codex exec")), true)
for (const redirect of [">$(printf worker.log)", "2>&$(printf 1)"]) {
  T(`engine: leading dynamic redirect ${redirect} fails closed`, blocks(engine(`${redirect} codex exec`)), true)
}
T("engine: codex exec before a pipe blocks", blocks(engine("codex exec | tee worker.log")), true)
T("engine: codex exec after a pipe blocks", blocks(engine("head -20 | codex exec")), true)
for (const separator of ["&&", ";", "||"]) {
  T(`engine: codex exec after ${separator} blocks`, blocks(engine(`codex cloud list ${separator} codex exec`)), true)
}
T("engine: a quoted pipeline is harmless argument text", engine('echo "codex exec | tee"'), null)
T("engine: a nested dollar command substitution revokes the cloud read exemption", blocks(engine('codex cloud list "$(codex exec \'do work\')"')), true)
T("engine: a nested backtick command substitution revokes the cloud read exemption", blocks(engine("codex cloud list `codex exec 'do work'`")), true)
T("engine: a help flag cannot launder a nested engine call", blocks(engine('codex cloud list --help "$(codex exec \'do work\')"')), true)
T("engine: input process substitution revokes the cloud read exemption", blocks(engine("codex cloud list <(codex exec 'do work')")), true)
T("engine: output process substitution revokes the cloud read exemption", blocks(engine("codex cloud list >(codex exec 'do work')")), true)
T("engine: an escaped inner executable revokes the cloud read exemption", blocks(engine("codex cloud list co\\dex exec")), true)
T("engine: a leading assignment falls outside the complete cloud read shape", blocks(engine("SAFE_READ=1 codex cloud list")), true)
T("engine: an unquoted heredoc command substitution revokes the cloud read exemption", blocks(engine("codex cloud list <<EOF\n$(codex exec 'do work')\nEOF")), true)
T("engine: an unquoted heredoc backtick substitution revokes the cloud read exemption", blocks(engine("codex cloud list <<EOF\n`codex exec 'do work'`\nEOF")), true)
T("engine: an even-backslash heredoc substitution still executes and is blocked", blocks(engine("codex cloud list <<EOF\n\\\\$(codex exec 'do work')\nEOF")), true)
T("engine: an odd-backslash heredoc substitution is data and keeps the cloud read exemption", engine("codex cloud list <<EOF\n\\$(codex exec 'data only')\nEOF"), null)
T("engine: a quoted data-only heredoc suppresses expansion and keeps the cloud read exemption", engine("codex cloud list <<'EOF'\n$(codex exec 'data only')\nEOF"), null)
T("engine: an unquoted heredoc command substitution revokes the zero-cost exemption too", blocks(engine("codex --version <<EOF\n$(codex exec 'do work')\nEOF")), true)
T("engine: codex cloud exec blocks", blocks(engine('codex cloud exec --env env_1 "do the thing"')), true)
T("engine: codex cloud apply blocks", blocks(engine("codex cloud apply task_123")), true)
T('engine: "list" inside a prompt exempts nothing', blocks(engine('codex exec "cloud list things"')), true)
T("engine: the cloud allowance is codex-only", blocks(engine("claude cloud list")), true)
T("engine: the refusal names the cloud submitter", engine("codex cloud exec")?.message.includes("tools/submit-cloud-worker.mjs"), true)
// The launcher exports its marker into every worker it spawns; that is the
// discriminator, and it is read from the ENVIRONMENT only.
T("engine: the launcher marker in the environment allows", engine("codex exec", { env: { ORBIT_LAUNCH_WORKER: "1" } }), null)
T("engine: a typed marker with no such environment still blocks", blocks(engine("ORBIT_LAUNCH_WORKER=1 codex exec")), true)
// A worker already inside a launcher-created worktree is the sanctioned caller.
// A linked worktree carries a `.git` FILE pointing into <main>/.git/worktrees/<name>;
// an ordinary checkout carries a `.git` DIRECTORY, which is what separates them.
const mainCheckout = join(root, "main")
const linkedWorktree = join(root, "worktrees", "feat")
mkdirSync(join(mainCheckout, ".git", "worktrees", "feat"), { recursive: true })
mkdirSync(linkedWorktree, { recursive: true })
writeFileSync(join(linkedWorktree, ".git"), `gitdir: ${join(mainCheckout, ".git", "worktrees", "feat")}\n`)
mkdirSync(join(linkedWorktree, "named-dir"), { recursive: true })
mkdirSync(join(linkedWorktree, ".claude"), { recursive: true })
writeFileSync(join(linkedWorktree, ".claude", "orchestrator.json"), JSON.stringify({ repos: { ui: ".", api: "../orbit-api", landing: "../orbit-landing-page" } }))
T("repo roots: linked worktree resolves configured siblings from the primary checkout",
  declaredRepoRoots(linkedWorktree),
  [linkedWorktree, mainCheckout, join(root, "orbit-api"), join(root, "orbit-landing-page")])
T("engine: a cwd inside a linked worktree allows", checkEngineInvocation("codex exec", { cwd: linkedWorktree, repoRoots: [mainCheckout] }), null)
T("engine: the main checkout is not a linked worktree", blocks(checkEngineInvocation("codex exec", { cwd: mainCheckout, repoRoots: [mainCheckout] })), true)
const stagingMain = join(root, "staging-main")
const stagingWorktree = join(root, "staging-worktree")
mkdirSync(stagingMain, { recursive: true })
const stagingGit = (args, cwd = stagingMain) => spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true })
T("staging: temporary repository initializes", stagingGit(["init", "--initial-branch=main"]).status, 0)
T("staging: temporary repository configures identity", stagingGit(["config", "user.email", "hooks@example.invalid"]).status, 0)
T("staging: temporary repository configures name", stagingGit(["config", "user.name", "Hook Test"]).status, 0)
mkdirSync(join(stagingMain, ".claude"), { recursive: true })
writeFileSync(join(stagingMain, ".claude", "tracked.md"), "tracked\n")
writeFileSync(join(stagingMain, "named.ts"), "export {}\n")
T("staging: temporary repository stages fixture", stagingGit(["add", ".claude/tracked.md", "named.ts"]).status, 0)
T("staging: temporary repository commits fixture", stagingGit(["commit", "-m", "fixture"]).status, 0)
T("staging: real linked worktree initializes", stagingGit(["worktree", "add", "-b", "feat", stagingWorktree]).status, 0)
mkdirSync(join(stagingWorktree, "named-dir"), { recursive: true })
rmSync(join(stagingWorktree, ".claude"), { recursive: true })
const workerStaging = (command) => checkBroadStaging(command, { cwd: stagingWorktree, repoRoots: [stagingMain] })
for (const redirect of [">$(printf worker.log)", "2>&$(printf 1)"]) {
  T(`staging: leading dynamic redirect ${redirect} cannot hide broad staging`, blocks(workerStaging(`${redirect} git add -A`)), true)
}
for (const command of [
  "git add -A",
  "git add --all",
  "git add --a",
  "git add -u",
  "git add --update",
  "git add --up",
  "git add .",
  "git add -- .",
  "git add \".\"",
  "git add named.ts .",
  "git add \"./\"",
  "git add src/*.ts",
  "git add ':(glob)src/*.ts'",
  "git add :",
  "git add :/",
  "git add ':(literal)'",
  "git add apps/web/app/api/[...path]/route.ts",
  "git add named-dir",
  "git add .claude",
  "git stage .",
  "git add --pathspec-from-file paths.txt",
  "git add --pathspec-from-file=paths.txt",
  "git add --pathspec-from-f paths.txt",
  "git add --pathspec-from-file paths.txt --pathspec-file-nul",
  "git commit -am 'sweep everything'",
  "git commit --all -m 'sweep everything'",
  "git commit . -m 'sweep everything'",
  "git commit ':(glob)**' -m 'sweep everything'",
  "git commit --pathspec-from-file paths.txt -m 'sweep everything'",
  "git commit -p",
  "git commit --patch",
  "git commit -i",
  "git commit --interactive",
  "git commit --intera",
  "git commit --patc",
  "git commit named-dir -m 'sweep subtree'",
  `git -C "${stagingWorktree}" add .`,
]) {
  T(`staging: ${command} blocks in a worker worktree`, blocks(workerStaging(command)), true)
}
T("staging: explicitly named paths are allowed", workerStaging("git add tools/verify-delivery.mjs .claude/skills/orchestrate/SKILL.md"), null)
T(
  "staging: a literal bracketed filename is allowed",
  workerStaging("git --literal-pathspecs add apps/web/app/api/[...path]/route.ts"),
  null,
)
T("staging: literal pathspec magic is allowed", workerStaging("git add ':(literal)apps/web/app/api/[...path]/route.ts'"), null)
T("staging: an explicitly named commit path is allowed", workerStaging("git commit tools/verify-delivery.mjs -m 'named only'"), null)
T("staging: a literal bracketed commit path is allowed", workerStaging("git commit ':(literal)apps/web/app/api/[...path]/route.ts' -m 'named only'"), null)
T("staging: an attached -m value containing broad flag letters is allowed", workerStaging("git commit -mapi"), null)
T("staging: an attached -F value containing broad flag letters is allowed", workerStaging("git commit -Fpath-to-message"), null)
T("staging: an attached -S key ID containing broad flag letters is allowed", workerStaging("git commit -Sapi"), null)
T("staging: broad add outside a worker is untouched", checkBroadStaging("git add -A", { cwd: mainCheckout, repoRoots: [mainCheckout] }), null)
// bare /[&|;\n]/, so the `|` inside the quoted search pattern produced a phantom
// segment whose first token resolved to `codex`, and a read-only grep was
// refused. A search PATTERN is data, never an invocation.
T("engine: a grep whose PATTERN contains the engine names allows", engine("grep -rnE 'claude|codex' tools/"), null)
T("engine: the same grep with double quotes allows", engine('grep -rn "claude|codex" tools/'), null)
// and refused `codex --version`, which starts no model session: the refusal
// protected no budget and only broke ordinary preflight.
T("engine: codex --version allows", engine("codex --version"), null)
T("engine: claude --help allows", engine("claude --help"), null)
T("engine: an unrelated command allows", engine("npm run lint"), null)
T("engine: a commit message naming the engine allows", engine('git commit -m "stop running codex exec by hand"'), null)
T("engine: a path containing .claude is not the claude binary", engine("cat .claude/skills/second-opinion/SKILL.md"), null)

console.log("\n# forbid-worker-browser (_lib/rules-worker.mjs)")
// Only launcher workers are barred from browsers; the owner may use the dev server.
const worker = (command, options) => checkWorkerBrowser(command, { env: { ORBIT_LAUNCH_WORKER: "1" }, cwd: repoRoot, repoRoots: [], ...options })
for (const command of ["npm run dev", "next dev --port 3920", "pnpm dev", "expo start", "npx playwright test", "maestro test flow.yaml", "curl http://localhost:3920/login", "adb shell input tap 1 1"]) {
  T(`worker-browser: ${command} blocks`, blocks(worker(command)), true)
}
T("worker-browser: the refusal says who owes the visual check", worker("npm run dev")?.message.includes("owed by a HUMAN"), true)
T("worker-browser: a later chained dev server blocks", blocks(worker("npm test && npm run dev")), true)
// The same commands from a session that is NOT a worker are none of this gate's business.
T("worker-browser: npm run dev outside a worker allows", checkWorkerBrowser("npm run dev", { env: {}, cwd: "", repoRoots: [] }), null)
T("worker-browser: a cwd inside a linked worktree IS a worker", blocks(checkWorkerBrowser("npm run dev", { env: {}, cwd: linkedWorktree, repoRoots: [mainCheckout] })), true)
T("worker-browser: Playwright remains blocked in a linked worktree", blocks(checkWorkerBrowser("npx playwright test", { env: {}, cwd: linkedWorktree, repoRoots: [mainCheckout] })), true)
T("worker-browser: the main checkout is not a worker", checkWorkerBrowser("npm run dev", { env: {}, cwd: mainCheckout, repoRoots: [mainCheckout] }), null)
// Ordinary work a worker MUST still be able to do. A gate that blocks the test run gets switched off.
for (const command of ["npm test", "npm run build", "npm run lint", "dotnet test", "npx vitest run", "npx vitest run apps/web", "npm test --workspace=@orbit/web", "git commit -m 'stop npm run dev in CI'", "curl https://api.github.com/repos/o/r"]) {
  T(`worker-browser: ${command} allows`, worker(command), null)
}
T("worker-browser: refusal retains e2e and layout guard bans", /no e2e\//.test(worker("npx playwright test")?.message ?? "") && /no layout guard/.test(worker("npx playwright test")?.message ?? ""), true)
// The rule judges the INVOKED PROGRAM, never stray argument text. Scanning the whole segment refused
// `rg -n playwright .`, so a worker could not inspect or delete the very code this bans, which
// aborts executable work for no safety. Same defect rules-orchestrator fixed for grep-over-engines.
for (const command of ["rg -n playwright .", 'grep -rn "npm run dev" tools/', "cat apps/web/e2e/orb-39.ts", "rm -rf apps/web/e2e", 'sed -i "s/expo start//" README.md']) {
  T(`worker-browser: read-only work whose ARGUMENTS name a browser tool allows: ${command}`, worker(command), null)
}
// ...and the package runners that front the real program are still resolved through.
T("worker-browser: npx playwright still blocks through the runner prefix", blocks(worker("npx playwright test")), true)
T("worker-browser: pnpm dlx cypress still blocks", blocks(worker("pnpm dlx cypress run")), true)
T("worker-browser: a dev script under a runner still blocks", blocks(worker("npm run dev -- --port 4000")), true)
T("worker-browser: a missing script fails closed", blocks(worker("npm run dev:docs")), true)
for (const command of [
  "npm run test:layout -w apps/web",
  "npm run test:layout --workspace=@orbit/web",
  "npm -w apps/web run test:layout",
  "npm run test:layout --workspace apps/web",
  "npm run-script test:layout -w @orbit/web",
  "npx npm run test:layout -w apps/web",
  "pnpm run test:layout -w apps/web",
  "pnpm --filter @orbit/web run test:layout",
  "yarn workspace @orbit/web run test:layout",
]) {
  T(`worker-browser: package script ${command} blocks`, blocks(worker(command)), true)
}
const scriptChainRoot = join(root, "script-chain")
mkdirSync(scriptChainRoot, { recursive: true })
writeFileSync(join(scriptChainRoot, "package.json"), JSON.stringify({ scripts: { "test:chain": "npm run test:layout", "test:layout": "playwright test --project=layout", "test:cycle": "npm run test:cycle" } }))
T("worker-browser: a script reaching Playwright through npm run blocks", blocks(worker("npm run test:chain", { cwd: scriptChainRoot })), true)
T("worker-browser: a recursive script fails closed", blocks(worker("npm run test:cycle", { cwd: scriptChainRoot })), true)
T("worker-browser: an allowed mobile Vitest script passes", worker("npm test -w @orbit/mobile"), null)
T("worker-browser: curl to a public host allows while localhost blocks", worker("curl https://example.com") === null && blocks(worker("curl http://localhost:3000")), true)

console.log("\n# forbid-approval-prompt (_lib/rules-approval.mjs)")
const approvalOptions = { cwd: "/work/checkouts/repo", home: "/fixture-home", workingDirectories: ["/work/checkouts/api"], windows: false }
const refusedBy = (command, options = approvalOptions) => checkApprovalPrompt(command, options)?.rule ?? null
const HELD_REMOVAL = 'rm "$DST/$d/node_modules"'
T("approval: the held removal is refused", refusedBy(HELD_REMOVAL), "variable-path")
T("approval: the refusal gives the guarded rewrite", checkApprovalPrompt(HELD_REMOVAL, approvalOptions).message.includes('"${DST:?}/${d:?}/node_modules"'), true)
T("approval: the refusal gives the literal path rewrite", checkApprovalPrompt(HELD_REMOVAL, approvalOptions).message.includes("Write the literal path"), true)
T("approval: the refusal names the reason and the command", ["no person is present", HELD_REMOVAL, "dangerous removal"].every((text) => checkApprovalPrompt(HELD_REMOVAL, approvalOptions).message.includes(text)), true)
// Each row is one rule: a command it refuses, and the rewrite its refusal asks for.
const approvalRules = [
  ["command-substitution", 'rm -rf "$(git rev-parse --show-toplevel)/dist"', "rm -rf /work/checkouts/repo/dist"],
  ["variable-path", HELD_REMOVAL, 'rm "${DST:?}/${d:?}/node_modules"'],
  ["brace-expansion", "rm -rf dist/{web,mobile}", "rm -rf dist/web dist/mobile"],
  ["windows-path", "rm -rf C:work", "rm -rf C:/work/build"],
  ["derived-variable", 'ROOT=$(git rev-parse --show-toplevel); rm -rf "${ROOT:?}"', "rm -rf /work/checkouts/repo/dist"],
  ["glob-target", "cd apps && rm -rf ./*", "rm -rf /work/checkouts/repo/apps/web/.next"],
  ["critical-path", "rm -rf /tmp", "rm -rf /tmp/orbit-build"],
  ["working-directory", "rm -rf .", "rm -rf dist"],
  ["mounted-drive", "rm -rf /Volumes/Backup", "rm -rf /Volumes/Backup/orbit/old"],
  ["not-modelled", 'bash <<<$"rm -rf \\"\\$TMP\\""', "rm -rf /tmp/orbit-build"],
]
T("approval: every removal rule has a refusal case", approvalRules.map(([rule]) => rule), REMOVAL_RULES.map((rule) => rule.name))
// The README rule table names each rule and the `covers` text of its refusal, so a changed rule fails here.
const readmeRules = Object.fromEntries([...readFileSync(join(hooksDir, "_lib", "README.md"), "utf8").matchAll(/^\| `([a-z-]+)` \| (`\w+`(?:, `\w+`)*) \|$/gm)]
  .map(([, rule, covers]) => [rule, covers.replaceAll("`", "")]))
const refusalCovers = (command) => /dangerous removal \(([^)]+)\)/.exec(checkApprovalPrompt(command, approvalOptions)?.message ?? "")?.[1] ?? null
T("approval: the README rule table lists each removal rule in source order", Object.keys(readmeRules), REMOVAL_RULES.map((rule) => rule.name))
T("approval: the README rule table gives the covers text of each refusal", approvalRules.map(([rule, refused]) => [rule, refusalCovers(refused)]), approvalRules.map(([rule]) => [rule, readmeRules[rule] ?? null]))
for (const [rule, refused, rewritten] of approvalRules) {
  T(`approval ${rule}: refused`, refusedBy(refused), rule)
  // The guard broken: with this one rule removed the same command passes, so the refusal belongs to the rule.
  T(`approval ${rule}: passes with the rule removed`, refusedBy(refused, { ...approvalOptions, rules: REMOVAL_RULES.filter((candidate) => candidate.name !== rule) }), null)
  // The guard restored: the full rule set refuses again, and the rewrite the refusal asks for passes.
  T(`approval ${rule}: refused again with the rule restored`, refusedBy(refused, { ...approvalOptions, rules: REMOVAL_RULES }), rule)
  T(`approval ${rule}: the rewrite passes`, refusedBy(rewritten), null)
}
let modelledRefusals = 0
for (const [command, rule] of [
  ['for d in web mobile; do rm "$DST/$d/node_modules"; done', "variable-path"],
  ["rm -rf $1", "variable-path"],
  ['rm -rf "${TMP:-/tmp}/build"', "variable-path"],
  ['rm -rf "$DST" 2>/dev/null', "variable-path"],
  ['rmdir "$DST"', "variable-path"],
  ['sudo rm -rf "$DST"', "variable-path"],
  ['xargs rm -rf "$DST"', "variable-path"],
  ['find /tmp/build -name "*.tmp" -exec rm -f "$DST/x" \\;', "variable-path"],
  // A variable that gives `find` its path can be an action that runs a program, so the reader refuses it.
  ['find "$DST" -name "*.tmp" -exec rm -f "$DST/x" \\;', "not-modelled"],
  [`bash -c 'rm -rf "$DST/"'`, "variable-path"],
  [`trap 'rm -rf "$TMP"' EXIT`, "variable-path"],
  ["bash <<'EOF'\nrm -rf \"$TMP\"\nEOF", "variable-path"],
  ...HEREDOC_SHELLS.map((shell) => [`${shell} <<'EOF'\nrm -rf "$TMP"\nEOF`, "variable-path"]),
  ...HEREDOC_SHELL_LINES.map((row) => [heredocCommand(row, 'rm -rf "$TMP"'), "variable-path"]),
  // A here-string is no heredoc: the line after it is a command, also when a later line repeats its word.
  ['cat <<<x\nrm -rf "$TMP"\nx', "variable-path"],
  // A shell runs the word of its here-string as a script, with or without a space around the operator.
  [`bash <<<'rm -rf "$TMP"'`, "variable-path"],
  [`bash -e<<<$'rm -rf "$TMP"'`, "variable-path"],
  ['bash <<<rm\\ -rf\\ \\"\\$TMP\\"', "variable-path"],
  [`bash <<<$'echo it\\'s; rm -rf "$TMP"'`, "variable-path"],
  // A quoted `<<EOF` is text, so the line after it is a command.
  ["echo '<<EOF'\nrm -rf \"$TMP\"\nEOF", "variable-path"],
  ['echo "<<EOF"\nrm -rf "$TMP"\nEOF', "variable-path"],
  // bash reads `$$` as the process id and then a plain quote, which the backslash does not keep open. zsh reads an ANSI-C quote after `$$`.
  ["echo $$'a\\' ; rm -rf \"$TMP\" # '", "variable-path"],
  ["echo $$'a\\'b' ; rm -rf \"$TMP\" # '", "variable-path"],
  ["echo $$$$'a\\' ; rm -rf \"$TMP\" # '", "variable-path"],
  // The append form of an assignment comes before a command as the plain form does.
  ["y+=1 eval 'rm -rf \"$TMP\"'", "variable-path"],
  ["rm -rf `pwd`/dist", "command-substitution"],
  ["docker exec box sh -c 'rm -rf /'", "critical-path"],
  ["rm -rf /", "critical-path"],
  ["rm -rf ~", "critical-path"],
  ['rm -rf "${HOME:?}"', "critical-path"],
  [`rm -rf ${["", "private", "tmp"].join("/")}`, "critical-path"],
  ["rm -rf /usr/", "critical-path"],
  ["rm -rf ./*", "working-directory"],
  ["rm -rf *", "working-directory"],
  ["rm -rf ..", "working-directory"],
  ["rm -rf /work/checkouts", "working-directory"],
  ["rm -rf /work/checkouts/api", "working-directory"],
  ["rm -rf apps/*/*", "glob-target"],
  ["rm -rf ~/*", "glob-target"],
  ["rm -rf ../*", "glob-target"],
  ["rmdir -p apps/web/*", "glob-target"],
  ["rm -rf \\\\", "windows-path"],
  ['bash -c "IFS=: ; rm -rf dist"', "not-modelled"],
  ['rm -rf build "unbalanced', "not-modelled"],
  // A comment hides nothing from the rules: the removal before it is still read.
  ['rm -rf "$DST" # it\'s stale', "variable-path"],
  ["rm -rf build 'unbalanced # not a comment", "not-modelled"],
  // The shell removes each quote and each escape from the name of a program before it runs the program.
  [`"bash" <<<'rm -rf "$TMP"'`, "variable-path"],
  [`b''ash <<<'rm -rf "$TMP"'`, "variable-path"],
  [`b''ash -c 'rm -rf "$TMP"'`, "variable-path"],
  ['sudo "rm" -rf "$TMP"', "variable-path"],
  ['r\\m -rf "$TMP"', "variable-path"],
  // `<<-` removes the leading tabs of the end marker line, so the body ends at line 3 and the shell runs line 4.
  ["cat <<-'EOF'\n\tdata\n\tEOF\nrm -rf \"$TMP\"\nEOF", "variable-path"],
  // Each construct outside the modelled subset is refused as not modelled: a run of `$` before `'`, a `$"..."` quote,
  // a here-string, a heredoc with no exact end marker, and `eval`.
  ["echo \\$$$'a\\'b' ; rm -rf \"$TMP\" # '", "not-modelled"],
  ["echo \\\\\\$$$'a\\'b' ; rm -rf \"$TMP\" # '", "not-modelled"],
  ["echo \\$$$$$'a\\'b' ; rm -rf \"$TMP\" # '", "not-modelled"],
  ["echo $$$'a\\' ; rm -rf \"$TMP\" # '", "not-modelled"],
  ["echo \\$$'a\\' ; rm -rf \"$TMP\" # '", "not-modelled"],
  ['bash <<<$"rm -rf \\"\\$TMP\\""', "not-modelled"],
  [`cat <<<'rm -rf "$TMP"'`, "not-modelled"],
  [`cat <<<'rm -rf "$TMP"' | bash`, "not-modelled"],
  ["echo $$'x\\' <<EOF ; echo '\nrm -rf \"$TMP\"\nEOF", "not-modelled"],
  ["cat <<'EOF'\ndata\nEOF \nrm -rf \"$TMP\"\nEOF", "not-modelled"],
  [`bash <<<$'\\x72m -rf "$TMP"'`, "not-modelled"],
  // `eval` joins its words and reads them again, so the value of the variable is code. A `<<` with no end marker line takes the rest as its body in one reading.
  [`eval 'echo 'rm -rf "$TMP"''`, "not-modelled"],
  [`eval 'eval 'rm -rf "$TMP"''`, "variable-path"],
  ["bash -c 'echo $'x\\' <<EOF ; echo '\nrm -rf \"$TMP\"\nEOF'", "not-modelled"],
  // A script from `/dev/stdin`, and a process substitution that gives a shell its script.
  ["source /dev/stdin <<'EOF'\nrm -rf \"$TMP\"\nEOF", "not-modelled"],
  ["bash <(cat <<'EOF'\nrm -rf \"$TMP\"\nEOF\n)", "not-modelled"],
]) {
  // A command outside the subset is refused before a removal rule reads it.
  const expected = isModelled(command) ? rule : "not-modelled"
  modelledRefusals += isModelled(command) ? 1 : 0
  T(`approval: ${command} is refused by ${expected}`, refusedBy(command), expected)
}
// The two rows with a last line `EOF` are not modelled: `EOF` is a command word that the hook does not know.
// `sudo` runs its command as another user, so the two `sudo` rows are not modelled.
T("approval: the count of refused rows that the subset models, each refused by its removal rule", modelledRefusals, 23)
for (const command of REVIEW_APPROVAL_REFUSED) T(`approval review: ${JSON.stringify(command)} is refused`, refusedBy(command), "not-modelled")
// Each removal command of the round 13 review is refused.
for (const command of ["if [[ 1 ]] rm -rf \"$TMP\"", "if { true } rm -rf \"$TMP\"", "{ cd /work/checkouts/repo/x/y/z/w; } | cat; rm -rf ../..", "{ cd /work/checkouts/repo/x/y/z/w; } & rm -rf ../..",
  "source //dev/stdin <<'EOF'\nrm -rf \"$TMP\"\nEOF", "bash /dev/./stdin <<'EOF'\nrm -rf \"$TMP\"\nEOF", "bash //dev/stdin <<'EOF'\nrm -rf \"$TMP\"\nEOF", "env -S 'rm -rf \"$TMP\"'",
  "PS4='$(rm -rf \"$TMP\")' bash -xc true", "printf -v 'a[$(rm -rf \"$TMP\")]' x"]) {
  T(`approval review r13: ${JSON.stringify(command)} is refused`, refusedBy(command), "not-modelled")
}
T("approval review r13: the plain removal in the review is refused by its rule", [refusedBy('rm -rf "$TMP"'), refusedBy("rm -rf ../..")], ["variable-path", "critical-path"])
for (const command of ["git status", "for w in ticket-1 ticket-2; do d=/work/worktrees/$w; git -C \"$d\" status --short; done", "if git merge --no-edit origin/main; then echo merged; else git merge --abort; fi",
  "node .claude/hooks/test-hooks.mjs 2>&1 | tail -5", "echo \"head $(git rev-parse --short HEAD)\"", "node tools/test-tools.mjs > /tmp/tools.log 2>&1", "gh pr view 2464 --repo thomasluizon/orbit-ui-mobile --json body"]) {
  T(`approval coordinator form: ${JSON.stringify(command)} passes`, refusedBy(command), null)
}
for (const command of ["read d <<'EOF'\n/\nEOF\nrm -rf \"${d:?}\"", "chdir /; rm -rf Users", "tcsh -c 'rm -rf $TMP'", "csh -c 'rm -rf $TMP'", "caffeinate rm -rf /tmp/x", "rm -rf build <0-9>"]) {
  T(`approval review r14: ${JSON.stringify(command)} is refused`, refusedBy(command), "not-modelled")
}
// Item 10 of the order: each command form of the coordinator passes the approval rule too.
for (const command of COORDINATOR_FORMS) T(`approval coordinator form: ${JSON.stringify(command)} passes`, refusedBy(command), null)
// Round 15 review: the state rows and the procedure forms pass the approval rule, and `HOME` is refused there too.
for (const command of [...REVIEW_R15_STATE_ROWS, `for w in ${loopWords}; do if test -f /work/checkouts/repo/$w; then d=/work/checkouts/repo/$w; rm -rf /work/checkouts/repo/build; fi; done`, ...PROCEDURE_GIT_FORMS]) {
  T(`approval review r15: ${JSON.stringify(command.slice(0, 90))} passes`, refusedBy(command), null)
}
// The form of the review is read within the state limit, and its removal is refused by its own rule: Claude Code reads `$d` in the raw text.
T("approval review r15: the loop of the review is refused by the variable path rule, not as a command that the hook cannot read",
  refusedBy(`for w in ${loopWords}; do if test -f /work/checkouts/repo/$w; then d=/work/checkouts/repo/$w; rm -rf "$d/build"; fi; done`), "variable-path")
for (const command of ["HOME=/work/checkouts/repo; rm -rf ~/build", "env -u HOME rm -rf /work/checkouts/repo/build"]) T(`approval review r15: ${JSON.stringify(command)} is refused`, refusedBy(command), "not-modelled")
// Defect 7: the walk is linear in the number of assignments. A 100 KB chain of assignments ends in each real hook file within 1 s.
const assignmentChain = (tail, value = "x") => { let chain = ""; for (let index = 0; chain.length < 100_000 - tail.length - 16; index++) chain += `a${index}=${value};`; return chain + tail }
for (const [file, command, env, want] of [["git-guardrails.mjs", assignmentChain("git push origin main"), {}, 2], ["forbid-approval-prompt.mjs", assignmentChain('rm -rf "$TMP"'), { ORBIT_LAUNCH_WORKER: "1" }, 2],
  ["git-guardrails.mjs", assignmentChain("git status"), {}, 0], ["forbid-approval-prompt.mjs", `x=/w;${assignmentChain("rm -rf build", "$x")}`, { ORBIT_LAUNCH_WORKER: "1" }, 0]]) {
  const started = performance.now()
  const result = spawnSync(process.execPath, [join(hooksDir, file)], { input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: repoRoot, session_id: "" }), encoding: "utf8", env: { ...process.env, ORBIT_LAUNCH_WORKER: "", ...env }, timeout: 20000 })
  const seconds = (performance.now() - started) / 1000
  T(`subset: ${file} reads a chain of ${command.split(";").length - 1} assignments (${command.length} characters) that ends in ${JSON.stringify(command.slice(command.lastIndexOf(";") + 1))} -> ${want} within 1 s`, [result.status, seconds < 1], [want, true])
}
// Defect 1: a byte outside printable ASCII outside a quote ends in a refusal within 1 s. A child process runs the rules, so a loop fails this test and not the suite.
const UNREAD_BYTES = { CR: "\r", "form feed": "\f", "vertical tab": "\v", "U+00A0": " ", "U+2028": " ", NUL: "\u0000" }
const unreadByteCommands = Object.entries(UNREAD_BYTES).flatMap(([name, byte]) => [[`git push origin main ;${byte}`, name], [`echo a${byte}b; git push origin main`, name], [`rm -rf "$TMP" ;${byte}`, name], [`git status${byte}`, name]])
const byteProbe = spawnSync(process.execPath, ["--input-type=module", "-e", `
  import { performance } from "node:perf_hooks"
  import { checkGitCommand } from ${JSON.stringify(pathToFileURL(join(hooksDir, "_lib", "rules-git.mjs")).href)}
  import { checkApprovalPrompt } from ${JSON.stringify(pathToFileURL(join(hooksDir, "_lib", "rules-approval.mjs")).href)}
  const rows = JSON.parse(process.argv[1]).map(([command]) => {
    const start = performance.now()
    const refused = Boolean(checkGitCommand(command, { cwd: "/work/x", resolveRemoteUrl: () => "https://github.com/o/orbit-ui-mobile.git" })?.notModelled) && Boolean(checkApprovalPrompt(command, { cwd: "/work/x" })?.rule === "not-modelled")
    return { refused, milliseconds: performance.now() - start }
  })
  process.stdout.write(JSON.stringify(rows))
`, JSON.stringify(unreadByteCommands)], { encoding: "utf8", timeout: 20000 })
const byteRows = byteProbe.status === 0 ? JSON.parse(byteProbe.stdout) : []
unreadByteCommands.forEach(([command, name], index) => {
  T(`subset: ${JSON.stringify(command)} with a ${name} outside a quote is refused within 1 s`, (byteRows[index]?.refused ?? false) && byteRows[index].milliseconds < 1000, true)
})
T("subset: a CR, a form feed and U+00A0 inside a quote are text", ["git commit -m 'a\rb'", 'git commit -m "a\fb"', "echo 'a b'"].map((command) => readCommand(command).notModelled), ["", "", ""])
T("approval: the not-modelled refusal names the construct, the plain subset and the script file", ["a here-string", "plain subset", "literal path"].every((text) => (checkApprovalPrompt(`cat <<<'rm -rf "$TMP"'`, approvalOptions)?.message ?? "").includes(text)), true)
let modelledPasses = 0
for (const command of [
  "rm -rf build",
  "rm -rf node_modules && npm ci",
  'rm -rf "apps/web/.next" apps/mobile/dist',
  "rm -f dist/*.js",
  "rm -rf dist/*",
  "rm -rf ~/cache/orbit",
  'rm -rf "${HOME:?}/cache/orbit"',
  "rm -rf /tmp/orbit-build",
  "rm -rf '$literal/x'",
  "rm -- -weird",
  'TMP=$(mktemp -d); rm -rf "${TMP:?}"',
  'find . -name "*.tmp" -exec rm -rf {} +',
  // Text that names a removal does not run one.
  'git rm -r "$DST"',
  'echo "rm -rf $DST"',
  'git commit -m "rm \\"$DST/\\" stops"',
  'grep -rn "rm -rf" tools',
  "cat > cleanup.sh <<'EOF'\nrm -rf \"$TMP\"\nEOF",
  "git commit -F - <<'EOF'\nrm -rf \"$TMP\"\nEOF",
  "npm run build",
  // The shell does not read a comment, so an apostrophe or a script word there changes nothing.
  "rm -rf dist # it's stale",
  "rm -rf dist # don't keep it\nnpm run build # it's fast",
  "bash -c 'rm -rf dist' # the alias function() is gone",
  // After one `$`, both shells read an ANSI-C quote: `\\'` does not end it, so the removal is text.
  "echo $'a\\' ; rm -rf \"$TMP\" # '",
  // A construct that the reader does not model passes when the text holds no removal that a rule refuses.
  "bash <<<'rm -rf dist'",
  "bash -c 'cat' <<<'rm -rf dist'",
  'grep -c rm <<<"$output"',
  "echo $$'x' ; rm -rf dist",
  "cat <<-'EOF'\n\trm -rf \"$TMP\"\n\tEOF",
  // A quoted word that is no command word is text.
  'grep -rn "rm" .',
  // `-c` with a variable is a script only after a shell word.
  "grep -c \"$pattern\" notes.md; cat > clean.sh <<'EOF'\nrm -rf \"$TMP\"\nEOF",
  ...HEREDOC_DATA.map((row) => heredocCommand(row, 'rm -rf "$TMP"')),
]) {
  // A command outside the subset is refused as not modelled, also when it runs no removal that Claude Code holds.
  const expected = isModelled(command) ? null : "not-modelled"
  modelledPasses += isModelled(command) ? 1 : 0
  T(`approval: ${command} ${expected ? "is not modelled" : "passes"}`, refusedBy(command), expected)
}
T("approval: the count of safe rows that the subset models, each one allowed", modelledPasses, 27)
// Property: for each command of a generated set, the hooks refuse it, or a direct reading proves that it runs no dangerous command.
// The set puts `git push origin main` and `rm -rf "$TMP"` into each pair of the constructs below, one inside the other and one after the other.
const DANGEROUS_COMMANDS = ["git push origin main", 'rm -rf "$TMP"']
const CONSTRUCTS = [
  "%", "echo '%'", 'echo "%"', "echo ok ; %", "echo x # %",
  "echo $'a\\'b' ; % # '", "echo $$'a\\'b' ; % # '", "echo \\$$$'a\\'b' ; % # '",
  'bash <<<$"%"', "bash <<<'%'", `"bash" <<<'%'`, "b''ash <<<'%'", "cat <<<'%'", "cat <<<'%' | bash",
  "bash -c '%'", `"bash" -c '%'`, "b''ash -c '%'", "eval '%'",
  "cat <<'EOF'\n%\nEOF", "cat <<EOF\n%\nEOF", "bash <<'EOF'\n%\nEOF", "cat <<'EOF' | bash\n%\nEOF",
  "cat <<-'EOF'\n\tdata\n\tEOF\n%\nEOF", "cat <<'EOF'\ndata\nEOF \n%\nEOF", "cat <<E\"O\"F\n%\nEOF",
  "echo $$'x\\' <<EOF ; echo '\n%\nEOF", "echo $'x\\' <<EOF ; echo '\n%\nEOF",
]
const within = (construct, text) => construct.replace("%", () => text)
const GENERATED_COMMANDS = DANGEROUS_COMMANDS.flatMap((dangerous) => CONSTRUCTS.flatMap((outer) => CONSTRUCTS.flatMap((inner) =>
  [within(outer, within(inner, dangerous)), `${within(outer, "echo ok")}\n${within(inner, dangerous)}`])))
/** The programs of the generated set that run no word of their input. `EOF` is an end marker that a nested heredoc leaves as a command. */
const HARMLESS_PROGRAMS = new Set(["echo", "cat", "grep", "true", "EOF"])
/** Stands for the value of a `$NAME` that the shell expands: no reading can prove a script that holds it. */
const EXPANDED = "\u0000"
/** The text of the `"..."` quote that opens at `start`, with the index of its close, or null when the direct reading cannot read it. */
const directDoubleQuote = (source, start) => {
  let text = ""
  for (let index = start + 1; index < source.length; index++) {
    const character = source[index]
    if (character === '"') return { text, close: index }
    if (character === "`" || (character === "$" && source[index + 1] === "(")) return null
    if (character === "\\" && /["\\$`\n]/.test(source[index + 1] ?? "")) text += source[++index]
    else if (character === "$" && /[A-Za-z_]/.test(source[index + 1] ?? "")) text += EXPANDED
    else text += character
  }
  return null
}
/** The body of the heredoc whose operator line ends at `lineEnd`, with the index after its end marker line, or null when the end marker is not exact. */
const directHeredocBody = (source, lineEnd, { marker, tabs }) => {
  const lines = source.slice(lineEnd + 1).split("\n")
  const end = lines.findIndex((line) => line.trim() === marker)
  if (end < 0 || !(tabs ? /^\t*$/ : /^$/).test(lines[end].slice(0, -marker.length))) return null
  const body = lines.slice(0, end).map((line) => (tabs ? line.replace(/^\t+/, "") : line)).join("\n")
  return { body, resume: lineEnd + 1 + lines.slice(0, end + 1).join("\n").length }
}
/**
 * A direct reading in a small grammar that bash and zsh read in one way: plain words, a `'...'` quote, a `"..."` quote with no
 * substitution, a `$'...'` quote after one `$` with no escape but `\'` and `\\`, `$NAME`, a comment, the separators `;`, `&`, `|`
 * and the line end, and a heredoc with one plain end marker. Each command is `{ words, piped, body }`: `piped` is true after a `|`,
 * and `body` is the heredoc body of its operator, with `expands` true for an unquoted end marker. Null for each other text.
 */
function directReading(source) {
  const commands = []
  let words = []
  let word = null
  let heredoc = null
  let piped = false
  const endWord = () => { if (word !== null) words.push(word); word = null }
  const endCommand = (separator) => {
    endWord()
    if (words.length > 0) commands.push({ words, piped, heredoc })
    if (words.length > 0 || separator !== "|") piped = separator === "|" && words.length > 0
    words = []
  }
  let pending = null
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    const rest = source.slice(index)
    if (character === "'") {
      const close = source.indexOf("'", index + 1)
      if (close < 0) return null
      word = (word ?? "") + source.slice(index + 1, close)
      index = close
    } else if (rest.startsWith("$'")) {
      const quoted = /^\$'((?:\\['\\]|[^'\\])*)'/.exec(rest)
      if (!quoted) return null
      word = (word ?? "") + quoted[1].replace(/\\(.)/g, "$1")
      index += quoted[0].length - 1
    } else if (character === '"') {
      const quoted = directDoubleQuote(source, index)
      if (!quoted) return null
      word = (word ?? "") + quoted.text
      index = quoted.close
    } else if (character === " " || character === "\t") endWord()
    else if (character === "#" && word === null) {
      const lineEnd = source.indexOf("\n", index)
      index = (lineEnd < 0 ? source.length : lineEnd) - 1
    } else if (/[;&|]/.test(character)) endCommand(character)
    else if (character === "\n") {
      endCommand(character)
      if (!pending) continue
      const read = directHeredocBody(source, index, pending)
      if (!read) return null
      pending.body = read.body
      pending = null
      index = read.resume - 1
    } else if (character === "<") {
      const opener = /^<<(-?)(?:'([A-Za-z_]\w*)'|([A-Za-z_]\w*))(?=[ \t;|&\n]|$)/.exec(rest)
      if (!opener || pending || heredoc) return null
      endWord()
      pending = { marker: opener[2] ?? opener[3], tabs: opener[1] === "-", expands: opener[2] === undefined, body: null }
      heredoc = pending
      index += opener[0].length - 1
      continue
    } else if (character === "$") {
      const name = /^\$[A-Za-z_]\w*/.exec(rest)
      if (!name) return null
      word = (word ?? "") + EXPANDED
      index += name[0].length - 1
    } else if (/[\w./:=+,@%-]/.test(character)) word = (word ?? "") + character
    else return null
    if (/[;&|\n]/.test(character)) heredoc = null
  }
  endCommand("\n")
  return pending ? null : commands
}
/**
 * True only when the direct reading proves that the text runs no dangerous command: each command starts with a word of
 * `HARMLESS_PROGRAMS`, or is a `git` or an `rm` with no argument, or is `bash -c` or `eval` with a script that the same reading proves, or is a `bash` with no argument
 * whose script is the body of its own quoted heredoc, or the body that a `cat` with no argument pipes to it.
 */
function provesNoDangerousCommand(source, depth = 0) {
  const commands = depth > 6 ? null : directReading(source)
  if (!commands) return false
  return commands.every(({ words, piped, heredoc }, index) => {
    // A `git` or an `rm` with no argument changes nothing.
    if (HARMLESS_PROGRAMS.has(words[0]) || (words.length === 1 && ["git", "rm"].includes(words[0]))) return true
    if (words[0] === "eval") return provesNoDangerousCommand(words.slice(1).join(" "), depth + 1)
    if (words[0] !== "bash") return false
    if (words[1] === "-c" && words.length > 2) return provesNoDangerousCommand(words[2], depth + 1)
    const feeder = commands[index - 1]
    const script = heredoc ?? (piped && feeder?.words.join(" ") === "cat" && !feeder.piped ? feeder.heredoc : null)
    return words.length === 1 && Boolean(script) && !script.expands && provesNoDangerousCommand(script.body, depth + 1)
  })
}
const hooksRefuse = (command, rules = REMOVAL_RULES) => blocks(checkGitCommand(command)) === true || refusedBy(command, { ...approvalOptions, rules }) !== null
const passesWithNoProof = (rules) => GENERATED_COMMANDS.filter((command) => !hooksRefuse(command, rules) && !provesNoDangerousCommand(command))
T(`property: each of ${GENERATED_COMMANDS.length} generated commands is refused, or a direct reading proves that it runs no dangerous command`, passesWithNoProof(REMOVAL_RULES), [])
T("property: the generated set holds refused commands and proven commands", [GENERATED_COMMANDS.some((command) => hooksRefuse(command)), GENERATED_COMMANDS.some((command) => !hooksRefuse(command) && provesNoDangerousCommand(command))], [true, true])
// The direct reading proves a command whose text is data, and proves no command that runs the text or that it cannot read.
T("property: the direct reading proves commands whose dangerous text is data", ["echo 'git push origin main'", 'echo "rm -rf "$TMP""', "cat <<'EOF'\nrm -rf \"$TMP\"\nEOF", "echo x # git push origin main",
  "bash -c 'echo ok' git push origin main", "eval 'echo ok # git push origin main'", "bash <<'EOF'\necho 'git push origin main'\nEOF", "cat <<'EOF' | bash\necho ok\nEOF", "echo $'a\\'b ; git push origin main'",
  "cat <<-'EOF'\n\tgit push origin main\n\tEOF"].map((command) => provesNoDangerousCommand(command)), Array(10).fill(true))
T("property: the direct reading proves no command that runs the text or that it cannot read", ["git push origin main", "echo ok ; rm -rf \"$TMP\"", "bash -c 'git push origin main'", "cat <<'EOF' | bash\ngit push origin main\nEOF",
  "eval 'eval 'rm -rf \"$TMP\"''", "eval echo $X", "bash", "cat <<'EOF' ; bash\necho ok\nEOF", "bash <<EOF\necho ok\nEOF", "echo $$'a' ; echo b", "echo $'\\x67'", "cat <<<'x'", "cat <<'EOF'\nx\nEOF \nEOF",
  "cat <<-'EOF'\n\tx\n\tEOF\ngit push origin main"].map((command) => provesNoDangerousCommand(command)), Array(14).fill(false))
// The guard broken: without the not-modelled rule, a generated removal passes with no proof. The full rule set restores it.
const removalPassesWithNoProof = (rules) => GENERATED_COMMANDS.filter((command) => command.includes("rm -rf") && refusedBy(command, { ...approvalOptions, rules }) === null && !provesNoDangerousCommand(command))
T("property: with the not-modelled rule removed, the approval rule passes a generated removal with no proof", [removalPassesWithNoProof(REMOVAL_RULES.filter((rule) => rule.name !== "not-modelled")).length > 0, removalPassesWithNoProof(REMOVAL_RULES)], [true, []])
T("approval windows: the top level of a drive is critical", refusedBy("rm -rf C:/work", { ...approvalOptions, cwd: "C:\\work\\repo", windows: true }), "critical-path")
T("approval windows: a deeper drive path passes", refusedBy("rm -rf C:/work/other/build", { ...approvalOptions, cwd: "C:\\work\\repo", windows: true }), null)
T("approval: a non-string command passes", checkApprovalPrompt(undefined, approvalOptions), null)
T("approval: the removal check runs for the Bash tool and the Monitor tool", REMOVAL_CHECK_TOOLS, ["Bash", "Monitor"])
// Each settings scope that Claude Code reads adds working directories; a relative entry resolves from the project directory.
const settingsScopes = join(mkdtempSync(join(tmpdir(), "orbit-settings-")), "scopes")
const scopeProject = join(settingsScopes, "work", "project")
const scopeAccount = join(settingsScopes, "account")
const scopeManaged = join(settingsScopes, "managed")
const scopeOptions = { configDirectory: scopeAccount, home: join(settingsScopes, "home"), managedDirectory: scopeManaged }
for (const directory of [join(scopeProject, ".claude"), scopeAccount, join(scopeManaged, "managed-settings.d")]) mkdirSync(directory, { recursive: true })
const writeScope = (path, directories) => writeFileSync(path, JSON.stringify({ permissions: { additionalDirectories: directories } }))
T("additional directories: no settings file adds none", additionalWorkingDirectories(scopeProject, scopeOptions), [])
writeScope(join(scopeAccount, "settings.json"), [join(settingsScopes, "vault"), "~/notes", "~"])
writeScope(join(scopeProject, ".claude", "settings.json"), ["../api", "../landing"])
writeScope(join(scopeProject, ".claude", "settings.local.json"), [join(settingsScopes, "local-only"), "../api"])
writeScope(join(scopeManaged, "managed-settings.json"), [join(settingsScopes, "managed-root")])
writeScope(join(scopeManaged, "managed-settings.d", "10-team.json"), [join(settingsScopes, "managed-drop-in")])
T("additional directories: the user, project, local and managed scopes each add their entries, once each", additionalWorkingDirectories(scopeProject, scopeOptions), [
  join(settingsScopes, "vault"), join(settingsScopes, "home", "notes"), join(settingsScopes, "home"),
  join(settingsScopes, "work", "api"), join(settingsScopes, "work", "landing"), join(settingsScopes, "local-only"),
  join(settingsScopes, "managed-root"), join(settingsScopes, "managed-drop-in"),
])
writeFileSync(join(scopeProject, ".claude", "settings.local.json"), "{ not json")
writeFileSync(join(scopeManaged, "managed-settings.json"), JSON.stringify({ permissions: { additionalDirectories: "not a list" } }))
writeFileSync(join(scopeManaged, "managed-settings.d", "10-team.json"), JSON.stringify({ permissions: { additionalDirectories: [7, "", join(settingsScopes, "managed-drop-in")] } }))
T("additional directories: a file that does not parse, a value that is not a list and an entry that is not a path add nothing", additionalWorkingDirectories(scopeProject, scopeOptions), [
  join(settingsScopes, "vault"), join(settingsScopes, "home", "notes"), join(settingsScopes, "home"),
  join(settingsScopes, "work", "api"), join(settingsScopes, "work", "landing"), join(settingsScopes, "managed-drop-in"),
])
T("approval: removal of a directory that a settings scope adds is refused", refusedBy(`rm -rf ${join(settingsScopes, "vault")}`, { ...approvalOptions, workingDirectories: additionalWorkingDirectories(scopeProject, scopeOptions) }), "working-directory")
T("approval: the same removal passes with no settings scope read", refusedBy(`rm -rf ${join(settingsScopes, "vault")}`), null)
// The real project settings of this repository add the two sibling repositories, as a real session lists them.
T("additional directories: the real project settings add the sibling repositories", additionalWorkingDirectories(repoRoot, { ...scopeOptions, configDirectory: scopeManaged })
  .map((directory) => directory.slice(dirname(resolve(repoRoot)).length + 1)).filter((name) => ["orbit-api", "orbit-landing-page"].includes(name)), ["orbit-api", "orbit-landing-page"])
const sleepingRun = { sleep: true, sessionId: "coordinator" }
T("approval scope: the coordinator of an unattended run", isUnattendedRun({ state: sleepingRun, sessionId: "coordinator" }), true)
// A subagent's tool hooks carry the session id of the coordinator, so the same record covers it.
T("approval scope: a session with no id fails closed", isUnattendedRun({ state: sleepingRun }), true)
T("approval scope: a launched worker", isUnattendedRun({ env: { ORBIT_LAUNCH_WORKER: "1" }, state: null }), true)
T("approval scope: an attended run", isUnattendedRun({ state: { sleep: false, sessionId: "coordinator" }, sessionId: "coordinator" }), false)
T("approval scope: another session beside an unattended run", isUnattendedRun({ state: sleepingRun, sessionId: "owner" }), false)
T("approval scope: no run record", isUnattendedRun({ env: {}, state: null, sessionId: "owner" }), false)
for (const tool of PERSON_PROMPT_TOOLS) T(`person prompt: ${tool} waits for a person and is refused`, checkPersonPrompt(tool)?.rule ?? null, "person-prompt")
for (const tool of ["Bash", "Monitor", "Agent", "Read", undefined]) T(`person prompt: ${tool} is not a question to a person`, checkPersonPrompt(tool), null)

console.log("\n# forbid-node-modules-write (_lib/rules-dependencies.mjs)")
// the package was extracted, npm install left them alone, and four contradictory citations of
// those two files were published across three sessions. Unlike the browser ban, this one takes no
// caller: the damage is to what every later reader sees, not to one session's budget.
const dependencyTree = join(root, "dependency-guard")
const installedPackage = join(dependencyTree, "node_modules", "react-native")
const installedFile = join(installedPackage, "ReactNativeFeatureFlagsDefaults.kt")
mkdirSync(installedPackage, { recursive: true })
mkdirSync(join(dependencyTree, "apps", "mobile", "app"), { recursive: true })
mkdirSync(join(dependencyTree, "node_modules_backup"), { recursive: true })
writeFileSync(installedFile, "enableImperativeFocus = false\n")
const linkedPackage = join(dependencyTree, "link-to-package")
let symlinkFixtureError = null
try {
  symlinkSync(installedPackage, linkedPackage, "junction")
} catch (error) {
  symlinkFixtureError = String(error?.message ?? error)
}
const inTree = { cwd: dependencyTree }
T("dependency-write: an absolute path inside node_modules blocks", blocks(checkDependencyFileWrite(installedFile, inTree)), true)
T("dependency-write: a relative path inside node_modules blocks", blocks(checkDependencyFileWrite("node_modules/react-native/index.js", inTree)), true)
// A guard that pattern-matches the literal string is not a guard: both of these reach the same
// bytes while spelling neither.
T(
  "dependency-write: a traversal back into node_modules blocks",
  blocks(checkDependencyFileWrite("apps/mobile/../../node_modules/react-native/index.js", inTree)),
  true,
)
// `symlinkAvailable ? blocks(...) : true` reported PASS as `true === true` when the fixture failed
// to stage, so the assertion went green while proving nothing. The staging is its own assertion
// now, and the guard case reports the staging error instead of substituting a passing value.
T("dependency-write: the symlink fixture stages", symlinkFixtureError, null)
T(
  "dependency-write: a symlink into the package blocks",
  symlinkFixtureError ? `fixture unavailable: ${symlinkFixtureError}` : blocks(checkDependencyFileWrite(join(linkedPackage, "index.js"), inTree)),
  true,
)
T(
  "dependency-write: a case-different spelling of node_modules blocks",
  blocks(checkDependencyFileWrite(join(dependencyTree, "NODE_MODULES", "react-native", "flags.kt"), inTree)),
  true,
)
T(
  "dependency-write: a case-different spelling blocks where no node_modules exists yet",
  blocks(checkDependencyFileWrite("NODE_MODULES/react-native/x.kt", { cwd: join(dependencyTree, "apps") })),
  true,
)
T("dependency-write: the repository's own source allows", checkDependencyFileWrite("apps/mobile/app/index.tsx", inTree), null)
// A SEGMENT, never a substring. node_modules_backup/ is an ordinary directory.
T("dependency-write: a directory merely named like node_modules allows", checkDependencyFileWrite("node_modules_backup/notes.md", inTree), null)
T("dependency-write: no path at all allows", checkDependencyFileWrite(null, inTree), null)
const dependencyCommand = (command) => checkDependencyCommand(command, inTree)
const isolatedDirectoryBodies = [
  (body) => `echo $(${body})`,
  (body) => `echo \`${body}\``,
  (body) => `(${body})`,
  (body) => `bash -c '${body}'`,
  (body) => `sh -c '${body}'`,
  (body) => `zsh -c '${body}'`,
  (body) => `${body} | cat`,
  (body) => `${body} & wait`,
  (body) => `true |& ${body}`,
]
for (const wrap of isolatedDirectoryBodies) {
  for (const [command, cwd, expected] of [
    [`${wrap(`cd ${root}`)}; touch package.json`, installedPackage, true],
    [`cd ${installedPackage}; ${wrap(`cd ${root}`)}; touch package.json`, root, true],
    [`${wrap(`cd ${root}`)}; cd ${installedPackage}; touch package.json`, root, true],
    [`cd ${installedPackage}; ${wrap("touch package.json")}`, root, true],
    [`${wrap("touch package.json")}; cd ${installedPackage}`, root, false],
    [`${wrap(`cd ${installedPackage}`)}; touch package.json`, root, false],
  ]) T(`dependency scope: ${command}`, blocks(checkDependencyCommand(command, { cwd })), expected)
  const resolveRemoteUrl = byTextDirectory((directory) => directory === root ? "https://example.invalid/other.git" : "https://example.invalid/orbit-ui-mobile.git")
  for (const [command, cwd, expected] of [
    [`${wrap(`cd ${root}`)}; git push origin main`, installedPackage, true],
    [`cd ${installedPackage}; ${wrap(`cd ${root}`)}; git push origin main`, root, true],
    [`${wrap(`cd ${root}`)}; cd ${installedPackage}; git push origin main`, root, true],
    [`cd ${installedPackage}; ${wrap("git push origin main")}`, root, true],
    [`${wrap("git push origin main")}; cd ${installedPackage}`, root, false],
    [`${wrap(`cd ${installedPackage}`)}; git push origin main`, root, false],
    // A body that the subset does not model is refused wherever its push goes.
  ]) T(`git scope: ${command}`, blocks(checkGitCommand(command, { cwd, resolveRemoteUrl })), expected || !isModelled(command))
}
T("subset: the isolated bodies that the subset models", isolatedDirectoryBodies.map((wrap) => isModelled(wrap("true"))), [true, false, false, false, false, false, true, false, false])
T("dependency scope: eval changes the parent directory", blocks(dependencyCommand("eval 'cd node_modules/react-native'; touch package.json")), true)
T("dependency scope: eval can leave the installed package", checkDependencyCommand(`eval 'cd ${root}'; touch package.json`, { cwd: installedPackage }), null)
const scopeRemote = byTextDirectory((directory) => directory === root ? "https://example.invalid/other.git" : "https://example.invalid/orbit-ui-mobile.git")
T("git scope: eval changes the parent directory", blocks(checkGitCommand(`eval 'cd ${installedPackage}'; git push origin main`, { cwd: root, resolveRemoteUrl: scopeRemote })), true)
T("git scope: eval is not modelled, also when it leaves a protected repository", checkGitCommand(`eval 'cd ${root}'; git push origin main`, { cwd: installedPackage, resolveRemoteUrl: scopeRemote })?.notModelled.includes("the builtin `eval`"), true)
T("git scope: a plain cd can leave a protected repository", checkGitCommand(`cd ${root}; git push origin main`, { cwd: installedPackage, resolveRemoteUrl: scopeRemote }), null)
const interpreterReads = [
  `node -e 'require("fs").readFileSync("node_modules/js-yaml/package.json", "utf8")'`,
  `node -e 'require("node_modules/js-yaml/package.json")'`,
  `node -e 'require("fs").promises.readFile("node_modules/js-yaml/package.json", "utf8")'`,
  `python -c 'print(open("node_modules/js-yaml/package.json").read())'`,
  `python3 -c 'print(open("node_modules/pkg/file", mode="r").read())'`,
  `perl -e 'open(my $f, "<", "node_modules/pkg/file"); print <$f>'`,
  "node -e 'require(\"fs\").readFileSync(`node_modules/pkg/file`, \"utf8\")'",
  "node -e 'require(\"fs\").openSync(`node_modules/pkg/file`, \"r\")'",
  "node -e 'require(\"fs\").copyFileSync(`node_modules/pkg/file`, `report.txt`)'",
  `python3 -c 'from pathlib import Path; print(Path("node_modules/js-yaml/package.json").read_text())'`,
  `node -e 'require("fs").writeFileSync("report.txt", "node_modules/js-yaml/package.json")'`,
  `python3 -c 'open("report.txt", mode="w").write("node_modules/pkg/file")'`,
  `perl -e 'open(my $f, ">", "report.txt"); print $f "node_modules/pkg/file"'`,
  "node -e 'require(\"fs\").writeFileSync(`report.txt`, \"node_modules/pkg/file\")'",
  `node -e 'const fs = require("fs"); fs.readFileSync("node_modules/js-yaml/package.json"); fs.writeFileSync("report.txt", "ok")'`,
]
for (const command of interpreterReads) T(`dependency interpreter read: ${command}`, dependencyCommand(command), null)
const interpreterWrites = [
  `node -e 'require("fs").writeFileSync("node_modules/js-yaml/package.json", "edited")'`,
  `node -e 'require("fs").openSync("node_modules/js-yaml/package.json", "w")'`,
  `python -c 'open("node_modules/js-yaml/package.json", "w").write("edited")'`,
  `python3 -c 'open("node_modules/pkg/file", mode="w").write("x")'`,
  `python3 -c 'open("node_modules/pkg/file", mode = "r+").write("x")'`,
  `perl -e 'open(my $f, ">", "node_modules/pkg/file"); print $f "x"'`,
  `perl -e 'open(my $f, "+<", "node_modules/pkg/file"); print $f "x"'`,
  "node -e 'require(\"fs\").writeFileSync(`node_modules/pkg/file`, \"x\")'",
  "node -e 'require(\"fs\").openSync(`node_modules/pkg/file`, \"w\")'",
  "node -e 'require(\"fs\").copyFileSync(`report.txt`, `node_modules/pkg/file`)'",
  "node -e 'require(\"fs\").renameSync(`report.txt`, `node_modules/pkg/file`)'",
  "node -e 'require(\"fs\").renameSync(`node_modules/pkg/file`, `report.txt`)'",
  `python3 -c 'from pathlib import Path; Path("node_modules/js-yaml/package.json").write_text("edited")'`,
  `bash -c 'true' > node_modules/js-yaml/package.json`,
  `eval 'true' > node_modules/js-yaml/package.json`,
]
for (const command of interpreterWrites) T(`dependency interpreter write: ${command}`, blocks(dependencyCommand(command)), true)
T("dependency scope: eval redirects before changing its directory", blocks(checkDependencyCommand(`eval 'cd ${root}' > package.json`, { cwd: installedPackage })), true)
for (const command of [
  "echo true > node_modules/react-native/flags.kt",
  'sed -i "s/false/true/" node_modules/react-native/flags.kt',
  "tee node_modules/react-native/flags.kt",
  "cp /tmp/flags.kt node_modules/react-native/flags.kt",
  "npx patch-package react-native",
  "npx -y patch-package react-native",
  "npx --yes patch-package react-native",
  "npm exec -- patch-package",
  "npm exec -y patch-package",
  "sudo -E npx patch-package",
  "time npx -y patch-package",
  "npx patch-package@latest react-native",
  "npx -p patch-package patch-package",
  "pnpm dlx -y patch-package",
  "Set-Content -Path node_modules/react-native/flags.kt -Value true",
  "Copy-Item C:\\tmp\\flags.kt node_modules/react-native/flags.kt",
]) {
  T(`dependency-write: ${command} blocks`, blocks(dependencyCommand(command)), true)
}
// The documented repair is a delete plus an install, so refusing it would leave a poisoned tree
// with no sanctioned way out. Reading a dependency is the behaviour the rule asks for.
for (const command of [
  "rm -rf node_modules/react-native",
  "npm install",
  "npm ci",
  "cat node_modules/react-native/flags.kt",
  "grep -rn enableImperativeFocus node_modules/react-native",
  "cp node_modules/react-native/flags.kt /tmp/flags.kt",
  "Copy-Item node_modules/react-native/flags.kt C:\\tmp\\flags.kt",
  "node tools/check-dependency-edits.mjs > report.txt",
  "npm test 2>&1",
  // Reading or naming the tool is not running it, so the refusal must not reach a grep over this
  // guard's own source or an ordinary install.
  "grep -rn patch-package .claude/hooks",
  "npm install --save-dev some-other-tool",
]) {
  T(`dependency-write: ${command} allows`, dependencyCommand(command), null)
}
// Prose ABOUT the ban is not the ban being broken, the same distinction rules-git and rules-worker
// already draw for a commit message.
T(
  "dependency-write: a commit message naming the redirect allows",
  dependencyCommand('git commit -m "forbid echo x > node_modules/react-native/flags.kt"'),
  null,
)
T(
  "dependency-write: a heredoc body naming the redirect allows",
  dependencyCommand("git commit -F - <<'EOF'\nnever write > node_modules/react-native/flags.kt\nEOF"),
  null,
)
T("dependency-write: the refusal names the repair that works", dependencyCommand("tee node_modules/react-native/flags.kt")?.message.includes("rm -rf node_modules/<package>"), true)

console.log("\n# require-wake-source (_lib/rules-sleep.mjs)")
const alive = () => true
const dead = () => false
const sleeping = { sessionId: "s1", sleep: true, remaining: ["ORB-2", "ORB-3"] }
const stop = (options) => checkSleepStop({ sessionId: "s1", isWakeSourceAlive: dead, ...options })
T("sleep-stop: work remaining and no live wake source blocks", blocks(stop({ state: sleeping })), true)
T("sleep-stop: the refusal names admission and CI waiting", stop({ state: sleeping })?.message.includes("tools/run-status.mjs --session") && stop({ state: sleeping })?.message.includes("admission gate") && stop({ state: sleeping })?.message.includes("tools/wait-ci.mjs"), true)
T("sleep-stop: a live wake source allows", checkSleepStop({ state: sleeping, wakeSources: [{ pid: 1 }], sessionId: "s1", isWakeSourceAlive: alive }), null)
// A leaked file from a crashed launcher is not a wake source, which is why liveness is checked at
// all rather than the file's existence being trusted.
T("sleep-stop: a registered but DEAD wake source is not one", blocks(stop({ state: sleeping, wakeSources: [{ pid: 1 }] })), true)
T("sleep-stop: a dead launcher with a live worker is reported separately",
  checkSleepStop({ state: sleeping, orphanedWakeSources: [{ pid: 100, workerPid: 200 }], sessionId: "s1", isWakeSourceAlive: dead })?.message.includes("orphaned worker pid 200"), true)
T("sleep-stop: an exhausted queue allows", checkSleepStop({ state: { ...sleeping, remaining: [] }, sessionId: "s1", isWakeSourceAlive: dead }), null)
T("auto-work: empty queue still requires a wake source", blocks(stop({ state: { ...sleeping, remaining: [], autoWork: true } })), true)
T("auto-work: disabled mode restores queue exhaustion", checkSleepStop({ state: { ...sleeping, remaining: [], autoWork: false }, sessionId: "s1", isWakeSourceAlive: dead }), null)
const salvaged = { ...sleeping, remaining: [], pullRequests: [{ repositoryKey: "ui", prNumber: 690, receiptPath: "C:/receipt.json" }] }
T("sleep-stop: an open pull request with no READY receipt blocks the queue from reading as done", blocks(stop({ state: salvaged })), true)
T("sleep-stop: the refusal names the repository-qualified pull request and receipt debt", stop({ state: salvaged })?.message.includes("ui#690") && stop({ state: salvaged })?.message.includes("READY final-head receipt"), true)
T("sleep-stop: a live worker allows the turn to end", checkSleepStop({ state: salvaged, wakeSources: [{ pid: 1 }], sessionId: "s1", isWakeSourceAlive: alive }), null)
T("sleep-stop: bare PR numbers are invalid run state and cannot clear readiness", blocks(stop({ state: { ...sleeping, remaining: [], pullRequests: [690] } })), true)
T("sleep-stop: an append-only ledger survives a cleared pullRequests list", blocks(stop({ state: { ...sleeping, remaining: [], pullRequests: [], readinessLedger: salvaged.pullRequests } })), true)
T("sleep-stop: a mechanically READY ledger permits queue completion", checkSleepStop({ state: { ...sleeping, remaining: [], pullRequests: [], readinessLedger: salvaged.pullRequests }, sessionId: "s1", isWakeSourceAlive: dead, receiptVerdict: () => "READY" }), null)
T("sleep-stop: nothing remaining and no pull requests allows", checkSleepStop({ state: { ...sleeping, remaining: [], pullRequests: [] }, sessionId: "s1", isWakeSourceAlive: dead }), null)
T("sleep-stop: a run that is not --sleep allows", checkSleepStop({ state: { ...sleeping, sleep: false }, sessionId: "s1", isWakeSourceAlive: dead }), null)
T("sleep-stop: no record at all allows", checkSleepStop({ state: null, sessionId: "s1", isWakeSourceAlive: dead }), null)
// A record from a previous run must never block today's session, and the session id is exact.
T("sleep-stop: a record from another session allows", checkSleepStop({ state: sleeping, sessionId: "s2", isWakeSourceAlive: dead }), null)
// A blocked stop that blocks again is an infinite loop.
T("sleep-stop: the second pass never blocks again", checkSleepStop({ state: sleeping, sessionId: "s1", stopHookActive: true, isWakeSourceAlive: dead }), null)

const blockedEntry = { repositoryKey: "ui", prNumber: 698, receiptPath: "C:/receipt.json", receiptWritten: true, blocker: "SonarCloud new-code coverage 66.7% on a deletion-only diff" }
const blockedRun = { ...sleeping, remaining: [], pullRequests: [], readinessLedger: [blockedEntry] }
T("sleep-stop: a pull request with a RECORDED blocker may end the run", blocks(stop({ state: blockedRun })), false)
T("sleep-stop: the blocked ending is reported as BLOCKED, never as finished", stop({ state: blockedRun })?.terminal, "BLOCKED")
T("sleep-stop: the BLOCKED banner names the pull request and its blocker", stop({ state: blockedRun })?.message.includes("ui#698") && stop({ state: blockedRun })?.message.includes("SonarCloud"), true)
// Without the recorded blocker the very same entry still blocks, which is what keeps the state honest.
T("sleep-stop: the same entry with NO recorded blocker still blocks the stop", blocks(stop({ state: { ...blockedRun, readinessLedger: [{ ...blockedEntry, blocker: null }] } })), true)
T("sleep-stop: an empty blocker string is not a blocker", blocks(stop({ state: { ...blockedRun, readinessLedger: [{ ...blockedEntry, blocker: "" }] } })), true)
const pressureRun = (blocker) => ({ ...blockedRun, readinessLedger: [{ ...blockedEntry, blocker }] })
for (const blocker of [
  "BLOCKED ON MACHINE MEMORY: the low-memory guard reaped the worker mid-round, 5.6 GB free of 32 GB",
  "stopped because the system is running low on memory",
  "worker killed, out of memory",
  "the background shell was reaped while the session was idle",
  "ENOSPC writing the build output",
]) {
  T(`sleep-stop: a machine-resource blocker never ends the run (${blocker.slice(0, 28)})`, blocks(stop({ state: pressureRun(blocker) })), true)
}
T("sleep-stop: the machine-pressure refusal says to use fewer workers rather than to stop", stop({ state: pressureRun("reaped for low memory") })?.message.includes("FEWER WORKERS"), true)
T("sleep-stop: the machine-pressure refusal names the pull request carrying it", stop({ state: pressureRun("reaped for low memory") })?.message.includes("ui#698"), true)
// And a real external limit still ends the run, or the rule above would have eaten the honest ending.
T("sleep-stop: an exhausted allowance is still a legitimate blocker", blocks(stop({ state: pressureRun("Codex and Pullfrog share one OpenAI allowance and it is exhausted until 2026-09-22") })), false)
T("sleep-stop: a review verdict is still a legitimate blocker", blocks(stop({ state: pressureRun("REQUEST CHANGES at f07ddcaf, two false body sentences") })), false)
// A finished run must stay silent, or a BLOCKED banner on every ending means nothing.
T("sleep-stop: a genuinely READY queue reports no terminal banner", checkSleepStop({ state: blockedRun, sessionId: "s1", isWakeSourceAlive: dead, receiptVerdict: () => "READY" }), null)
// A live wake source means the TURN is ending, not the RUN. Announcing a final state there would be
// the mirror of the defect: reporting an ending while work is still in flight.
T(
  "sleep-stop: a blocked pull request with a LIVE wake source reports nothing, because the run has not ended",
  checkSleepStop({ state: blockedRun, wakeSources: [{ pid: 1 }], sessionId: "s1", isWakeSourceAlive: alive }),
  null,
)

const mergedEntry = { repositoryKey: "ui", prNumber: 1023, receiptPath: "C:/receipt.json", receiptWritten: true, merged: "0123456789abcdef0123456789abcdef01234567" }
const mergedRun = { ...sleeping, remaining: [], pullRequests: [], readinessLedger: [mergedEntry] }
T("sleep-stop: a pull request merged under the exception ends the run rather than deadlocking it", blocks(stop({ state: mergedRun })), false)
T("sleep-stop: the merged ending is reported as MERGED, never as a plain finish", stop({ state: mergedRun })?.terminal, "MERGED")
T(
  "sleep-stop: the MERGED banner names the pull request and its sha",
  stop({ state: mergedRun })?.message.includes("ui#1023") && stop({ state: mergedRun })?.message.includes(mergedEntry.merged),
  true,
)
// A live wake source means the TURN is ending, not the RUN, so a merged row gets no banner either.
T(
  "sleep-stop: a merged pull request with a LIVE wake source reports nothing, because the run has not ended",
  checkSleepStop({ state: mergedRun, wakeSources: [{ pid: 1 }], sessionId: "s1", isWakeSourceAlive: alive }),
  null,
)
T("sleep-stop: the same row with NO recorded merge sha still blocks the stop", blocks(stop({ state: { ...mergedRun, readinessLedger: [{ ...mergedEntry, merged: null }] } })), true)
T("sleep-stop: an empty merged string is not a merge", blocks(stop({ state: { ...mergedRun, readinessLedger: [{ ...mergedEntry, merged: "" }] } })), true)
T(
  "sleep-stop: the skill's own unfilled merge-sha placeholder is not a merge",
  blocks(stop({ state: { ...mergedRun, readinessLedger: [{ ...mergedEntry, merged: "<merge commit sha once it is merged, or absent>" }] } })),
  true,
)
T("sleep-stop: a bare claim in place of a sha is not a merge", blocks(stop({ state: { ...mergedRun, readinessLedger: [{ ...mergedEntry, merged: "yes" }] } })), true)
// A merge settles its OWN row and no other, or one merged pull request would end a night with work left.
T(
  "sleep-stop: a merged pull request beside a pending one still blocks",
  blocks(stop({ state: { ...mergedRun, readinessLedger: [mergedEntry, { repositoryKey: "ui", prNumber: 1024, receiptPath: "C:/receipt.json", receiptWritten: true }] } })),
  true,
)
// A merged row must not launder a blocked one into a silent finish: the banner still names the blocker.
T(
  "sleep-stop: a merged pull request beside a blocked one still reports BLOCKED, naming only the blocked one",
  ((verdict) => verdict?.terminal === "BLOCKED" && verdict.message.includes("ui#698") && !verdict.message.includes("ui#1023"))(
    stop({ state: { ...mergedRun, readinessLedger: [mergedEntry, blockedEntry] } }),
  ),
  true,
)
// The refusal has to name the way out, or an operator meeting it at 03:00 has no path back.
T("sleep-stop: the refusal names the merged disposition beside the blocker one", stop({ state: salvaged })?.message.includes("`merged` string"), true)
// A merged row's receipt debt is moot: the pull request is closed and the sha is the stronger evidence.
T(
  "sleep-stop: a merged row whose receipt was never written still ends the run",
  blocks(stop({ state: { ...mergedRun, readinessLedger: [{ ...mergedEntry, receiptWritten: false }] } })),
  false,
)
/**
 * The merge-sha rule is written twice, here and in `tools/lib/run-state.mjs`, because this file is
 * a pure rule with no dependency on the tools tree. Two copies of one rule drift, and the drift
 * that matters is the lenient direction: a recorder that accepts a placeholder while the hook
 * rejects it puts the run right back in the deadlock. Pin them to the same literal.
 */
const mergeShaLiteral = "/^[0-9a-f]{7,40}$/"
T("sleep-stop: the merge-sha rule is identical in the Stop hook and in the recorder", {
  rule: readFileSync(join(hooksDir, "_lib", "rules-sleep.mjs"), "utf8").includes(`const MERGE_SHA = ${mergeShaLiteral}`),
  recorder: readFileSync(join(repoRoot, "tools", "lib", "run-state.mjs"), "utf8").includes(`const MERGE_SHA = ${mergeShaLiteral}`),
}, { rule: true, recorder: true })

const unwritten = { ...sleeping, remaining: [], pullRequests: [], readinessLedger: [{ repositoryKey: "ui", prNumber: 699, receiptPath: "C:/never-written.json", receiptWritten: false }] }
T("sleep-stop: a ledger row whose receipt was never written blocks", blocks(stop({ state: unwritten })), true)
T("sleep-stop: the refusal names the receipt path that was never written", stop({ state: unwritten })?.message.includes("C:/never-written.json"), true)
const closedRows = [
  { repositoryKey: "api", prNumber: 535, receiptPath: "C:/535.json", receiptWritten: false, closed: true, blocker: "superseded by merged work" },
  { repositoryKey: "api", prNumber: 579, receiptPath: "C:/579.json", receiptWritten: false, closed: true, blocker: "superseded by another pull request" },
]
const closedRun = { ...sleeping, remaining: [], pullRequests: [], readinessLedger: closedRows }
T("sleep-stop: closed unmerged rows with blockers end BLOCKED", stop({ state: closedRun })?.terminal, "BLOCKED")
T("sleep-stop: the blocked ending names every closed row", closedRows.every((row) => stop({ state: closedRun })?.message.includes(`${row.repositoryKey}#${row.prNumber}: ${row.blocker}`)), true)
T("sleep-stop: an unwritten receipt with a blocker but no closed marker still blocks", blocks(stop({ state: { ...closedRun, readinessLedger: [{ ...closedRows[0], closed: false }] } })), true)
T("sleep-stop: a closed row without a blocker still blocks", blocks(stop({ state: { ...closedRun, readinessLedger: [{ ...closedRows[0], blocker: null }] } })), true)
T("sleep-stop: a nonboolean closed marker cannot excuse an unwritten receipt", blocks(stop({ state: { ...closedRun, readinessLedger: [{ ...closedRows[0], closed: "true" }] } })), true)
T(
  "sleep-stop: a merged row stays exempt beside an unwritten closed row with a blocker",
  ((verdict) => verdict?.terminal === "BLOCKED" && verdict.message.includes("api#535") && !verdict.message.includes("ui#1023"))(
    stop({ state: { ...closedRun, readinessLedger: [{ ...mergedEntry, receiptWritten: false }, closedRows[0]] } }),
  ),
  true,
)
const reopenedCheckout = join(root, "reopened-pull-request")
mkdirSync(join(reopenedCheckout, ".git"), { recursive: true })
writeRunState({ ...sleeping, remaining: [], pullRequests: [closedRows[0]] }, reopenedCheckout)
writeRunState({ ...sleeping, remaining: [], pullRequests: [{ ...closedRows[0], closed: false, blocker: null }] }, reopenedCheckout)
T(
  "sleep-stop: a reopened row without a receipt or blocker refuses the stop again",
  blocks(stop({ state: readRunState(reopenedCheckout) })),
  true,
)

T("git wrapper regression: nested escaped backticks", blocks(checkGitCommand("echo `echo \\`git push origin main\\``")), true)
for (const command of ["(git push origin main)", "$(git push origin main)", "echo `git push origin main`", "bash -c 'git push origin main'", "eval 'git push origin main'", "git commit -nam x", "git -c core.hooksPath=/dev/null commit", "git -c 'core.hooksPath=/dev/null' commit", "git -ccore.hooksPath=/dev/null push origin feature/x", "git -c core.hooksPath=/dev/null push origin feature/x", "git push --all origin", "git push --mirror origin", "git push --branches origin"]) {
  T(`git wrapper regression: ${command}`, blocks(checkGitCommand(command)), true)
}
for (const command of ["npx -y playwright test", "pnpm exec playwright test", "yarn exec playwright test", "npx vite --port 5173", "remix", "curl localhost:3000", "curl 127.0.0.1:3000", "curl '[::1]:3000'"]) {
  T(`worker wrapper regression: ${command}`, blocks(checkWorkerBrowser(command, { env: { ORBIT_LAUNCH_WORKER: "1" } })), true)
}
for (const command of ["cd node_modules/react-native && echo x > flags.kt", "echo x >| node_modules/react-native/flags.kt", "node -e \"require('fs').writeFileSync('node_modules/react-native/x', 'x')\"", "python -c \"open('node_modules/react-native/x', 'w').write('x')\"", "dd of=node_modules/react-native/x", "perl -i -pe 's/x/y/' node_modules/react-native/x"]) {
  T(`dependency wrapper regression: ${command}`, blocks(checkDependencyCommand(command, { cwd: dependencyTree })), true)
}
T("admin merge: repository-id endpoint blocks", blocks(checkAdminMerge("gh api -X PUT repositories/123456/pulls/667/merge")), true)
T("admin merge: nested shell blocks", blocks(checkAdminMerge("bash -c 'gh api -X PUT repositories/123456/pulls/667/merge'")), true)
console.log("\n# forbid-raw-ticket-mutation (_lib/rules-tickets.mjs)")
const TICKET_REPO = "thomasluizon/orbit-tickets"
const CODE_REPO = "thomasluizon/orbit-ui-mobile"
for (const command of ["gh issue close 1 -R $OWNER/orbit-tickets", "gh api -X PATCH repos/$OWNER/orbit-tickets/issues/1", "gh project delete $PROJECT --owner thomasluizon", "gh project delete 2 --owner $OWNER"]) T(`tickets: an unresolved target blocks ${command}`, blocks(checkTicketMutation(command)), true)
T("ticket wrapper regression: nested escaped backticks", blocks(checkTicketMutation("echo `echo \\`gh issue close 1 -R thomasluizon/orbit-tickets\\``")), true)
for (const command of [
  `echo $(gh issue close 1 -R ${TICKET_REPO})`,
  `node tools/x.mjs $(gh issue close 1 -R ${TICKET_REPO})`,
  `node tools/x.mjs \`gh issue close 1 -R ${TICKET_REPO}\``,
  `sh -c 'gh issue close 1 -R ${TICKET_REPO}'`,
  `eval 'gh issue close 1 -R ${TICKET_REPO}'`,
  "gh project delete 2 --owner thomasluizon",
  `gh label clone source/repo --repo ${TICKET_REPO}`,
  "gh api graphql -f query='mutation { addAssigneesToAssignable(input: {assignableId: $i}) { clientMutationId } }'",
  `G=gh; $G issue close 1 -R ${TICKET_REPO}`,
  `$G issue close 1 -R ${TICKET_REPO}`,
  `echo node tools/x.mjs gh issue close 1 -R ${TICKET_REPO}`,
]) T(`ticket wrapper regression: ${command}`, blocks(checkTicketMutation(command)), true)
T("tickets: read-only project view allows", checkTicketMutation("gh project view 2"), null)
T("tickets: read-only issue view allows", checkTicketMutation(`gh issue view 1 -R ${TICKET_REPO}`), null)

T("tickets: issue edit in the ticket repository blocks", blocks(checkTicketMutation(`gh issue edit 215 --repo ${TICKET_REPO} --add-label Bug`)), true)
T("tickets: attached short repo flag still blocks", blocks(checkTicketMutation(`gh issue close 215 -R${TICKET_REPO}`)), true)
T("tickets: host-qualified ticket repository still blocks", blocks(checkTicketMutation(`gh issue delete 215 --repo github.com/${TICKET_REPO} --confirm`)), true)
T("tickets: issue create in the ticket repository blocks", blocks(checkTicketMutation(`gh issue create --repo ${TICKET_REPO} --title x --body y`)), true)
T("tickets: issue comment by ticket URL blocks", blocks(checkTicketMutation(`gh issue comment https://github.com/${TICKET_REPO}/issues/215 --body fixed`)), true)
T("tickets: issue mutation with no target fails closed", blocks(checkTicketMutation("gh issue close 215")), true)
T("tickets: issue edit in a code repository allows", checkTicketMutation(`gh issue edit 12 --repo ${CODE_REPO} --add-label Bug`), null)
T("tickets: issue reads need no target", checkTicketMutation("gh issue list --state open"), null)
T("tickets: every pull request command allows", checkTicketMutation(`gh pr view 12 --repo ${TICKET_REPO}`), null)
T("tickets: ticket board item edit blocks", blocks(checkTicketMutation("gh project item-edit 2 --owner thomasluizon --id PVTI_x --field-id PVTSSF_x --single-select-option-id x")), true)
T("tickets: project item mutation with no owner fails closed", blocks(checkTicketMutation("gh project item-delete 2 --id PVTI_x")), true)
T("tickets: project node-id mutation fails closed", blocks(checkTicketMutation("gh project item-edit --owner thomasluizon --id PVTI_x --field-id x --project-id PVT_x --text value")), true)
T("tickets: @me project owner fails closed", blocks(checkTicketMutation("gh project item-delete 2 --owner @me --id PVTI_x")), true)
T("tickets: another project item mutation allows", checkTicketMutation("gh project item-edit 9 --owner octocat --id PVTI_x --field-id x --text value"), null)
T("tickets: label create in the ticket repository blocks", blocks(checkTicketMutation(`gh label create urgent --repo ${TICKET_REPO}`)), true)
T("tickets: label edit in a code repository allows", checkTicketMutation(`gh label edit bug --repo ${CODE_REPO} --color ff0000`), null)
T("tickets: REST issue mutation in the ticket repository blocks", blocks(checkTicketMutation(`gh api repos/${TICKET_REPO}/issues/215 -X PATCH -f title=x`)), true)
T("tickets: attached REST method and field flags still block", blocks(checkTicketMutation(`gh api repos/${TICKET_REPO}/issues/215 -XPATCH -ftitle=x`)), true)
T("tickets: REST milestone mutation in the ticket repository blocks", blocks(checkTicketMutation(`gh api repos/${TICKET_REPO}/milestones -f title=Launch`)), true)
T("tickets: REST issue read in the ticket repository allows", checkTicketMutation(`gh api repos/${TICKET_REPO}/issues/215`), null)
T("tickets: REST issue mutation in a code repository allows", checkTicketMutation(`gh api repos/${CODE_REPO}/issues/12 -X PATCH -f title=x`), null)
T("tickets: REST mutation with a placeholder target fails closed", blocks(checkTicketMutation("gh api repos/{owner}/{repo}/issues/12 -X PATCH -f title=x")), true)
T("tickets: GraphQL project item mutation fails closed on an opaque node id", blocks(checkTicketMutation("gh api graphql -f query='mutation { deleteProjectV2Item(input: {projectId: $p, itemId: $i}) { deletedItemId } }'")), true)
T("tickets: GraphQL closeIssue fails closed on an opaque node id", blocks(checkTicketMutation("gh api graphql -f query='mutation { closeIssue(input: {issueId: $i}) { issue { id } } }'")), true)
T("tickets: GraphQL addComment fails closed on an opaque subject id", blocks(checkTicketMutation("gh api graphql -f query='mutation { addComment(input: {subjectId: $i, body: $b}) { commentEdge { node { id } } } }'")), true)
T("tickets: opaque GraphQL input fails closed", blocks(checkTicketMutation("gh api graphql --input payload.json")), true)
T("tickets: GraphQL mutation with unproved node ownership blocks", blocks(checkTicketMutation("gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: $i}) { thread { isResolved } } }'")), true)
T("tickets: a repository tool invocation allows", checkTicketMutation("node tools/sync-issue-state.mjs --issue ORB-215 --repo ui --state ready"), null)
T("tickets: the ticket skill milestone read allows", checkTicketMutation(`gh api repos/${TICKET_REPO}/milestones?state=all&per_page=100 --paginate --jq .[].title`), null)
T("tickets: the sanctioned milestone creator allows", checkTicketMutation("node tools/create-milestone.mjs --title Launch --description-file draft.md"), null)
T("tickets: the sanctioned ticket creator allows", checkTicketMutation("node tools/create-ticket.mjs --title x --body-file draft.md --label repo:ui --label Improvement"), null)
T("tickets: the sanctioned existing-ticket project add allows", checkTicketMutation('node tools/add-ticket-to-project.mjs --issue "#221"'), null)
T("tickets: the post-merge completion preflight allows", checkTicketMutation('node tools/complete-ticket.mjs --issue "#221" --preflight'), null)
T("tickets: the post-merge completion write allows", checkTicketMutation('node tools/complete-ticket.mjs --issue "#221"'), null)

/** The endpoint used to be read as the single word after `api`, so any flag placed first made that
 * word `--method` and the guard allowed the mutation. `gh` accepts every one of these shapes. */
T("tickets: a leading long method flag no longer hides the endpoint", blocks(checkTicketMutation(`gh api --method DELETE repos/${TICKET_REPO}/issues/1`)), true)
T("tickets: a leading short method flag no longer hides the endpoint", blocks(checkTicketMutation(`gh api -X DELETE repos/${TICKET_REPO}/issues/1`)), true)
T("tickets: a leading boolean flag no longer hides the endpoint", blocks(checkTicketMutation(`gh api --silent -X PATCH repos/${TICKET_REPO}/issues/1`)), true)
T("tickets: an attached leading method flag no longer hides the endpoint", blocks(checkTicketMutation(`gh api -XDELETE repos/${TICKET_REPO}/issues/1`)), true)
T("tickets: a leading flag before a read is still allowed", checkTicketMutation(`gh api --method GET repos/${TICKET_REPO}/issues/1`), null)
T("tickets: a leading flag before a code-repository write is still allowed", checkTicketMutation(`gh api -X DELETE repos/${CODE_REPO}/issues/1`), null)
T("tickets: an API write with no endpoint at all fails closed", blocks(checkTicketMutation("gh api -X DELETE")), true)
T("tickets: an API write behind a flag of unknown arity fails closed", blocks(checkTicketMutation(`gh api --newflag -X DELETE repos/${CODE_REPO}/issues/1`)), true)
T("tickets: a leading flag before a GraphQL mutation still fails closed", blocks(checkTicketMutation("gh api --silent graphql -f query='mutation { closeIssue(input: {issueId: $i}) { issue { id } } }'")), true)

/** The second fail-open: quote state never recovered, so an unbalanced quote absorbed the rest of
 * the command and the gh invocation inside it was never parsed as its own segment. */
T("tickets: a ticket write after an unbalanced quote blocks", blocks(checkTicketMutation(`echo " ; gh issue edit 5 --repo ${TICKET_REPO} --title "X"`)), true)
T("tickets: a ticket API write after an unbalanced quote blocks", blocks(checkTicketMutation(`echo ' && gh api -X DELETE repos/${TICKET_REPO}/issues/1`)), true)
T("tickets: a balanced-quote ticket write still blocks", blocks(checkTicketMutation(`gh issue edit 5 --repo ${TICKET_REPO} --title "X"`)), true)
T("tickets: an unbalanced quote around a code-repository write still allows", checkTicketMutation(`echo " ; gh issue edit 5 --repo ${CODE_REPO} --title "X"`), null)
T("tickets: an unbalanced quote around a sanctioned tool still allows", checkTicketMutation(`echo " ; node tools/comment-ticket.mjs --issue "#5" --body-file -`), null)

/** gh clusters short flags the POSIX way, so `-iX` is `-i` plus `-X` and `-iFtitle=x` is `-i` plus
 * `-F title=x`. Read raw, `-iX` matched no flag, the method defaulted to GET, and a real DELETE was
 * allowed. The shell also concatenates `g''h` and `\gh` into gh before gh ever runs. */
T("tickets: a clustered short method flag no longer reads as GET", blocks(checkTicketMutation(`gh api -iX DELETE repos/${TICKET_REPO}/issues/1`)), true)
T("tickets: a clustered short field flag no longer reads as GET", blocks(checkTicketMutation(`gh api -iFtitle=x repos/${TICKET_REPO}/issues/215`)), true)
T("tickets: a clustered write against a code repository still allows", checkTicketMutation(`gh api -iX DELETE repos/${CODE_REPO}/issues/1`), null)
T("tickets: a cluster carrying an unclassifiable character fails closed", blocks(checkTicketMutation(`gh api -iZ repos/${TICKET_REPO}/issues/1`)), true)
T("tickets: a lone boolean short flag before a read still allows", checkTicketMutation(`gh api -i repos/${TICKET_REPO}/issues/1`), null)
T("tickets: a quote-concatenated gh api write blocks", blocks(checkTicketMutation(`g''h api -X DELETE repos/${TICKET_REPO}/issues/1`)), true)
T("tickets: a quote-concatenated gh issue write blocks", blocks(checkTicketMutation(`g"h" issue edit 5 --repo ${TICKET_REPO} --title X`)), true)
T("tickets: a backslash-escaped gh write blocks", blocks(checkTicketMutation(`\\gh api -X DELETE repos/${TICKET_REPO}/issues/1`)), true)
T("tickets: an opaque GraphQL payload hidden in a cluster fails closed", blocks(checkTicketMutation("gh api graphql -iFquery=@payload.graphql")), true)
T("tickets: an opaque GraphQL payload behind an attached short flag fails closed", blocks(checkTicketMutation("gh api graphql -Fquery=@payload.graphql")), true)
// A gate that fires on prose gets switched off, so its false-positive rate remains part of its contract.
const tracked = spawnSync("git", ["-C", repoRoot, "ls-files", "*.md", ".claude/*", "tools/*"], { encoding: "utf8" })
const docPaths = (tracked.status === 0 ? tracked.stdout.trim().split(/\r?\n/) : [])
  .filter(Boolean)
  // The adapter exempts the gate's own source, since a rule module must contain
  // the strings it matches on. Mirror that here rather than reporting it.
  .filter((relative) => !relative.startsWith(".claude/hooks/") && !relative.startsWith("tools/"))
  .map((relative) => join(repoRoot, relative))
  .filter((absolute) => existsSync(absolute) && statSync(absolute).isFile())
T("tickets: blocks none of this repo's tracked docs", docPaths.filter((path) => checkTicketMutation(readFileSync(path, "utf8"), { sourcePath: path })?.block).map((path) => path.slice(repoRoot.length + 1)), [])
T("tickets: the doc scan actually read files", docPaths.length > 0, true)

console.log("\n# forbid-ef-migration-raw-index (_lib/rules-source.mjs)")
// EF applies migrations at startup on Render, so raw index SQL must be
// idempotent: a bare CREATE INDEX for an index that already exists throws
// Postgres 42P07 and fails the deploy. Scoped to orbit-api Migrations/*.cs.
const migration = "/x/orbit-api/src/Orbit.Infrastructure/Migrations/20260101_Add.cs"
T("ef-index: a raw CREATE UNIQUE INDEX blocks", blocks(checkEfMigrationRawIndex(migration, 'migrationBuilder.Sql("CREATE UNIQUE INDEX ix_foo ON foo (bar)");')), true)
T("ef-index: a raw DROP INDEX without IF EXISTS blocks", blocks(checkEfMigrationRawIndex(migration, 'migrationBuilder.Sql("DROP INDEX ix_foo");')), true)
T("ef-index: the IF NOT EXISTS form allows", checkEfMigrationRawIndex(migration, 'migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_foo ON foo (bar)");'), null)
T("ef-index: the CreateIndex API call allows", checkEfMigrationRawIndex(migration, 'migrationBuilder.CreateIndex(name: "ix_foo", table: "foo", column: "bar");'), null)
T("ef-index: a file off the migrations path is skipped", checkEfMigrationRawIndex("/x/orbit-api/src/Orbit.Application/Foo.cs", 'migrationBuilder.Sql("CREATE INDEX ix_foo ON foo (bar)");'), null)
// One statement's IF NOT EXISTS must not mask a sibling in the same batched call.
T("ef-index: a batched Sql with one non-idempotent statement blocks", blocks(checkEfMigrationRawIndex(migration, 'migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_b ON foo (b); CREATE INDEX ix_a ON foo (a);");')), true)
T("ef-index: a batched Sql with all idempotent statements allows", checkEfMigrationRawIndex(migration, 'migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_b ON foo (b); CREATE INDEX IF NOT EXISTS ix_a ON foo (a);");'), null)

// PRRT_ id resolved to a live thread on a stranger's public repository and replied there,
// because node ids are globally unique and a wrong one does not fail.
const OBSERVED = "PRRT_kwDOR5Siws6Wfy_V"
const INVENTED = "PRRT_kwDOR5Siws6XdcAt"
const TRAILING_HYPHEN = "PRRT_kwDOR5Siws6d9bF-"
const TRAILING_UNDERSCORE = "PRRT_kwDOR5Siws6d9bF_"
const seen = new Set([OBSERVED])
const invented = (command, options = {}) => checkInventedIdentifier(command, { observedIdentifiers: seen, ...options })
T(
  "identifier: the incident command blocks",
  blocks(invented(`printf 'fixed in %s' "$sha" | node tools/resolve-bot-thread.mjs --thread ${INVENTED} --repo ui --pr 699 || node tools/list-bot-threads.mjs --pr 699 --repo ui`)),
  true,
)
T("identifier: the blocked message names the unknown id", invented(`gh api graphql -f thread=${INVENTED}`)?.message?.includes(INVENTED) === true, true)
T("identifier: an observed id allows", invented(`node tools/resolve-bot-thread.mjs --thread ${OBSERVED} --repo ui --pr 699`), null)
// One known id must not launder an unknown one in the same command.
T("identifier: a known id beside an unknown one still blocks", blocks(invented(`gh api graphql -f a=${OBSERVED} -f b=${INVENTED}`)), true)
T("identifier: only the unknown id is named", invented(`gh api graphql -f a=${OBSERVED} -f b=${INVENTED}`)?.message?.includes(OBSERVED) === true, false)
// An id in text is not a target. A guard that fired on grep or an editor would be bypassed by habit.
T("identifier: an id in a command that cannot reach GitHub allows", invented(`grep -n ${INVENTED} notes.md`), null)
T("identifier: a gh command with no id at all allows", invented("gh pr view 699 --repo thomasluizon/orbit-ui-mobile"), null)
// Ordinary upper-case shell words share the prefixes and are not node ids.
T("identifier: PR_NUMBER is not a node id", extractNodeIds("gh pr view $PR_NUMBER"), [])
T("identifier: IC_CONFIG is not a node id", extractNodeIds("gh api $IC_CONFIG"), [])
T("identifier: a short body is not a node id", extractNodeIds("gh api PRRT_abc"), [])
T("identifier: an ordinary node id is extracted once, deduped", extractNodeIds(`gh api ${INVENTED} ${INVENTED}`), [INVENTED])
T("identifier: a node id ending in a hyphen is extracted whole", extractNodeIds(`gh api ${TRAILING_HYPHEN}`), [TRAILING_HYPHEN])
T("identifier: a node id ending in an underscore is extracted whole", extractNodeIds(`gh api ${TRAILING_UNDERSCORE}`), [TRAILING_UNDERSCORE])
T(
  "identifier: an unobserved node id ending in a hyphen is refused whole",
  invented(`gh api graphql -f thread=${TRAILING_HYPHEN}`)?.message?.includes(TRAILING_HYPHEN) === true,
  true,
)
T("identifier: PR_ and IC_ shapes are guarded too", extractNodeIds("gh api PR_kwDOR5Siws6abc IC_kwDOR5Siws6def").length, 2)
T("identifier: an empty command allows", invented(""), null)
T(
  "identifier: an id quoted inside a heredoc body allows",
  invented(`node .claude/skills/second-opinion/second-opinion.mjs <<'F'\nthe incident passed --thread ${INVENTED} to tools/resolve-bot-thread.mjs\nF`),
  null,
)
T(
  "identifier: the same id on the COMMAND LINE beside a heredoc still blocks",
  blocks(invented(`node tools/resolve-bot-thread.mjs --thread ${INVENTED} --repo ui --pr 699 <<'F'\nfixed in abc\nF`)),
  true,
)

console.log("\n# pending lessons (_lib/rules-lessons.mjs)")
const datedEntry = (date, lesson) => `## ${date} - ${lesson}`
T("lessons: one dated entry before Graduated is pending", countUnreviewedPendingLessons([
  "# Pending lessons",
  datedEntry("2026-09-10", "first lesson"),
  "## Graduated",
].join("\n")), 1)
T("lessons: an undated candidate before Graduated is pending", countUnreviewedPendingLessons([
  "# Pending lessons",
  "## Keep the hook and producer in sync",
  "- Trigger: lesson staging",
  "## Graduated",
].join("\n")), 1)
T("lessons: a promoted or removed undated candidate is not pending", countUnreviewedPendingLessons([
  "# Pending lessons",
  "## Graduated",
  "## Keep the hook and producer in sync",
].join("\n")), 0)
T("lessons: several dated entries before Graduated are pending", countUnreviewedPendingLessons([
  datedEntry("2026-09-10", "first lesson"),
  "details",
  datedEntry("2026-09-11", "second lesson"),
  "## Graduated",
].join("\n")), 2)
T("lessons: entries after Graduated are ignored", countUnreviewedPendingLessons([
  "## Graduated",
  datedEntry("2026-09-10", "already reviewed"),
].join("\n")), 0)
T("lessons: DROPPED and Original entry headings are ignored", countUnreviewedPendingLessons([
  "## DROPPED 2026-09-10 - rejected lesson",
  "### Original entry",
  "## Graduated",
].join("\n")), 0)
T("lessons: without Graduated the whole file is pending", countUnreviewedPendingLessons([
  datedEntry("2026-09-10", "first lesson"),
  datedEntry("2026-09-11", "second lesson"),
].join("\n")), 2)
T("lessons: an empty file has no pending entries", countUnreviewedPendingLessons(""), 0)
T("lessons: the title alone has no pending entries", countUnreviewedPendingLessons("# Pending lessons\n"), 0)
T("lessons: the real pending-lessons.md parses", Number.isInteger(countUnreviewedPendingLessons(
  readFileSync(join(repoRoot, ".claude", "pending-lessons.md"), "utf8"),
)), true)
const DRIFT_TODAY = new Date("2026-09-12T12:00:00.000Z")
T("lessons: absent drift state is overdue", isDriftReviewOverdue(undefined, DRIFT_TODAY), true)
T("lessons: today's drift state is current", isDriftReviewOverdue('{"lastRun":"2026-09-12"}', DRIFT_TODAY), false)
T("lessons: state from eight days ago is overdue", isDriftReviewOverdue('{"lastRun":"2026-09-04"}', DRIFT_TODAY), true)
T("lessons: malformed drift state is overdue", isDriftReviewOverdue("not json", DRIFT_TODAY), true)
T("lessons: invalid drift state is overdue", isDriftReviewOverdue('{"lastRun":"2026-02-30"}', DRIFT_TODAY), true)

// ---------------------------------------------------------------------------
// 3. The real hook files: stdin payload in, exit code out
// ---------------------------------------------------------------------------
console.log("\n# hook adapters (real files, real exit codes)")
const runHookResult = (file, input, env) =>
  spawnSync(process.execPath, [join(hooksDir, file)], {
    input,
    encoding: "utf8",
    env: { ...process.env, ORBIT_LAUNCH_WORKER: "", ...env },
  })
const runHook = (file, payload, env) => runHookResult(file, JSON.stringify(payload), env).status
for (const hook of ["git-guardrails", "orchestrator-guardrails", "forbid-invented-identifier", "forbid-worker-browser", "forbid-node-modules-write", "forbid-approval-prompt", "forbid-raw-ticket-mutation", "forbid-ef-migration-raw-index", "require-handoff-prompt", "require-wake-source", "forbid-superseded-session"]) {
  const result = runHookResult(`${hook}.mjs`, "not json")
  T(`adapter ${hook}: malformed stdin blocks`, result.status, 2)
  T(`adapter ${hook}: failure identifies the hook`, result.stderr.includes(hook), true)
}
for (const hook of ["surface-pending-lessons", "record-handoff-request", "relay-at-threshold", "offer-stale-cleanup"]) {
  T(`reminder ${hook}: malformed stdin allows`, runHookResult(`${hook}.mjs`, "not json").status, 0)
}
const bash = (command, cwd = root) => ({ tool_name: "Bash", tool_input: { command }, cwd })
const powershell = (command, cwd = root) => ({ tool_name: "PowerShell", tool_input: { command }, cwd })
// The Monitor tool input of Claude Code 2.1.325: `description`, `timeout_ms`, `persistent`, and `command` or `ws`.
const monitor = (command, cwd = root) => ({ tool_name: "Monitor", tool_input: { command, description: "Watch the run", timeout_ms: 300000, persistent: false }, cwd })
const monitorSocket = { tool_name: "Monitor", tool_input: { ws: { url: "wss://events.example.com/stream" }, description: "Events", timeout_ms: 300000, persistent: false }, cwd: root }
/** One command as a Bash payload and as a Monitor payload. It records the guard, so a guard with no Monitor case fails below. */
const monitorRefusalGuards = new Set()
const bashAndMonitor = (file, command, { cwd = root, env, extra = {} } = {}) => {
  monitorRefusalGuards.add(file)
  return [runHook(file, { ...bash(command, cwd), ...extra }, env), runHook(file, { ...monitor(command, cwd), ...extra }, env)]
}
for (const file of BASH_GUARDS) T(`adapter ${file}: a Monitor that opens a WebSocket has no command -> 0`, runHook(file, monitorSocket), 0)
const STALE_TEXT = "forbid-stale-text.mjs"
const plantedOwner = ["Tho", "mas"].join("")
T("adapter timeless: a new owner attribution -> 2", runHook(STALE_TEXT, {
  hook_event_name: "PreToolUse",
  tool_name: "Write",
  tool_input: { file_path: join(repoRoot, "timeless-hook-probe.md"), content: `Ask ${plantedOwner}.\n` },
  cwd: repoRoot,
}), 2)
T("adapter timeless: an Edit before it lands -> 0", runHook(STALE_TEXT, {
  hook_event_name: "PreToolUse",
  tool_name: "Edit",
  tool_input: { file_path: join(repoRoot, "CLAUDE.md"), old_string: "# Orbit", new_string: plantedOwner },
  cwd: repoRoot,
}), 0)
T("adapter timeless: a scratchpad write -> 0", runHook(STALE_TEXT, {
  hook_event_name: "PreToolUse",
  tool_name: "Write",
  tool_input: { file_path: join(root, "scratchpad.md"), content: `Ask ${plantedOwner}.\n` },
  cwd: repoRoot,
}), 0)

const LESSONS_HOOK = "surface-pending-lessons.mjs"
const DRIFT_REVIEW_REMINDER = "Workflow drift review is overdue. Run /drift-review."
const lessonsFixtureRoot = join(root, "lessons-project")
const lessonsFixtureFile = join(lessonsFixtureRoot, ".claude", "pending-lessons.md")
const driftStateFixtureFile = join(lessonsFixtureRoot, ".claude", "drift-review-state.json")
mkdirSync(dirname(lessonsFixtureFile), { recursive: true })
const runLessonsHook = (input) => runHookResult(LESSONS_HOOK, input, { CLAUDE_PROJECT_DIR: lessonsFixtureRoot })
const isWellFormedLessonsReminder = (output) =>
  /^\d+ unreviewed pending lessons? in \.claude\/pending-lessons\.md\. Review (?:it|them) with \/lesson\.$/.test(output)
const isCombinedLessonsReminder = (output) => {
  const driftSuffix = `\n${DRIFT_REVIEW_REMINDER}`
  return output.endsWith(driftSuffix) && isWellFormedLessonsReminder(output.slice(0, -driftSuffix.length))
}
const isContentIndependentLessonsResult = (result) => ({
  status: result.status,
  stderr: result.stderr,
  output: result.stdout === ""
    || isWellFormedLessonsReminder(result.stdout)
    || result.stdout === DRIFT_REVIEW_REMINDER
    || isCombinedLessonsReminder(result.stdout),
})
const validReminderShapes = {
  lessonsOnly: "1 unreviewed pending lesson in .claude/pending-lessons.md. Review it with /lesson.",
  driftOnly: DRIFT_REVIEW_REMINDER,
  combined: `1 unreviewed pending lesson in .claude/pending-lessons.md. Review it with /lesson.\n${DRIFT_REVIEW_REMINDER}`,
}
T("adapter lessons: the content-independent validator accepts every valid reminder shape", {
  lessonsOnly: isContentIndependentLessonsResult({ status: 0, stderr: "", stdout: validReminderShapes.lessonsOnly }).output,
  driftOnly: isContentIndependentLessonsResult({ status: 0, stderr: "", stdout: validReminderShapes.driftOnly }).output,
  combined: isContentIndependentLessonsResult({ status: 0, stderr: "", stdout: validReminderShapes.combined }).output,
}, { lessonsOnly: true, driftOnly: true, combined: true })
writeFileSync(driftStateFixtureFile, JSON.stringify({ lastRun: new Date().toISOString().slice(0, 10) }))
writeFileSync(lessonsFixtureFile, [
  "# Pending lessons",
  datedEntry("2026-09-10", "first lesson"),
  "## Graduated",
].join("\n"))
const oneSurfacedLesson = runLessonsHook("{}")
T("adapter lessons: one pending entry emits one line with the count and action", {
  lines: oneSurfacedLesson.stdout.split(/\r?\n/).length,
  count: oneSurfacedLesson.stdout.includes("1"),
  action: oneSurfacedLesson.stdout.includes("/lesson"),
}, { lines: 1, count: true, action: true })
writeFileSync(lessonsFixtureFile, [
  "# Pending lessons",
  "## Keep the hook and producer in sync",
  "- Trigger: lesson staging",
  "## Graduated",
].join("\n"))
const undatedSurfacedLesson = runLessonsHook("{}")
T("adapter lessons: an undated candidate emits a reminder", undatedSurfacedLesson.stdout, validReminderShapes.lessonsOnly)
writeFileSync(lessonsFixtureFile, [
  "# Pending lessons",
  datedEntry("2026-09-10", "first lesson"),
  datedEntry("2026-09-11", "second lesson"),
  "## Graduated",
].join("\n"))
const surfacedLessons = runLessonsHook("{}")
T("adapter lessons: two pending entries exit 0", surfacedLessons.status, 0)
T("adapter lessons: two pending entries emit no stderr", surfacedLessons.stderr, "")
T("adapter lessons: output names the count and file", {
  count: surfacedLessons.stdout.includes("2"),
  file: surfacedLessons.stdout.includes("pending-lessons.md"),
}, { count: true, file: true })
T("adapter lessons: output is one plain-text reminder", isWellFormedLessonsReminder(surfacedLessons.stdout), true)
const malformedInputLessons = runLessonsHook("not json")
T("adapter lessons: malformed stdin exits 0 and emits nothing", {
  status: malformedInputLessons.status, stdout: malformedInputLessons.stdout, stderr: malformedInputLessons.stderr,
}, { status: 0, stdout: "", stderr: "" })
writeFileSync(lessonsFixtureFile, [
  "# Pending lessons",
  "## DROPPED 2026-09-10 - rejected lesson",
  "## Graduated",
  "## Already promoted lesson",
].join("\n"))
const silentLessons = runLessonsHook("{}")
T("adapter lessons: reviewed and dropped entries exit 0", silentLessons.status, 0)
T("adapter lessons: reviewed and dropped entries emit nothing", { stdout: silentLessons.stdout, stderr: silentLessons.stderr }, { stdout: "", stderr: "" })
rmSync(lessonsFixtureFile)
const absentLessons = runLessonsHook("{}")
T("adapter lessons: an absent file exits 0 and emits nothing", {
  status: absentLessons.status, stdout: absentLessons.stdout, stderr: absentLessons.stderr,
}, { status: 0, stdout: "", stderr: "" })
mkdirSync(lessonsFixtureFile)
const malformedLessons = runLessonsHook("{}")
T("adapter lessons: an unreadable file exits 0 and emits nothing", {
  status: malformedLessons.status, stdout: malformedLessons.stdout, stderr: malformedLessons.stderr,
}, { status: 0, stdout: "", stderr: "" })
rmSync(lessonsFixtureFile, { recursive: true })
writeFileSync(lessonsFixtureFile, "# Pending lessons\n## Graduated\n")
const realFileLessons = runHookResult(LESSONS_HOOK, "{}", { CLAUDE_PROJECT_DIR: repoRoot })
T("adapter lessons: the real file result is content-independent", isContentIndependentLessonsResult(realFileLessons), {
  status: 0, stderr: "", output: true,
})
const realLessons = readFileSync(join(repoRoot, ".claude", "pending-lessons.md"), "utf8")
const stagedRealLessons = /^## Graduated\r?$/m.test(realLessons)
  ? realLessons.replace(/^## Graduated\r?$/m, `${datedEntry("2099-12-31", "staged harness proof")}\n## Graduated`)
  : `${realLessons}\n${datedEntry("2099-12-31", "staged harness proof")}\n`
writeFileSync(lessonsFixtureFile, stagedRealLessons)
const stagedRealFileLessons = runLessonsHook("{}")
T("adapter lessons: the real file with a staged entry emits one well-formed line", {
  status: stagedRealFileLessons.status,
  stderr: stagedRealFileLessons.stderr,
  output: isWellFormedLessonsReminder(stagedRealFileLessons.stdout),
}, { status: 0, stderr: "", output: true })
const fallbackLessons = runHookResult(LESSONS_HOOK, "{}", { CLAUDE_PROJECT_DIR: "" })
T(
  "adapter lessons: an empty project environment falls back to the hook location",
  isContentIndependentLessonsResult(fallbackLessons),
  { status: 0, stderr: "", output: true },
)

writeFileSync(lessonsFixtureFile, "# Pending lessons\n## Graduated\n")
rmSync(driftStateFixtureFile)
const absentDriftState = runLessonsHook("{}")
T("adapter lessons: absent drift state emits the overdue line", absentDriftState.stdout, "Workflow drift review is overdue. Run /drift-review.")
writeFileSync(driftStateFixtureFile, JSON.stringify({ lastRun: new Date().toISOString().slice(0, 10) }))
const currentDriftState = runLessonsHook("{}")
T("adapter lessons: current drift state emits nothing", { status: currentDriftState.status, stdout: currentDriftState.stdout }, { status: 0, stdout: "" })
const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
writeFileSync(driftStateFixtureFile, JSON.stringify({ lastRun: eightDaysAgo }))
const overdueDriftState = runLessonsHook("{}")
T("adapter lessons: eight-day-old drift state emits the overdue line", overdueDriftState.stdout, "Workflow drift review is overdue. Run /drift-review.")
writeFileSync(driftStateFixtureFile, "not json")
const malformedDriftState = runLessonsHook("{}")
T("adapter lessons: malformed drift state exits 0 and emits the overdue line", {
  status: malformedDriftState.status, stdout: malformedDriftState.stdout, stderr: malformedDriftState.stderr,
}, { status: 0, stdout: "Workflow drift review is overdue. Run /drift-review.", stderr: "" })

T("adapter git-guardrails: push main -> 2", runHook("git-guardrails.mjs", bash("git push origin main")), 2)
T("adapter git-guardrails: the same push from Bash and from Monitor -> 2, 2", bashAndMonitor("git-guardrails.mjs", "git push origin main"), [2, 2])
T("adapter git-guardrails: push feature -> 0", runHook("git-guardrails.mjs", bash("git push origin feature/x")), 0)
T("adapter git-guardrails: a grep for the flag that skips the hooks -> 0", runHook("git-guardrails.mjs", bash(`grep -rn -- '${NV}' .claude/hooks`)), 0)
T("adapter git-guardrails: a push to main in a here-string with a $\"...\" quote -> 2", runHook("git-guardrails.mjs", bash('bash <<<$"git push origin main"')), 2)
T("adapter git-guardrails: worktree remove --force -> 2", runHook("git-guardrails.mjs", bash("git worktree remove --force .claude/worktrees/x")), 2)
// git applies each `-C` word with `chdir`, which follows a symlink before it reads `..`. The fixture: a repository with no protection that
// holds a symlink to a directory of a protected repository. The adapter reads the remote with real git, attended and in an unattended run.
const symlinkFixture = join(root, "git-symlink")
const protectedCheckout = join(symlinkFixture, "orbit-ui-mobile")
const openCheckout = join(symlinkFixture, "brain")
for (const [checkout, url] of [[protectedCheckout, "https://github.com/thomasluizon/orbit-ui-mobile.git"], [openCheckout, "https://github.com/thomasluizon/brain.git"]]) {
  mkdirSync(join(checkout, "apps"), { recursive: true })
  spawnSync("git", ["init", "-q", checkout])
  spawnSync("git", ["-C", checkout, "remote", "add", "origin", url])
}
const linkToProtected = join(openCheckout, "link")
symlinkSync(join(protectedCheckout, "apps"), linkToProtected, "junction")
const fromOpenCheckout = (command, env) => runHook("git-guardrails.mjs", bash(command, openCheckout), env)
for (const command of [`git -C ${linkToProtected}/.. push origin main`, "git -C link/.. push origin main", "git -C link/.. push origin HEAD:main", `cd ${linkToProtected}; git -C .. push origin main`,
  "git -C link -C .. push origin main"]) {
  T(`adapter git-guardrails symlink: ${command} from a repository with no protection -> 2, 2`, [fromOpenCheckout(command), fromOpenCheckout(command, { ORBIT_LAUNCH_WORKER: "1" })], [2, 2])
}
// The controls: the shell `cd` is logical, so `cd link/..` stays in the repository with no protection, and a push to its main passes.
for (const command of [`cd ${linkToProtected}/..; git push origin main`, `git -C ${openCheckout} push origin main`, "git -C link/.. push origin fix/x"]) {
  T(`adapter git-guardrails symlink: ${command} from a repository with no protection -> 0, 0`, [fromOpenCheckout(command), fromOpenCheckout(command, { ORBIT_LAUNCH_WORKER: "1" })], [0, 0])
}
T("handoff git: the top level follows the -C chain as git does", topLevelOf([openCheckout, "link/.."]), realpathSync(protectedCheckout))
// `find -execdir` runs git in the directory that holds each found file, here the protected checkout, which the `cd` model cannot know.
// The git rule refuses it attended and in a worker run, and the approval rule refuses it in a worker run.
for (const command of [`find ${protectedCheckout} -maxdepth 1 -name apps -execdir git push origin main \\;`, `find ${protectedCheckout} -maxdepth 1 -name apps -execdir git push --force origin HEAD:main \\;`,
  `find ${protectedCheckout} -maxdepth 1 -name apps -okdir git push origin main \\;`,
  // A variable gives `find` its `-execdir`, and `xargs` gives `find` or `env` the words of a push.
  `x=-execdir; find ${protectedCheckout} -maxdepth 1 -name apps "$x" git push origin main \\;`,
  `printf '%s\\n' -execdir git push origin main ';' | xargs find ${protectedCheckout} -maxdepth 1 -name apps`,
  `printf '%s\\n' git -C ${protectedCheckout} push origin main | xargs env`]) {
  T(`adapter other directory: ${command} from a repository with no protection -> git 2, 2 and approval 2`,
    [fromOpenCheckout(command), fromOpenCheckout(command, { ORBIT_LAUNCH_WORKER: "1" }), runHook("forbid-approval-prompt.mjs", bash(command, openCheckout), { ORBIT_LAUNCH_WORKER: "1" })], [2, 2, 2])
}
T(`adapter other directory: the control \`cd ${protectedCheckout}; git push origin main\` -> 2`, fromOpenCheckout(`cd ${protectedCheckout}; git push origin main`), 2)
T("adapter other directory: the control `find -exec` push of a feature branch from the shell directory -> 0, 0",
  [fromOpenCheckout(`find ${openCheckout} -maxdepth 0 -exec git push origin fix/x \\;`), fromOpenCheckout(`find ${openCheckout} -maxdepth 0 -exec git push origin fix/x \\;`, { ORBIT_LAUNCH_WORKER: "1" })], [0, 0])

const ORCH = "orchestrator-guardrails.mjs"
for (const [shape, command] of descriptorSuffixAllows) {
  T(`adapter orchestrator: descriptor duplication ${shape} -> 0`, runHook(ORCH, bash(command)), 0)
}
for (const [shape, command] of descriptorSafetyRefusals) {
  T(`adapter orchestrator: descriptor safety ${shape} -> 2`, runHook(ORCH, bash(command)), 2)
}
T("adapter orchestrator: codex exec -> 2", runHook(ORCH, bash('codex exec "do the thing"')), 2)
T(`adapter orchestrator: gh pr merge ${ADMIN} -> 2`, runHook(ORCH, bash(`gh pr merge 1 --squash ${ADMIN}`)), 2)
T(`adapter orchestrator: the same gh pr merge ${ADMIN} from Bash and from Monitor -> 2, 2`, bashAndMonitor(ORCH, `gh pr merge 1 --squash ${ADMIN}`), [2, 2])
T("adapter orchestrator: gh pr merge --squash -> 0", runHook(ORCH, bash("gh pr merge 1 --squash")), 0)
T("adapter orchestrator: codex --version -> 0", runHook(ORCH, bash("codex --version")), 0)
T("adapter orchestrator: grep over a codex pattern -> 0", runHook(ORCH, bash("grep -rnE 'claude|codex' tools/")), 0)
T("adapter orchestrator: piped codex cloud list -> 0", runHook(ORCH, bash("codex cloud list --env env_1 | head -20")), 0)
T("adapter orchestrator: piped codex exec -> 2", runHook(ORCH, bash("codex exec | tee worker.log")), 2)
for (const redirect of ["*>tasks.txt", "*>>tasks.txt", "*>&1"]) {
  T(
    `adapter orchestrator: PowerShell cloud read with ${redirect} -> 0`,
    runHook(ORCH, powershell(`codex cloud list ${redirect}`)),
    0,
  )
}
T("adapter orchestrator: the launcher marker -> 0", runHook(ORCH, bash("codex exec"), { ORBIT_LAUNCH_WORKER: "1" }), 0)
T("adapter orchestrator: worker git add -A -> 2", runHook(ORCH, bash("git add -A"), { ORBIT_LAUNCH_WORKER: "1" }), 2)
T("adapter orchestrator: worker git add -u -> 2", runHook(ORCH, bash("git add -u"), { ORBIT_LAUNCH_WORKER: "1" }), 2)
T("adapter orchestrator: worker named git add -> 0", runHook(ORCH, bash("git add tools/verify-delivery.mjs", repoRoot), { ORBIT_LAUNCH_WORKER: "1" }), 0)
T(
  "adapter orchestrator: worker literal bracketed git add -> 0",
  runHook(ORCH, bash("git --literal-pathspecs add apps/web/app/api/[...path]/route.ts", repoRoot), { ORBIT_LAUNCH_WORKER: "1" }),
  0,
)

// The launcher marker means the opposite for the browser ban: it identifies the worker, which is
// the only caller this gate refuses.
const BROWSER = "forbid-worker-browser.mjs"
T("adapter worker-browser: a worker starting a dev server -> 2", runHook(BROWSER, bash("npm run dev"), { ORBIT_LAUNCH_WORKER: "1" }), 2)
T("adapter worker-browser: a worker running playwright -> 2", runHook(BROWSER, bash("npx playwright test"), { ORBIT_LAUNCH_WORKER: "1" }), 2)
T("adapter worker-browser: the same playwright run from Bash and from Monitor -> 2, 2", bashAndMonitor(BROWSER, "npx playwright test", { env: { ORBIT_LAUNCH_WORKER: "1" } }), [2, 2])
T("adapter worker-browser: a worker running the tests -> 0", runHook(BROWSER, bash("npm test", repoRoot), { ORBIT_LAUNCH_WORKER: "1" }), 0)
T("adapter worker-browser: a workspace layout script -> 2", runHook(BROWSER, bash("npm run test:layout -w apps/web", repoRoot), { ORBIT_LAUNCH_WORKER: "1" }), 2)
T("adapter worker-browser: the same dev server outside a worker -> 0", runHook(BROWSER, bash("npm run dev")), 0)

// This one is wired to Write, Edit and MultiEdit as well as both shells, because an agent edits a
// file with a tool and not with a redirect, and the launcher marker is irrelevant to it: every
// caller is refused.
const DEPENDENCY = "forbid-node-modules-write.mjs"
for (const wrap of isolatedDirectoryBodies) {
  for (const [command, cwd, expected] of [
    [`${wrap(`cd ${root}`)}; touch package.json`, installedPackage, 2],
    [`cd ${installedPackage}; ${wrap(`cd ${root}`)}; touch package.json`, root, 2],
    [`cd ${installedPackage}; ${wrap("touch package.json")}`, root, 2],
    [`${wrap("touch package.json")}; cd ${installedPackage}`, root, 0],
  ]) T(`adapter dependency scope: ${command}`, runHook(DEPENDENCY, bash(command, cwd)), expected)
}
for (const command of interpreterReads) T(`adapter dependency interpreter read: ${command}`, runHook(DEPENDENCY, bash(command, dependencyTree)), 0)
for (const command of interpreterWrites) T(`adapter dependency interpreter write: ${command}`, runHook(DEPENDENCY, bash(command, dependencyTree)), 2)
const scopedProtectedRepo = join(root, "scoped-protected")
const scopedOtherRepo = join(root, "scoped-other")
for (const [directory, repository] of [[scopedProtectedRepo, "orbit-ui-mobile"], [scopedOtherRepo, "other"]]) {
  mkdirSync(directory)
  T("git scope fixture: init", stagingGit(["init", "--initial-branch=main"], directory).status, 0)
  T("git scope fixture: remote", stagingGit(["remote", "add", "origin", `https://example.invalid/${repository}.git`], directory).status, 0)
}
for (const wrap of isolatedDirectoryBodies) {
  for (const [command, cwd, expected] of [
    [`${wrap(`cd ${scopedOtherRepo}`)}; git push origin main`, scopedProtectedRepo, 2],
    [`cd ${scopedProtectedRepo}; ${wrap(`cd ${scopedOtherRepo}`)}; git push origin main`, root, 2],
    [`cd ${scopedProtectedRepo}; ${wrap("git push origin main")}`, root, 2],
    [`${wrap("git push origin main")}; cd ${scopedProtectedRepo}`, scopedOtherRepo, 0],
  ]) T(`adapter git scope: ${command}`, runHook("git-guardrails.mjs", bash(command, cwd)), isModelled(command) ? expected : 2)
}
T("adapter git scope: eval can enter a protected repository", runHook("git-guardrails.mjs", bash(`eval 'cd ${scopedProtectedRepo}'; git push origin main`, scopedOtherRepo)), 2)
T("adapter git scope: eval is not modelled -> 2", runHook("git-guardrails.mjs", bash(`eval 'cd ${scopedOtherRepo}'; git push origin main`, scopedProtectedRepo)), 2)
T("adapter git scope: a plain cd can leave a protected repository -> 0", runHook("git-guardrails.mjs", bash(`cd ${scopedOtherRepo}; git push origin main`, scopedProtectedRepo)), 0)
T("adapter git-guardrails: a command word that zsh expands to git -> 2", runHook("git-guardrails.mjs", bash("=git push origin main", scopedOtherRepo)), 2)
T("adapter git-guardrails: a line continuation after the git word -> 2", runHook("git-guardrails.mjs", bash("git \\\npush origin main", scopedOtherRepo)), 2)
T("adapter git-guardrails: a quoted -n on a commit -> 2", runHook("git-guardrails.mjs", bash("git commit -m x '-n'", scopedOtherRepo)), 2)
T("adapter git-guardrails: a grep for a git command with the flag -> 0", runHook("git-guardrails.mjs", bash(`grep -rn "git commit ${NV}" .claude`, scopedOtherRepo)), 0)
// Defect 1 through the real hook files: each one exits 2 within the time limit, where a loop ends in a kill or an abort.
for (const [name, byte] of [["CR", "\r"], ["form feed", "\f"], ["U+00A0", " "]]) {
  for (const [file, command, env] of [["git-guardrails.mjs", `git push origin main ;${byte}`, {}], ["forbid-approval-prompt.mjs", `rm -rf "$TMP" ;${byte}`, { ORBIT_LAUNCH_WORKER: "1" }]]) {
    const result = spawnSync(process.execPath, [join(hooksDir, file)], { input: JSON.stringify(bash(command, scopedOtherRepo)), encoding: "utf8", env: { ...process.env, ORBIT_LAUNCH_WORKER: "", ...env }, timeout: 10000 })
    T(`adapter ${file}: a ${name} outside a quote -> 2 within the time limit`, [result.status, result.signal], [2, null])
  }
}
T("adapter git-guardrails: a worker refuses a command outside the subset that names no git -> 2", runHook("git-guardrails.mjs", bash("while true; do sleep 5; done", scopedOtherRepo), { ORBIT_LAUNCH_WORKER: "1" }), 2)
const edit = (toolName, filePath) => ({ tool_name: toolName, tool_input: { file_path: filePath }, cwd: dependencyTree })
T("adapter dependency-write: Write inside node_modules -> 2", runHook(DEPENDENCY, edit("Write", installedFile)), 2)
T("adapter dependency-write: Edit through a relative path -> 2", runHook(DEPENDENCY, edit("Edit", "node_modules/react-native/flags.kt")), 2)
T("adapter dependency-write: MultiEdit on the repository's own source -> 0", runHook(DEPENDENCY, edit("MultiEdit", "apps/mobile/app/index.tsx")), 0)
T("adapter dependency-write: a worker redirect into a dependency -> 2", runHook(DEPENDENCY, bash("echo true > node_modules/react-native/flags.kt", dependencyTree), { ORBIT_LAUNCH_WORKER: "1" }), 2)
T("adapter dependency-write: the same redirect outside a worker still -> 2", runHook(DEPENDENCY, bash("echo true > node_modules/react-native/flags.kt", dependencyTree)), 2)
T("adapter dependency-write: the same redirect from Bash and from Monitor -> 2, 2", bashAndMonitor(DEPENDENCY, "echo true > node_modules/react-native/flags.kt", { cwd: dependencyTree }), [2, 2])
T("adapter dependency-write: the PowerShell tool is guarded too -> 2", runHook(DEPENDENCY, powershell("Set-Content -Path node_modules/react-native/flags.kt -Value true", dependencyTree)), 2)
T("adapter dependency-write: a case-different spelling -> 2", runHook(DEPENDENCY, edit("Write", "NODE_MODULES/react-native/flags.kt")), 2)
T("adapter dependency-write: npx -y patch-package -> 2", runHook(DEPENDENCY, bash("npx -y patch-package react-native", dependencyTree)), 2)
T("adapter dependency-write: the documented repair -> 0", runHook(DEPENDENCY, bash("rm -rf node_modules/react-native && npm install", dependencyTree)), 0)
T("adapter dependency-write: reading the installed source -> 0", runHook(DEPENDENCY, bash("cat node_modules/react-native/flags.kt", dependencyTree)), 0)

/**
 * The invented-identifier adapter, on both of its evidence sources. The ledger case writes THIS
 * checkout's real ledger, because that is the only path list-bot-threads.mjs writes, and restores
 * whatever was there. The scratchpad case stages a session directory under the real scratchpad
 * layout, so the id-in-an-artifact path is exercised without touching any repository.
 */
const IDENT_HOOK = "forbid-invented-identifier.mjs"
const IDENT_SESSION = "b7b639ab-803e-409a-b1ce-9b86ccdf9a60"
const resolveCommand = (id) => `node tools/resolve-bot-thread.mjs --thread ${id} --repo ui --pr 699`
const identPayload = (command, sessionId = IDENT_SESSION) => ({ tool_name: "Bash", tool_input: { command }, cwd: repoRoot, session_id: sessionId })

T("adapter identifier: an id this run never read -> 2", runHook(IDENT_HOOK, identPayload(resolveCommand(INVENTED))), 2)
T("adapter identifier: a command with no id at all -> 0", runHook(IDENT_HOOK, identPayload("node tools/list-bot-threads.mjs --pr 699 --repo ui")), 0)
T(
  "adapter identifier: the PowerShell tool is guarded too, not only Bash -> 2",
  runHook(IDENT_HOOK, { tool_name: "PowerShell", tool_input: { command: resolveCommand(INVENTED) }, cwd: repoRoot, session_id: IDENT_SESSION }),
  2,
)
T("adapter identifier: the same id from Bash and from Monitor -> 2, 2", bashAndMonitor(IDENT_HOOK, resolveCommand(INVENTED), { cwd: repoRoot, extra: { session_id: IDENT_SESSION } }), [2, 2])

const scratchpadArtifact = join(tmpdir(), "claude", "orbit-hooks-gate-project", IDENT_SESSION, "scratchpad", "threads.json")
mkdirSync(dirname(scratchpadArtifact), { recursive: true })
writeFileSync(scratchpadArtifact, JSON.stringify({ threads: [{ id: INVENTED }] }))
try {
  T("adapter identifier: the same id read from a session artifact -> 0", runHook(IDENT_HOOK, identPayload(resolveCommand(INVENTED))), 0)
  T("adapter identifier: traversal session cannot scan an artifact", runHook(IDENT_HOOK, identPayload(resolveCommand(INVENTED), "../../x")), 2)
  T("adapter identifier: another session cannot borrow that artifact -> 2", runHook(IDENT_HOOK, identPayload(resolveCommand(INVENTED), "a-different-session")), 2)
} finally {
  rmSync(join(tmpdir(), "claude", "orbit-hooks-gate-project"), { recursive: true, force: true })
}

/**
 * The ledger cases run the real hook from an isolated checkout, because the ledger lives in the
 * checkout's .git directory. A review sandbox can mount this checkout's .git read-only, and the
 * ledger write then fails quietly, so the cases would prove nothing about the hook.
 */
const { identifierLedgerPath, recordObservedIdentifiers } = await import("../../tools/lib/identifier-ledger.mjs")
const ledgerCheckout = join(root, "identifier-ledger")
const ledgerHooks = join(ledgerCheckout, ".claude", "hooks")
mkdirSync(ledgerHooks, { recursive: true })
T("ledger fixture: repository initializes", stagingGit(["init", "--initial-branch=main"], ledgerCheckout).status, 0)
cpSync(join(repoRoot, "tools", "lib"), join(ledgerCheckout, "tools", "lib"), { recursive: true })
cpSync(join(hooksDir, "_lib"), join(ledgerHooks, "_lib"), { recursive: true })
cpSync(join(hooksDir, IDENT_HOOK), join(ledgerHooks, IDENT_HOOK))
writeFileSync(join(ledgerCheckout, ".claude", "orchestrator.json"), `${JSON.stringify({ repos: { ui: "." } })}\n`)
const runLedgerHook = () => spawnSync(process.execPath, [join(ledgerHooks, IDENT_HOOK)], {
  input: JSON.stringify({ ...identPayload(resolveCommand(INVENTED)), cwd: ledgerCheckout }),
  encoding: "utf8",
  env: { ...process.env, ORBIT_LAUNCH_WORKER: "" },
}).status
const recordInLedger = (runIdentifier) => recordObservedIdentifiers([INVENTED], { repoRoot: ledgerCheckout, tool: "test-hooks.mjs", runIdentifier })
T("adapter identifier: an empty ledger -> 2", runLedgerHook(), 2)
T("ledger fixture: an earlier run's id is written", recordInLedger("an-earlier-session"), identifierLedgerPath(ledgerCheckout))
T("adapter identifier: an id recorded by an earlier run -> 2", runLedgerHook(), 2)
T("ledger fixture: this run's id is written", recordInLedger(IDENT_SESSION), identifierLedgerPath(ledgerCheckout))
T("adapter identifier: an id recorded by this run -> 0", runLedgerHook(), 0)
rmSync(identifierLedgerPath(ledgerCheckout), { force: true })
T("adapter identifier: a removed ledger blocks the id again -> 2", runLedgerHook(), 2)

/**
 * The Stop adapter reads THIS checkout's real run record, because that is the only path a live run
 * writes. The fixture carries its own session id, so even a leaked file cannot block a real session:
 * a session id that does not match is treated as a previous run's and ignored.
 */
const WAKE_HOOK = "require-wake-source.mjs"
const { PENDING_WAKE_SOURCE_MAX_AGE_MS, acquireRelayLock, clearWakeSource, readWakeSources, readWakeSourceStates, registerWakeSource, runStatePath, wakeSourceDirectory } = await import("../../tools/lib/run-state.mjs")
const stopPayload = { session_id: "orbit-hooks-gate-session", stop_hook_active: false }
// Exercise the real adapter in an isolated checkout so another run cannot mask a bad identity.
const wakeCheckout = join(root, "wake-identity")
const wakeHooks = join(wakeCheckout, ".claude", "hooks")
mkdirSync(wakeCheckout, { recursive: true })
T("relay fixture: repository initializes", stagingGit(["init", "--initial-branch=relay-fixture"], wakeCheckout).status, 0)
T("relay fixture: repository configures identity", stagingGit(["config", "user.email", "hooks@example.invalid"], wakeCheckout).status, 0)
T("relay fixture: repository configures name", stagingGit(["config", "user.name", "Hook Test"], wakeCheckout).status, 0)
mkdirSync(wakeHooks, { recursive: true })
cpSync(join(repoRoot, "tools", "lib"), join(wakeCheckout, "tools", "lib"), { recursive: true })
cpSync(join(repoRoot, "tools", "relay-session.mjs"), join(wakeCheckout, "tools", "relay-session.mjs"))
cpSync(join(hooksDir, "_lib"), join(wakeHooks, "_lib"), { recursive: true })
cpSync(join(hooksDir, WAKE_HOOK), join(wakeHooks, WAKE_HOOK))
cpSync(join(repoRoot, ".claude", "orchestrator.json"), join(wakeCheckout, ".claude", "orchestrator.json"))
T("relay fixture: repository stages configuration", stagingGit(["--literal-pathspecs", "add", ".claude/orchestrator.json"], wakeCheckout).status, 0)
T("relay fixture: repository commits configuration", stagingGit(["commit", "-m", "relay fixture"], wakeCheckout).status, 0)
const wakeOrigin = join(root, "wake-origin.git")
T("relay fixture: local origin initializes", stagingGit(["init", "--bare", wakeOrigin], wakeCheckout).status, 0)
T("relay fixture: local origin is configured", stagingGit(["remote", "add", "origin", wakeOrigin], wakeCheckout).status, 0)
T("relay fixture: main is published locally", stagingGit(["push", "origin", "HEAD:refs/heads/main"], wakeCheckout).status, 0)
T("relay fixture: base configuration is available", stagingGit(["update-ref", "refs/remotes/origin/redesign/main", "HEAD"], wakeCheckout).status, 0)
for (const name of ["relay-at-threshold.mjs", "forbid-superseded-session.mjs", "record-handoff-request.mjs", "require-handoff-prompt.mjs", "forbid-approval-prompt.mjs"]) cpSync(join(hooksDir, name), join(wakeHooks, name))
// The staged checkout owns its run record, so the run that executes this suite cannot change the verdict.
const APPROVAL_HOOK = "forbid-approval-prompt.mjs"
const approvalHook = (payload, env = {}) => spawnSync(process.execPath, [join(wakeHooks, APPROVAL_HOOK)], {
  input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, ORBIT_LAUNCH_WORKER: "", ...env },
})
const heldRemoval = (toolName = "Bash", sessionId = "approval-coordinator") => ({ tool_name: toolName, tool_input: { command: HELD_REMOVAL }, cwd: wakeCheckout, session_id: sessionId })
T("adapter approval: no run record -> 0", approvalHook(heldRemoval()).status, 0)
writeRunState({ sessionId: "approval-coordinator", sleep: false, remaining: [] }, wakeCheckout)
T("adapter approval: an attended run -> 0", approvalHook(heldRemoval()).status, 0)
T("adapter approval: a worker in an attended run -> 2", approvalHook(heldRemoval(), { ORBIT_LAUNCH_WORKER: "1" }).status, 2)
writeRunState({ sessionId: "approval-coordinator", sleep: true, remaining: [] }, wakeCheckout)
const refusedRemoval = approvalHook(heldRemoval())
T("adapter approval: the held removal in an unattended run -> 2", refusedRemoval.status, 2)
T("adapter approval: the refusal tells the agent how to rewrite the command", refusedRemoval.stderr.includes('"${DST:?}/${d:?}/node_modules"') && refusedRemoval.stderr.includes("literal path"), true)
const refusedUnmodelled = approvalHook({ ...heldRemoval(), tool_input: { command: 'bash <<<$"rm -rf \\"\\$TMP\\""' } })
T("adapter approval: a removal in a construct that the reader does not model -> 2", refusedUnmodelled.status, 2)
T("adapter approval: that refusal names the construct and asks for the plain subset", refusedUnmodelled.stderr.includes("a here-string") && refusedUnmodelled.stderr.includes("plain subset"), true)
// The live held command of the order: a variable in a path and an escaped `$(` in a grep pattern, which Claude Code held for a person.
// In an unattended run the hook refuses it first, and the refusal names the `.mjs` route for a search.
const LIVE_HELD_COMMAND = String.raw`N=/tmp/scratchpad/rv-2464-r16; awk '/^const HEREDOC_DATA/{on=1;next} on&&/^\]/{exit} on' $N/head/.claude/hooks/test-hooks.mjs | grep -n "bash script.sh\"\|x=\\$(cat" | head; grep -n "^const HEREDOC_DATA" -A6 $N/head/.claude/hooks/test-hooks.mjs | head -8`
const refusedLiveCommand = approvalHook({ ...heldRemoval(), tool_input: { command: LIVE_HELD_COMMAND } })
T("adapter approval: the live held command of the order in an unattended run -> 2", refusedLiveCommand.status, 2)
T("adapter approval: that refusal asks for a .mjs file that node runs", refusedLiveCommand.stderr.includes("node /abs/path.mjs"), true)
T("approval: the live held command of the order is refused by both rules", [Boolean(checkGitCommand(LIVE_HELD_COMMAND, { cwd: "/work/x" })?.notModelled), checkApprovalPrompt(LIVE_HELD_COMMAND, { cwd: "/work/x" })?.rule], [true, "not-modelled"])
// Claude Code runs its removal check for the Bash tool and the Monitor tool, and the guarded rewrite is Bash syntax.
T("adapter approval: a PowerShell command is outside the removal check -> 0", approvalHook(heldRemoval("PowerShell")).status, 0)
const monitorRemoval = { ...heldRemoval("Monitor"), tool_input: { command: 'sleep 5 && test -f "$OUT/done" && rm -rf "$OUT/$d"', description: "Wait for the build", timeout_ms: 300000 } }
const refusedMonitor = approvalHook(monitorRemoval)
T("adapter approval: a Monitor command that removes a variable path -> 2", refusedMonitor.status, 2)
// The approval hook runs from the staged checkout, so it records its own case for the parity check.
T("adapter approval: the same held removal from Monitor -> 2", approvalHook(heldRemoval("Monitor")).status, 2)
monitorRefusalGuards.add(APPROVAL_HOOK)
T("adapter approval: the Monitor refusal gives the guarded rewrite", refusedMonitor.stderr.includes('"${OUT:?}/${d:?}"'), true)
T("adapter approval: a Monitor command with a guarded removal -> 0", approvalHook({ ...monitorRemoval, tool_input: { ...monitorRemoval.tool_input, command: 'sleep 5 && test -f "$OUT/done" && rm -rf "${OUT:?}/${d:?}"' } }).status, 0)
T("adapter approval: a Monitor that opens a WebSocket has no command -> 0", approvalHook({ ...heldRemoval("Monitor"), tool_input: { ws: { url: "wss://events.example.com/stream" }, description: "Events", timeout_ms: 300000 } }).status, 0)
T("adapter approval: the hook is wired to each tool that runs the removal check, and to no other shell", settings.hooks.PreToolUse.filter((entry) => entry.hooks.some((hook) => hook.command.includes(APPROVAL_HOOK))).flatMap((entry) => entry.matcher.split("|")).filter((tool) => !PERSON_PROMPT_TOOLS.includes(tool)).sort(), ["Bash", "Monitor"])
// The guard broken: with Monitor removed from the tool list the same command passes, as it did before the list held it.
const approvalRulesPath = join(wakeHooks, "_lib", "rules-approval.mjs")
const approvalRulesSource = readFileSync(approvalRulesPath, "utf8")
const removalToolsLine = 'export const REMOVAL_CHECK_TOOLS = ["Bash", "Monitor"]'
T("adapter approval: the broken guard targets the production tool list", approvalRulesSource.includes(removalToolsLine), true)
writeFileSync(approvalRulesPath, approvalRulesSource.replace(removalToolsLine, 'export const REMOVAL_CHECK_TOOLS = ["Bash"]'))
T("adapter approval: with Monitor removed from the tool list the Monitor command passes -> 0", approvalHook(monitorRemoval).status, 0)
writeFileSync(approvalRulesPath, approvalRulesSource)
T("adapter approval: with the tool list restored the Monitor command is refused again -> 2", approvalHook(monitorRemoval).status, 2)
// AskUserQuestion waits for a person with no limit. The payload copies the PreToolUse input of Claude Code 2.1.325
// (session_id, transcript_path, cwd, hook_event_name, tool_name, tool_input, tool_use_id) and the tool input of a real transcript.
const ownerQuestion = (sessionId = "approval-coordinator") => ({
  session_id: sessionId, transcript_path: join(root, `${sessionId}.jsonl`), cwd: wakeCheckout, permission_mode: "bypassPermissions", hook_event_name: "PreToolUse", tool_name: "AskUserQuestion",
  tool_input: { questions: [{ question: "Which branch takes the fix?", header: "Branch", multiSelect: false, options: [{ label: "main", description: "The default branch" }, { label: "redesign/main", description: "The redesign branch" }] }] },
  tool_use_id: "toolu_question",
})
const refusedQuestion = approvalHook(ownerQuestion())
T("adapter person prompt: AskUserQuestion in an unattended run -> 2", refusedQuestion.status, 2)
T("adapter person prompt: the refusal tells the agent to decide and log it, or to queue the owner question and ask it in reply text",
  ["no person is present", "best option", "decision log", "openOwnerQuestions", "{ question, blocks }", "updateRunState", "plain reply text"].every((text) => refusedQuestion.stderr.includes(text)), true)
T("adapter person prompt: a subagent of the unattended run -> 2", approvalHook({ ...ownerQuestion(), agent_id: "fix-agent", agent_type: "general-purpose" }).status, 2)
T("adapter person prompt: another session beside the unattended run -> 0", approvalHook(ownerQuestion("owner-session")).status, 0)
writeRunState({ sessionId: "approval-coordinator", sleep: false, remaining: [] }, wakeCheckout)
T("adapter person prompt: an attended run -> 0", approvalHook(ownerQuestion()).status, 0)
T("adapter person prompt: a launched worker in an attended run -> 2", approvalHook(ownerQuestion(), { ORBIT_LAUNCH_WORKER: "1" }).status, 2)
writeRunState({ sessionId: "approval-coordinator", sleep: true, remaining: [] }, wakeCheckout)
T("adapter person prompt: the hook is wired to each tool that waits for a person", settings.hooks.PreToolUse.filter((entry) => entry.hooks.some((hook) => hook.command.includes(APPROVAL_HOOK)))
  .flatMap((entry) => entry.matcher.split("|")).filter((tool) => !["Bash", "Monitor"].includes(tool)).sort(), ["AskUserQuestion", "OfferChromeSetup", "PublishPlugin", "SendToProject", "ShowOnboardingRolePicker"])
// The guard broken: with AskUserQuestion removed from the tool list the question passes, as it did before the list held it.
const personToolsLine = 'export const PERSON_PROMPT_TOOLS = ["AskUserQuestion", "OfferChromeSetup", "PublishPlugin", "SendToProject", "ShowOnboardingRolePicker"]'
T("adapter person prompt: the broken guard targets the production tool list", approvalRulesSource.includes(personToolsLine), true)
writeFileSync(approvalRulesPath, approvalRulesSource.replace(personToolsLine, 'export const PERSON_PROMPT_TOOLS = ["OfferChromeSetup", "PublishPlugin", "SendToProject", "ShowOnboardingRolePicker"]'))
T("adapter person prompt: with AskUserQuestion removed from the tool list the question passes -> 0", approvalHook(ownerQuestion()).status, 0)
writeFileSync(approvalRulesPath, approvalRulesSource)
T("adapter person prompt: with the tool list restored the question is refused again -> 2", approvalHook(ownerQuestion()).status, 2)
// Claude Code adds `permissions.additionalDirectories` of each settings scope to the working directories of the session.
const approvalAccount = join(root, "approval-account")
const addedDirectories = { user: join(root, "added-by-user", "notes"), project: join(root, "added-by-project", "site"), local: join(root, "added-by-local", "vault") }
mkdirSync(approvalAccount, { recursive: true })
const settingsWith = (directories) => JSON.stringify({ permissions: { additionalDirectories: directories } })
const scopeFiles = { user: join(approvalAccount, "settings.json"), project: join(wakeCheckout, ".claude", "settings.json"), local: join(wakeCheckout, ".claude", "settings.local.json") }
const removalOf = (directory) => approvalHook({ ...heldRemoval(), tool_input: { command: `rm -rf ${directory}` } }, { CLAUDE_CONFIG_DIR: approvalAccount }).status
for (const scope of Object.keys(scopeFiles)) {
  T(`adapter approval: a directory that no settings file adds can be removed (${scope}) -> 0`, removalOf(addedDirectories[scope]), 0)
  // The project entry is relative, as the real project settings write it: Claude Code resolves it from the project directory.
  writeFileSync(scopeFiles[scope], settingsWith([scope === "project" ? "../added-by-project/site" : addedDirectories[scope]]))
  T(`adapter approval: removal of a directory that the ${scope} settings add -> 2`, removalOf(addedDirectories[scope]), 2)
  T(`adapter approval: removal of a parent of a directory that the ${scope} settings add -> 2`, removalOf(dirname(addedDirectories[scope])), 2)
  T(`adapter approval: removal of an entry inside a directory that the ${scope} settings add -> 0`, removalOf(join(addedDirectories[scope], "build")), 0)
  rmSync(scopeFiles[scope])
}
// The guard broken: with the settings read removed the directory that the user settings add can be removed again.
writeFileSync(scopeFiles.user, settingsWith([addedDirectories.user]))
const approvalAdapterPath = join(wakeHooks, APPROVAL_HOOK)
const approvalAdapterSource = readFileSync(approvalAdapterPath, "utf8")
const settingsRead = ", ...additionalWorkingDirectories(repoRoot)]"
T("adapter approval: the broken guard targets the production settings read", approvalAdapterSource.includes(settingsRead), true)
writeFileSync(approvalAdapterPath, approvalAdapterSource.replace(settingsRead, "]"))
T("adapter approval: with the settings read removed the added directory passes -> 0", removalOf(addedDirectories.user), 0)
writeFileSync(approvalAdapterPath, approvalAdapterSource)
T("adapter approval: with the settings read restored the added directory is refused again -> 2", removalOf(addedDirectories.user), 2)
rmSync(scopeFiles.user)
T("adapter approval: a subagent carries the coordinator session -> 2", approvalHook({ ...heldRemoval(), agent_id: "fix-agent", agent_type: "general-purpose" }).status, 2)
T("adapter approval: the guarded rewrite -> 0", approvalHook({ ...heldRemoval(), tool_input: { command: 'rm "${DST:?}/${d:?}/node_modules"' } }).status, 0)
T("adapter approval: removal of the checkout itself -> 2", approvalHook({ ...heldRemoval(), tool_input: { command: `rm -rf ${wakeCheckout}` } }).status, 2)
T("adapter approval: another session beside the unattended run -> 0", approvalHook(heldRemoval("Bash", "owner-session")).status, 0)
writeFileSync(runStatePath(wakeCheckout), "not json")
T("adapter approval: an unreadable run record fails closed -> 2", approvalHook(heldRemoval()).status, 2)
T("adapter person prompt: an unreadable run record fails closed -> 2", approvalHook(ownerQuestion()).status, 2)
T("adapter approval: an unreadable run record still allows a safe command -> 0", approvalHook({ ...heldRemoval(), tool_input: { command: "npm test" } }).status, 0)
rmSync(runStatePath(wakeCheckout))
const relayDecisionLog = join(wakeCheckout, ".git", "relay-decisions.md")
writeFileSync(relayDecisionLog, "No open decisions.\n")
const relayState = { autoWork: false, sessionId: "relay-parent", sleep: true, remaining: ["#1091"], decisionLogPath: relayDecisionLog }
/** The shipped thresholds, so the crossing tests follow the real values instead of a copy of them. */
const { softTokens: relaySoft, hardTokens: relayHard } = JSON.parse(readFileSync(join(repoRoot, ".claude", "orchestrator.json"), "utf8")).relay
const relayOptions = { enabled: true, softTokens: relaySoft, hardTokens: relayHard, state: relayState, sessionId: relayState.sessionId, measuredTokens: relayHard }
T("relay: below the soft threshold is inert", checkRelayStop({ ...relayOptions, measuredTokens: relaySoft - 1 }), null)
T("relay: kill switch is inert", checkRelayStop({ ...relayOptions, enabled: false }), null)
T("relay: attended sessions are inert", checkRelayStop({ ...relayOptions, state: { ...relayState, sleep: false } }), null)
T("relay: another session is inert", checkRelayStop({ ...relayOptions, sessionId: "other" }), null)
for (const count of [0, 1, 6]) {
  const wakeSources = Array.from({ length: count }, (_, index) => ({ pid: index + 1, what: "Worker launcher" }))
  T(`relay: first crossing with ${count} launchers starts drain`, checkRelayStop({ ...relayOptions, wakeSources }).begin, true)
  T(`relay: pending drain with ${count} launchers injects only when empty`, Boolean(checkRelayStop({ ...relayOptions, state: { ...relayState, relay: { pending: true } }, wakeSources })), count === 0)
}
for (const type of ["workflow", "subagent"]) {
  const backgroundRuns = [{ id: `${type}-task`, type }]
  T(`relay: pending ${type} blocks completion`, checkRelayStop({ ...relayOptions, backgroundRuns, state: { ...relayState, relay: { pending: true } } }), null)
}
T("relay: release watcher keeps drain waiting", checkRelayStop({ ...relayOptions, state: { ...relayState, relay: { pending: true } }, wakeSources: [{ pid: 1, what: "Release ui run 1" }] }), null)
T("relay: retry cooldown injects nothing", checkRelayStop({ ...relayOptions, state: { ...relayState, relay: { pending: true, lastAttemptAt: new Date().toISOString() } } }), null)
T("relay: two failures near auto compact permit fallback", checkRelayStop({ ...relayOptions, measuredTokens: 950000, state: { ...relayState, relay: { pending: true, failures: 2 } } }).fallback, true)
const launcher = [{ pid: 1, what: "Worker launcher" }]
const midTurn = { ...relayOptions, measuredTokens: relaySoft, hookEventName: "PostToolUse" }
T("relay soft: mid-turn crossing arms and never begins", { arm: checkRelayStop(midTurn).arm, begin: checkRelayStop(midTurn).begin }, { arm: true, begin: undefined })
T("relay soft: arming tells the session to finish the work in front of it", checkRelayStop(midTurn).message.includes("Finish the work"), true)
T("relay soft: an armed relay stays silent mid-turn", checkRelayStop({ ...midTurn, state: { ...relayState, relay: { armed: true } } }), null)
T("relay soft: a turn end with a live wake source begins at the soft threshold", { begin: checkRelayStop({ ...midTurn, hookEventName: "Stop", wakeSources: launcher }).begin, forced: checkRelayStop({ ...midTurn, hookEventName: "Stop", wakeSources: launcher }).forced }, { begin: true, forced: false })
T("relay soft: a turn end with open work and no wake source is not quiet", checkRelayStop({ ...midTurn, hookEventName: "Stop" }).arm, true)
T("relay soft: a turn end with an empty queue and no live wake source is not quiet", { arm: checkRelayStop({ ...midTurn, hookEventName: "Stop", state: { ...relayState, remaining: [] } }).arm, begin: checkRelayStop({ ...midTurn, hookEventName: "Stop", state: { ...relayState, remaining: [] } }).begin }, { arm: true, begin: undefined })
/** Every turn end the relay calls quiet is one the sleep gate allows. A refused stop would turn the relay into RELAY_DRAIN. */
const openPullRequest = { repositoryKey: "ui", prNumber: 1, receiptPath: "/absent/receipt.json" }
const quietAgreement = []
for (const [name, state] of [["queue left", relayState], ["empty queue", { ...relayState, remaining: [] }], ["empty queue, open pull request", { ...relayState, remaining: [], pullRequests: [openPullRequest] }],
  ["empty queue, auto-work", { ...relayState, remaining: [], autoWork: true }], ["queue left, auto-work", { ...relayState, autoWork: true }]]) {
  for (const wakeSources of [[], launcher]) {
    const verdict = checkRelayStop({ ...midTurn, hookEventName: "Stop", state, wakeSources })
    if (verdict.begin) quietAgreement.push([name, wakeSources.length, Boolean(checkSleepStop({ state, wakeSources, sessionId: relayState.sessionId, isWakeSourceAlive: () => true })?.block)])
  }
}
T("relay soft: a quiet point is never a stop the sleep gate refuses", quietAgreement.filter(([, , refused]) => refused), [])
T("relay soft: the quiet points that agreed were reached with a live wake source only", quietAgreement.every(([, sources]) => sources > 0) && quietAgreement.length === 5, true)
T("relay soft: a launcher without a wake source is not quiet", checkRelayStop({ ...midTurn, hookEventName: "Stop", wakeSources: launcher, orphaned: [{ pid: 2, workerPid: 3 }] }).arm, true)
T("relay soft: a turn that a Stop hook keeps open is not quiet", checkRelayStop({ ...midTurn, hookEventName: "Stop", wakeSources: launcher, stopHookActive: true }).arm, true)
T("relay hard: one token below the ceiling mid-turn only arms", checkRelayStop({ ...midTurn, measuredTokens: relayHard - 1 }).begin, undefined)
T("relay hard: the ceiling begins mid-turn and says it was forced", { begin: checkRelayStop({ ...midTurn, measuredTokens: relayHard }).begin, forced: checkRelayStop({ ...midTurn, measuredTokens: relayHard }).forced }, { begin: true, forced: true })
T("relay hard: the ceiling begins even with an orphaned launcher", checkRelayStop({ ...midTurn, measuredTokens: relayHard, orphaned: [{ pid: 2, workerPid: 3 }] }).begin, true)
T("relay hard: an armed relay still begins at the ceiling", checkRelayStop({ ...midTurn, measuredTokens: relayHard, state: { ...relayState, relay: { armed: true } } }).begin, true)
T("relay hard: the ceiling is above the soft threshold", relayHard > relaySoft, true)
T("sleep: drain guidance never launches more work", checkSleepStop({ state: { ...relayState, relay: { pending: true } } }).message.includes("Launch nothing"), true)
/** The fixture usage with its cache read set so the call sums to the given size. The other fields sum to 670. */
const usageAt = (tokens) => ({ ...JSON.parse(readFileSync(join(repoRoot, "tools", "__tests__", "fixtures", "session-usage.json"), "utf8")), cache_read_input_tokens: tokens - 670 })
const relayUsage = usageAt(relayHard)
const relayTranscript = join(wakeCheckout, ".git", "relay-transcript.jsonl")
const relayPayload = { session_id: "relay-parent", transcript_path: relayTranscript, cwd: wakeCheckout, permission_mode: "bypassPermissions", hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: "", background_tasks: [], session_crons: [] }
const isolatedRelayHook = (name, payload = relayPayload, timeout) => spawnSync(process.execPath, [join(wakeHooks, name)], { input: JSON.stringify(payload), encoding: "utf8", timeout })
writeFileSync(runStatePath(wakeCheckout), "not json")
const corruptStop = isolatedRelayHook(WAKE_HOOK, stopPayload)
T("adapter wake-source: corrupt run blocks stop", corruptStop.status, 2)
T("adapter wake-source: corrupt run error names its path", corruptStop.stderr.includes(runStatePath(wakeCheckout)), true)
T("adapter wake-source: active stop prevents a block loop", isolatedRelayHook(WAKE_HOOK, { ...stopPayload, stop_hook_active: true }).status, 0)
rmSync(runStatePath(wakeCheckout))
T("adapter wake-source: missing record allows stop", isolatedRelayHook(WAKE_HOOK, stopPayload).status, 0)
writeRunState({ sessionId: stopPayload.session_id, sleep: true, remaining: ["ORB-2"] }, wakeCheckout)
T("adapter wake-source: a sleeping queue with nothing live -> 2", isolatedRelayHook(WAKE_HOOK, stopPayload).status, 2)
writeRunState({ sessionId: stopPayload.session_id, sleep: true, remaining: [] }, wakeCheckout)
T("adapter wake-source: an exhausted queue -> 0", isolatedRelayHook(WAKE_HOOK, stopPayload).status, 0)
writeRunState({ sessionId: stopPayload.session_id, sleep: true, remaining: ["ORB-2"] }, wakeCheckout)
T("adapter wake-source: another session's record -> 0", isolatedRelayHook(WAKE_HOOK, { ...stopPayload, session_id: "someone-else" }).status, 0)
const requestFile = join(wakeCheckout, ".git", "orbit-handoff-request.json")
writeFileSync(requestFile, "{")
const corruptRequestStop = isolatedRelayHook("require-handoff-prompt.mjs", { ...stopPayload, hook_event_name: "Stop" })
T("handoff adapter: corrupt request blocks", corruptRequestStop.status, 2)
T("handoff adapter: an internal request-read throw blocks a valid tool payload", isolatedRelayHook("require-handoff-prompt.mjs", { ...stopPayload, hook_event_name: "PreToolUse", tool_input: { command: "git status" } }).status, 2)
T("handoff adapter: corrupt request names path", corruptRequestStop.stderr.includes(requestFile), true)
rmSync(requestFile)
const { newestCommittedPrompt: readCommittedPrompt } = await import("./_lib/handoff-git.mjs")
let promptReadFailed = false
try { readCommittedPrompt(root) } catch { promptReadFailed = true }
T("handoff reader: git failure throws instead of proving no prompt", promptReadFailed, true)
writeRunState(relayState, wakeCheckout)
writeFileSync(relayTranscript, JSON.stringify({ type: "assistant", message: { id: "call", usage: { ...relayUsage, cache_read_input_tokens: relaySoft - 671 } } }) + "\n")
T("relay adapter: one token below the soft threshold prints nothing", isolatedRelayHook("relay-at-threshold.mjs").stdout, "")
writeFileSync(relayTranscript, JSON.stringify({ type: "assistant", message: { id: "call", usage: relayUsage } }) + "\n")
T("relay adapter: concurrent wake hook never says to launch on crossing", isolatedRelayHook(WAKE_HOOK).stderr, "")
const crossing = isolatedRelayHook("relay-at-threshold.mjs")
const feedback = JSON.parse(crossing.stdout)
T("relay adapter: the hard ceiling emits documented Stop feedback", feedback.hookSpecificOutput.hookEventName, "Stop")
T("relay adapter: feedback names relay", feedback.hookSpecificOutput.additionalContext.includes("relay"), true)
T("relay adapter: machine origin enforces sleep prompt", readHandoffRequest("relay-parent", wakeCheckout).origin, "context-relay")
T("relay adapter: measured pending state is persisted", readRunState(wakeCheckout).relay.measuredTokens, relayHard)
const stopRelayState = readRunState(wakeCheckout)
const stopRelayRequest = readHandoffRequest("relay-parent", wakeCheckout)
const postToolRelayHooks = settings.hooks.PostToolUse
  .filter((entry) => new RegExp(entry.matcher ?? ".*").test("Bash"))
  .flatMap((entry) => entry.hooks)
  .filter((hook) => hook.command.includes("relay-at-threshold.mjs"))
T("relay post-tool: Bash matches exactly one relay check", postToolRelayHooks.length, 1)
T("relay post-tool: reads, edits, agents and MCP tools each match once", ["Read", "Edit", "Write", "Agent", "mcp__server__tool"].map((toolName) =>
  settings.hooks.PostToolUse.filter((entry) => new RegExp(entry.matcher ?? ".*").test(toolName))
    .flatMap((entry) => entry.hooks).filter((hook) => hook.command.includes("relay-at-threshold.mjs")).length), [1, 1, 1, 1, 1])
const postToolPayload = { session_id: relayPayload.session_id, transcript_path: relayTranscript, cwd: wakeCheckout,
  permission_mode: relayPayload.permission_mode, hook_event_name: "PostToolUse", tool_name: "Bash",
  tool_input: { command: "true" }, tool_response: { stdout: "", stderr: "", interrupted: false }, tool_use_id: "tool-call", duration_ms: 1 }
const relayTimeoutMilliseconds = postToolRelayHooks[0].timeout * 1000
T("relay: configured timeout is explicitly positive", Number.isFinite(relayTimeoutMilliseconds) && relayTimeoutMilliseconds > 0, true)
T("relay: Stop and PostToolUse share the timeout", settings.hooks.Stop.flatMap((entry) => entry.hooks)
  .filter((hook) => hook.command.includes("relay-at-threshold.mjs")).map((hook) => hook.timeout), [postToolRelayHooks[0].timeout])
const postToolRelay = () => isolatedRelayHook("relay-at-threshold.mjs", postToolPayload, relayTimeoutMilliseconds)
writeRunState(relayState, wakeCheckout)
writeFileSync(relayTranscript, JSON.stringify({ type: "assistant", message: { id: "call", usage: { ...relayUsage, cache_read_input_tokens: relaySoft - 671 } } }) + "\n")
T("relay post-tool: below the soft threshold prints nothing", postToolRelay().stdout, "")
T("relay post-tool: below the soft threshold preserves state", readRunState(wakeCheckout).relay, undefined)
const transcriptPadding = JSON.stringify({ type: "user", message: { content: "x".repeat(1024 * 1024) } }) + "\n"
writeFileSync(relayTranscript, transcriptPadding.repeat(12) + JSON.stringify({ type: "assistant", message: { id: "call", usage: relayUsage } }) + "\n" + transcriptPadding)
T("relay post-tool: performance fixture exceeds ten MiB", statSync(relayTranscript).size > 10 * 1024 * 1024, true)
const subagentCrossing = isolatedRelayHook("relay-at-threshold.mjs", { ...postToolPayload, agent_id: "review-subagent", agent_type: "Explore" })
T("relay post-tool: a subagent tool call at the threshold prints nothing", subagentCrossing.stdout, "")
T("relay post-tool: a subagent tool call leaves the parent relay state", readRunState(wakeCheckout).relay, undefined)
T("relay post-tool: a subagent tool call records no handoff request", readHandoffRequest("relay-parent", wakeCheckout), stopRelayRequest)
// Each sample begins a fresh relay, including configuration checks and the lock's process identity probe.
const relayMeasurements = Array.from({ length: 3 }, (_, index) => {
  writeRunState(relayState, wakeCheckout)
  const started = performance.now()
  const result = postToolRelay()
  const milliseconds = performance.now() - started
  console.log(`relay post-tool timing: ${statSync(relayTranscript).size} bytes in ${milliseconds.toFixed(1)} ms (sample ${index + 1}, budget ${relayTimeoutMilliseconds / 2} ms)`)
  T(`relay post-tool: sample ${index + 1} crosses and persists without diagnostics`,
    { status: result.status, stderr: result.stderr, feedback: JSON.parse(result.stdout || "{}").hookSpecificOutput, relay: readRunState(wakeCheckout).relay },
    { status: 0, stderr: "", feedback: { hookEventName: "PostToolUse", additionalContext: feedback.hookSpecificOutput.additionalContext },
      relay: { ...stopRelayState.relay, triggeredAt: readRunState(wakeCheckout).relay?.triggeredAt } })
  return { result, milliseconds }
})
writeRunState({ ...relayState, crank: true }, wakeCheckout)
postToolRelay()
T("relay crank: threshold records durable crank mode", readHandoffRequest("relay-parent", wakeCheckout)?.crank, true)
T("relay crank: threshold preserves run mode", readRunState(wakeCheckout).crank, true)
writeRunState({ ...relayState, autoWork: true }, wakeCheckout)
postToolRelay()
T("relay auto-work: threshold records durable mode", readHandoffRequest("relay-parent", wakeCheckout)?.autoWork, true)
writeRunState({ ...readRunState(wakeCheckout), autoWork: false }, wakeCheckout)
writeRunState(stopRelayState, wakeCheckout)
recordHandoffRequest("relay-parent", stopRelayRequest, stopRelayRequest.recordedAt, wakeCheckout)
const postToolCrossing = relayMeasurements.at(-1).result
T("relay post-tool: large transcript finishes inside half its timeout", relayMeasurements.every(({ milliseconds }) => milliseconds < relayTimeoutMilliseconds / 2), true)
T("relay post-tool: crossing succeeds without diagnostics", { status: postToolCrossing.status, stderr: postToolCrossing.stderr }, { status: 0, stderr: "" })
T("relay post-tool: mid-turn crossing emits the same drain instruction", JSON.parse(postToolCrossing.stdout || "{}").hookSpecificOutput,
  { hookEventName: "PostToolUse", additionalContext: feedback.hookSpecificOutput.additionalContext })
const midTurnState = readRunState(wakeCheckout)
T("relay post-tool: pending state equals Stop state except trigger time",
  { ...midTurnState, relay: { ...midTurnState.relay, triggeredAt: stopRelayState.relay.triggeredAt } }, stopRelayState)
T("relay post-tool: handoff request equals Stop request with its trigger time",
  readHandoffRequest("relay-parent", wakeCheckout), { ...stopRelayRequest, recordedAt: midTurnState.relay?.triggeredAt })
registerWakeSource({ pid: process.pid, what: "Worker launcher" }, wakeCheckout)
T("relay post-tool: pending worker drain injects nothing", postToolRelay().stdout, "")
T("relay post-tool: Stop does not re-begin a mid-turn relay", isolatedRelayHook("relay-at-threshold.mjs").stdout, "")
T("relay post-tool: pending checks preserve relay state", readRunState(wakeCheckout), midTurnState)
T("relay post-tool: pending checks preserve handoff request", readHandoffRequest("relay-parent", wakeCheckout), { ...stopRelayRequest, recordedAt: midTurnState.relay?.triggeredAt })
clearWakeSource(process.pid, wakeCheckout)
T("relay post-tool: drained workers receive completion context", JSON.parse(postToolRelay().stdout || "{}").hookSpecificOutput,
  { hookEventName: "PostToolUse", additionalContext: checkRelayStop({ ...relayOptions, state: midTurnState }).message })
const hardRelayTranscript = readFileSync(relayTranscript, "utf8")
const hardRelayState = readRunState(wakeCheckout)
const hardRelayRequest = readHandoffRequest("relay-parent", wakeCheckout)
const softCall = (tokens = relaySoft) => writeFileSync(relayTranscript, JSON.stringify({ type: "assistant", message: { id: "call", usage: usageAt(tokens) } }) + "\n")
const stopRelay = () => isolatedRelayHook("relay-at-threshold.mjs", relayPayload, relayTimeoutMilliseconds)
softCall()
writeRunState(relayState, wakeCheckout)
const armed = postToolRelay()
T("relay soft adapter: a mid-turn crossing prints the arming context", JSON.parse(armed.stdout || "{}").hookSpecificOutput?.additionalContext?.includes("armed"), true)
T("relay soft adapter: arming persists the mark and starts no drain", { armed: readRunState(wakeCheckout).relay.armed, pending: readRunState(wakeCheckout).relay.pending, armedTokens: readRunState(wakeCheckout).relay.armedTokens }, { armed: true, pending: undefined, armedTokens: relaySoft })
T("relay soft adapter: arming records no handoff request", readHandoffRequest("relay-parent", wakeCheckout), hardRelayRequest)
T("relay soft adapter: a second mid-turn call stays silent", postToolRelay().stdout, "")
T("relay soft adapter: a turn end with open work and no wake source stays armed", { stdout: stopRelay().stdout, pending: readRunState(wakeCheckout).relay.pending }, { stdout: "", pending: undefined })
registerWakeSource({ pid: process.pid, what: "Worker launcher" }, wakeCheckout)
const quiet = stopRelay()
T("relay soft adapter: a quiet turn end begins the relay", { pending: readRunState(wakeCheckout).relay.pending, forced: readRunState(wakeCheckout).relay.forced, quiet: JSON.parse(quiet.stdout || "{}").hookSpecificOutput?.additionalContext?.includes("quiet point") }, { pending: true, forced: false, quiet: true })
T("relay soft adapter: the pending relay keeps the arming time and size", { armedAt: typeof readRunState(wakeCheckout).relay.armedAt, armedTokens: readRunState(wakeCheckout).relay.armedTokens }, { armedAt: "string", armedTokens: relaySoft })
T("relay soft adapter: the quiet relay records the machine handoff request", readHandoffRequest("relay-parent", wakeCheckout).origin, "context-relay")
clearWakeSource(process.pid, wakeCheckout)
writeRunState({ ...relayState, relay: { armed: true, armedTokens: relaySoft } }, wakeCheckout)
softCall(relaySoft - 1)
postToolRelay()
T("relay soft adapter: falling below the soft threshold clears the mark", readRunState(wakeCheckout).relay.armed, false)
const changedRecordPreload = join(wakeCheckout, "changed-record-relay.mjs")
writeFileSync(changedRecordPreload, `
import fs from "node:fs"
import { syncBuiltinESMExports } from "node:module"
const originalReaddir = fs.readdirSync
let changed = false
fs.readdirSync = function (path, ...args) {
  if (!changed && String(path).endsWith("orbit-wake-sources")) {
    changed = true
    const record = JSON.parse(fs.readFileSync(process.env.RELAY_STATE_PATH, "utf8"))
    fs.writeFileSync(process.env.RELAY_STATE_PATH, JSON.stringify({ ...record, relay: { failures: 1 } }))
  }
  return originalReaddir.call(this, path, ...args)
}
syncBuiltinESMExports()
`)
const changedRecordHook = (payload) => spawnSync(process.execPath, ["--import", pathToFileURL(changedRecordPreload).href, join(wakeHooks, "relay-at-threshold.mjs")], {
  input: JSON.stringify(payload), encoding: "utf8", timeout: relayTimeoutMilliseconds,
  env: { ...process.env, RELAY_STATE_PATH: runStatePath(wakeCheckout) },
})
softCall()
writeRunState(relayState, wakeCheckout)
const armChanged = changedRecordHook(postToolPayload)
T("relay soft adapter: a record that changed after the arm verdict skips the arm write and its message", { stdout: armChanged.stdout, relay: readRunState(wakeCheckout).relay }, { stdout: "", relay: { failures: 1 } })
writeRunState({ ...relayState, relay: { armed: true, armedAt: "2026-01-01T09:00:00Z", armedTokens: relaySoft } }, wakeCheckout)
registerWakeSource({ pid: process.pid, what: "Worker launcher" }, wakeCheckout)
const requestBeforeBegin = readHandoffRequest("relay-parent", wakeCheckout)
const beginChanged = changedRecordHook(relayPayload)
T("relay soft adapter: a record that changed after the begin verdict skips the begin write, its message and its handoff request",
  { stdout: beginChanged.stdout, relay: readRunState(wakeCheckout).relay, request: readHandoffRequest("relay-parent", wakeCheckout) }, { stdout: "", relay: { failures: 1 }, request: requestBeforeBegin })
clearWakeSource(process.pid, wakeCheckout)
writeRunState(hardRelayState, wakeCheckout)
writeFileSync(relayTranscript, hardRelayTranscript)
recordHandoffRequest("relay-parent", hardRelayRequest, hardRelayRequest.recordedAt, wakeCheckout)
const backgroundLaunches = JSON.parse(readFileSync(join(repoRoot, "tools", "__tests__", "fixtures", "claude-background-launches.json"), "utf8"))
const claudeDirectory = join(wakeCheckout, ".git", "claude")
mkdirSync(join(claudeDirectory, "sessions"), { recursive: true })
writeFileSync(join(claudeDirectory, "sessions", `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: relayPayload.session_id }))
const backgroundHook = (payload) => spawnSync(process.execPath, [join(wakeHooks, "relay-at-threshold.mjs")], {
  input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, CLAUDE_CONFIG_DIR: claudeDirectory },
})
for (const [type, tool] of [["workflow", "Workflow"], ["subagent", "Agent"]]) {
  writeRunState(relayState, wakeCheckout)
  const response = backgroundLaunches[type]
  const launched = backgroundHook({ ...relayPayload, hook_event_name: "PostToolUse", tool_name: tool, tool_response: response })
  T(`relay adapter: ${type} threshold names the background drain`, launched.stdout.includes(type), true)
  const id = response.taskId ?? response.agentId
  const waiting = { ...relayPayload, background_tasks: [{ id, type, status: "running", description: "Background work" }] }
  T(`relay adapter: live ${type} Stop cannot complete drain`, backgroundHook(waiting).stdout, "")
  T(`relay adapter: live ${type} PostToolUse cannot complete drain`, backgroundHook({ ...relayPayload, hook_event_name: "PostToolUse", tool_name: "Bash", tool_response: {} }).stdout, "")
  T(`relay adapter: finished ${type} completes on authoritative empty Stop`, backgroundHook(relayPayload).stdout.includes("drain is complete"), true)
  backgroundHook({ ...relayPayload, hook_event_name: "PostToolUse", tool_name: tool, tool_response: response })
  const recordPath = join(wakeCheckout, ".git", "orbit-background-runs", relayPayload.session_id, `${id}.json`)
  const record = JSON.parse(readFileSync(recordPath, "utf8"))
  writeFileSync(recordPath, JSON.stringify({ ...record, processStartIdentity: "previous process" }))
  T(`relay adapter: stale ${type} does not strand the pending drain`, backgroundHook({ ...relayPayload, hook_event_name: "PostToolUse", tool_name: "Bash", tool_response: {} }).stdout.includes("drain is complete"), true)
}
// A subagent that waits on a prompt stays live in every Stop payload and writes no more transcript.
writeRunState(relayState, wakeCheckout)
backgroundHook({ ...relayPayload, hook_event_name: "PostToolUse", tool_name: "Agent", tool_response: backgroundLaunches.subagent })
const heldAgent = backgroundLaunches.subagent.agentId
const heldStop = { ...relayPayload, background_tasks: [{ id: heldAgent, type: "subagent", status: "running", description: "Background work" }] }
const heldRecordPath = join(wakeCheckout, ".git", "orbit-background-runs", relayPayload.session_id, `${heldAgent}.json`)
const heldRecord = JSON.parse(readFileSync(heldRecordPath, "utf8"))
const wakeStop = (payload) => spawnSync(process.execPath, [join(wakeHooks, WAKE_HOOK)], { input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, CLAUDE_CONFIG_DIR: claudeDirectory } })
T("stuck limit: the launch record names the subagent transcript", heldRecord.transcript, join(dirname(relayTranscript), relayPayload.session_id, "subagents", `agent-${heldAgent}.jsonl`))
T("stuck limit: a live subagent below the limit holds the drain", backgroundHook(heldStop).stdout, "")
const unwatchedDrain = wakeStop(heldStop)
T("stuck limit: a drain that waits on a subagent with no waiter refuses the turn end", { status: unwatchedDrain.status, names: unwatchedDrain.stderr.includes("node tools/wait-background-runs.mjs") && unwatchedDrain.stderr.includes(`subagent ${heldAgent}`) }, { status: 2, names: true })
// A whole second: Node 22 utimes cuts the fraction to microseconds after a float multiply, so a millisecond time can read back 1 ms early.
const silentTime = new Date(Math.floor((Date.now() - 31 * 60_000) / 1000) * 1000)
const silentSince = silentTime.toISOString()
// The held agent works in its own worktree and branch. Every entry of its transcript carries the coordinator checkout as `cwd`.
const heldWorktree = join(root, "wake-identity-held-agent")
T("stuck limit: the agent worktree is created", stagingGit(["worktree", "add", "-b", "fix/held-agent", heldWorktree], wakeCheckout).status, 0)
T("stuck limit: the agent commits in its worktree", stagingGit(["commit", "--allow-empty", "-m", "agent work"], heldWorktree).status, 0)
const headOf = (directory) => stagingGit(["rev-parse", "HEAD"], directory).stdout.trim()
const transcriptTokens = { WORKTREE: heldWorktree, SESSION_DIRECTORY: wakeCheckout, OTHER_REPOSITORY: wakeOrigin, SCRATCHPAD: root }
const heldTranscript = readFileSync(join(repoRoot, "tools", "__tests__", "fixtures", "claude-subagent-transcript.jsonl"), "utf8")
  .replace(/\{\{([A-Z_]+)\}\}/g, (_token, name) => JSON.stringify(transcriptTokens[name]).slice(1, -1))
writeFileSync(heldRecordPath, JSON.stringify({ ...heldRecord, observedAt: new Date(Date.now() - 29 * 60_000).toISOString() }))
T("stuck limit: a subagent with no transcript on disk holds the drain below the limit", backgroundHook(heldStop).stdout, "")
writeFileSync(heldRecordPath, JSON.stringify({ ...heldRecord, observedAt: new Date(silentTime.getTime() - 60_000).toISOString() }))
mkdirSync(dirname(heldRecord.transcript), { recursive: true })
writeFileSync(heldRecord.transcript, heldTranscript)
utimesSync(heldRecord.transcript, silentTime, silentTime)
const releasedDrain = backgroundHook(heldStop)
T("stuck limit: 30 minutes with no transcript progress completes the drain", releasedDrain.stdout.includes("drain is complete"), true)
T("stuck limit: the drain message names the stuck subagent for the handoff", releasedDrain.stdout.includes(`subagent ${heldAgent}`) && releasedDrain.stdout.includes("stuckBackgroundRuns"), true)
T("stuck limit: the drain message names the worktree and the branch of the agent", releasedDrain.stdout.includes(`worktree ${JSON.stringify(heldWorktree).slice(1, -1)}`) && releasedDrain.stdout.includes("branch fix/held-agent"), true)
// The agent branch has no upstream, and no remote holds its one commit.
T("stuck limit: the drain message says what the worktree holds that no remote holds", releasedDrain.stdout.includes("uncommitted changes 0, unpushed commits 1"), true)
T("stuck limit: the run state records the worktree, branch and last commit of the stuck subagent, not of the coordinator",
  readRunState(wakeCheckout).stuckBackgroundRuns?.map((run) => [run.id, run.type, run.sessionId, run.worktree, run.branch, run.lastCommit, run.lastProgressAt]),
  [[heldAgent, "subagent", relayPayload.session_id, heldWorktree, "fix/held-agent", headOf(heldWorktree), silentSince]])
T("stuck limit: the agent and the coordinator have different last commits", headOf(heldWorktree) === headOf(wakeCheckout), false)
T("stuck limit: the turn end no longer waits on the stuck subagent", wakeStop(heldStop).status, 0)
// The guard broken: with no limit the same silent subagent holds the drain, as it did before the limit existed.
const stuckLimitSource = readFileSync(join(wakeCheckout, "tools", "lib", "background-runs.mjs"), "utf8")
const stuckLimitLine = "export const STUCK_RUN_MILLISECONDS = 30 * 60_000"
T("stuck limit: the broken guard targets the production limit", stuckLimitSource.includes(stuckLimitLine), true)
writeFileSync(join(wakeCheckout, "tools", "lib", "background-runs.mjs"), stuckLimitSource.replace(stuckLimitLine, "export const STUCK_RUN_MILLISECONDS = Infinity"))
T("stuck limit: with the limit removed the silent subagent holds the drain again", backgroundHook(heldStop).stdout, "")
T("stuck limit: with the limit removed the turn end waits again", wakeStop(heldStop).status, 2)
writeFileSync(join(wakeCheckout, "tools", "lib", "background-runs.mjs"), stuckLimitSource)
T("stuck limit: with the limit restored the drain completes again", backgroundHook(heldStop).stdout.includes("drain is complete"), true)
// The relay rule reads no drain below the soft threshold and no Stop rule reads one without a pending relay, so the
// hooks spend no transcript read and no git process on it there. A drain read records the silent subagent as stuck.
const drainedState = readRunState(wakeCheckout)
const heldToolCall = { ...heldStop, hook_event_name: "PostToolUse", tool_name: "Bash", tool_response: {} }
softCall(relaySoft - 1)
for (const [event, run] of [["a PostToolUse below the soft threshold", () => backgroundHook(heldToolCall)], ["a Stop below the soft threshold", () => backgroundHook(heldStop)], ["a turn end with no pending relay", () => wakeStop(heldStop)]]) {
  writeRunState(relayState, wakeCheckout)
  run()
  T(`stuck limit: ${event} reads no drain`, readRunState(wakeCheckout).stuckBackgroundRuns, undefined)
}
writeRunState(relayState, wakeCheckout)
softCall(relaySoft)
backgroundHook(heldToolCall)
T("stuck limit: a PostToolUse at the soft threshold reads the drain", readRunState(wakeCheckout).stuckBackgroundRuns?.map((run) => run.id), [heldAgent])
writeFileSync(relayTranscript, hardRelayTranscript)
writeRunState(drainedState, wakeCheckout)
backgroundHook(relayPayload)
const backgroundModulePath = join(wakeCheckout, "tools", "lib", "background-runs.mjs")
const backgroundModuleSource = readFileSync(backgroundModulePath, "utf8")
const probeMarker = join(claudeDirectory, "identity-probe-entered")
const recorderTranscript = readFileSync(relayTranscript, "utf8")
writeFileSync(relayTranscript, Array.from({ length: 20 }, (_, index) => JSON.stringify({ type: "assistant", message: { id: `recorder-${index}`, usage: relayUsage } })).join("\n") + "\n")
for (const [type, tool] of [["workflow", "Workflow"], ["subagent", "Agent"]]) {
  writeRunState(relayState, wakeCheckout)
  rmSync(probeMarker, { force: true })
  const probeEntry = "const sessionOwner = (sessionId, claudeDirectory) => {"
  T("relay recorder: slow probe injection targets the production identity lookup", backgroundModuleSource.includes(probeEntry), true)
  writeFileSync(backgroundModulePath, backgroundModuleSource.replace(probeEntry, `${probeEntry}
    writeFileSync(${JSON.stringify(probeMarker)}, "entered")
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000)
  `))
  let interrupted
  try {
    interrupted = spawnSync(process.execPath, [join(wakeHooks, "relay-at-threshold.mjs")], {
      input: JSON.stringify({ ...relayPayload, hook_event_name: "PostToolUse", tool_name: tool, tool_response: backgroundLaunches[type] }),
      encoding: "utf8", env: { ...process.env, CLAUDE_CONFIG_DIR: claudeDirectory }, timeout: 1500, killSignal: "SIGKILL",
    })
  } finally { writeFileSync(backgroundModulePath, backgroundModuleSource) }
  T(`relay recorder: ${type} launch times out inside the identity probe`, existsSync(probeMarker) && interrupted.error?.code === "ETIMEDOUT", true)
  const id = backgroundLaunches[type].taskId ?? backgroundLaunches[type].agentId
  const crossing = backgroundHook({ ...relayPayload, hook_event_name: "PostToolUse", tool_name: "Bash", tool_response: {} })
  T(`relay recorder: interrupted ${type} launch is named at the threshold before Stop`, crossing.stdout.includes(`${type} ${id}`), true)
  T(`relay recorder: interrupted ${type} launch holds the pending drain before Stop`, backgroundHook({ ...relayPayload, hook_event_name: "PostToolUse", tool_name: "Bash", tool_response: {} }).stdout, "")
  const refused = spawnSync(process.execPath, [realpathSync(join(wakeCheckout, "tools", "relay-session.mjs"))], {
    encoding: "utf8", env: { ...process.env, CLAUDE_CODE_SESSION_ID: relayPayload.session_id },
  })
  T(`relay recorder: relay CLI refuses the interrupted ${type} launch by id`, { status: refused.status, stderr: refused.stderr },
    { status: 1, stderr: `RELAY_FAILED: relay drain has background ${type} ${id}\n` })
  T(`relay recorder: owning Stop settles interrupted ${type} launch`, backgroundHook(relayPayload).stdout.includes("drain is complete"), true)
}
writeFileSync(relayTranscript, recorderTranscript)
writeRunState(midTurnState, wakeCheckout)
writeRunState({ ...midTurnState, relay: { ...midTurnState.relay, lastAttemptAt: new Date().toISOString() } }, wakeCheckout)
T("relay post-tool: retry cooldown injects nothing", postToolRelay().stdout, "")
writeRunState(relayState, wakeCheckout)
const releaseRelayLock = acquireRelayLock(wakeCheckout)
try {
  T("relay post-tool: occupied relay lock cannot begin another drain", postToolRelay().stdout, "")
  T("relay post-tool: occupied relay lock preserves state", readRunState(wakeCheckout).relay, undefined)
} finally { releaseRelayLock() }
writeRunState(relayState, wakeCheckout)
registerWakeSource({ pid: process.pid, what: "Worker launcher" }, wakeCheckout)
const crossingBarrier = join(wakeCheckout, ".git", "crossing-barrier")
mkdirSync(crossingBarrier)
const concurrentRelayPreload = join(wakeCheckout, "concurrent-relay.mjs")
writeFileSync(concurrentRelayPreload, `
import fs from "node:fs"
import { syncBuiltinESMExports } from "node:module"
import { join } from "node:path"
const originalRead = fs.readFileSync
let synchronized = false
fs.readFileSync = function (path, ...args) {
  const contents = originalRead.call(this, path, ...args)
  if (!synchronized && path === process.env.RELAY_STATE_PATH) {
    synchronized = true
    fs.writeFileSync(join(process.env.RELAY_BARRIER_PATH, String(process.pid)), "ready")
    const deadline = Date.now() + 500
    while (fs.readdirSync(process.env.RELAY_BARRIER_PATH).length < 2 && Date.now() < deadline) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5)
    }
    if (fs.readdirSync(process.env.RELAY_BARRIER_PATH).length < 2) process.exit(1)
  }
  return contents
}
syncBuiltinESMExports()
`)
const concurrentRelayHook = () => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["--import", pathToFileURL(concurrentRelayPreload).href, join(wakeHooks, "relay-at-threshold.mjs")],
    { env: { ...process.env, RELAY_STATE_PATH: runStatePath(wakeCheckout), RELAY_BARRIER_PATH: crossingBarrier } })
  let stdout = ""
  child.stdout.on("data", (chunk) => { stdout += chunk })
  child.on("error", reject)
  child.on("close", (status) => resolve({ status, stdout }))
  child.stdin.end(JSON.stringify(postToolPayload))
})
const parallelCrossings = await Promise.all([concurrentRelayHook(), concurrentRelayHook()])
T("relay post-tool: concurrent hooks both exit successfully", parallelCrossings.map((result) => result.status), [0, 0])
T("relay post-tool: concurrent crossings begin exactly once", parallelCrossings.filter((result) => result.stdout.includes(feedback.hookSpecificOutput.additionalContext)).length, 1)
clearWakeSource(process.pid, wakeCheckout)
appendChainEntry({ sessionId: "relay-parent" }, wakeCheckout)
const closeOwnerChain = () => spawnSync(process.execPath, [realpathSync(join(wakeCheckout, "tools", "relay-session.mjs")), "--close-chain"], {
  env: { ...process.env, CLAUDE_CODE_SESSION_ID: "relay-parent" }, encoding: "utf8",
})
const wakePromptPath = join(wakeCheckout, ".claude", "handoffs", "NEXT.md")
mkdirSync(join(wakeCheckout, ".claude", "handoffs"), { recursive: true })
const adapterSleepPrompt = "/sleep\nRead .claude/specs/relay.md. Every identifier is a lead to verify.\n## Sleep\nContinue.\n## Goal\ngh issue list\n## In flight\nNone.\n## Previous prompt, disposition\nCarried.\n"
writeFileSync(wakePromptPath, adapterSleepPrompt)
const adapterCommit = { ...relayPayload, hook_event_name: "PreToolUse", cwd: wakeCheckout, tool_input: { command: "git commit -m handoff" } }
writeRunState({ ...readRunState(wakeCheckout), crank: true }, wakeCheckout)
recordHandoffRequest("relay-parent", { command: "handoff", origin: "context-relay", sleep: true, crank: true }, "2026-01-01T10:00:00Z", wakeCheckout)
T("handoff crank adapter: current run requires crank instructions", isolatedRelayHook("require-handoff-prompt.mjs", adapterCommit).status, 2)
writeFileSync(wakePromptPath, `${adapterSleepPrompt}## Crank\nInvoke /crank immediately after /sleep entry.\n`)
T("handoff crank adapter: complete crank instructions pass", isolatedRelayHook("require-handoff-prompt.mjs", adapterCommit).status, 0)
writeFileSync(wakePromptPath, adapterSleepPrompt)
writeRunState({ ...readRunState(wakeCheckout), crank: false }, wakeCheckout)
T("handoff crank adapter: disabling restores sleep requirements", isolatedRelayHook("require-handoff-prompt.mjs", adapterCommit).status, 0)
T("handoff crank fixture: ordinary sleep prompt stages", stagingGit(["--literal-pathspecs", "add", ".claude/handoffs/NEXT.md"], wakeCheckout).status, 0)
T("handoff crank fixture: ordinary sleep prompt commits", stagingGit(["commit", "-m", "sleep handoff"], wakeCheckout).status, 0)
T("handoff crank adapter: disabling permits Stop after ordinary sleep prompt commit", isolatedRelayHook("require-handoff-prompt.mjs", { ...relayPayload, hook_event_name: "Stop" }).status, 0)
writeFileSync(wakePromptPath, `${adapterSleepPrompt}\n`)
T("handoff crank: disable supersedes the threshold request for Stop", checkHandoffStop({ request: readHandoffRequest("relay-parent", wakeCheckout), state: readRunState(wakeCheckout), headPrompt: adapterSleepPrompt, headPromptCommittedAt: "2026-01-01T10:05:00Z" }), null)
recordHandoffRequest("relay-parent", { command: "handoff", origin: "owner", sleep: true, crank: true }, "2026-01-01T10:06:00Z", wakeCheckout)
T("handoff crank: a newer explicit request enables the same run", readRunState(wakeCheckout).crank, true)
T("handoff crank adapter: newer request requires crank again", isolatedRelayHook("require-handoff-prompt.mjs", adapterCommit).status, 2)
T("handoff crank: newer request requires crank for Stop", blocks(checkHandoffStop({ request: readHandoffRequest("relay-parent", wakeCheckout), state: readRunState(wakeCheckout), headPrompt: adapterSleepPrompt, headPromptCommittedAt: "2026-01-01T10:07:00Z" })), true)
writeRunState({ ...readRunState(wakeCheckout), crank: false }, wakeCheckout)
recordHandoffRequest("relay-parent", { command: "handoff", origin: "context-relay", sleep: true, crank: false }, new Date().toISOString(), wakeCheckout)
rmSync(wakePromptPath)
const relayClosure = closeOwnerChain()
T("handoff adapter: a context relay cannot close the chain", { status: relayClosure.status, refused: relayClosure.stderr.includes("chain closure requires an owner-origin handoff") }, { status: 1, refused: true })
const ownerPrompt = { ...relayPayload, hook_event_name: "UserPromptSubmit", prompt: "Finish the report.\n/wrap-up --sleep" }
isolatedRelayHook("record-handoff-request.mjs", ownerPrompt)
const ownerRequest = readHandoffRequest("relay-parent", wakeCheckout)
T("relay adapter: own-line wrap-up records the owner's sleep request", { command: ownerRequest.command, sleep: ownerRequest.sleep, origin: ownerRequest.origin }, { command: "wrap-up", sleep: true, origin: "owner" })
T("relay adapter: owner handoff clears drain", readRunState(wakeCheckout).relay.pending, false)
T("relay adapter: owner handoff takes the run out of unattended mode", readRunState(wakeCheckout).sleep, false)
T("relay adapter: owner origin supersedes machine request", readHandoffRequest("relay-parent", wakeCheckout).origin, "owner")
const ownerClosure = closeOwnerChain()
T("handoff adapter: own-line wrap-up closes the owner's chain", { status: ownerClosure.status, stderr: ownerClosure.stderr, chain: openSessionChain("relay-parent", wakeCheckout) }, { status: 0, stderr: "", chain: null })
for (const [index, prompt] of [
  "we are working always using /handoff, wrap-up, etc etc\n\nwhat happens when the spec is finished?",
  "Read `/handoff --relay --sleep` and `/wrap-up` in NEXT.md.",
  "```text\n/wrap-up --sleep\n```",
  '<pasted_content source="NEXT.md">\n/handoff --relay --sleep\n</pasted_content>',
  ".claude/skills/handoff/SKILL.md",
  "<pasted_content>\n<pasted_content>\nquoted\n</pasted_content>\n/handoff --sleep\n</pasted_content>",
].entries()) {
  const sessionId = `handoff-mention-${index}`
  writeRunState({ sessionId, sleep: true, relay: { pending: true } }, wakeCheckout)
  T(`handoff adapter: mention ${index} exits quietly`, isolatedRelayHook("record-handoff-request.mjs", { ...ownerPrompt, session_id: sessionId, prompt }).status, 0)
  T(`handoff adapter: mention ${index} records nothing`, readHandoffRequest(sessionId, wakeCheckout), null)
  T(`handoff adapter: mention ${index} preserves the unattended drain`, { sleep: readRunState(wakeCheckout).sleep, pending: readRunState(wakeCheckout).relay.pending }, { sleep: true, pending: true })
}
writeRunState({ sessionId: "handoff-parenthesized", sleep: true, relay: { pending: true } }, wakeCheckout)
isolatedRelayHook("record-handoff-request.mjs", { ...ownerPrompt, session_id: "handoff-parenthesized", prompt: "/handoff --sleep" })
const parenthesizedRequest = readHandoffRequest("handoff-parenthesized", wakeCheckout)
T("handoff adapter: a direct sleep handoff records an unattended owner request", { command: parenthesizedRequest?.command, sleep: parenthesizedRequest?.sleep, origin: parenthesizedRequest?.origin }, { command: "handoff", sleep: true, origin: "owner" })
writeRunState({ ...relayState, relay: { pending: true } }, wakeCheckout)
const unreadable = isolatedRelayHook("relay-at-threshold.mjs", { ...relayPayload, transcript_path: join(wakeCheckout, "absent.jsonl") })
T("relay adapter: unreadable transcript fails open with one stderr line", { status: unreadable.status, stdout: unreadable.stdout, lines: unreadable.stderr.trim().split("\n").length }, { status: 0, stdout: "", lines: 1 })
T("relay adapter: unreadable transcript explains the skipped relay", unreadable.stderr.startsWith("Context relay skipped:"), true)
appendChainEntry({ sessionId: "relay-parent" }, wakeCheckout)
writeRunState({ ...relayState, relay: { pending: true, successorSessionId: "relay-child", successorTerminal: "term_live" } }, wakeCheckout)
adoptRelayRun("relay-child", wakeCheckout)
const interruptedTool = JSON.parse(isolatedRelayHook("forbid-superseded-session.mjs", { ...relayPayload, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "true" } }).stdout || "{}")
T("superseded adapter: adopted transfer denies Bash before chain confirmation", interruptedTool.hookSpecificOutput?.permissionDecision, "deny")
T("superseded adapter: adopted transfer names successor terminal", interruptedTool.hookSpecificOutput?.permissionDecisionReason?.includes("term_live"), true)
T("superseded adapter: adopted transfer blocks typed prompt before confirmation", JSON.parse(isolatedRelayHook("forbid-superseded-session.mjs", ownerPrompt).stdout || "{}").decision, "block")
T("superseded adapter: adopted successor remains usable before confirmation", isolatedRelayHook("forbid-superseded-session.mjs", { ...ownerPrompt, session_id: "relay-child" }).stdout, "")
confirmChainSuccessor("relay-parent", "relay-child", "term_live", 1, wakeCheckout)
const deniedTool = JSON.parse(isolatedRelayHook("forbid-superseded-session.mjs", { ...relayPayload, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "true" } }).stdout)
T("superseded adapter: Bash is denied", deniedTool.hookSpecificOutput.permissionDecision, "deny")
T("superseded adapter: refusal names live terminal", deniedTool.hookSpecificOutput.permissionDecisionReason.includes("term_live"), true)
T("superseded adapter: typed prompt is blocked", JSON.parse(isolatedRelayHook("forbid-superseded-session.mjs", ownerPrompt).stdout).decision, "block")
T("superseded adapter: live successor remains usable", isolatedRelayHook("forbid-superseded-session.mjs", { ...ownerPrompt, session_id: "relay-child" }).stdout, "")
for (const priorChain of [false, true]) {
  const checkout = join(root, `owner-handoff-fence-${priorChain}`)
  const hooks = join(checkout, ".claude/hooks")
  mkdirSync(hooks, { recursive: true })
  cpSync(join(repoRoot, "tools/lib"), join(checkout, "tools/lib"), { recursive: true })
  cpSync(join(hooksDir, "_lib"), join(hooks, "_lib"), { recursive: true })
  cpSync(join(hooksDir, "forbid-superseded-session.mjs"), join(hooks, "forbid-superseded-session.mjs"))
  cpSync(join(repoRoot, ".claude/orchestrator.json"), join(checkout, ".claude/orchestrator.json"))
  const prompt = adapterSleepPrompt.replace("/sleep\n", "/auto-work\n")
  mkdirSync(join(checkout, ".claude/handoffs"), { recursive: true })
  writeFileSync(join(checkout, ".claude/handoffs/NEXT.md"), prompt)
  if (priorChain) {
    appendChainEntry({ sessionId: "owner-ancestor" }, checkout)
    confirmChainSuccessor("owner-ancestor", "owner-predecessor", "term_owner", 1, checkout)
    closeSessionChain("owner-predecessor", checkout)
  }
  writeRunState({ sessionId: "owner-predecessor", sleep: false, autoWork: true,
    intake: { gmail: { pending: { message: { sendAttempted: true } } } } }, checkout)
  recordHandoffRequest("owner-predecessor", { command: "handoff", sleep: true, origin: "owner" }, "2026-01-01T00:00:00Z", checkout)
  T(`owner fence adapter ${priorChain}: prepares`, prepareOwnerHandoffRun("owner-predecessor", checkout), true)
  T(`owner fence adapter ${priorChain}: adopts`, adoptOwnerHandoffRun("owner-successor", prompt, checkout), true)
  const invoke = (sessionId, event) => JSON.parse(spawnSync(process.execPath, [join(hooks, "forbid-superseded-session.mjs")], {
    input: JSON.stringify({ session_id: sessionId, hook_event_name: event, tool_name: "Bash", tool_input: { command: "true" } }), encoding: "utf8",
  }).stdout || "{}")
  for (const ordinaryWrite of [false, true]) {
    if (ordinaryWrite) writeRunState({ sessionId: "owner-successor", sleep: true }, checkout)
    T(`owner fence adapter ${priorChain}/${ordinaryWrite}: predecessor tool is denied`, invoke("owner-predecessor", "PreToolUse").hookSpecificOutput?.permissionDecision, "deny")
    T(`owner fence adapter ${priorChain}/${ordinaryWrite}: predecessor prompt is blocked`, invoke("owner-predecessor", "UserPromptSubmit").decision, "block")
    T(`owner fence adapter ${priorChain}/${ordinaryWrite}: successor remains usable`, invoke("owner-successor", "PreToolUse"), {})
  }
}
writeFileSync(runStatePath(wakeCheckout), JSON.stringify({ sessionId: stopPayload.session_id, sleep: true, remaining: ["ORB-2"] }))
const wakeFile = join(wakeSourceDirectory(wakeCheckout), `${process.pid}.json`)
const isolatedWakeStop = ({ preload = null, env = {} } = {}) => spawnSync(
  process.execPath,
  [...(preload ? ["--import", pathToFileURL(preload).href] : []), join(wakeHooks, WAKE_HOOK)],
  { input: JSON.stringify(stopPayload), encoding: "utf8", windowsHide: true, env: { ...process.env, ...env } },
).status
registerWakeSource({ pid: process.pid, what: "hook identity regression" }, wakeCheckout)
const registeredWake = JSON.parse(readFileSync(wakeFile, "utf8"))
T("wake identity: registration captures a real OS process start identity", typeof registeredWake.processStartIdentity, "string")
T("wake identity: the same live process allows the real Stop adapter", isolatedWakeStop(), 0)

/** A pending record is an admission window, not permission to claim a process that never began. */
clearWakeSource(process.pid, wakeCheckout)
const neverSpawnedPid = 2_147_483_647
registerWakeSource({
  pid: neverSpawnedPid,
  what: "worker ORB-never-spawned",
  pending: true,
  pendingAt: "2026-09-12T00:00:00.000Z",
}, wakeCheckout)
T("wake pending: a registration whose process never starts blocks the real Stop adapter", isolatedWakeStop(), 2)
clearWakeSource(neverSpawnedPid, wakeCheckout)

/** Freeze the adapter's clock so both sides of the 45-second boundary run instantly. */
const wakeTimePreload = join(wakeCheckout, "wake-time.mjs")
writeFileSync(wakeTimePreload, "Date.now = () => Number(process.env.ORBIT_TEST_NOW)\n")
const pendingAt = Date.parse("2026-09-12T00:00:00.000Z")
registerWakeSource({
  pid: process.pid,
  what: "worker ORB-pending",
  workerPid: null,
  pending: true,
  pendingAt: new Date(pendingAt).toISOString(),
}, wakeCheckout)
T(
  "wake pending: a live registration inside the admission window allows the real Stop adapter",
  isolatedWakeStop({ preload: wakeTimePreload, env: { ORBIT_TEST_NOW: String(pendingAt + PENDING_WAKE_SOURCE_MAX_AGE_MS) } }),
  0,
)
T(
  "wake pending: a registration past the admission window blocks without sleeping",
  isolatedWakeStop({ preload: wakeTimePreload, env: { ORBIT_TEST_NOW: String(pendingAt + PENDING_WAKE_SOURCE_MAX_AGE_MS + 1) } }),
  2,
)
writeFileSync(wakeFile, JSON.stringify(registeredWake))
writeFileSync(wakeFile, JSON.stringify({ ...registeredWake, processStartIdentity: `${registeredWake.processStartIdentity}:different-start` }))
T("wake identity: a live pid with a different start identity blocks the real Stop adapter", isolatedWakeStop(), 2)
T("wake identity: a live mismatched record is left alone", existsSync(wakeFile), true)
writeFileSync(wakeFile, JSON.stringify({ pid: process.pid, what: "legacy registration" }))
T("wake identity: a legacy pid-only record cannot allow a stop", isolatedWakeStop(), 2)
T("wake identity: a legacy live record is left alone", existsSync(wakeFile), true)
writeFileSync(wakeFile, JSON.stringify(registeredWake))
// Keep the reader's real identity, then replace only the observation at the final decision.
// Preloading patches the OS boundary in the actual adapter, including its predicate wiring.
const wakeProbePreload = join(wakeCheckout, "wake-probe.mjs")
const wakeProbeTrace = join(wakeCheckout, "wake-probes.json")
writeFileSync(wakeProbePreload, `
import childProcess from "node:child_process"
import fs from "node:fs"
import { syncBuiltinESMExports } from "node:module"
const observed = []
const replaceIdentity = (identity) => {
  const next = observed.length === 0 ? identity
    : process.env.ORBIT_TEST_WAKE_PROBE === "unreadable" ? null : String(BigInt(identity) + 1n)
  observed.push(next)
  fs.writeFileSync(${JSON.stringify(wakeProbeTrace)}, JSON.stringify(observed))
  if (next === null) throw new Error("process identity unavailable at final probe")
  return next
}
const spawn = childProcess.spawnSync
childProcess.spawnSync = (command, args, options) => {
  const result = spawn(command, args, options)
  if (command === "powershell.exe" && args.some((arg) => arg.includes("Get-Process -Id ${process.pid} "))) {
    result.stdout = replaceIdentity(result.stdout.trim()) + "\\r\\n"
  }
  // macOS: the identity is the lstart second, so the swap moves the start time and prints it back.
  if (command === "ps" && args.includes("${process.pid}")) {
    const [state, ...lstart] = result.stdout.trim().split(/\\s+/)
    const seconds = Date.parse(lstart.join(" ") + " GMT") / 1000
    const moved = new Date(Number(replaceIdentity(String(seconds))) * 1000).toUTCString()
    const [, weekday, day, month, year, time] = /^(\\w{3}), (\\d{2}) (\\w{3}) (\\d{4}) ([\\d:]{8}) GMT$/.exec(moved)
    result.stdout = state + "   " + weekday + " " + month + " " + String(Number(day)).padStart(2) + " " + time + " " + year + "\\n"
  }
  return result
}
const read = fs.readFileSync
fs.readFileSync = (path, ...args) => {
  const contents = read(path, ...args)
  if (path !== "/proc/${process.pid}/stat") return contents
  const start = contents.lastIndexOf(") ") + 2
  const fields = contents.slice(start).trim().split(/\\s+/)
  fields[19] = replaceIdentity(fields[19])
  return contents.slice(0, start) + fields.join(" ") + "\\n"
}
syncBuiltinESMExports()
`)
for (const mode of ["replaced", "unreadable"]) {
  writeFileSync(wakeProbeTrace, "[]")
  const stopped = spawnSync(process.execPath, ["--import", pathToFileURL(wakeProbePreload).href, join(wakeHooks, WAKE_HOOK)], {
    input: JSON.stringify(stopPayload), encoding: "utf8", windowsHide: true,
    env: { ...process.env, ORBIT_TEST_WAKE_PROBE: mode },
  })
  const observations = JSON.parse(readFileSync(wakeProbeTrace, "utf8"))
  T(`wake identity: ${mode} identity after reader validation blocks the real Stop adapter`, {
    status: stopped.status,
    probes: observations.length,
    readerMatched: registeredWake.processStartIdentity.endsWith(`:${observations[0]}`),
    finalChanged: observations.length === 2 && observations[1] !== observations[0],
    explainsBlock: stopped.stderr.includes("NO live background task"),
  }, { status: 2, probes: 2, readerMatched: true, finalChanged: true, explainsBlock: true })
}
const linuxStat = "9 (cat) R 8 9 9 34816 9 4194560 174 0 1 0 0 0 0 0 20 0 1 0 185 1736704 194 18446744073709551615 104008432738304 104008433362862 140729346400016 0 0 0 0 4 0 0 0 0 17 1 0 0 0 0 0 104008433506352 104008433520688 104009433042944 140729346401036 140729346401056 140729346401056 140729346404335 0"
const linuxBootId = "03b8381d-65e7-4b3e-b03e-138371be3664"
const deadStatePreload = join(wakeCheckout, "wake-dead-state.mjs")
writeFileSync(deadStatePreload, `
import fs from "node:fs"
import { syncBuiltinESMExports } from "node:module"
Object.defineProperty(process, "platform", { value: "linux" })
const observed = []
const read = fs.readFileSync
fs.readFileSync = (path, ...args) => {
  if (path === "/proc/sys/kernel/random/boot_id") return ${JSON.stringify(linuxBootId)} + "\\n"
  if (path !== "/proc/${process.pid}/stat") return read(path, ...args)
  const state = process.env.ORBIT_TEST_WAKE_STATE_AT === "final" && observed.length === 0
    ? "R" : process.env.ORBIT_TEST_WAKE_STATE
  observed.push(state)
  fs.writeFileSync(${JSON.stringify(wakeProbeTrace)}, JSON.stringify(observed))
  return ${JSON.stringify(linuxStat)}.replace(/^\\d+ \\(cat\\) R /, ${JSON.stringify(`${process.pid} (cat) `)} + state + " ") + "\\n"
}
syncBuiltinESMExports()
`)
writeFileSync(wakeFile, JSON.stringify({ ...registeredWake, processStartIdentity: `linux:${linuxBootId}:185` }))
const deadStateResults = []
for (const state of ["X", "x", "Z"]) {
  for (const at of ["both", "final"]) {
    writeFileSync(wakeProbeTrace, "[]")
    const stopped = spawnSync(process.execPath, ["--import", pathToFileURL(deadStatePreload).href, join(wakeHooks, WAKE_HOOK)], {
      input: JSON.stringify(stopPayload), encoding: "utf8", windowsHide: true,
      env: { ...process.env, ORBIT_TEST_WAKE_STATE: state, ORBIT_TEST_WAKE_STATE_AT: at },
    })
    deadStateResults.push({
      state, at, status: stopped.status,
      observations: JSON.parse(readFileSync(wakeProbeTrace, "utf8")),
      explainsBlock: stopped.stderr.includes("NO live background task"),
    })
  }
}
T("wake identity: Linux dead states block the real Stop adapter at either probe", deadStateResults,
  ["X", "x", "Z"].flatMap((state) => ["both", "final"].map((at) => ({
    state, at, status: 2,
    observations: at === "final" ? ["R", state] : [state],
    explainsBlock: true,
  }))))
writeFileSync(wakeFile, JSON.stringify(registeredWake))
const originalKill = process.kill
try {
  process.kill = () => { throw new Error("process probe unavailable") }
  T("wake identity: an inconclusive probe supplies no wake source", readWakeSources(wakeCheckout).length, 0)
  T("wake identity: an inconclusive probe never deletes the record", existsSync(wakeFile), true)
} finally {
  process.kill = originalKill
}
const exitedProcess = spawnSync(process.execPath, ["-e", ""], { windowsHide: true })
const deadWakeFile = join(wakeSourceDirectory(wakeCheckout), `${exitedProcess.pid}.json`)
registerWakeSource({ pid: exitedProcess.pid, workerPid: process.pid, what: "orphaned worker" }, wakeCheckout)
T("wake identity: a dead launcher and live worker have a distinct state", readWakeSourceStates(wakeCheckout).orphaned.map((source) => source.workerPid), [process.pid])
T("wake identity: the orphaned registration remains for recovery", existsSync(deadWakeFile), true)
clearWakeSource(process.pid, wakeCheckout)
const orphanedStop = spawnSync(process.execPath, [join(wakeHooks, WAKE_HOOK)], { input: JSON.stringify(stopPayload), encoding: "utf8", windowsHide: true })
T("wake identity: the real Stop adapter names the orphaned worker", orphanedStop.status === 2 && orphanedStop.stderr.includes(`orphaned worker pid ${process.pid}`), true)
registerWakeSource({ pid: process.pid, what: "hook identity regression" }, wakeCheckout)
writeFileSync(deadWakeFile, JSON.stringify({ pid: exitedProcess.pid, what: "exited launcher" }))
T("wake identity: sweeping a dead registration keeps the live one", readWakeSources(wakeCheckout).map((source) => source.pid), [process.pid])
T("wake identity: a proven dead registration is removed", existsSync(deadWakeFile), false)
clearWakeSource(process.pid, wakeCheckout)
T("wake identity: cleanup removes the matching launch registration", existsSync(wakeFile), false)

const mergedAdapterSha = "4d5901100fe6d3f6db9004468c653f9ff9239ff4"
writeFileSync(runStatePath(wakeCheckout), JSON.stringify({
  sessionId: stopPayload.session_id,
  sleep: true,
  remaining: [],
  readinessLedger: [{ repositoryKey: "ui", prNumber: 1023, receiptPath: join(wakeCheckout, "receipt.json"), merged: mergedAdapterSha }],
}))
const mergedAdapterStop = spawnSync(process.execPath, [join(wakeHooks, WAKE_HOOK)], {
  input: JSON.stringify(stopPayload), encoding: "utf8", windowsHide: true,
})
T("wake merged: a merged pull request allows the real Stop adapter", mergedAdapterStop.status, 0)
T("wake merged: the adapter surfaces the merged ending and its sha, the way it surfaces BLOCKED", {
  namesTheEnding: mergedAdapterStop.stderr.includes("MERGE"),
  namesThePullRequest: mergedAdapterStop.stderr.includes("ui#1023"),
  namesTheSha: mergedAdapterStop.stderr.includes(mergedAdapterSha),
}, { namesTheEnding: true, namesThePullRequest: true, namesTheSha: true })

// The ticket guard is wired to BOTH events: the shell call and source that would issue it later.
const TICKET_HOOK = "forbid-raw-ticket-mutation.mjs"
T("adapter tickets: raw issue edit -> 2", runHook(TICKET_HOOK, bash(`gh issue edit 215 --repo ${TICKET_REPO} --add-label Bug`)), 2)
T("adapter tickets: the same raw issue edit from Bash and from Monitor -> 2, 2", bashAndMonitor(TICKET_HOOK, `gh issue edit 215 --repo ${TICKET_REPO} --add-label Bug`), [2, 2])
T("adapter tickets: pull request read -> 0", runHook(TICKET_HOOK, bash(`gh pr view 12 --repo ${CODE_REPO}`)), 0)
const mutatingScript = { tool_name: "Write", tool_input: { file_path: join(root, "post.mjs"), content: `gh issue comment 215 --repo ${TICKET_REPO} --body fixed` } }
T("adapter tickets: a written script that mutates -> 2", runHook(TICKET_HOOK, mutatingScript), 2)
T("adapter tickets: a repository tool source edit -> 0", runHook(TICKET_HOOK, { ...mutatingScript, tool_input: { ...mutatingScript.tool_input, file_path: join(repoRoot, "tools", "ticket-write.mjs") } }), 0)
T("adapter tickets: nested tools source is not exempt", runHook(TICKET_HOOK, { ...mutatingScript, tool_input: { ...mutatingScript.tool_input, file_path: join(repoRoot, "apps", "web", "tools", "post.mjs") } }), 2)
T("adapter tickets: documentation naming a write allows", runHook(TICKET_HOOK, { ...mutatingScript, tool_input: { ...mutatingScript.tool_input, file_path: join(repoRoot, "guide.md"), content: "Use `gh issue edit` through the repository adapter." } }), 0)
T("adapter tickets: an unrelated command -> 0", runHook(TICKET_HOOK, bash("npm test")), 0)

// The EF adapter re-reads the file from disk after the edit lands, so these need real files.
const EF_HOOK = "forbid-ef-migration-raw-index.mjs"
const migrationsDir = join(root, "orbit-api", "src", "Orbit.Infrastructure", "Migrations")
mkdirSync(migrationsDir, { recursive: true })
const efPayload = (name, sql) => {
  const filePath = join(migrationsDir, name)
  writeFileSync(filePath, `migrationBuilder.Sql("${sql}");\n`)
  return { tool_name: "Write", tool_input: { file_path: filePath } }
}
T("adapter ef-index: a raw CREATE INDEX -> 2", runHook(EF_HOOK, efPayload("20260101_Add.cs", "CREATE UNIQUE INDEX ix_foo ON foo (bar)")), 2)
T("adapter ef-index: the IF NOT EXISTS form -> 0", runHook(EF_HOOK, efPayload("20260102_Add.cs", "CREATE INDEX IF NOT EXISTS ix_foo ON foo (bar)")), 0)

// ---------------------------------------------------------------------------
// 4. Agent and skill frontmatter
// ---------------------------------------------------------------------------
console.log("\n# agent and skill frontmatter")
// A `description:` that is the LAST key is terminated by the closing `---`, not
// by another `key:`. A parser that looks for the next key instead runs straight
// into the body and swallows it. The block bound is the fence, and only the
// fence. Folded scalars (`>-`) continue on the indented lines that follow.
const frontmatterOf = (body) => {
  const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(body)
  if (!block) return null
  const fields = {}
  let key = null
  for (const line of block[1].split(/\r?\n/)) {
    const opener = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(line)
    if (opener) {
      key = opener[1]
      fields[key] = /^[>|][-+]?$/.test(opener[2].trim()) ? "" : opener[2].trim()
      continue
    }
    if (key && /^[ \t]+\S/.test(line)) fields[key] = `${fields[key]} ${line.trim()}`.trim()
  }
  return fields
}

const trailingDescription = ["---", "name: probe", "description: >-", "  a folded description", "  that is the last key", "---", "", "# Body", "tools: not-frontmatter"].join("\n")
T("frontmatter: a folded trailing description ends at the closing fence", frontmatterOf(trailingDescription)?.description, "a folded description that is the last key")
T("frontmatter: the body is not parsed as frontmatter", frontmatterOf(trailingDescription)?.tools, undefined)
T("frontmatter: a file without a fence has none", frontmatterOf("# Just a heading\n"), null)

const agentFiles = readdirSync(join(repoRoot, ".claude", "agents")).filter((name) => name.endsWith(".md")).map((name) => join(".claude", "agents", name))
// A skill directory with no SKILL.md is shared prose (`_shared/`), not a skill.
const skillFiles = readdirSync(join(repoRoot, ".claude", "skills"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(".claude", "skills", entry.name, "SKILL.md"))
  .filter((relative) => existsSync(join(repoRoot, relative)))
const definitionFiles = [...agentFiles, ...skillFiles]
for (const relative of definitionFiles) {
  const fields = frontmatterOf(readFileSync(join(repoRoot, relative), "utf8"))
  T(`frontmatter: ${relative} declares a name and a description`, { name: !!fields?.name, description: !!fields?.description }, { name: true, description: true })
}
// A guard that scanned nothing passes vacuously; make that a failure instead.
T("frontmatter: the scan actually read definitions", definitionFiles.length > 0, true)

const toolFlagSets = new Map()
const flagsAcceptedBy = (tool) => {
  if (toolFlagSets.has(tool)) return toolFlagSets.get(tool)
  const path = join(repoRoot, "tools", tool)
  if (!existsSync(path)) {
    toolFlagSets.set(tool, null)
    return null
  }
  const source = readFileSync(path, "utf8")
  const flags = new Set(source.match(/--[a-z][a-z0-9-]*/g) ?? [])
  toolFlagSets.set(tool, flags)
  return flags
}

const prescribed = []
for (const relative of skillFiles) {
  const text = readFileSync(join(repoRoot, relative), "utf8")
  for (const line of text.split(/\r?\n/)) {
    const invocation = line.match(/^\s*node\s+tools\/([a-z0-9-]+\.mjs)\s+(.*)$/)
    if (!invocation) continue
    // A trailing shell comment is prose, not an argument. `--board  # --auto` names one flag.
    const [, tool, restWithComment] = invocation
    const rest = restWithComment.split("#")[0]
    const accepted = flagsAcceptedBy(tool)
    if (accepted === null) {
      prescribed.push([relative, tool, "the tool does not exist"])
      continue
    }
    for (const flag of rest.match(/--[a-z][a-z0-9-]*/g) ?? []) {
      if (!accepted.has(flag)) prescribed.push([relative, tool, `does not accept ${flag}`])
    }
  }
}
for (const [relative, tool, problem] of prescribed) {
  T(`skill commands: ${relative} prescribes ${tool} which ${problem}`, false)
}
T("skill commands: every prescribed tool invocation names flags the tool accepts", prescribed.length === 0, true)
T("skill commands: the scan actually found invocations", toolFlagSets.size > 0, true)

const progressSkill = readFileSync(join(repoRoot, ".claude", "skills", "progress", "SKILL.md"), "utf8")
T("progress: integration discovery starts from the current PR head and removes stacked heads", {
  readsHeads: progressSkill.includes("headRefName"),
  readsBases: progressSkill.includes("baseRefName"),
  excludesStackedHeads: progressSkill.includes("not the integration branch"),
  refreshesIntegrationRef: progressSkill.includes("git fetch origin <integration-branch>"),
}, { readsHeads: true, readsBases: true, excludesStackedHeads: true, refreshesIntegrationRef: true })
T("progress: session discovery uses the current run ledger and proves integration ancestry", {
  checksSessionIdentity: progressSkill.includes("currentRunIdentifier"),
  readsLedger: progressSkill.includes("readinessLedger"),
  readsLiveIdentity: progressSkill.includes("gh pr view <number> --json state,mergeCommit"),
  checksIntegrationAncestry: progressSkill.includes("git merge-base --is-ancestor <merge-commit-oid> origin/<integration-branch>"),
  claimsMergedField: /readRunState[^\n]*\bmerged\b/.test(progressSkill),
  readsWorkingTree: progressSkill.includes("git status --short"),
}, { checksSessionIdentity: true, readsLedger: true, readsLiveIdentity: true, checksIntegrationAncestry: true, claimsMergedField: false, readsWorkingTree: true })
T("progress: a missing session baseline degrades explicitly to effort scope", {
  namesMissingBaseline: progressSkill.includes("no session baseline"),
  fallsBackToEffortScope: progressSkill.includes("report the effort scope instead"),
  admitsLinkedWorktreeBlindSpot: progressSkill.includes("linked worktrees"),
}, { namesMissingBaseline: true, fallsBackToEffortScope: true, admitsLinkedWorktreeBlindSpot: true })
T("progress: each ledger repository resolves and refreshes its own integration branch", {
  readsLiveBase: progressSkill.includes("gh pr view <number> --json state,mergeCommit,baseRefName"),
  anchorsResolutionToSessionPullRequest: progressSkill.includes("repository's session pull request"),
  resolvesInsideMappedRepository: progressSkill.includes("in that mapped repository"),
  scopesFetchFailure: progressSkill.includes("does not affect the other repositories"),
}, { readsLiveBase: true, anchorsResolutionToSessionPullRequest: true, resolvesInsideMappedRepository: true, scopesFetchFailure: true })
T("progress: stacked squash merges do not make an impossible ancestry promise", {
  limitsAncestryToDirectIntegrationMerges: progressSkill.includes("equals that repository's resolved integration branch"),
  reportsImmediateBase: progressSkill.includes("landed into `<baseRefName>`"),
  admitsSquashBoundary: progressSkill.includes("cannot prove arrival across that squash boundary"),
  namesRetargetPractice: /retargets a stacked child onto the integration branch before\s+merging\s+its parent/.test(progressSkill),
}, { limitsAncestryToDirectIntegrationMerges: true, reportsImmediateBase: true, admitsSquashBoundary: true, namesRetargetPractice: true })

T("progress: a closed stacked parent is never reported as the integration branch", {
  resolvesEveryState: progressSkill.includes("gh pr list --head <candidate> --state all"),
  followsOpenAndMergedParents: progressSkill.includes("`OPEN` or `MERGED`"),
  refusesClosedParent: /never report that head as the integration\s+branch/.test(progressSkill),
  terminatesOnAnEmptyArray: /An empty array, or one left empty by that filter, means the candidate is no pull request's\s+head/.test(progressSkill),
}, { resolvesEveryState: true, followsOpenAndMergedParents: true, refusesClosedParent: true, terminatesOnAnEmptyArray: true })

/**
 * A reused branch name makes that listing return several rows, which is normal rather than
 * ambiguous. The rule said BOTH "take the highest number" and "a duplicate matching head is
 * ambiguity", so the same response could either continue the walk or refuse it.
 */
T("progress: a reused head has exactly one deterministic rule", {
  oneOpenRowDecides: /Exactly one row has `state` `OPEN`: that row decides/.test(progressSkill),
  highestNumberWhenNoneOpen: /No row is `OPEN`: the highest `number` decides/.test(progressSkill),
  twoOpenRowsAreTheAmbiguity: /Two or more rows are `OPEN`: that is the ambiguity/.test(progressSkill),
  noContradictoryDuplicateRule: !progressSkill.includes("A duplicate matching head or a cycle is ambiguity"),
}, { oneOpenRowDecides: true, highestNumberWhenNoneOpen: true, twoOpenRowsAreTheAmbiguity: true, noContradictoryDuplicateRule: true })

/**
 * `--head` filters on the branch NAME only, and its own help says `<owner>:<branch>` is not
 * supported. On a public repository a fork's pull request carrying the same branch name is
 * therefore in the listing, and following its base walks into a stranger's branch.
 */
T("progress: a fork's pull request is never read as a stacked parent", {
  anchorListingRequestsTheField: /gh pr list --state open --limit 100 --json number,headRefName,baseRefName,isCrossRepository/.test(progressSkill),
  anchorRequiresMappedRepository: /row's `isCrossRepository` is false/.test(progressSkill),
  dropsForkRowsFirst: /Drop every row whose `isCrossRepository` is true, before anything else/.test(progressSkill),
  saysWhyTheFilterIsNeeded: /`--head` filters on\s+the branch NAME only/.test(progressSkill),
}, { anchorListingRequestsTheField: true, anchorRequiresMappedRepository: true, dropsForkRowsFirst: true, saysWhyTheFilterIsNeeded: true })

/**
 * Unresolved conflict markers, committed twice during the GitHub migration and caught both times by
 * looking rather than by any gate. A pre-commit hook does not check for them and neither did
 * anything else, so a merge resolved by a substitution that silently matched nothing shipped.
 */
const markerHits = []
const scanForMarkers = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      scanForMarkers(full)
      continue
    }
    if (!/\.(mjs|js|ts|tsx|json|md|ya?ml)$/.test(entry.name)) continue
    for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
      if (/^(<{7}|>{7}) /.test(line)) markerHits.push(`${full.slice(repoRoot.length + 1)}: ${line.slice(0, 40)}`)
    }
  }
}
for (const top of ["tools", ".claude"]) scanForMarkers(join(repoRoot, top))
for (const hit of markerHits) T(`conflict markers: ${hit}`, false)
T("conflict markers: no unresolved merge markers are committed", markerHits.length === 0, true)

// Handoff prompt gate: the owner's requested mode decides what NEXT.md must look like.
T("handoff request: typed /wrap-up --sleep asks for sleep", parseHandoffRequest("/wrap-up --sleep"), { command: "wrap-up", sleep: true, crank: false })
T("handoff request: typed /handoff alone is attended", parseHandoffRequest("/handoff"), { command: "handoff", sleep: false, crank: false })
T("handoff request: expanded command tags are read", parseHandoffRequest("<command-message>wrap-up</command-message>\n<command-name>/wrap-up</command-name>\n<command-args>--sleep</command-args>"), { command: "wrap-up", sleep: true, crank: false })
T("handoff request: another command is not a handoff", parseHandoffRequest("/progress --full"), null)
T("handoff request: a plain reply is not a handoff", parseHandoffRequest("proceed"), null)
for (const [label, prompt, expected] of [
  ["a leading word is a mention", "RUN /wrap-up --sleep", null],
  ["a polite prefix is a mention", "please /handoff", null],
  ["a command on the second line is read", "Finish this task.\n/wrap-up --sleep", { command: "wrap-up", sleep: true, crank: false }],
  ["an inline code mention is ignored", "Read `/handoff --relay --sleep` in NEXT.md.", null],
  ["a fenced code mention is ignored", "Example:\n```text\n/wrap-up --sleep\n```", null],
  ["a pasted content mention is ignored", '<pasted_content source="NEXT.md">\n/handoff --relay --sleep\n</pasted_content>', null],
  ["a skill path is ignored", ".claude/skills/handoff/SKILL.md", null],
  ["the first command keeps its own arguments", "/handoff then /wrap-up --sleep", { command: "handoff", sleep: false, crank: false }],
  ["the first sleep command wins", "/wrap-up --sleep then /handoff", { command: "wrap-up", sleep: true, crank: false }],
]) T(`handoff request: ${label}`, parseHandoffRequest(prompt), expected)

const goodSleepPrompt = [
  "/sleep", "", "Read .claude/specs/orbit-prod-release.md before anything else.", "",
  "## Sleep", "", "Unattended.", "", "## Goal", "", "Finish it. gh issue list --repo x --state open", "",
  "## In flight", "", "none", "", "## Previous prompt, disposition", "", "- carried", "",
  "## Carried", "", "Every identifier in this prompt came from a previous session: treat each as a lead to verify.",
].join("\n")
const attendedPrompt = goodSleepPrompt.replace("/sleep\n\n", "").replace("## Sleep\n\nUnattended.\n\n", "")
const goodCrankPrompt = `${goodSleepPrompt}\n## Crank\nInvoke /crank immediately after /sleep entry.\n`
for (const source of [{ request: { crank: true } }, { request: { sleep: true }, state: { crank: true } }, { state: { crank: true } }]) {
  const commit = (text) => checkHandoffCommit({ command: "git commit -m docs", cwd: "/repo", ...source, promptsForCommit: () => [text] })
  T("handoff crank: commit refuses a sleep prompt without crank instructions", blocks(commit(goodSleepPrompt)), true)
  T("handoff crank: commit accepts the complete crank prompt", commit(goodCrankPrompt), null)
  T("handoff crank: commit requires sleep even when a section is present", blocks(commit(goodCrankPrompt.replace("/sleep\n", "# Next\n"))), true)
  if (source.request) {
    const stop = (text) => checkHandoffStop({ ...source, request: { ...source.request, recordedAt: "2026-01-01T10:00:00Z" }, headPrompt: text, headPromptCommittedAt: "2026-01-01T10:05:00Z" })
    T("handoff crank: stop refuses missing crank instructions", blocks(stop(goodSleepPrompt)), true)
    T("handoff crank: stop accepts crank instructions", stop(goodCrankPrompt), null)
  }
}
T("handoff crank: disabled state accepts the default sleep prompt", checkHandoffCommit({ command: "git commit -m docs", cwd: "/repo", request: { sleep: true }, state: { crank: false }, promptsForCommit: () => [goodSleepPrompt] }), null)

T("handoff prompt: a complete sleep prompt passes", validateHandoffPrompt(goodSleepPrompt, { sleep: true }), [])
T("handoff prompt: a sleep prompt must start with /sleep", validateHandoffPrompt(goodSleepPrompt.replace("/sleep\n", "# NEXT\n"), { sleep: true }).some((item) => item.includes("/sleep")), true)
T("handoff prompt: a sleep prompt needs its own Sleep section", validateHandoffPrompt(goodSleepPrompt.replace("## Sleep", "## Unattended"), { sleep: true }).some((item) => item.includes("## Sleep")), true)
T("handoff prompt: an attended prompt passes without the sleep block", validateHandoffPrompt(attendedPrompt, { sleep: false }), [])
T("handoff prompt: an attended prompt must not start with a slash command", validateHandoffPrompt(goodSleepPrompt, { sleep: false }).length, 1)
T("handoff prompt: the previous prompt must be given dispositions", validateHandoffPrompt(goodSleepPrompt.replace("## Previous prompt, disposition", "## History"), { sleep: true }).some((item) => item.includes("Previous prompt")), true)
T("handoff prompt: an unrecorded mode checks only the shared rules", validateHandoffPrompt(goodSleepPrompt, {}), [])
T("handoff prompt: a blank line before /sleep fails the literal first line", validateHandoffPrompt(`\n${goodSleepPrompt}`, { sleep: true }).some((item) => item.includes("/sleep")), true)
T("handoff prompt: an indented /sleep fails the literal first line", validateHandoffPrompt(goodSleepPrompt.replace("/sleep\n", "  /sleep\n"), { sleep: true }).some((item) => item.includes("/sleep")), true)

const handoffCommit = (command, request, text) => checkHandoffCommit({ command, cwd: "/repo", request, promptsForCommit: () => (text === null ? [] : [text]) })
T("handoff commit: a sleep request refuses a prompt without /sleep", blocks(handoffCommit("git commit -m docs -- .claude/handoffs/NEXT.md", { sleep: true }, goodSleepPrompt.replace("/sleep\n", "# NEXT\n"))), true)
T("handoff commit: a sleep request accepts a complete prompt", handoffCommit("git commit -m docs -- .claude/handoffs/NEXT.md", { sleep: true }, goodSleepPrompt), null)
T("handoff commit: a commit that leaves NEXT.md alone passes", handoffCommit("git commit -m fix -- src/a.ts", { sleep: true }, null), null)
T("handoff commit: a command that commits nothing passes", handoffCommit("git status --short", { sleep: true }, "anything"), null)
T("handoff commit: a failing working copy blocks even when the staged prompt passes", blocks(checkHandoffCommit({ command: "git commit -m docs", cwd: "/repo", request: { sleep: true }, promptsForCommit: () => [goodSleepPrompt, attendedPrompt] })), true)
T("handoff commit: -C names the directory the commit runs in", gitCommitChains("git -C /other/repo commit -m x", { cwd: "/repo" }),
  { chains: [{ chain: ["/repo", "/other/repo"], subcommand: "commit" }], notModelled: "" })
const commitChains = (command, options) => gitCommitChains(command, { cwd: "/work/a", home: "/fixture-home", ...options }).chains.map(({ chain }) => chain)
for (const [name, command, want] of [
  ["a `cd` before the commit moves the directory", "cd /work/b; git commit -m x", [["/work/b"]]],
  ["a relative `cd` reads `..` by text", "cd ../b && git commit -m x", [["/work/b"]]],
  ["a `-C` variable that the line sets gives its value", 'wt=/work/b; git -C "$wt" commit -m x', [["/work/a", "/work/b"]]],
  ["a `-C ~/...` word gives the home directory", "git -C ~/repo commit -m x", [["/work/a", "/fixture-home/repo"]]],
  ["a relative `-C` word stays for git to read", "git -C l/.. commit -m x", [["/work/a", "l/.."]]],
  ["an echo of a commit text gives no chain", 'echo "git -C /nowhere commit"', []],
  ["a gh body that names a commit gives no chain", 'gh pr comment 1 -b "git -C /nowhere then commit"', []],
  ["an echo with `..` gives no chain", 'echo "git -C .. push, then commit"', []],
  ["a commit after a wrapper gives its chain", "env A=1 nice -n 5 git -C /work/c commit -m x", [["/work/a", "/work/c"]]],
  ["each commit of a line gives its own chain", "cd /work/b; git commit -m x; cd /work/c; git commit -m y", [["/work/b"], ["/work/c"]]],
  ["a commit that runs twice in one directory gives one chain", "git commit -m x || git commit -m y", [["/work/a"]]],
  ["a git command that is not a commit gives no chain", "git -C /work/b status && git log --grep commit", []],
  // Each git subcommand that can record the index in a commit is judged as `git commit` is.
  ["`git merge --continue` gives its chain", "git merge --continue", [["/work/a"]]],
  ["`git merge` of a branch gives its chain", "git merge --no-edit origin/main", [["/work/a"]]],
  ["`git cherry-pick --continue` gives its chain", "cd /work/b; git cherry-pick --continue", [["/work/b"]]],
  ["`git revert --continue` gives its chain", "git -C /work/c revert --continue", [["/work/a", "/work/c"]]],
  ["`git rebase --continue` gives its chain", 'wt=/work/b; git -C "$wt" rebase --continue', [["/work/a", "/work/b"]]],
  ["`git am --continue` gives its chain", "git am --continue", [["/work/a"]]],
  ["`git pull` gives its chain", "git pull origin main", [["/work/a"]]],
  ["each recording subcommand of a line gives its own chain", "git -C /work/b merge --continue; git -C /work/c commit -m x", [["/work/a", "/work/b"], ["/work/a", "/work/c"]]],
  ["a git command that records nothing gives no chain", "git stash list; git status; git log --merges", []],
  // `git stash` records the index in a stash commit, and an allowed `git merge --ff-only refs/stash` puts that commit on the branch.
  ["`git stash` gives its chain", "git stash", [["/work/a"]]],
  ["`git stash push` gives its chain", "cd /work/b; git stash push -m x", [["/work/b"]]],
  ["`git stash save` gives its chain", "git -C /work/c stash save x", [["/work/a", "/work/c"]]],
  ["`git stash create` gives its chain", "git stash create", [["/work/a"]]],
  ["`git stash` with an option first gives its chain", "git stash -m x", [["/work/a"]]],
  ["`git stash` with a pathspec gives its chain", "git stash -- .claude/handoffs", [["/work/a"]]],
  ["a `git stash` form that records nothing gives no chain", "git stash list; git stash show; git stash pop; git stash apply; git stash drop; git stash clear; git stash branch b; git stash store x", []],
]) T(`handoff chain: ${name}`, commitChains(command), want)
T("handoff chain: each chain keeps its subcommand", gitCommitChains("git pull; git -C /work/b merge x; git stash; git commit -m y", { cwd: "/work/a" }).chains,
  [{ chain: ["/work/a"], subcommand: "pull" }, { chain: ["/work/a", "/work/b"], subcommand: "merge" }, { chain: ["/work/a"], subcommand: "stash" }, { chain: ["/work/a"], subcommand: "commit" }])
// The checkout refresh merges `origin/main`. It runs only before `git commit`, never before the subcommand that the agent asked for.
const refreshedChains = []
T("handoff commit: each recording subcommand is judged, and only a commit refreshes the checkout", checkHandoffCommit({ command: "git pull; git -C /work/b merge x; git stash; git -C /work/c commit -m y",
  cwd: "/work/a", request: { sleep: true }, promptsForCommit: () => [goodSleepPrompt], refreshCheckout: (chain) => refreshedChains.push(chain) }), null)
T("handoff commit: the refresh reads only the commit chain", refreshedChains, [["/work/a", "/work/c"]])
// An attended line outside the subset is read from its text: each git command of the text gives its own chain.
for (const [name, command, want] of [
  ["a merge before the commit refreshes the commit chain", 'git merge "$B" && git commit -m y', [["/work/a"]]],
  ["a `git stash list` before the commit refreshes the commit chain", 'git stash list "$X"; git commit -m y', [["/work/a"]]],
]) {
  const refreshed = []
  T(`handoff commit attended text: ${name}`, [checkHandoffCommit({ command, cwd: "/work/a", unattended: false, promptsForCommit: () => [],
    refreshCheckout: (chain) => refreshed.push(chain) }), refreshed], [null, want])
}
T("handoff chain: an attended `git stash list` outside the subset gives no chain", gitCommitChains('git stash list "$X"', { cwd: "/work/a", unattended: false }), { chains: [], notModelled: "" })
T("handoff chain: an unattended recording subcommand outside the subset names the construct", gitCommitChains('git -C "$WT" merge --continue', { cwd: "/work/a" }),
  { chains: [], notModelled: "a variable in a `git` argument" })
T("handoff chain: an attended recording subcommand outside the subset is read from its text", gitCommitChains('git -C "$WT" rebase --continue', { cwd: "/work/a", unattended: false }),
  { chains: [{ chain: ["/work/a", "$WT"], subcommand: "rebase" }], notModelled: "" })
T("handoff chain: an unattended commit outside the subset names the construct", gitCommitChains('git -C "$WT" commit -m x', { cwd: "/work/a" }), { chains: [], notModelled: "a variable in a `git` argument" })
T("handoff chain: an attended commit outside the subset is read from its text", gitCommitChains('git -C "$WT" commit -m x', { cwd: "/work/a", unattended: false }),
  { chains: [{ chain: ["/work/a", "$WT"], subcommand: "commit" }], notModelled: "" })
T("handoff chain: text outside the subset that names no commit gives no chain", gitCommitChains('echo "$(cat <<\'EOF\'\nx\nEOF\n)"', { cwd: "/work/a" }), { chains: [], notModelled: "" })
T("handoff commit: an unattended commit outside the subset is refused with the rewrite", checkHandoffCommit({ command: 'git -C "$WT" commit -m x', cwd: "/repo", request: { sleep: true },
  promptsForCommit: () => [goodSleepPrompt] })?.message.includes(PLAIN_SUBSET_ADVICE), true)
const judgedChains = []
T("handoff commit: each commit of the line is judged in its own directory", checkHandoffCommit({ command: "cd /work/b; git commit -m x; git -C /work/c commit -m y", cwd: "/work/a", request: { sleep: true },
  promptsForCommit: (chain) => { judgedChains.push(chain); return [goodSleepPrompt] } }), null)
T("handoff commit: the judged chains follow the `cd` model", judgedChains, [["/work/b"], ["/work/b", "/work/c"]])

T("handoff stop: a failing prompt committed after the request refuses the stop", blocks(checkHandoffStop({ request: { sleep: true, recordedAt: "2026-01-01T10:00:00Z" }, headPrompt: attendedPrompt, headPromptCommittedAt: "2026-01-01T10:05:00Z" })), true)
T("handoff stop: a prompt committed before the request is not judged", checkHandoffStop({ request: { sleep: true, recordedAt: "2026-01-01T10:00:00Z" }, headPrompt: attendedPrompt, headPromptCommittedAt: "2026-01-01T09:00:00Z" }), null)
T("handoff stop: no recorded request allows the stop", checkHandoffStop({ request: null, headPrompt: attendedPrompt, headPromptCommittedAt: "2026-01-01T10:05:00Z" }), null)

const handoffSpecPath = ".claude/specs/orbit-prod-release.md"
const specCommit = (versions, prompt = goodSleepPrompt) => checkHandoffCommit({ command: "git commit -m docs", cwd: "/repo", request: { sleep: true },
  promptsForCommit: () => [prompt], specsForCommit: (chain, path) => (chain.join("|") === "/repo" && path === handoffSpecPath ? versions : []) })
T("handoff size: a commit of a 41984 B spec is refused with its name and size", /`\.claude\/specs\/orbit-prod-release\.md` within 40960 B \(it is 41984 B\)/.test(specCommit(["x".repeat(41984)])?.message ?? ""), true)
T("handoff size: a commit of a 40960 B spec passes", specCommit(["x".repeat(40960)]), null)
T("handoff size: an oversized working copy blocks even when the staged spec fits", blocks(specCommit(["small", "x".repeat(40961)])), true)
T("handoff size: a commit of an 8300 B prompt is refused", /`\.claude\/handoffs\/NEXT\.md` within 8192 B \(it is 8300 B\)/.test(specCommit([], `${goodSleepPrompt}\n${"x".repeat(8299 - goodSleepPrompt.length)}`)?.message ?? ""), true)
T("handoff size: a commit of an 8192 B prompt passes", specCommit([], `${goodSleepPrompt}\n${"x".repeat(8191 - goodSleepPrompt.length)}`), null)
T("handoff size: a stop after an oversized committed spec is refused", blocks(checkHandoffStop({ request: { sleep: true, recordedAt: "2026-01-01T10:00:00Z" }, headPrompt: goodSleepPrompt, headPromptCommittedAt: "2026-01-01T10:05:00Z", headSpecVersions: () => ["x".repeat(41984)] })), true)

// The shared origin: a base commit, then a main commit that edits shared.txt and .claude/specs/merge.md.
const operationOrigin = join(root, "operation-commit-origin.git")
const originSeed = join(root, "operation-commit-seed")
const inOriginSeed = (...args) => spawnSync("git", ["-C", originSeed, ...args], { encoding: "utf8" })
const originSetup = [
  () => spawnSync("git", ["init", "-q", "--bare", operationOrigin], { encoding: "utf8" }),
  () => spawnSync("git", ["init", "-q", "--initial-branch=main", originSeed], { encoding: "utf8" }),
  () => inOriginSeed("config", "user.email", "hooks@example.invalid"),
  () => inOriginSeed("config", "user.name", "Hook Test"),
  () => inOriginSeed("remote", "add", "origin", operationOrigin),
  () => { mkdirSync(join(originSeed, ".claude", "specs"), { recursive: true }); writeFileSync(join(originSeed, ".claude", "specs", "merge.md"), "spec\n"); writeFileSync(join(originSeed, "shared.txt"), "base\n"); return inOriginSeed("add", ".claude/specs/merge.md", "shared.txt") },
  () => inOriginSeed("commit", "-qm", "base"),
  () => { writeFileSync(join(originSeed, "shared.txt"), "main\n"); writeFileSync(join(originSeed, ".claude", "specs", "merge.md"), "main spec\n"); return inOriginSeed("commit", "-qam", "main change") },
  () => inOriginSeed("push", "-q", "-u", "origin", "main"),
]
T("open operation commit: origin fixture builds", originSetup.map((step) => step().status), originSetup.map(() => 0))

// A conflicted merge of main, cherry-pick, revert or rebase stages a spec edit that the operation carries, and the commit
// that concludes it authors no handoff docs. The reftable ref backend keeps CHERRY_PICK_HEAD and REVERT_HEAD in its ref
// store, not as files, so every case runs under both backends. A rebase stop leaves HEAD detached.
const writeFixture = (checkout, files) => { for (const [path, text] of Object.entries(files)) writeFileSync(join(checkout, path), text) }
const openOperationCases = [
  { name: "merge", stagedSpec: ".claude/specs/merge.md", start: ["merge", "--no-edit", "origin/main"], prepare: (inCheckout, checkout) => [
    () => inCheckout("checkout", "-qb", "feature", "origin/main~1"),
    () => { writeFixture(checkout, { "shared.txt": "feature\n" }); return inCheckout("commit", "-qam", "feature change") },
  ] },
  { name: "cherry-pick", stagedSpec: ".claude/specs/merge.md", start: ["cherry-pick", "release"], prepare: (inCheckout, checkout) => [
    () => inCheckout("checkout", "-qb", "release", "origin/main"),
    () => { writeFixture(checkout, { "shared.txt": "release\n", ".claude/specs/merge.md": "release spec\n" }); return inCheckout("commit", "-qam", "release fix") },
    () => inCheckout("checkout", "-qb", "backport", "origin/main"),
    () => { writeFixture(checkout, { "shared.txt": "backport\n" }); return inCheckout("commit", "-qam", "backport work") },
  ] },
  { name: "revert", stagedSpec: ".claude/specs/merge.md", start: ["revert", "--no-edit", "release~1"], prepare: (inCheckout, checkout) => [
    () => inCheckout("checkout", "-qb", "release", "origin/main"),
    () => { writeFixture(checkout, { "shared.txt": "release\n", ".claude/specs/merge.md": "release spec\n" }); return inCheckout("commit", "-qam", "release fix") },
    () => { writeFixture(checkout, { "shared.txt": "later\n" }); return inCheckout("commit", "-qam", "later work") },
  ] },
  { name: "rebase", stagedSpec: ".claude/specs/feature.md", start: ["rebase", "origin/main"], prepare: (inCheckout, checkout) => [
    () => inCheckout("checkout", "-qb", "feature", "origin/main~1"),
    () => { writeFixture(checkout, { "shared.txt": "feature\n", ".claude/specs/feature.md": "feature spec\n" }); return inCheckout("add", "shared.txt", ".claude/specs/feature.md") },
    () => inCheckout("commit", "-qm", "feature work"),
  ] },
]
for (const refFormat of ["files", "reftable"]) {
  for (const { name, stagedSpec, start, prepare } of openOperationCases) {
    const label = refFormat === "files" ? `${name} commit` : `${name} commit (reftable)`
    const checkout = join(root, `${name}-commit-checkout-${refFormat}`)
    const inCheckout = (...args) => spawnSync("git", ["-C", checkout, ...args], { encoding: "utf8", env: { ...process.env, GIT_EDITOR: "true" } })
    const setup = [
      () => spawnSync("git", ["clone", "-q", `--ref-format=${refFormat}`, operationOrigin, checkout], { encoding: "utf8" }),
      () => inCheckout("config", "user.email", "hooks@example.invalid"),
      () => inCheckout("config", "user.name", "Hook Test"),
      ...prepare(inCheckout, checkout),
    ]
    T(`${label}: fixture builds`, setup.map((step) => step().status), setup.map(() => 0))
    T(`${label}: the checkout uses the ${refFormat} ref backend`, inCheckout("rev-parse", "--show-ref-format").stdout.trim(), refFormat)
    T(`${label}: the ${name} stops on a conflict`, inCheckout(...start).status, 1)
    writeFixture(checkout, { "shared.txt": "resolved\n" })
    T(`${label}: the resolution stages`, inCheckout("add", "shared.txt").status, 0)
    T(`${label}: the index holds the spec edit the ${name} carries`, inCheckout("diff", "--cached", "--name-only", "--", ".claude/specs/").stdout.trim(), stagedSpec)
    const commitHook = spawnSync(process.execPath, [join(hooksDir, "require-handoff-prompt.mjs")], { cwd: checkout, encoding: "utf8",
      input: JSON.stringify({ hook_event_name: "PreToolUse", session_id: `${name}-commit-fixture-${refFormat}`, cwd: checkout, tool_input: { command: "git commit --no-edit" } }) })
    T(`${label}: the commit that concludes the ${name} passes the handoff gate`, { status: commitHook.status, stderr: commitHook.stderr }, { status: 0, stderr: "" })
    T(`${label}: the ${name} is open before it concludes`, operationInProgress(checkout), true)
    T(`${label}: the ${name} concludes`, inCheckout(name, "--continue").status, 0)
    T(`${label}: no operation is open after the ${name} concludes`, operationInProgress(checkout), false)
  }
}

const specGitRepo = mkdtempSync(join(tmpdir(), "orbit-handoff-spec-"))
const inSpecRepo = (...args) => spawnSync("git", ["-C", specGitRepo, ...args], { encoding: "utf8" })
inSpecRepo("init", "-q", "-b", "main")
inSpecRepo("config", "user.email", "hooks@test.invalid")
inSpecRepo("config", "user.name", "hooks")
mkdirSync(join(specGitRepo, ".claude", "specs"), { recursive: true })
mkdirSync(join(specGitRepo, ".claude", "handoffs"), { recursive: true })
T("handoff git: a spec in neither the index nor the tree has no version", specsForCommit([specGitRepo], handoffSpecPath), [])
writeFileSync(join(specGitRepo, handoffSpecPath), "staged\n")
inSpecRepo("add", handoffSpecPath)
writeFileSync(join(specGitRepo, handoffSpecPath), "working\n")
T("handoff git: a staged spec and its working copy are both versions", specsForCommit([specGitRepo], handoffSpecPath), ["staged\n", "working\n"])
writeFileSync(join(specGitRepo, ".claude", "handoffs", "NEXT.md"), goodSleepPrompt)
inSpecRepo("add", ".claude")
T("handoff fixture: the spec handoff commits", inSpecRepo("commit", "-q", "-m", "handoff").status, 0)
T("handoff git: the committed handoff reads its spec at that commit", newestCommittedPrompt(specGitRepo).specVersions(handoffSpecPath), ["working\n"])
T("handoff git: a spec absent at that commit has no version", newestCommittedPrompt(specGitRepo).specVersions(".claude/specs/absent.md"), [])

const handoffRepo = join(root, "handoff-repo")
mkdirSync(join(handoffRepo, ".git"), { recursive: true })
recordHandoffRequest("s-handoff", { command: "wrap-up", sleep: true }, "2026-01-01T10:00:00Z", handoffRepo)
T("handoff request: a recorded request reads back for its session", readHandoffRequest("s-handoff", handoffRepo), { command: "wrap-up", sleep: true, recordedAt: "2026-01-01T10:00:00Z" })
T("handoff request: another session sees no request", readHandoffRequest("s-other", handoffRepo), null)

const intentOnlyHook = (prompt) => spawnSync(process.execPath, [join(wakeHooks, "record-handoff-request.mjs")], {
  input: JSON.stringify({ session_id: "intent-only", prompt }), encoding: "utf8",
})
const activeBeforeIntent = readRunState(wakeCheckout)
rmSync(join(wakeCheckout, ".git", "orbit-orchestrate-run.json"))
T("wrap-up crank: no-run owner request records successfully", intentOnlyHook("/wrap-up --crank").status, 0)
T("wrap-up crank: no-run path records successor intent", readHandoffRequest("intent-only", wakeCheckout)?.crank, true)
T("wrap-up crank: successor intent creates no active run", readRunState(wakeCheckout), null)
T("wrap-up crank: successor intent creates no wake obligation", checkSleepStop({ state: readRunState(wakeCheckout), sessionId: "intent-only" }), null)
T("wrap-up crank: successor intent requires crank instructions", blocks(checkHandoffCommit({ command: "git commit -m handoff", cwd: wakeCheckout, request: readHandoffRequest("intent-only", wakeCheckout), promptsForCommit: () => [goodSleepPrompt] })), true)
T("wrap-up crank: complete successor instructions pass", checkHandoffCommit({ command: "git commit -m handoff", cwd: wakeCheckout, request: readHandoffRequest("intent-only", wakeCheckout), promptsForCommit: () => [goodCrankPrompt] }), null)
T("standalone crank: routes to its skill rather than recording a handoff", { status: intentOnlyHook("/crank").status, request: parseHandoffRequest("/crank") }, { status: 0, request: null })
const crankSkill = readFileSync(join(repoRoot, ".claude", "skills", "crank", "SKILL.md"), "utf8")
T("standalone crank: no-run entry retains the canonical sleep lifecycle", /If enabling with no active[^.]+invoke `?\.claude\/skills\/sleep\/SKILL\.md`? first/s.test(crankSkill), true)
const wrapUpSkill = readFileSync(join(repoRoot, ".claude", "skills", "wrap-up", "SKILL.md"), "utf8")
T("wrap-up crank: instructions never enter sleep to establish a run", !/enter `\/sleep` through/.test(wrapUpSkill), true)
const handoffSkill = readFileSync(join(repoRoot, ".claude", "skills", "handoff", "SKILL.md"), "utf8")
const relayPassInvocations = handoffSkill.replace(/\s+/g, " ").split(/(?<=\.) /).filter((sentence) => sentence.includes("invoke `/questions --relay`"))
T("handoff owner path: only a --relay handoff invokes the relay questions pass", relayPassInvocations.length > 0 && relayPassInvocations.every((sentence) => sentence.startsWith("With `--relay`,")), true)
T("handoff owner path: an owner handoff never runs the relay questions pass", handoffSkill.replace(/\s+/g, " ").includes("An owner `/handoff` never runs `/questions --relay`."), true)
const ownerCheckAt = handoffSkill.replace(/\s+/g, " ").indexOf("An owner `/handoff` runs `node tools/relay-session.mjs --owner-check` first, before it writes anything.")
T("handoff owner path: the owner check runs before the handoff writes its outputs", ownerCheckAt >= 0 && ownerCheckAt < handoffSkill.replace(/\s+/g, " ").indexOf("Two outputs, both committed files in this repo"), true)
const openQuestionsRule = handoffSkill.replace(/\s+/g, " ")
T("handoff open questions: every listed row enters the spec, only a filter or the owner removes one, and the owner-only steps and settled decisions stay",
  openQuestionsRule.includes("every row that `node tools/owner-questions.mjs --list` prints goes in the spec's `## Open questions`") &&
  openQuestionsRule.includes("Remove a question from that section only when a filter or the owner settled it.") &&
  openQuestionsRule.includes("Keep the owner-only steps and the settled decisions that the section also holds.") && !openQuestionsRule.includes("holds exactly the rows"), true)
writeRunState(activeBeforeIntent, wakeCheckout)

const handoffGitRepo = mkdtempSync(join(tmpdir(), "orbit-handoff-git-"))
const inHandoffRepo = (...args) => spawnSync("git", ["-C", handoffGitRepo, ...args], { encoding: "utf8" })
inHandoffRepo("init", "-q", "-b", "integration")
inHandoffRepo("config", "user.email", "hooks@test.invalid")
inHandoffRepo("config", "user.name", "hooks")
mkdirSync(join(handoffGitRepo, ".claude", "handoffs"), { recursive: true })
const handoffFile = join(handoffGitRepo, ".claude", "handoffs", "NEXT.md")
writeFileSync(handoffFile, attendedPrompt)
inHandoffRepo("add", ".")
inHandoffRepo("commit", "-q", "-m", "handoff")
const handoffOrigin = join(root, "handoff-origin.git")
T("handoff fixture: local origin initializes", inHandoffRepo("init", "--bare", handoffOrigin).status, 0)
T("handoff fixture: local origin is configured", inHandoffRepo("remote", "add", "origin", handoffOrigin).status, 0)
T("handoff fixture: main is published locally", inHandoffRepo("push", "origin", "HEAD:refs/heads/main").status, 0)
T("handoff git: an unchanged NEXT.md yields no version to judge", promptsForCommit([handoffGitRepo]), [])
writeFileSync(handoffFile, "# NEXT\n")
T("handoff git: an unstaged edit yields the working copy", promptsForCommit([handoffGitRepo]), ["# NEXT\n"])
const handoffHook = join(hooksDir, "require-handoff-prompt.mjs")
const handoffHookRun = (command) => spawnSync(process.execPath, [handoffHook], { input: JSON.stringify({ hook_event_name: "PreToolUse", session_id: "s-handoff-none", cwd: handoffGitRepo, tool_input: { command } }), encoding: "utf8" }).status
T("handoff hook: a directory pathspec commit of an invalid prompt is refused", handoffHookRun("git commit -m x -- .claude/handoffs"), 2)
T("handoff hook: the same commit from Bash and from Monitor is refused", bashAndMonitor("require-handoff-prompt.mjs", "git commit -m x -- .claude/handoffs", { cwd: handoffGitRepo, extra: { hook_event_name: "PreToolUse", session_id: "s-handoff-none" } }), [2, 2])
T("handoff hook: a glob pathspec commit of an invalid prompt is refused", handoffHookRun("git commit -m x -- '.claude/*'"), 2)
inHandoffRepo("add", ".")
writeFileSync(handoffFile, attendedPrompt)
T("handoff git: a staged edit and a different working copy yield both versions", promptsForCommit([handoffGitRepo]), ["# NEXT\n", attendedPrompt])
T("handoff hook: an index-only commit of a staged invalid prompt is refused", handoffHookRun("git commit -m x"), 2)
inHandoffRepo("add", ".")
T("handoff hook: a commit that leaves a valid prompt passes", handoffHookRun("git commit -m x -- .claude/handoffs"), 0)
inHandoffRepo("checkout", "-q", "-b", "feature", "HEAD~0")
inHandoffRepo("checkout", "-q", "integration")
writeFileSync(handoffFile, goodSleepPrompt)
spawnSync("git", ["-C", handoffGitRepo, "commit", "-q", "-am", "sleep handoff"], { encoding: "utf8", env: { ...process.env, GIT_COMMITTER_DATE: "2030-01-01T00:00:00Z" } })
inHandoffRepo("checkout", "-q", "feature")
T("handoff git: the newest committed prompt is read from another branch", newestCommittedPrompt(handoffGitRepo).text, goodSleepPrompt)
const copiedHandoffHooks = join(handoffGitRepo, ".claude/hooks")
cpSync(hooksDir, copiedHandoffHooks, { recursive: true })
cpSync(join(repoRoot, "tools/lib"), join(handoffGitRepo, "tools/lib"), { recursive: true })
if (process.env.HANDOFF_GIT_FIXTURE) cpSync(process.env.HANDOFF_GIT_FIXTURE, join(copiedHandoffHooks, "_lib/handoff-git.mjs"))
recordHandoffRequest("show-failure", { sleep: true }, new Date(0).toISOString(), handoffGitRepo)
const committedBlob = inHandoffRepo("rev-parse", "integration:.claude/handoffs/NEXT.md").stdout.trim()
T("handoff fixture: committed prompt resolves to a blob", /^[0-9a-f]{40}$/.test(committedBlob), true)
const objectPath = inHandoffRepo("rev-parse", "--git-path", `objects/${committedBlob.slice(0, 2)}/${committedBlob.slice(2)}`).stdout.trim()
rmSync(resolve(handoffGitRepo, objectPath))
T("handoff fixture: git log still reads the committed prompt metadata", inHandoffRepo("log", "-1", "--format=%H%n%cI", "--branches", "--remotes", "HEAD", "--", ".claude/handoffs/NEXT.md").status, 0)
T("handoff fixture: git show really fails for the missing blob", inHandoffRepo("show", `integration:.claude/handoffs/NEXT.md`).status !== 0, true)
const failedShowStop = spawnSync(process.execPath, [join(copiedHandoffHooks, "require-handoff-prompt.mjs")], { input: JSON.stringify({ hook_event_name: "Stop", session_id: "show-failure" }), encoding: "utf8" })
T("handoff hook: failing git show with a live request blocks Stop", failedShowStop.status, 2)
rmSync(handoffGitRepo, { recursive: true, force: true })

// The handoff gate reads the directory of a commit as the shell and the git rule read it: the `cd` model, a variable, `~`, and no commit in quoted text.
const chainHome = mkdtempSync(join(tmpdir(), "orbit-handoff-chain-"))
const chainRepository = (name, stagedPrompt) => {
  const repository = join(chainHome, name)
  const inRepository = (...args) => spawnSync("git", ["-C", repository, ...args], { encoding: "utf8" }).status
  mkdirSync(join(repository, ".claude", "handoffs"), { recursive: true })
  writeFileSync(join(repository, ".claude", "handoffs", "NEXT.md"), attendedPrompt)
  const steps = [inRepository("init", "-q", "-b", "main"), inRepository("config", "user.email", "hooks@test.invalid"), inRepository("config", "user.name", "hooks"),
    inRepository("add", "."), inRepository("commit", "-q", "-m", "handoff")]
  if (stagedPrompt !== undefined) {
    writeFileSync(join(repository, ".claude", "handoffs", "NEXT.md"), stagedPrompt)
    steps.push(inRepository("add", "."))
  }
  T(`handoff chain fixture: the ${name} repository builds`, steps, steps.map(() => 0))
  return repository
}
const stagedChainRepository = chainRepository("staged", "# NEXT\n")
const cleanChainRepository = chainRepository("clean")
const plainChainDirectory = join(chainHome, "plain")
mkdirSync(plainChainDirectory)
T("handoff chain fixture: the staged repository stages an invalid NEXT.md", spawnSync("git", ["-C", stagedChainRepository, "diff", "--cached", "--name-only"], { encoding: "utf8" }).stdout.trim(), ".claude/handoffs/NEXT.md")
const chainHook = (command, cwd, env = {}) => {
  const result = spawnSync(process.execPath, [handoffHook], { input: JSON.stringify({ hook_event_name: "PreToolUse", session_id: "s-handoff-none", cwd, tool_input: { command } }),
    encoding: "utf8", env: { ...process.env, ORBIT_LAUNCH_WORKER: "", HOME: chainHome, ...env } })
  return { status: result.status, refusal: result.stderr.split("\n")[0] }
}
const handoffMismatch = "BLOCKED: .claude/handoffs/NEXT.md does not match the unrecorded handoff the owner asked for."
const handoffChainRows = [
  ["a `cd` to the checkout with a staged invalid NEXT.md is refused", `cd ${stagedChainRepository}; git commit -m x`, cleanChainRepository, {}, { status: 2, refusal: handoffMismatch }],
  ["control: the same commit from the clean checkout passes", "git commit -m x", cleanChainRepository, {}, { status: 0, refusal: "" }],
  ["control: the same commit in the staged checkout is refused", "git commit -m x", stagedChainRepository, {}, { status: 2, refusal: handoffMismatch }],
  ["a `-C` variable that the line sets passes", `wt=${cleanChainRepository}; git -C "$wt" commit -m x --dry-run`, plainChainDirectory, {}, { status: 0, refusal: "" }],
  ["a `-C` variable that names the staged checkout is refused", `wt=${stagedChainRepository}; git -C "$wt" commit -m x`, plainChainDirectory, {}, { status: 2, refusal: handoffMismatch }],
  ["a `-C ~/...` path passes", "git -C ~/clean commit -m x --dry-run", plainChainDirectory, {}, { status: 0, refusal: "" }],
  ["a `-C ~/...` path that names the staged checkout is refused", "git -C ~/staged commit -m x", plainChainDirectory, {}, { status: 2, refusal: handoffMismatch }],
  ["an echo of a commit text passes", 'echo "git -C /nowhere commit"', plainChainDirectory, {}, { status: 0, refusal: "" }],
  ["a gh body that names a commit passes", 'gh pr comment 1 -b "git -C /nowhere then commit"', plainChainDirectory, {}, { status: 0, refusal: "" }],
  ["an echo with `..` outside a repository passes", 'echo "git -C .. push, then commit"', plainChainDirectory, {}, { status: 0, refusal: "" }],
  ["an unattended commit outside the subset is refused with the rewrite", 'git -C "$WT" commit -m x', cleanChainRepository, { ORBIT_LAUNCH_WORKER: "1" },
    { status: 2, refusal: "BLOCKED commit (the handoff gate cannot read it):" }],
  ["an attended commit outside the subset is read from its text", "git commit -m \"$(cat <<'EOF'\nx\nEOF\n)\"", stagedChainRepository, {}, { status: 2, refusal: handoffMismatch }],
  ["control: that attended commit in the clean checkout passes", "git commit -m \"$(cat <<'EOF'\nx\nEOF\n)\"", cleanChainRepository, {}, { status: 0, refusal: "" }],
  ["an unattended text outside the subset that runs no commit passes", 'echo "$(cat <<\'EOF\'\nx\nEOF\n)"', plainChainDirectory, { ORBIT_LAUNCH_WORKER: "1" }, { status: 0, refusal: "" }],
  // `git merge --continue` and the other recording subcommands record the staged NEXT.md, so the gate judges them as a commit.
  ["`git merge --continue` with a staged invalid NEXT.md is refused", "git merge --continue", stagedChainRepository, {}, { status: 2, refusal: handoffMismatch }],
  ["`git merge --continue` with a staged invalid NEXT.md is refused in a worker run", "git merge --continue", stagedChainRepository, { ORBIT_LAUNCH_WORKER: "1" }, { status: 2, refusal: handoffMismatch }],
  ["`git -C` to the staged checkout with `rebase --continue` is refused", `git -C ${stagedChainRepository} rebase --continue`, cleanChainRepository, {}, { status: 2, refusal: handoffMismatch }],
  ["control: `git merge --continue` in the clean checkout passes", "git merge --continue", cleanChainRepository, {}, { status: 0, refusal: "" }],
  // `git stash` records the staged NEXT.md in a stash commit, so the gate judges it as a commit.
  ["`git stash` with a staged invalid NEXT.md is refused", "git stash", stagedChainRepository, {}, { status: 2, refusal: handoffMismatch }],
  ["`git stash` with a staged invalid NEXT.md is refused in a worker run", "git stash", stagedChainRepository, { ORBIT_LAUNCH_WORKER: "1" }, { status: 2, refusal: handoffMismatch }],
  ["`git stash push` with a staged invalid NEXT.md is refused in a worker run", "git stash push -m x", stagedChainRepository, { ORBIT_LAUNCH_WORKER: "1" }, { status: 2, refusal: handoffMismatch }],
  ["`git stash create` with a staged invalid NEXT.md is refused in a worker run", "git stash create", stagedChainRepository, { ORBIT_LAUNCH_WORKER: "1" }, { status: 2, refusal: handoffMismatch }],
  ["control: `git stash list` with a staged invalid NEXT.md passes", "git stash list", stagedChainRepository, { ORBIT_LAUNCH_WORKER: "1" }, { status: 0, refusal: "" }],
  // `find -execdir` runs git in the directory of the found file, so a worker run refuses it as not modelled.
  ["an unattended `find -execdir` commit is refused with the rewrite", `find ${stagedChainRepository} -maxdepth 1 -name .claude -execdir git commit -m x \\;`, cleanChainRepository,
    { ORBIT_LAUNCH_WORKER: "1" }, { status: 2, refusal: "BLOCKED commit (the handoff gate cannot read it):" }],
  ["an unattended `{}` after `find -exec` in a commit is refused with the rewrite", `find ${stagedChainRepository} -maxdepth 0 -exec git -C {} commit -m x \\;`, cleanChainRepository,
    { ORBIT_LAUNCH_WORKER: "1" }, { status: 2, refusal: "BLOCKED commit (the handoff gate cannot read it):" }],
]
for (const [name, command, cwd, env, want] of handoffChainRows) T(`handoff chain hook: ${name}`, chainHook(command, cwd, env), want)
// Attended, the handoff gate reads a command outside the subset from its text. The git rule in the same matcher refuses each such command that names git.
T("handoff chain hook: an attended `find -execdir` commit is refused by the git rule in the same matcher",
  runHook("git-guardrails.mjs", bash(`find ${stagedChainRepository} -maxdepth 1 -name .claude -execdir git commit -m x \\;`, cleanChainRepository)), 2)
T("handoff chain hook: the unattended refusal names the plain subset rewrite",
  spawnSync(process.execPath, [handoffHook], { input: JSON.stringify({ hook_event_name: "PreToolUse", session_id: "s-handoff-none", cwd: cleanChainRepository, tool_input: { command: 'git -C "$WT" commit -m x' } }),
    encoding: "utf8", env: { ...process.env, ORBIT_LAUNCH_WORKER: "1" } }).stderr.includes(PLAIN_SUBSET_ADVICE), true)
// The checkout refresh runs only before `git commit`. The fixture: branch `feature/x` with an unstaged spec edit, a branch `other`, and an
// `origin/main` one commit ahead. Only the hook runs, never the command, so HEAD moves only when the hook itself merges.
const refreshOrigin = join(chainHome, "refresh-origin.git")
const refreshSeed = join(chainHome, "refresh-seed")
const refreshCheckout = join(chainHome, "refresh")
const inRefresh = (directory, ...args) => spawnSync("git", ["-C", directory, ...args], { encoding: "utf8" })
const refreshSetup = [
  () => spawnSync("git", ["init", "-q", "--bare", "-b", "main", refreshOrigin], { encoding: "utf8" }),
  () => spawnSync("git", ["init", "-q", "-b", "main", refreshSeed], { encoding: "utf8" }),
  () => inRefresh(refreshSeed, "config", "user.email", "hooks@test.invalid"),
  () => inRefresh(refreshSeed, "config", "user.name", "hooks"),
  () => { mkdirSync(join(refreshSeed, ".claude", "specs"), { recursive: true }); writeFileSync(join(refreshSeed, ".claude", "specs", "a.md"), "spec\n"); return inRefresh(refreshSeed, "add", ".") },
  () => inRefresh(refreshSeed, "commit", "-qm", "base"),
  () => inRefresh(refreshSeed, "remote", "add", "origin", refreshOrigin),
  () => inRefresh(refreshSeed, "push", "-q", "origin", "main"),
  () => spawnSync("git", ["clone", "-q", refreshOrigin, refreshCheckout], { encoding: "utf8" }),
  () => inRefresh(refreshCheckout, "config", "user.email", "hooks@test.invalid"),
  () => inRefresh(refreshCheckout, "config", "user.name", "hooks"),
  () => inRefresh(refreshCheckout, "checkout", "-qb", "other"),
  () => { writeFileSync(join(refreshCheckout, "other.txt"), "other\n"); return inRefresh(refreshCheckout, "add", "other.txt") },
  () => inRefresh(refreshCheckout, "commit", "-qm", "other"),
  () => inRefresh(refreshCheckout, "checkout", "-qb", "feature/x", "main"),
  () => { writeFileSync(join(refreshSeed, "ahead.txt"), "ahead\n"); return inRefresh(refreshSeed, "add", "ahead.txt") },
  () => inRefresh(refreshSeed, "commit", "-qm", "main ahead"),
  () => inRefresh(refreshSeed, "push", "-q", "origin", "main"),
  () => { writeFileSync(join(refreshCheckout, ".claude", "specs", "a.md"), "edited spec\n"); return inRefresh(refreshCheckout, "status", "--short") },
]
T("handoff refresh fixture: the relay checkout builds", refreshSetup.map((step) => step().status), refreshSetup.map(() => 0))
const refreshHead = () => inRefresh(refreshCheckout, "rev-parse", "HEAD").stdout.trim()
const refreshStart = { "feature/x": inRefresh(refreshCheckout, "rev-parse", "feature/x").stdout.trim(), main: inRefresh(refreshCheckout, "rev-parse", "main").stdout.trim() }
/** Each row starts on `branch` at its first commit, behind `origin/main`, with the unstaged spec edit, so a merge by the hook moves HEAD in each row. */
const refreshRun = (command, env = {}, branch = "feature/x") => {
  const reset = [inRefresh(refreshCheckout, "checkout", "-qf", branch).status, inRefresh(refreshCheckout, "reset", "-q", "--hard", refreshStart[branch]).status]
  writeFileSync(join(refreshCheckout, ".claude", "specs", "a.md"), "edited spec\n")
  const before = refreshHead()
  const { status, refusal } = chainHook(command, refreshCheckout, env)
  return { reset, status, refusal, headUnchanged: refreshHead() === before }
}
for (const [name, command, env] of [
  ["an attended `git pull`", "git pull", {}],
  ["an attended `git pull --ff-only` of the branch", "git pull --ff-only origin feature/x", {}],
  ["a worker `git merge` of a branch", "git merge --no-edit other", { ORBIT_LAUNCH_WORKER: "1" }],
  ["an attended `git merge` of a branch", "git merge --no-edit other", {}],
  ["an attended `git rebase`", "git rebase --onto other other~0 feature/x", {}],
  ["a worker `git cherry-pick --continue` with no open operation", "git cherry-pick --continue", { ORBIT_LAUNCH_WORKER: "1" }],
  ["a worker `git stash`", "git stash", { ORBIT_LAUNCH_WORKER: "1" }],
]) T(`handoff refresh hook: ${name} with an unstaged spec edit passes and leaves HEAD unchanged`, refreshRun(command, env), { reset: [0, 0], status: 0, refusal: "", headUnchanged: true })
T("handoff refresh hook: an attended `git pull` on `main` with a spec edit passes", refreshRun("git pull", {}, "main"), { reset: [0, 0], status: 0, refusal: "", headUnchanged: true })
T("handoff refresh hook: a worker `git merge` on `main` with a spec edit passes", refreshRun("git merge --no-edit other", { ORBIT_LAUNCH_WORKER: "1" }, "main"),
  { reset: [0, 0], status: 0, refusal: "", headUnchanged: true })
// The control: a `git commit` with the spec edit refreshes the relay branch, so the hook merges `origin/main` before it.
T("handoff refresh hook: the control `git commit` with an unstaged spec edit merges `origin/main` first", [refreshRun("git commit -m x"),
  inRefresh(refreshCheckout, "merge-base", "--is-ancestor", "origin/main", "HEAD").status], [{ reset: [0, 0], status: 0, refusal: "", headUnchanged: false }, 0])
rmSync(chainHome, { recursive: true, force: true })

const timelessHook = join(hooksDir, "forbid-stale-text.mjs")
T("relative sibling roots resolve from the primary checkout", siblingRoots.includes(join(primaryCommonDirectory, "..", "..", "orbit-api")), true)
const staleName = ["Tho", "mas"].join("")
const timelessRepo = join(root, "timeless-repository")
mkdirSync(join(timelessRepo, "tools"), { recursive: true })
cpSync(join(repoRoot, "tools/check-timeless.mjs"), join(timelessRepo, "tools/check-timeless.mjs"))
writeFileSync(join(timelessRepo, "tools/timeless-allowlist.json"), "[]\n")
const timelessFile = join(timelessRepo, "CLAUDE.md")
writeFileSync(timelessFile, "# Orbit\n")
const inTimelessRepo = (...args) => spawnSync("git", ["-C", timelessRepo, "-c", "user.name=Orbit Gate", "-c", "user.email=gate@orbit.test", ...args], { encoding: "utf8" })
inTimelessRepo("init", "-q", "--initial-branch=main")
inTimelessRepo("add", "CLAUDE.md", "tools/check-timeless.mjs", "tools/timeless-allowlist.json")
T("timeless fixture: the base commit lands", inTimelessRepo("commit", "-qm", "base").status, 0)
const landedEdit = (written, new_string) => {
  writeFileSync(timelessFile, written)
  const hookPayload = { hook_event_name: "PostToolUse", tool_name: "Edit", tool_input: { file_path: timelessFile, old_string: "# Orbit", new_string }, tool_response: {} }
  return spawnSync(process.execPath, [timelessHook], { input: JSON.stringify(hookPayload), encoding: "utf8" }).status
}
T("timeless hook rejects a planted name in a landed Edit", landedEdit(`${staleName}\n`, staleName), 2)
T("timeless hook passes after removal", landedEdit("# Orbit\n", "# Orbit"), 0)

console.log("\n# second-opinion verdict parsing")
const claudeFixtureDirectory = join(root, "second-opinion-bin")
mkdirSync(claudeFixtureDirectory)
symlinkSync(process.execPath, join(claudeFixtureDirectory, "node"))
writeFileSync(join(claudeFixtureDirectory, "codex"), '#!/usr/bin/env node\nprocess.exit(1)\n', { mode: 0o755 })
writeFileSync(join(claudeFixtureDirectory, "claude"), `#!/usr/bin/env node
const { writeFileSync, readFileSync } = require("node:fs")
writeFileSync(process.env.ORBIT_TEST_INVOCATION, JSON.stringify({ args: process.argv.slice(2), prompt: readFileSync(0, "utf8"), cwd: process.cwd(), disableAttachments: process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS ?? null }))
if (process.env.ORBIT_TEST_MODE === "timeout") setInterval(() => {}, 1000)
else {
  process.stdout.write(process.env.ORBIT_TEST_MODE === "invalid-envelope" ? "not json" : JSON.stringify({ is_error: process.env.ORBIT_TEST_MODE === "error", result: process.env.ORBIT_TEST_REPLY }) + "\\n")
  if (process.env.ORBIT_TEST_MODE === "exit") process.exit(1)
}
`, { mode: 0o755 })
const secondOpinionScript = join(repoRoot, ".claude", "skills", "second-opinion", "second-opinion.mjs")
const invocationPath = join(root, "second-opinion-invocation.json")
const absentClaudeDirectory = join(root, "absent-claude")
mkdirSync(absentClaudeDirectory)
const secondOpinionReply = (reply, mode = "success", input = "Review the quoted finding") => {
  const run = spawnSync(process.execPath, [secondOpinionScript, "--timeout", "1000"], {
    input,
    encoding: "utf8",
    timeout: 3_000,
    env: { ...process.env, PATH: mode === "absent" ? absentClaudeDirectory : claudeFixtureDirectory, ORBIT_TEST_REPLY: reply, ORBIT_TEST_MODE: mode, ORBIT_TEST_INVOCATION: invocationPath },
  })
  T("second-opinion: process exits successfully", run.status, 0)
  T("second-opinion: stdout is one JSON line", run.stdout.trim().split(/\r?\n/).length, 1)
  return run.status === 0 ? JSON.parse(run.stdout) : {}
}
const placeholderVerdict = JSON.stringify({ verdict: "AGREE", confidence: "high", reasoning: "Remove {name} on {date}." })
const placeholderResult = secondOpinionReply(placeholderVerdict)
T("second-opinion: placeholders inside reasoning keep the verdict", [placeholderResult.status, placeholderResult.verdict, placeholderResult.confidence], ["OK", "AGREE", "high"])
const fencedResult = secondOpinionReply(`\`\`\`json\n${placeholderVerdict}\n\`\`\``)
T("second-opinion: a fenced verdict parses", [fencedResult.status, fencedResult.verdict], ["OK", "AGREE"])
const proseResult = secondOpinionReply(`Before. ${placeholderVerdict} After.`)
T("second-opinion: prose around a verdict parses", [proseResult.status, proseResult.verdict], ["OK", "AGREE"])
const escapedVerdict = JSON.stringify({ verdict: "DISAGREE", confidence: "medium", reasoning: 'The code says "{name}" and uses {"key":1}.' })
const escapedResult = secondOpinionReply(escapedVerdict)
T("second-opinion: escaped quotes do not break brace matching", [escapedResult.status, escapedResult.verdict, escapedResult.reasoning], ["OK", "DISAGREE", 'The code says "{name}" and uses {"key":1}.'])
const newestResult = secondOpinionReply(`${placeholderVerdict}\n${escapedVerdict}`)
T("second-opinion: the newest verdict wins", [newestResult.status, newestResult.verdict], ["OK", "DISAGREE"])
const invalidReply = "No JSON verdict here."
const invalidResult = secondOpinionReply(invalidReply)
T("second-opinion: unparseable replies retain raw text", [invalidResult.status, invalidResult.reason, invalidResult.raw], ["UNAVAILABLE", "unparseable verdict", invalidReply])
for (const invalidObject of ['{"verdict":"MAYBE"}', "{"]) {
  const invalidObjectResult = secondOpinionReply(invalidObject)
  T("second-opinion: invalid object at start returns unavailable", [invalidObjectResult.status, invalidObjectResult.reason, invalidObjectResult.raw], ["UNAVAILABLE", "unparseable verdict", invalidObject])
}

const invocation = existsSync(invocationPath) ? JSON.parse(readFileSync(invocationPath, "utf8")) : null
T("second-opinion: calls Claude without tools or inherited MCP configuration", invocation?.args, ["-p", "--model", "claude-opus-5-5", "--output-format", "json", "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--disable-slash-commands", "--no-session-persistence"])
T("second-opinion: dossier @file mentions stay plain text (attachment expansion disabled)", invocation?.disableAttachments, "1")
T("second-opinion: dossier arrives over stdin outside the repository", Boolean(invocation?.prompt.includes("Review the quoted finding")) && invocation?.cwd === realpathSync(tmpdir()), true)
T("second-opinion: the requested model is reported", placeholderResult.model, "claude-opus-5-5")
for (const [mode, reason] of [["absent", "claude not runnable (ENOENT)"], ["timeout", "claude timed out"], ["invalid-envelope", "unparseable response from claude"], ["error", "claude reported an error"], ["exit", "claude exited with status 1"]]) {
  const result = secondOpinionReply(placeholderVerdict, mode)
  T(`second-opinion: ${mode} degrades without a verdict`, [result.status, result.reason, result.verdict], ["UNAVAILABLE", reason, undefined])
}
const emptyResult = secondOpinionReply("")
T("second-opinion: an empty response degrades", [emptyResult.status, emptyResult.reason], ["UNAVAILABLE", "empty response from claude"])
const noFindingResult = secondOpinionReply(placeholderVerdict, "success", " ")
T("second-opinion: no dossier degrades", [noFindingResult.status, noFindingResult.reason], ["UNAVAILABLE", "no finding text on stdin"])

// ---------------------------------------------------------------------------
// Stale files offer (UserPromptSubmit), in the isolated checkout so no test reads or writes this machine's listing
// ---------------------------------------------------------------------------
console.log("\n# offer-stale-cleanup (stale files offer on every prompt)")
const { LISTING_MAX_AGE_MS, listingIdOf, staleFilesStorePath } = await import("../../tools/lib/stale-files.mjs")
const STALE_OFFER_HOOK = "offer-stale-cleanup.mjs"
cpSync(join(hooksDir, STALE_OFFER_HOOK), join(wakeHooks, STALE_OFFER_HOOK))
const staleListingArguments = join(root, "stale-listing-arguments.json")
// The real tool reads the whole machine. This stand-in only records how the hook starts a listing.
writeFileSync(join(wakeCheckout, "tools", "stale-files.mjs"), `import { writeFileSync } from "node:fs"\nwriteFileSync(${JSON.stringify(staleListingArguments)}, JSON.stringify(process.argv.slice(2)))\n`)
const staleSessionRoot = join(root, "stale-offer-sessions")
const staleSessionDirectory = join(staleSessionRoot, "0f0f0f0f-0000-4000-8000-00000000000f")
mkdirSync(staleSessionDirectory, { recursive: true })
const offerPrompt = { session_id: "stale-offer-session", hook_event_name: "UserPromptSubmit", prompt: "Continue.", cwd: wakeCheckout, scratchpad_dir: join(staleSessionRoot, "stale-offer-session", "scratchpad") }
const runOfferHook = (payload = offerPrompt, env = {}) => spawnSync(process.execPath, [join(wakeHooks, STALE_OFFER_HOOK)], { input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, ORBIT_LAUNCH_WORKER: "", ...env } })
const offerOutput = (result) => (result.stdout === "" ? null : JSON.parse(result.stdout).hookSpecificOutput)
const startedListing = async (attempts = 100) => {
  for (let attempt = 0; attempt < attempts && !existsSync(staleListingArguments); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 50))
  const started = existsSync(staleListingArguments) ? JSON.parse(readFileSync(staleListingArguments, "utf8")) : null
  rmSync(staleListingArguments, { force: true })
  rmSync(join(wakeCheckout, ".git", "orbit-stale-files-refresh.json"), { force: true })
  return started
}
const storeStaleListing = (stale, generatedAt = new Date().toISOString()) => writeFileSync(staleFilesStorePath(wakeCheckout),
  JSON.stringify({ version: 1, generatedAt, listingId: listingIdOf(stale), context: { sessionId: "stale-offer-session", sessionRoot: staleSessionRoot }, stale, kept: [] }))
const staleItem = { kind: "session", path: staleSessionDirectory, bytes: 3 * 1024 ** 3, reason: "not this session, its predecessor, or a session with a live process" }

const firstPrompt = runOfferHook()
T("stale offer: a prompt with no stored listing adds nothing", [firstPrompt.status, firstPrompt.stdout], [0, ""])
T("stale offer: a prompt with no stored listing starts one detached listing for this session", await startedListing(), ["--list", "--session", "stale-offer-session", "--session-root", staleSessionRoot])
storeStaleListing([staleItem])
const offered = runOfferHook()
const offerContext = offerOutput(offered)?.additionalContext ?? ""
T("stale offer: a prompt with a stale item exits 0 and adds context to the prompt", [offered.status, offerOutput(offered)?.hookEventName], [0, "UserPromptSubmit"])
T("stale offer: the context is one line with the item count, the total size and the removal command", {
  oneLine: !offerContext.includes("\n"), count: offerContext.includes("1 item, 3.0 GB (1 session directory)"), owner: /Offer this cleanup to the owner in one line/.test(offerContext),
  consent: /only after the owner says yes/.test(offerContext), command: offerContext.includes(`node tools/stale-files.mjs --delete --listing ${listingIdOf([staleItem])}`),
}, { oneLine: true, count: true, owner: true, consent: true, command: true })
T("stale offer: the offer appears again on the next prompt", runOfferHook().stdout, offered.stdout)
T("stale offer: a recent listing starts no second listing", await startedListing(20), null)
T("stale offer: a launched worker has no owner, so it gets no offer", runOfferHook(offerPrompt, { ORBIT_LAUNCH_WORKER: "1" }).stdout, "")
T("stale offer: a subagent gets no offer", runOfferHook({ ...offerPrompt, agent_id: "agent-1" }).stdout, "")
storeStaleListing([staleItem], new Date(Date.now() - LISTING_MAX_AGE_MS - 1000).toISOString())
T("stale offer: an old listing still gives the offer", offerOutput(runOfferHook())?.additionalContext, offerContext)
T("stale offer: an old listing starts a new listing", await startedListing(), ["--list", "--session", "stale-offer-session", "--session-root", staleSessionRoot])
storeStaleListing([])
T("stale offer: a listing with no stale item adds nothing", [runOfferHook().status, runOfferHook().stdout], [0, ""])
storeStaleListing([{ ...staleItem, path: join(staleSessionRoot, "removed-by-hand") }])
T("stale offer: an item that no longer exists is not offered", runOfferHook().stdout, "")
rmSync(staleFilesStorePath(wakeCheckout), { force: true })

T("monitor parity: each guard on the Bash matcher refuses one command from Bash and from Monitor in a test", BASH_GUARDS.filter((file) => !monitorRefusalGuards.has(file)), [])

console.log(`\n${fails === 0 ? "ORBIT HOOKS OK" : `ORBIT HOOKS FAILED (${fails})`}`)
process.exit(fails === 0 ? 0 : 1)
