import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { REPO_ROOT, T, same, stage, stageRepo } from "./_harness.mjs"
import { assertDetachedRunDirectory, claimEmulatorPort, emulatorPortClaimDirectory, launcherSettings, proofOrder, protectedDirectories, readOnlyLaunch, readOnlyPaths, resultVerdict, reviewBrief, reviewOrder, runDirectorySnapshot, runDirectoryWrites, SANDBOX_EXEC, sandboxedInvocation, writeSandboxAvailable, writeSandboxProfile } from "../lib/review-run.mjs"
import { composeRunNote } from "../lib/run-notes.mjs"
import { processStartIdentity } from "../lib/run-state.mjs"

const UNIT = "lib/review-run.mjs"

const gitWith = (environment) => (directory, args) => spawnSync("git", ["-C", directory, "-c", "user.email=gate@orbit.test", "-c", "user.name=Orbit Gate", ...args], {
  encoding: "utf8",
  env: { ...process.env, ...environment },
})

const verdictCases = () => {
  same(`${UNIT}: a clean review verdict is read`, resultVerdict("VERDICT: CLEAN\n\nHEAD: abc\n", "review"), "VERDICT: CLEAN")
  same(`${UNIT}: a review verdict with defects is read`, resultVerdict("VERDICT: DEFECTS (3)\r\nmore", "review"), "VERDICT: DEFECTS (3)")
  same(`${UNIT}: a passing proof is read`, resultVerdict("PROOF: PASS\n", "proof"), "PROOF: PASS")
  same(`${UNIT}: a failing proof is read`, resultVerdict("PROOF: FAIL (2 defects)\n", "proof"), "PROOF: FAIL (2 defects)")
  for (const [text, mode] of [
    ["PROOF: PASS", "review"],
    ["VERDICT: CLEAN", "proof"],
    ["The verdict is VERDICT: CLEAN", "review"],
    ["\nVERDICT: CLEAN", "review"],
    ["VERDICT: DEFECTS", "review"],
    ["", "proof"],
  ]) {
    same(`${UNIT}: ${JSON.stringify(text)} is no ${mode} verdict line`, resultVerdict(text, mode), null)
  }
  // The launcher publishes a result only when the run note step accepts its first line (thread b_s2).
  for (const line of ["VERDICT: CLEAN", "VERDICT: DEFECTS (1)", "VERDICT: DEFECTS (12)", "VERDICT: DEFECTS (0)", "VERDICT: DEFECTS (01)", "VERDICT: DEFECTS ()"]) {
    let noteAccepts = true
    try { composeRunNote({ kind: "review", head: "0123456789abcdef0123456789abcdef01234567", body: `${line}\nHEAD: abc\n` }) } catch { noteAccepts = false }
    same(`${UNIT}: the launcher publishes ${JSON.stringify(line)} only when post-run-note accepts it`, resultVerdict(`${line}\n`, "review") !== null, noteAccepts)
  }
}

/** A result that stays in a scratchpad file reaches no other computer, so each rule names its GitHub home (thread b_s2). */
const resultHomeCases = () => {
  const text = (path) => readFileSync(join(REPO_ROOT, path), "utf8")
  const lines = (path) => text(path).split("\n")
  const handoff = lines(".claude/skills/handoff/SKILL.md")
  const first = handoff.findIndex((line) => line.startsWith("4. The in-flight inventory"))
  const row = handoff.slice(first, first + 1 + handoff.slice(first + 1).findIndex((line) => /^\d+\. /.test(line))).join("\n")
  T(`${UNIT}: the handoff row of a review or proof worker names no order file, no result file and no scratchpad`,
    row.includes("--review") && !/order file|result file|scratchpad/.test(row) && row.includes("run note"), row)
  const posting = lines(".claude/playbooks/review-and-audit.md").find((line) => line.startsWith("4. Read the result file")) ?? ""
  T(`${UNIT}: rule 14 posts the review result as the review run note`,
    posting.includes("post-run-note.mjs --kind review --issue <ticket> --head <full sha> --body-file <result>"), posting)
  T(`${UNIT}: the proof paragraph of operations.md posts the proof result as a decision note`,
    /post-run-note\.mjs --kind decision --issue <ticket> --body-file <result>/.test(text(".claude/playbooks/operations.md")), "no decision note step")
  T(`${UNIT}: orchestrate names the run note kind of a review result and of a proof result`,
    /`post-run-note\.mjs --kind review`\s+and a proof result as `--kind decision`/.test(text(".claude/skills/orchestrate/SKILL.md")), "no run note step")
}

const pathCases = () => {
  const order = stage("review-run/order.md", "Review the head.\n")
  const output = join(dirname(order), "result.md")
  const copy = dirname(stage("review-run/copy/file.txt", "a copy outside every repository\n"))
  const repository = stageRepo("review-run-paths")
  mkdirSync(join(repository.path, "nested"), { recursive: true })
  const outside = readOnlyPaths(order, output, copy, "review")
  T(`${UNIT}: a copy outside every repository is accepted and is no git worktree`, outside.runDirectory === realpathSync(copy) && outside.gitWorktree === false, JSON.stringify(outside))
  const plainGit = gitWith({})
  const detached = join(dirname(repository.path), "review-run-paths-detached")
  plainGit(repository.path, ["worktree", "add", "-q", "--detach", detached])
  const worktreeRoot = readOnlyPaths(order, output, detached, "proof")
  T(`${UNIT}: a detached worktree root is accepted as a git run directory`, worktreeRoot.gitWorktree === true && worktreeRoot.orderFile === realpathSync(order), JSON.stringify(worktreeRoot))
  let detachedMessage = "accepted"
  try { assertDetachedRunDirectory(worktreeRoot.runDirectory, [repository.path]) } catch (error) { detachedMessage = error.message }
  same(`${UNIT}: a detached worktree outside the configured checkouts passes the run directory rule (thread vkfc)`, detachedMessage, "accepted")
  const branchWorktree = join(dirname(repository.path), "review-run-paths-branch")
  plainGit(repository.path, ["worktree", "add", "-q", "-b", "ticket-branch", branchWorktree])
  const primaryDetached = stageRepo("review-run-paths-primary")
  plainGit(primaryDetached.path, ["checkout", "-q", "--detach"])
  for (const [label, directory, repositories, pattern] of [
    ["a branch worktree whose ticket worker exited", branchWorktree, [repository.path], /is on a branch; make a detached worktree at the head/],
    ["the primary checkout of a configured repository on its branch", repository.path, [repository.path], /is the configured repository/],
    ["the checkout of a configured repository at a detached HEAD", primaryDetached.path, [primaryDetached.path], /is the configured repository/],
  ]) {
    let message = "accepted"
    try { assertDetachedRunDirectory(readOnlyPaths(order, output, directory, "review").runDirectory, repositories) } catch (error) { message = error.message }
    T(`${UNIT}: the run directory rule refuses ${label} (thread vkfc)`, pattern.test(message), message)
  }
  for (const [label, argv, pattern] of [
    ["a missing --directory", [order, output, null], /--directory is required for --review/],
    ["a directory inside a repository that is not its root", [order, output, join(repository.path, "nested")], /is inside a repository but is not a worktree root/],
    ["a run directory that does not exist", [order, output, join(copy, "absent")], /run directory not found/],
    ["an output that already exists", [order, order, copy], /review output must be a new file/],
    ["an order inside the run directory", [join(copy, "file.txt"), output, copy], /order lives inside the run directory/],
    ["an output inside the run directory", [order, join(copy, "result.md"), copy], /output lives inside the run directory/],
    ["the git directory of a repository (thread __od)", [order, output, join(repository.path, ".git")], /is inside a git directory/],
    ["a directory inside a git directory (thread __od)", [order, output, join(repository.path, ".git", "refs")], /is inside a git directory/],
    ["the git directory of a linked worktree (thread __od)", [order, output, join(repository.path, ".git", "worktrees", "review-run-paths-detached")], /is inside a git directory/],
  ]) {
    let message = "accepted"
    try { readOnlyPaths(...argv, "review") } catch (error) { message = error.message }
    T(`${UNIT}: refuses ${label}`, pattern.test(message), message)
  }
}

/** The profile closes the protected directories, opens the run directory inside them, then closes its git link again. */
const profileCases = () => {
  const profile = writeSandboxProfile({ protectedDirectories: ["/work/repos", "/work/repos/ui"], homeDirectory: "/home/a.b", runDirectory: "/work/repos/review", gitWorktree: true })
  const lines = profile.split("\n")
  const at = (text) => lines.findIndex((line) => line.includes(text))
  T(`${UNIT}: the profile allows by default and denies each protected directory`,
    lines[1] === "(allow default)" && at('(deny file-write* (subpath "/work/repos"))') > 1 && at('(deny file-write* (subpath "/work/repos/ui"))') > 1, profile)
  T(`${UNIT}: the run directory opens after every protected directory, and its .git closes after that`,
    at('(allow file-write* (subpath "/work/repos/review"))') > at('(deny file-write* (subpath "/work/repos/ui"))') &&
      at('(deny file-write* (subpath "/work/repos/review/.git"))') > at('(allow file-write* (subpath "/work/repos/review"))'), profile)
  T(`${UNIT}: the git directory rule is scoped to the home directory, with its dot escaped`, profile.includes('(regex "^/home/a\\\\.b/(.*/)?[^/]*\\\\.git(/|$)")'), profile)
  T(`${UNIT}: only the Vite and cache directories inside node_modules open again, after the protected directories`,
    at('(allow file-write* (regex #"/node_modules/\\.(vite|vite-temp|cache)(/|$)"))') > at('(deny file-write* (subpath "/work/repos/ui"))'), profile)
  T(`${UNIT}: the profile refuses each git network transport`, profile.includes('(deny process-exec (regex #"/git-remote-[^/]+$") (regex #"/ssh$"))'), profile)
  // CodeQL alert 60: each backslash is escaped before each quote, in the strings and in the regex.
  let odd = ""
  try { odd = writeSandboxProfile({ protectedDirectories: ['/work/a\\b"c'], homeDirectory: '/home/x\\y"z', runDirectory: "/work/run" }) } catch (error) { odd = error.message }
  T(`${UNIT}: a path with a backslash and a quote becomes one escaped profile string`, odd.includes('(deny file-write* (subpath "/work/a\\\\b\\"c"))'), odd)
  T(`${UNIT}: a home directory with a backslash and a quote becomes one escaped regex string`, odd.includes('(regex "^/home/x\\\\\\\\y\\"z/(.*/)?[^/]*\\\\.git(/|$)")'), odd)
  for (const path of ["/work/a\nb", "/work/a\rb"]) {
    let message = "accepted"
    try { writeSandboxProfile({ protectedDirectories: [path], homeDirectory: "/home/a", runDirectory: "/work/run" }) } catch (error) { message = error.message }
    T(`${UNIT}: the profile refuses the path ${JSON.stringify(path)}`, /cannot name a path with a line break/.test(message), message)
  }
  // The run directory opens after every deny, so a run directory that holds a protected directory or the home directory would reopen it (thread yoYL).
  for (const [label, runDirectory, pattern] of [
    ["the directory that holds the repositories", "/work/repos", /holds the protected directory \/work\/repos\/ui/],
    ["a parent of every protected directory", "/work", /holds the protected directory \/work\/repos/],
    ["the home directory", "/home/a.b", /holds the home directory \/home\/a\.b/],
    ["a parent of the home directory", "/home", /holds the home directory \/home\/a\.b/],
  ]) {
    let message = "accepted"
    try { writeSandboxProfile({ protectedDirectories: ["/work/repos", "/work/repos/ui"], homeDirectory: "/home/a.b", runDirectory, gitWorktree: false }) } catch (error) { message = error.message }
    T(`${UNIT}: the profile refuses a run directory that is ${label} (thread yoYL)`, pattern.test(message), message)
  }
  T(`${UNIT}: a git run directory that is itself a protected directory, or sits inside one, still gets a profile (thread yoYL)`,
    [writeSandboxProfile({ protectedDirectories: ["/work/repos", "/work/review"], homeDirectory: "/home/a.b", runDirectory: "/work/review", gitWorktree: true }), profile].every((text) => text.startsWith("(version 1)")))
  // A run directory outside git is in no protected list, so the rule that opens it would open a protected directory (thread __od).
  for (const [label, runDirectory, pattern] of [
    ["a hygiene root", "/work/vault", /is outside git and sits inside the protected directory \/work\/vault/],
    ["a directory inside a hygiene root", "/work/vault/notes", /is outside git and sits inside the protected directory \/work\/vault/],
    ["a plain directory next to the configured repositories", "/work/repos/copy", /is outside git and sits inside the protected directory \/work\/repos/],
  ]) {
    let message = "accepted"
    try { writeSandboxProfile({ protectedDirectories: ["/work/repos", "/work/repos/ui", "/work/vault"], homeDirectory: "/home/a.b", runDirectory, gitWorktree: false }) } catch (error) { message = error.message }
    T(`${UNIT}: the profile refuses a run directory outside git that is ${label} (thread __od)`, pattern.test(message), message)
  }
  T(`${UNIT}: a copy outside git and outside every protected directory still gets a profile (thread __od)`,
    writeSandboxProfile({ protectedDirectories: ["/work/repos", "/work/repos/ui", "/work/vault"], homeDirectory: "/home/a.b", runDirectory: "/home/a.b/scratchpad/copy", gitWorktree: false })
      .includes('(allow file-write* (subpath "/home/a.b/scratchpad/copy"))'))
  const invocation = sandboxedInvocation(profile, "claude", ["-p", "order"])
  same(`${UNIT}: the sandboxed invocation runs the worker under the profile`, [invocation.executable, ...invocation.args], [SANDBOX_EXEC, "-p", profile, "claude", "-p", "order"])
  same(`${UNIT}: only macOS has the write sandbox`, [writeSandboxAvailable("linux"), writeSandboxAvailable("win32")], [false, false])
}

/**
 * sandbox-exec reads the escaped strings back as the real paths: a write under a protected directory
 * with a backslash and a quote in its name fails, a git directory under such a home fails, and a write
 * next to them passes.
 */
const sandboxEscapeCases = () => {
  if (!writeSandboxAvailable()) return
  const base = dirname(stage('review-run/escape/a\\b"c/home/keep.txt', "kept\n"))
  const odd = realpathSync(dirname(base))
  const home = realpathSync(base)
  const plain = realpathSync(dirname(stage("review-run/escape/plain/keep.txt", "kept\n")))
  mkdirSync(join(home, "repo.git"), { recursive: true })
  let profile
  try { profile = writeSandboxProfile({ protectedDirectories: [join(odd, "protected")], homeDirectory: home, runDirectory: plain }) } catch (error) {
    T(`${UNIT}: the write sandbox names a path with a backslash and a quote (CodeQL alert 60)`, false, error.message)
    return
  }
  mkdirSync(join(odd, "protected"), { recursive: true })
  const touch = (path) => spawnSync(SANDBOX_EXEC, ["-p", profile, "/usr/bin/touch", path], { encoding: "utf8" })
  const denied = [touch(join(odd, "protected", "write.txt")), touch(join(home, "repo.git", "HEAD"))]
  const allowed = [touch(join(plain, "write.txt")), touch(join(home, "note.txt"))]
  T(`${UNIT}: sandbox-exec refuses a write in a protected directory and a git directory whose paths hold a backslash and a quote`,
    denied.every((result) => result.status === 1 && /Operation not permitted/.test(result.stderr)), denied.map((result) => `${result.status} ${result.stderr}`).join("\n"))
  T(`${UNIT}: sandbox-exec allows the writes next to them`, allowed.every((result) => result.status === 0), allowed.map((result) => `${result.status} ${result.stderr}`).join("\n"))
}

/** Two proofs claim two ports: the claim file holds the port until its launcher exits. */
const portClaimCases = async () => {
  const repository = stageRepo("review-run-port-claims")
  const claimDirectory = emulatorPortClaimDirectory(repository.path)
  T(`${UNIT}: the port claims live under the common git directory`, claimDirectory === join(realpathSync(repository.path), ".git", "orbit-proof-ports"), claimDirectory)
  const probe = async () => true
  const first = await claimEmulatorPort({ claimDirectory, probe })
  const second = await claimEmulatorPort({ claimDirectory, probe })
  T(`${UNIT}: a second proof launched before the first boots its emulator gets another port (thread vkfZ)`, first?.port === 5560 && second?.port === 5562, JSON.stringify([first?.port, second?.port]))
  const claimFile = join(claimDirectory, "5560.json")
  const claim = existsSync(claimFile) ? JSON.parse(readFileSync(claimFile, "utf8")) : null
  T(`${UNIT}: the claim names the launcher pid and its start identity`, claim?.launcherPid === process.pid && claim.launcherProcessStartIdentity === processStartIdentity(process.pid), JSON.stringify(claim))
  first.release()
  const third = await claimEmulatorPort({ claimDirectory, probe })
  T(`${UNIT}: a released port is free again`, third?.port === 5560 && existsSync(join(claimDirectory, "5562.json")), JSON.stringify(third?.port))
  mkdirSync(claimDirectory, { recursive: true })
  const gone = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" })
  writeFileSync(join(claimDirectory, "5564.json"), `${JSON.stringify({ launcherPid: Number(gone.stdout), launcherProcessStartIdentity: "darwin:1:S", claimId: "dead" })}\n`)
  writeFileSync(join(claimDirectory, "5566.json"), `${JSON.stringify({ launcherPid: process.pid, launcherProcessStartIdentity: "an earlier process with this pid", claimId: "reused" })}\n`)
  const reclaimedDead = await claimEmulatorPort({ claimDirectory, probe })
  const reclaimedReused = await claimEmulatorPort({ claimDirectory, probe })
  T(`${UNIT}: a claim whose launcher is gone, or whose pid now names another process, is free`, reclaimedDead?.port === 5564 && reclaimedReused?.port === 5566, JSON.stringify([reclaimedDead?.port, reclaimedReused?.port]))
  const busy = await claimEmulatorPort({ claimDirectory, probe: async (port) => port > 5569 })
  T(`${UNIT}: a port that something already listens on is skipped, and its claim is released`, busy?.port === 5570 && !existsSync(join(claimDirectory, "5568.json")), JSON.stringify(busy?.port))
  for (const held of [second, third, reclaimedDead, reclaimedReused, busy]) held.release()
  same(`${UNIT}: each release removes its own claim file`, readdirSync(claimDirectory), [])
}

/** The worker's hooks name the launcher checkout, never $CLAUDE_PROJECT_DIR, which is the head under review. */
const settingsCases = () => {
  const settings = launcherSettings(readFileSync(join(REPO_ROOT, ".claude", "settings.json"), "utf8"), "/launcher/checkout")
  const commands = Object.values(JSON.parse(settings).hooks).flat().flatMap((group) => group.hooks).map((hook) => hook.command)
  T(`${UNIT}: each hook command of the read-only settings names the launcher checkout (thread vkfg)`,
    commands.length > 0 && commands.every((command) => command.includes('"/launcher/checkout/.claude/hooks/')) && !settings.includes("CLAUDE_PROJECT_DIR"), commands.join("\n"))
  for (const root of ["/launcher/a b", '/launcher/a"b', "/launcher/$HOME", "/launcher/a\\b"]) {
    let message = "accepted"
    try { launcherSettings("{}", root) } catch (error) { message = error.message }
    T(`${UNIT}: the read-only settings refuse the checkout path ${JSON.stringify(root)}`, /cannot name a checkout path/.test(message), message)
  }
}

/** The protected list holds the directory of each repository, each worktree and each extra root, once and by real path. */
const protectedCases = () => {
  const repository = stageRepo("review-run-protected")
  const plainGit = gitWith({})
  const linked = join(dirname(repository.path), "review-run-protected-linked")
  const run = join(dirname(repository.path), "review-run-protected-run")
  plainGit(repository.path, ["worktree", "add", "-q", "--detach", linked])
  const runRepository = stageRepo("review-run-protected-other")
  plainGit(runRepository.path, ["worktree", "add", "-q", "--detach", run])
  const vault = dirname(stage("review-run/vault/note.md", "a note\n"))
  const directories = protectedDirectories({ repositories: [repository.path, repository.path, join(vault, "absent")], runDirectory: run, extraRoots: [vault, join(vault, "absent-root")] })
  same(`${UNIT}: the protected list holds each parent, repository, worktree and root once`, directories,
    [...new Set([dirname(repository.path), repository.path, linked, runRepository.path, run, vault].map((path) => realpathSync(path)))].sort())
}

/** The run directory is the one worktree the worker may write, so its own status finds each write of the run. */
const runDirectoryCases = () => {
  const repository = stageRepo("review-run-snapshot")
  const plainGit = gitWith({})
  writeFileSync(join(repository.path, "tracked.txt"), "first\n")
  plainGit(repository.path, ["add", "--", "tracked.txt"])
  plainGit(repository.path, ["commit", "-q", "-m", "a tracked file"])
  const run = realpathSync(repository.path)
  const before = runDirectorySnapshot(run, true)
  same(`${UNIT}: an unchanged run directory has no write`, runDirectoryWrites(before, runDirectorySnapshot(run, true), run), [])
  writeFileSync(join(run, "untracked.txt"), "a build output\n")
  same(`${UNIT}: an untracked file is no write`, runDirectoryWrites(before, runDirectorySnapshot(run, true), run), [])
  writeFileSync(join(run, "tracked.txt"), "a reviewer edit\n")
  plainGit(run, ["commit", "-q", "--allow-empty", "-m", "a reviewer commit"])
  same(`${UNIT}: a commit and a tracked edit in the run directory are writes`,
    runDirectoryWrites(before, runDirectorySnapshot(run, true), run).map(({ kind, detail }) => [kind, kind === "commit" ? detail.startsWith("HEAD ") : detail]),
    [["commit", true], ["tracked-change", "tracked.txt"]])
  same(`${UNIT}: a status that git can no longer read is a write`,
    runDirectoryWrites(before, { head: before.head, tracked: null }, run).map(({ kind }) => kind), ["tracked-change"])
  same(`${UNIT}: a copy outside every repository has no snapshot and no write`, [runDirectorySnapshot(run, false), runDirectoryWrites(null, null, run)], [null, []])
}

/**
 * A review worktree links node_modules from the primary checkout. The repository .gitignore must ignore
 * that link, a file and not a directory, or git worktree remove refuses the worktree.
 */
const ignoredLinkCases = () => {
  const repository = stageRepo("review-run-ignored-link")
  const plainGit = gitWith({})
  writeFileSync(join(repository.path, ".gitignore"), readFileSync(join(REPO_ROOT, ".gitignore"), "utf8"))
  plainGit(repository.path, ["add", "--", ".gitignore"])
  plainGit(repository.path, ["commit", "-q", "-m", "the repository ignore rules"])
  const worktree = join(dirname(repository.path), "review-run-ignored-link-review")
  plainGit(repository.path, ["worktree", "add", "-q", "--detach", worktree])
  const installed = dirname(stage("review-run/installed/node_modules/package/index.js", "module.exports = 1\n"))
  symlinkSync(dirname(installed), join(worktree, "node_modules"))
  same(`${UNIT}: a node_modules link in a review worktree is ignored (finding 16)`, plainGit(worktree, ["status", "--porcelain", "--ignored=no"]).stdout, "")
  const removed = plainGit(repository.path, ["worktree", "remove", worktree])
  T(`${UNIT}: git worktree remove removes a review worktree that holds the link (finding 16)`, removed.status === 0 && !existsSync(worktree), removed.stderr)
}

/** Each verdict line an order promises, with its placeholder filled, is one the launcher publishes. */
const orderCases = () => {
  const playbook = "## Rules\n\n#### The review brief\n\nRead the diff.\n\n- A lens.\n\n### 15. The next rule\nNot the brief.\n"
  same(`${UNIT}: the brief ends at the next heading`, reviewBrief(playbook), "Read the diff.\n\n- A lens.")
  for (const [label, text, pattern] of [
    ["no brief heading", "## Rules\n", /has no "#### The review brief" section/],
    ["an empty brief", "#### The review brief\n\n#### Next\n", /section is empty/],
  ]) {
    let message = "accepted"
    try { reviewBrief(text) } catch (error) { message = error.message }
    T(`${UNIT}: the brief reader refuses ${label}`, pattern.test(message), message)
  }
  const promised = (order) => [...order.matchAll(/`((?:VERDICT|PROOF): [^`]+)`/g)].map((match) => match[1].replace("<n>", "2"))
  const review = reviewOrder({ brief: "Read the diff.", slug: "owner/name", pullRequest: "7", head: "abc1234" })
  const proof = proofOrder({ slug: "owner/name", pullRequest: "7", head: "abc1234", plan: "1. Tap. Expected: it opens.\n", devices: ["iPhone 17"], evidenceDirectory: "/evidence", emulatorTool: "/launcher/checkout/tools/android-emulator.mjs" })
  T(`${UNIT}: the proof boots with the launcher checkout's tool and an AVD named by its port (threads vkfg, vkfZ)`,
    proof.includes("`node /launcher/checkout/tools/android-emulator.mjs --avd orbit-proof-$ORBIT_PROOF_EMULATOR_PORT --port $ORBIT_PROOF_EMULATOR_PORT`") && !proof.includes("node tools/android-emulator.mjs"), proof)
  T(`${UNIT}: the proof tells the worker to write each device path in full, because the hook refuses a glob (thread QXTK)`,
    proof.includes("Write each path in a device call in full, with no glob"), proof)
  T(`${UNIT}: both orders tell the worker to read the project rules, which this run does not load`,
    [review, proof].every((order) => order.includes("Read `CLAUDE.md` and `.claude/rules/core.md` of your directory first.")), review)
  same(`${UNIT}: the review order promises exactly the review verdict lines`, promised(review).map((line) => resultVerdict(line, "review")), ["VERDICT: CLEAN", "VERDICT: DEFECTS (2)"])
  const contract = review.slice(review.indexOf("**Your result.**"))
  T(`${UNIT}: the review verdict is CLEAN with only NOTE findings and wrong body lines, and counts BLOCKING findings only (thread Re7X)`,
    /`VERDICT: CLEAN` when you confirmed no BLOCKING finding/.test(contract) &&
      /`VERDICT: DEFECTS \(<n>\)`, where n counts the BLOCKING findings only/.test(contract) &&
      /A NOTE and a\s+`## Body` line never change the verdict/.test(contract) &&
      !/no\s+body line is wrong|and the wrong body lines/.test(contract), contract)
  const fixRoundReview = reviewOrder({ brief: "Read the diff.", slug: "owner/name", pullRequest: "7", head: "abc1234", since: "def5678" })
  T(`${UNIT}: a fix-round review reads the whole diff against the merge base and checks each fix against the new commits`,
    fixRoundReview.includes("git diff origin/main...abc1234") && fixRoundReview.includes("git diff def5678..abc1234") &&
      fixRoundReview.includes("Read the whole diff again, as\nthe GitHub reviewer does") && !/Read only the new commits/.test(fixRoundReview), fixRoundReview)
  T(`${UNIT}: the proof result names its head on the second line, for the decision note (thread b_s2)`,
    /Its second line is\s+`HEAD: abc1234`/.test(proof), proof)
  same(`${UNIT}: the proof order promises exactly the proof verdict lines`, promised(proof).map((line) => resultVerdict(line, "proof")), ["PROOF: PASS", "PROOF: FAIL (2 defects)"])
  const maximum = (order) => Number(/at most (\d+) lines/.exec(order)?.[1])
  T(`${UNIT}: both orders cap the final message at 12 lines`, maximum(review) === 12 && maximum(proof) === 12, `${maximum(review)} ${maximum(proof)}`)
}

/** A read-only mode decides its own values once; the launcher reads them and never asks which mode runs (thread __pE). */
const launchModeCases = async () => {
  const order = stage("review-run/mode-order.md", "Review the head.\n")
  const output = join(dirname(order), "mode-result.md")
  const copy = dirname(stage("review-run/mode-copy/file.txt", "a copy outside every repository\n"))
  const repository = stageRepo("review-run-mode")
  const detached = join(dirname(repository.path), "review-run-mode-detached")
  gitWith({})(repository.path, ["worktree", "add", "-q", "--detach", detached])
  const refusals = []
  const cli = (given) => ({
    argv: ["node", "launch-worker.mjs", ...given],
    argOf: (flag) => given.includes(flag) ? given[given.indexOf(flag) + 1] : null,
    fail: (code, message) => { refusals.push(code); throw new Error(message) },
  })
  const review = readOnlyLaunch("review", cli(["--review", "--order", order, "--out", output, "--directory", detached, "--tier", "deep"]))
  const proof = readOnlyLaunch("proof", cli(["--proof", "--order", order, "--out", output, "--directory", copy]))
  same(`${UNIT}: a review in a git worktree claims its run directory and no branch slot (thread __pE)`, review.reservation, { branchCap: null })
  same(`${UNIT}: a proof in a copy outside git claims nothing (thread __pE)`, proof.reservation, null)
  same(`${UNIT}: each read-only mode names itself in its label and its review wake source (thread __pE)`,
    [review.label, review.wake, proof.label, proof.wake], ["review", { what: "review", research: false, review: true }, "proof", { what: "proof", research: false, review: true }])
  T(`${UNIT}: a read-only mode runs in its checked run directory, reads its order, and clears its claims on exit (thread __pE)`,
    review.runDirectory === realpathSync(detached) && proof.runDirectory === realpathSync(copy) && review.promptFile === realpathSync(order) && review.clearsClaimsOnExit === true,
    JSON.stringify([review.runDirectory, proof.runDirectory, review.promptFile]))
  for (const [label, given, pattern] of [
    ["a ticket option", ["--review", "--order", order, "--out", output, "--directory", detached, "--issue", "ORB-201"], /unsupported --review option: --issue/],
    ["a run directory inside a git directory", ["--review", "--order", order, "--out", output, "--directory", join(repository.path, ".git")], /is inside a git directory/],
  ]) {
    refusals.length = 0
    let message = "accepted"
    try { readOnlyLaunch("review", cli(given)) } catch (error) { message = error.message }
    T(`${UNIT}: the review mode refuses ${label} with exit 2 (thread __pE)`, pattern.test(message) && refusals.join() === "2", `${message} ${refusals.join()}`)
  }
  refusals.length = 0
  let engineMessage = "accepted"
  try { await review.prepare({ engineName: "codex" }) } catch (error) { engineMessage = error.message }
  T(`${UNIT}: a review on an engine with no read-only hooks is refused with exit 2 on every platform (thread b_tA)`,
    /needs the claude worker engine/.test(engineMessage) && refusals.join() === "2", `${engineMessage} ${refusals.join()}`)
}

export const cases = async () => {
  await launchModeCases()
  orderCases()
  sandboxEscapeCases()
  await portClaimCases()
  settingsCases()
  verdictCases()
  resultHomeCases()
  pathCases()
  profileCases()
  protectedCases()
  runDirectoryCases()
  ignoredLinkCases()
}
