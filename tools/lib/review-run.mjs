/**
 * The read-only mode of tools/launch-worker.mjs: a review or a device proof that writes nothing tracked
 * in any repository it can reach. sandbox-exec applies a write profile to the whole worker process tree,
 * which no environment variable, git option or file write can drop. The run directory is the one
 * worktree the worker may write, so a before and after status of it finds a changed tracked file.
 */

import { spawnSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { homedir, tmpdir } from "node:os"
import { dirname, join, relative, resolve, isAbsolute } from "node:path"

import { parseWorktreeList } from "./git-worktrees.mjs"
import { requireKeyringOwner, withoutGithubToken } from "./github-auth.mjs"
import { researchPaths } from "./research-run.mjs"
import { isWakeSourceAlive, processStartIdentity } from "./run-state.mjs"

/** The first line of each result. reviewOrder and proofOrder below write the same lines into each order. */
const REVIEW_VERDICT_LINE = /^VERDICT: (?:CLEAN|DEFECTS \(\d+\))$/
const PROOF_VERDICT_LINE = /^PROOF: (?:PASS|FAIL \(\d+ defects?\))$/

/** The verdict line of a result in `mode` ("review" or "proof"), or null when the first line is not one. */
export const resultVerdict = (text, mode) => {
  const first = String(text ?? "").split(/\r?\n/, 1)[0].trim()
  return (mode === "proof" ? PROOF_VERDICT_LINE : REVIEW_VERDICT_LINE).test(first) ? first : null
}


const git = (directory, args) => spawnSync("git", ["-C", directory, ...args], {
  encoding: "utf8",
  windowsHide: true,
  maxBuffer: 64 * 1024 * 1024,
  // A status in another worker's worktree must never take that worktree's index lock.
  env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
})

const inside = (path, directory) => {
  const relation = relative(directory, path)
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation))
}

/**
 * The checked order, output and run directory of a read-only run. The order and the output follow the
 * research rules: outside every repository, and the output a new file. The run directory is a worktree
 * root, such as a detached worktree at the head under review, or a copy outside every repository. A
 * directory inside a git directory is neither: the worker could write that repository's config, hooks and refs.
 */
export const readOnlyPaths = (orderArgument, outputArgument, directoryArgument, mode) => {
  if (!directoryArgument || directoryArgument.startsWith("--")) throw new Error(`--directory is required for --${mode}`)
  const { orderFile, outputFile } = researchPaths(orderArgument, outputArgument, mode)
  let runDirectory
  try { runDirectory = realpathSync(resolve(directoryArgument)) } catch { throw new Error(`run directory not found: ${directoryArgument}`) }
  if (!statSync(runDirectory).isDirectory()) throw new Error(`run directory is not a directory: ${runDirectory}`)
  for (const [label, path] of [["order", orderFile], ["output", outputFile]]) {
    if (inside(path, runDirectory)) throw new Error(`${label} lives inside the run directory ${runDirectory}; keep it in the scratchpad`)
  }
  if (git(runDirectory, ["rev-parse", "--is-inside-git-dir"]).stdout.trim() === "true") {
    throw new Error(`run directory ${runDirectory} is inside a git directory; use a detached worktree at the head or a copy that holds no repository`)
  }
  const topLevel = git(runDirectory, ["rev-parse", "--show-toplevel"])
  if (topLevel.status === 0 && realpathSync(topLevel.stdout.trim()) !== runDirectory) {
    throw new Error(`run directory ${runDirectory} is inside a repository but is not a worktree root`)
  }
  return { orderFile, outputFile, runDirectory, gitWorktree: topLevel.status === 0 }
}

/**
 * Refuses a git run directory that the ticket does not permit. The worker may write its run directory,
 * so it must be a detached worktree at the head under review, never a branch worktree and never the
 * checkout of a configured repository. A copy outside every repository has no git directory to check.
 */
export const assertDetachedRunDirectory = (runDirectory, repositories) => {
  for (const repository of repositories) {
    if (realPath(repository) === runDirectory) throw new Error(`run directory ${runDirectory} is the configured repository ${repository}; make a detached worktree at the head`)
  }
  if (git(runDirectory, ["symbolic-ref", "-q", "HEAD"]).status === 0) {
    throw new Error(`run directory ${runDirectory} is on a branch; make a detached worktree at the head`)
  }
}

/** The macOS program that applies a sandbox profile to a process and to every process it starts. */
export const SANDBOX_EXEC = "/usr/bin/sandbox-exec"

/** Whether this machine can confine a read-only worker. Only macOS has sandbox-exec. */
export const writeSandboxAvailable = (platform = process.platform) => platform === "darwin" && existsSync(SANDBOX_EXEC)

const realPath = (path) => {
  try { return realpathSync(path) } catch { return null }
}

/** Each worktree path of the repository that holds `directory`, the primary checkout first. */
const worktreesOf = (directory) => {
  const listed = git(directory, ["worktree", "list", "--porcelain"])
  if (listed.status !== 0) return []
  return parseWorktreeList(listed.stdout).filter((worktree) => worktree.path && !worktree.prunable).map((worktree) => worktree.path)
}

/**
 * The directories that the read-only worker may not write: the directory that holds each configured
 * repository (so each sibling repository, such as the brain vault, is in it), each configured
 * repository, each worktree of a configured repository or of the run directory's repository, and each
 * extra root (the configured hygiene roots). Only existing directories, each one once, by real path.
 */
export const protectedDirectories = ({ repositories, runDirectory = null, extraRoots = [] }) => {
  const directories = new Set()
  const add = (path) => {
    const real = realPath(path)
    if (real !== null) directories.add(real)
  }
  for (const repository of repositories) {
    if (!existsSync(repository)) continue
    add(dirname(realPath(repository) ?? repository))
    add(repository)
    for (const worktree of worktreesOf(repository)) add(worktree)
  }
  if (runDirectory !== null) for (const worktree of worktreesOf(runDirectory)) add(worktree)
  for (const root of extraRoots) add(root)
  return [...directories].sort()
}

/**
 * A value as a sandbox profile string: each backslash first, then each quote, gets a backslash.
 * sandbox-exec reads a line break in a string as part of the path, but a path with one is refused, so
 * no profile line can hold two rules.
 */
const profileString = (value) => {
  if (/[\r\n]/.test(value)) throw new Error(`the write sandbox cannot name a path with a line break: ${JSON.stringify(value)}`)
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

/** A path as a regular expression that matches only that text: each special character, the backslash included, gets a backslash. */
const regexLiteral = (path) => path.replace(/[\\.*+?^${}()|[\]]/g, "\\$&")

/**
 * The sandbox profile of a read-only run. A later rule wins: the run directory and the node_modules test
 * caches open inside a protected directory, then the run directory's `.git` closes again. `homeDirectory`
 * scopes the git-directory rule. A run directory that holds a protected or home directory would open it, so it is
 * refused. So is one outside git (`gitWorktree` false) that sits inside a protected directory: no list holds it.
 */
export const writeSandboxProfile = ({ protectedDirectories: directories, homeDirectory, runDirectory, gitWorktree }) => {
  const held = directories.find((directory) => directory !== runDirectory && inside(directory, runDirectory))
  if (held !== undefined) throw new Error(`run directory ${runDirectory} holds the protected directory ${held}; use a detached worktree at the head or a copy that holds no repository`)
  if (inside(homeDirectory, runDirectory)) throw new Error(`run directory ${runDirectory} holds the home directory ${homeDirectory}; use a detached worktree at the head or a copy that holds no repository`)
  const holder = gitWorktree ? undefined : directories.find((directory) => inside(runDirectory, directory))
  if (holder !== undefined) throw new Error(`run directory ${runDirectory} is outside git and sits inside the protected directory ${holder}; use a detached worktree at the head or a copy in the scratchpad`)
  return [
    "(version 1)",
    "(allow default)",
    ...directories.map((directory) => `(deny file-write* (subpath ${profileString(directory)}))`),
    // A review worktree links node_modules from a protected checkout. Vite and Vitest write their untracked
    // bundled config and cache there, so a test run needs these directories and no package file.
    `(allow file-write* (regex #"/node_modules/\\.(vite|vite-temp|cache)(/|$)"))`,
    // A regex given as a profile string, not as a #"" literal, because a #"" literal has no escape for a quote.
    `(deny file-write* (regex ${profileString(`^${regexLiteral(homeDirectory)}/(.*/)?[^/]*\\.git(/|$)`)}))`,
    `(allow file-write* (subpath ${profileString(runDirectory)}))`,
    `(deny file-write* (subpath ${profileString(join(runDirectory, ".git"))}))`,
    // Git reaches a network remote only through these programs: the http, https, ftp, ext and fd helpers, and ssh.
    // A local remote is a directory, which the rules above refuse when it is protected or a git directory under home.
    `(deny process-exec (regex #"/git-remote-[^/]+$") (regex #"/ssh$"))`,
    "",
  ].join("\n")
}

/** The sandbox-exec invocation that runs `executable` under `profile`. */
export const sandboxedInvocation = (profile, executable, args) => ({ executable: SANDBOX_EXEC, args: ["-p", profile, executable, ...args] })

const portFree = (port) => new Promise((settle) => {
  const server = createServer()
  server.once("error", () => settle(false))
  server.listen(port, "127.0.0.1", () => server.close(() => settle(true)))
})

/** The directory of the emulator port claims: the common git directory of `checkout`, which each of its worktrees shares. */
export const emulatorPortClaimDirectory = (checkout) => {
  const common = git(checkout, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
  if (common.status !== 0 || common.stdout.trim() === "") throw new Error(`cannot read the git common directory of ${checkout}: ${common.stderr.trim()}`)
  return join(common.stdout.trim(), "orbit-proof-ports")
}

const claimIsLive = (path) => {
  try {
    const claim = JSON.parse(readFileSync(path, "utf8"))
    return isWakeSourceAlive({ pid: claim.launcherPid, processStartIdentity: claim.launcherProcessStartIdentity })
  } catch (error) {
    // A claim file that is gone is free. One that is unreadable may still be in the middle of its write.
    return error.code !== "ENOENT"
  }
}

/** Publishes `owner` at `path` only when no file is there: a hard link never replaces another launcher's claim. */
const publishClaim = (path, owner) => {
  const unpublished = `${path}.${randomUUID()}.unpublished`
  try {
    writeFileSync(unpublished, `${JSON.stringify(owner)}\n`, { flag: "wx" })
    linkSync(unpublished, path)
    return true
  } catch (error) {
    if (error.code === "EEXIST") return false
    throw error
  } finally {
    rmSync(unpublished, { force: true })
  }
}

/** Removes the claim at `path` when its launcher is gone. A live claim that arrived in between goes back. */
const removeDeadClaim = (path) => {
  if (claimIsLive(path)) return
  const moved = `${path}.${randomUUID()}.dead`
  try { renameSync(path, moved) } catch { return }
  try {
    if (claimIsLive(moved)) linkSync(moved, path)
  } catch { /* a newer claim already holds the path */ } finally {
    rmSync(moved, { force: true })
  }
}

/**
 * Claims an even emulator console port from 5560 to 5680 with a free adb port after it, for the life of
 * `launcherPid`. The owner's emulators take 5554 to 5559. The proof's emulator binds the port minutes
 * after the launch, so the claim file, not the socket probe, keeps two proofs apart. A claim whose
 * launcher is gone is free. Returns `{ port, release }`, or null when every port is taken.
 */
export const claimEmulatorPort = async ({ claimDirectory, launcherPid = process.pid, probe = portFree }) => {
  const identity = processStartIdentity(launcherPid)
  if (identity === null) throw new Error(`cannot read the start identity of the launcher pid ${launcherPid}`)
  mkdirSync(claimDirectory, { recursive: true })
  const owner = { launcherPid, launcherProcessStartIdentity: identity, claimId: randomUUID() }
  for (let port = 5560; port <= 5680; port += 2) {
    const path = join(claimDirectory, `${port}.json`)
    removeDeadClaim(path)
    if (!publishClaim(path, owner)) continue
    const release = () => {
      try {
        if (JSON.parse(readFileSync(path, "utf8")).claimId === owner.claimId) rmSync(path, { force: true })
      } catch { /* the claim is already gone */ }
    }
    if (await probe(port) && await probe(port + 1)) return { port, release }
    release()
  }
  return null
}

/**
 * The settings of a read-only worker: the orchestrating checkout's `.claude/settings.json` with each
 * `$CLAUDE_PROJECT_DIR` replaced by that checkout. The launcher passes it with `--setting-sources user`,
 * so Claude Code loads no settings file of the head under review, and the hooks of the head never run.
 */
export const launcherSettings = (settingsText, launcherRoot) => {
  if (/["$`\\\s]/.test(launcherRoot)) throw new Error(`the hook commands cannot name a checkout path with a quote, a dollar sign, a backtick, a backslash or a space: ${JSON.stringify(launcherRoot)}`)
  const settings = JSON.parse(settingsText)
  return `${JSON.stringify(settings, null, 2).replaceAll("$CLAUDE_PROJECT_DIR", launcherRoot)}\n`
}

const STATUS_ARGUMENTS = ["-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--untracked-files=no", "--ignore-submodules=none"]

/** Each changed tracked path of a worktree, keyed to its status code and content hash, or null when git cannot read it. */
const trackedChanges = (worktree) => {
  const result = git(worktree, STATUS_ARGUMENTS)
  if (result.status !== 0) return null
  const entries = result.stdout.split("\0")
  const changes = {}
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (entry.length < 4) continue
    const code = entry.slice(0, 2)
    const path = entry.slice(3)
    // A rename or a copy carries its source path as the next entry.
    if (code[0] === "R" || code[0] === "C") index += 1
    let content = "absent"
    try { content = createHash("sha1").update(readFileSync(join(worktree, path))).digest("hex") } catch { /* a deleted path has no content */ }
    changes[path] = `${code}:${content}`
  }
  return changes
}

/** The HEAD and the changed tracked paths of the run directory, or null for a copy outside every repository. */
export const runDirectorySnapshot = (runDirectory, gitWorktree) => {
  if (!gitWorktree) return null
  const head = git(runDirectory, ["rev-parse", "HEAD"])
  return { head: head.status === 0 ? head.stdout.trim() : null, tracked: trackedChanges(runDirectory) }
}

/**
 * The writes between two snapshots of the run directory: a moved HEAD, a changed tracked path, or a
 * status that git can no longer read. The sandbox refuses every other write, and the launcher holds the
 * run directory against a second launch, so each change here is the worker's own.
 */
export const runDirectoryWrites = (before, after, runDirectory) => {
  if (before === null) return []
  const writes = []
  if (before.head !== after.head) writes.push({ kind: "commit", directory: runDirectory, detail: `HEAD ${before.head} -> ${after.head}` })
  if (before.tracked === null) return writes
  if (after.tracked === null) return [...writes, { kind: "tracked-change", directory: runDirectory, detail: "git can no longer read the status of the run directory" }]
  const paths = [...new Set([...Object.keys(before.tracked), ...Object.keys(after.tracked)])]
    .filter((file) => before.tracked[file] !== after.tracked[file]).sort()
  if (paths.length > 0) writes.push({ kind: "tracked-change", directory: runDirectory, detail: paths.join(", ") })
  return writes
}

/**
 * The launch mode of a review or a proof (`mode`), with the values and steps that tools/launch-worker.mjs
 * names at its `launchMode`. `argv`, `argOf` and `fail` are the launcher's arguments, its flag reader and
 * its exit with a code and a message.
 */
export const readOnlyLaunch = (mode, { argv, argOf, fail }) => {
  const valueFlags = new Set(["--order", "--out", "--directory", "--tier", "--hard-ceiling-minutes"])
  const switches = new Set([`--${mode}`, "--measurement", "--dry-run"])
  for (let index = 2; index < argv.length; index++) {
    const flag = argv[index]
    if (valueFlags.has(flag)) index++
    else if (!switches.has(flag)) fail(2, `unsupported --${mode} option: ${flag}`)
  }
  let paths
  try { paths = readOnlyPaths(argOf("--order"), argOf("--out"), argOf("--directory"), mode) } catch (error) { fail(2, error.message) }
  const { orderFile, outputFile, runDirectory, gitWorktree } = paths
  const configuredRepositories = (config) => Object.values(config.repos ?? {}).filter((path) => typeof path === "string")
  let storage = null
  /** The worker writes its result here; only the finish step copies it to --out. */
  let stagedResult = null
  let profile = null
  let portClaim = null
  let snapshotBefore = null
  const launch = {
    label: mode,
    runDirectory,
    promptFile: orderFile,
    wake: { what: mode, research: false, review: true },
    /** A read-only run claims a git run directory against a second launch, but holds no branch slot. */
    reservation: gitWorktree ? { branchCap: null } : null,
    repositoryKey: null,
    clearsClaimsOnExit: true,
    inheritedDescriptors: [],
    plan: null,
    workerArguments: null,
    environment: null,
    checkRunDirectory: ({ config }) => {
      if (!writeSandboxAvailable()) fail(2, `--${mode} needs the macOS write sandbox (${SANDBOX_EXEC}), and ${process.platform} has none. A read-only worker never runs without it.`)
      if (!gitWorktree) return
      try { assertDetachedRunDirectory(runDirectory, configuredRepositories(config)) } catch (error) { fail(2, error.message) }
    },
    /**
     * A read-only claude worker loads its user settings and the launcher checkout's settings only. Claude Code
     * sets CLAUDE_PROJECT_DIR to the run directory, so a project settings file would run the hooks of the head
     * under review. --setting-sources user drops that file; --settings adds the launcher's hooks by path.
     */
    prepare: async ({ config, launcherRoot, engineName, invocation, scriptArgs }) => {
      if (engineName !== "claude") fail(2, `--${mode} needs the claude worker engine, whose hooks hold the read-only guards; .claude/orchestrator.json names "${engineName}"`)
      storage = mkdtempSync(join(tmpdir(), `orbit-${mode}-`))
      stagedResult = join(storage, "result.md")
      const settingsFile = join(storage, "settings.json")
      try {
        writeFileSync(settingsFile, launcherSettings(readFileSync(join(launcherRoot, ".claude", "settings.json"), "utf8"), launcherRoot), { flag: "wx", mode: 0o600 })
      } catch (error) { fail(2, `could not write the read-only worker settings from ${launcherRoot}: ${error.message}`) }
      const pointer = `Read ${orderFile} and execute it in full. That file is your complete order for a read-only ${mode} run. You are in ${runDirectory}. Write your complete result to ${stagedResult}; its first line is the verdict line the order names. Write no tracked file, commit, branch or push in any repository. Do not summarise the file back to me, start the work now.`
      launch.workerArguments = [...scriptArgs, ...invocation.args, "--setting-sources", "user", "--settings", settingsFile, pointer]
      const directories = protectedDirectories({
        repositories: configuredRepositories(config),
        runDirectory: gitWorktree ? runDirectory : null,
        // The worker never changes the hooks it runs under.
        extraRoots: [...Object.values(config.hygieneRoots ?? {}), launcherRoot],
      })
      try {
        profile = writeSandboxProfile({ protectedDirectories: directories, homeDirectory: realpathSync(homedir()), runDirectory, gitWorktree })
      } catch (error) { fail(2, error.message) }
      if (mode === "proof") {
        try { portClaim = await claimEmulatorPort({ claimDirectory: emulatorPortClaimDirectory(launcherRoot) }) } catch (error) { fail(2, `could not claim an emulator port: ${error.message}`) }
        if (portClaim === null) fail(3, "no free emulator port pair from 5560 to 5681 for the proof's throwaway emulator")
      }
      launch.plan = { issue: null, research: false, mode, outputFile, writeSandbox: directories, proofEmulatorPort: portClaim?.port ?? null }
    },
    admit: async ({ launched }) => {
      // The run holds no GitHub token: `gh` reads its own sign-in, so a variable expansion, `printenv` or `env` finds no token to print or send.
      // A copy outside every repository has no remote to choose a GitHub owner from, so it keeps the caller's own gh sign-in unchecked.
      if (gitWorktree) {
        try { await requireKeyringOwner(runDirectory) } catch (error) { fail(2, `could not resolve GitHub reads for ${runDirectory}: ${error.message}`) }
      }
      launch.environment = {
        ...launched(withoutGithubToken(process.env)),
        // A read-only status never takes the index lock, which the sandbox refuses.
        GIT_OPTIONAL_LOCKS: "0",
        ORBIT_READ_ONLY_RUN: "1",
        // adb sends each command without a device flag to ANDROID_SERIAL, the proof's own throwaway emulator.
        ...(portClaim === null ? {} : { ORBIT_DEVICE_PROOF: "1", ANDROID_SERIAL: `emulator-${portClaim.port}`, ORBIT_PROOF_EMULATOR_PORT: String(portClaim.port) }),
      }
    },
    begin: () => { snapshotBefore = runDirectorySnapshot(runDirectory, gitWorktree) },
    spawn: (executable, args) => sandboxedInvocation(profile, executable, args),
    /** A read-only order starts again from its beginning, so a partial result of the first attempt cannot be published. */
    relaunchArguments: () => {
      rmSync(stagedResult, { force: true })
      return launch.workerArguments
    },
    /**
     * Publishes the result only when the worker exited 0, the run directory holds no write of it, and the
     * staged result opens with the mode's verdict line. A write fails the run with exit 5.
     */
    finish: ({ attempts, startedAt, engine, tier, model }) => {
      const last = attempts.at(-1)
      const { outcome, exitCode } = last
      const writes = runDirectoryWrites(snapshotBefore, runDirectorySnapshot(runDirectory, gitWorktree), runDirectory)
      for (const write of writes) console.error(`the ${mode} worker left a ${write.kind} in ${write.directory}: ${write.detail}`)
      let published = false
      let verdict = null
      if (outcome === "EXITED" && exitCode === 0 && writes.length === 0) {
        try {
          const text = readFileSync(stagedResult, "utf8")
          verdict = resultVerdict(text, mode)
          if (verdict === null) throw new Error(`the result does not open with the ${mode} verdict line: ${JSON.stringify(text.split(/\r?\n/, 1)[0])}`)
          const checked = readOnlyPaths(orderFile, outputFile, runDirectory, mode)
          writeFileSync(checked.outputFile, text, { flag: "wx", mode: 0o600 })
          published = true
        } catch (error) { console.error(`could not publish the ${mode} result: ${error.message}`) }
      }
      console.log(JSON.stringify({ mode, outputFile, published, verdict, writes, runDirectory, engine, tier, model, account: last.account, configDirectory: last.configDirectory, pid: last.pid, logFile: last.logFile, startedAt, endedAt: last.endedAt, exitCode, outcome, usageLimitReached: last.usageLimitReached, authenticationFailed: last.authenticationFailed, resultError: last.resultError, attempts }, null, 2))
      return writes.length > 0 ? 5 : published ? 0 : 1
    },
    release: () => {
      if (storage !== null) rmSync(storage, { recursive: true, force: true })
      portClaim?.release()
    },
  }
  return launch
}

const BRIEF_HEADING = "#### The review brief"

/** The body of rule 14's review brief in `.claude/playbooks/review-and-audit.md`, the one place that defines it. */
export const reviewBrief = (playbook) => {
  const lines = playbook.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trimEnd() === BRIEF_HEADING)
  if (start === -1) throw new Error(`the playbook has no "${BRIEF_HEADING}" section`)
  const end = lines.findIndex((line, index) => index > start && /^#{2,4} /.test(line))
  const body = lines.slice(start + 1, end === -1 ? lines.length : end).join("\n").trim()
  if (body === "") throw new Error(`the "${BRIEF_HEADING}" section is empty`)
  return body
}

const NO_WRITES = `**You write nothing tracked.** Never edit, create or delete a tracked file, and never commit, stash,
reset, check out, switch, merge, rebase, fetch, create a branch or a tag, or push, in this directory or
in any other worktree or repository. You run under a macOS write sandbox: a write to a configured
repository, to one of its worktrees, to a git directory or to a git remote fails with "Operation not
permitted". Your directory is the one worktree you can write, and the launcher fails the whole run when
a tracked file in it changed. Untracked output of a test or a build is allowed. A test that makes its
own fixture repository in the temporary directory still works.

**No GitHub write.** Read GitHub with \`gh pr view\`, \`gh pr diff\` and \`gh api\` GET requests only. Never post a
comment, a review, a reaction, a label or a status, never resolve a thread, never ask for a review, and
never read a credential. A hook refuses each of these commands.`

const PROJECT_RULES = `**Project rules.** This run loads no settings file of your directory, so Claude Code does not load
its \`CLAUDE.md\` or \`.claude/rules/\`. Read \`CLAUDE.md\` and \`.claude/rules/core.md\` of your directory first.
The hooks of this run come from the orchestrating checkout, not from the head.`

const FINAL_MESSAGE = `**Your final message has at most 12 lines:** the verdict line, the result file path, and one line for
each of the most severe findings. The orchestrator reads the result file, not your message.`

/** The order of a pre-push review, or with `since` of a fix-round review that reads only the newer commits. */
export const reviewOrder = ({ brief, slug, pullRequest, head, since = null, baseBranch = "main" }) => {
  const scope = since === null
    ? `Read the whole diff against its merge base: \`git diff origin/${baseBranch}...${head}\`.`
    : `This is a fix round. The previous review read \`${since}\`. Read only the new commits,
\`git diff ${since}..${head}\`, and the code around each hunk.`
  return `# Read-only review of ${slug} pull request #${pullRequest}

${brief}

---

## Read-only review contract

**What you review.** Pull request #${pullRequest} of \`${slug}\` at head \`${head}\`. ${scope} Your directory is a
detached worktree at that head or a copy of it. Read by commit (\`git show ${head}:<path>\`), never by a
checkout.

${PROJECT_RULES}

${NO_WRITES}

**Your result.** Write the complete report to the result file that the launch instruction names, and
to no other file. Its first line is exactly \`VERDICT: CLEAN\` when you confirmed no finding and no
body line is wrong. Otherwise it is \`VERDICT: DEFECTS (<n>)\`, where n counts the numbered findings
and the wrong body lines. Then write the report that the brief describes: \`HEAD: <sha>\`,
\`FILES READ: <n of m>\`, \`## Findings\`, \`## Body\` and \`## Not confirmed\`.

${FINAL_MESSAGE}
`
}

/**
 * The order of a device proof: the coordinator's steps, the permitted devices and the evidence directory.
 * `emulatorTool` is the absolute path of the orchestrating checkout's tools/android-emulator.mjs, so the
 * proof never boots with the tool of the head under review.
 */
export const proofOrder = ({ slug, pullRequest, head, plan, devices, evidenceDirectory, emulatorTool }) => `# Device proof of ${slug} pull request #${pullRequest}

**What you prove.** Pull request #${pullRequest} of \`${slug}\` at head \`${head}\`. Your directory is a detached
worktree at that head or a copy of it. Do each step below and compare what you observe with the
expected result that the step names.

${plan.trim()}

**Devices.** Use only these: ${devices.join(", ")}. You may also create one throwaway Android virtual device
from the installed arm64 play image, run it headless with no personal account, and delete it before
you finish. Boot it with the orchestrating checkout's tool, on the port that the launcher pinned:
\`node ${emulatorTool} --avd orbit-proof-$ORBIT_PROOF_EMULATOR_PORT --port $ORBIT_PROOF_EMULATOR_PORT\`.
The AVD name holds the port, so no other proof uses the same AVD. Its serial is \`$ANDROID_SERIAL\`, which adb
uses when a command names no device: \`adb -s $ANDROID_SERIAL install <file>\` is the same as
\`adb install <file>\`. Never pass another serial, never clear or change either variable, never boot or use \`Orbit_Pixel_9_API_35\`, the owner's emulator, and never
sign in to a personal account. Read \`.claude/playbooks/operations.md\` \`## Android devices and Play\` before you use a device.

${PROJECT_RULES}

${NO_WRITES}
A step that needs a changed tracked file, such as a version bump for a local build, runs in a copy
outside every repository (\`git archive ${head} | tar -x -C <new directory>\`), never in a worktree.

**Evidence.** Save each screenshot, recording and log in \`${evidenceDirectory}\`, and name each file
by its step.

**Your result.** Write the complete report to the result file that the launch instruction names, and
to no other file. Its first line is exactly \`PROOF: PASS\` when every step met its expected result.
Otherwise it is \`PROOF: FAIL (<n> defects)\`, where n counts the steps that did not. Then write one
section for each step: the device, the exact commands, the observed result and the evidence files.

${FINAL_MESSAGE}
`
