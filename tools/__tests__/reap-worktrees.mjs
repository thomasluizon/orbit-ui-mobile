import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, check, orcaEnv, root } from "./_harness.mjs"

const observedCapture = JSON.parse(readFileSync(new URL("./fixtures/orca-worktree-ps-envelope.json", import.meta.url), "utf8"))
const observedEnvelope = observedCapture.response
const observedWorktree = observedEnvelope.result.worktrees.find((entry) => !entry.isMainWorktree && typeof entry.linkedLinearIssue === "string")

const worktree = (path, overrides = {}) => ({
  ...structuredClone(observedWorktree),
  path,
  branch: "refs/heads/feature/test",
  linkedLinearIssue: "ORB-124",
  ...overrides,
})

const psResult = (worktrees, overrides = {}) => {
  const envelope = structuredClone(observedEnvelope)
  envelope.result = { ...envelope.result, worktrees, totalCount: worktrees.length, truncated: false, ...overrides }
  return JSON.stringify(envelope)
}

const issueResult = (identifier, state) => JSON.stringify({
  ok: true,
  result: { issue: { identifier, state: { name: state } } },
})

const stageTeardownStub = (label, { exit = 0 } = {}) => {
  const directory = join(root, "reaper", label)
  const path = join(directory, "teardown-stub.mjs")
  const log = join(directory, "teardown.log")
  mkdirSync(directory, { recursive: true })
  writeFileSync(path, `#!/usr/bin/env node
import { appendFileSync } from "node:fs"
appendFileSync(process.env.ORBIT_REAPER_TEARDOWN_LOG, JSON.stringify(process.argv.slice(2)) + "\\n")
process.exit(${exit})
`)
  return { path, log }
}

const reapWorktreeCases = () => {
  const tool = new URL("../reap-worktrees.mjs", import.meta.url)
  if (!existsSync(tool)) {
    T("reap-worktrees.mjs: stale completed worktrees have an automatic reaper", false, "tools/reap-worktrees.mjs is absent")
    return
  }

  T(
    "reap-worktrees.mjs: fixtures derive from a complete observed Orca envelope",
    observedCapture.capture.command === "orca worktree ps --json"
      && observedEnvelope.result.totalCount === observedEnvelope.result.worktrees.length
      && observedEnvelope.result.worktrees.every((entry) => Object.hasOwn(entry, "path") && Object.hasOwn(entry, "agents")),
    "the recorded worktree ps envelope is incomplete or lacks its re-derivation command",
  )

  check("reap-worktrees.mjs", "refuses unknown input", ["--unknown"], { status: 2, stderr: /unknown option/ })

  const incomplete = worktree(join(root, "reaper", "incomplete"), { linkedLinearIssue: "ORB-129" })
  delete incomplete.isMainWorktree
  delete incomplete.isArchived
  delete incomplete.isActive
  delete incomplete.agents
  const incompleteStub = stageTeardownStub("incomplete-row")
  check(
    "reap-worktrees.mjs",
    "fails closed before selection when an inventory row lacks relied-on fields",
    [],
    { status: 3, stderr: /inventory row 0[\s\S]*isMainWorktree/ },
    {
      env: {
        ...orcaEnv([
          { match: "worktree ps", stdout: psResult([incomplete]) },
          { match: "linear issue ORB-129", stdout: issueResult("ORB-129", "Done") },
        ]),
        ORBIT_TEARDOWN_SCRIPT: incompleteStub.path,
        ORBIT_REAPER_TEARDOWN_LOG: incompleteStub.log,
      },
    },
  )

  const mistyped = worktree(join(root, "reaper", "mistyped"), { linkedLinearIssue: "ORB-130", isActive: "false", agents: {} })
  const mistypedStub = stageTeardownStub("mistyped-row")
  check(
    "reap-worktrees.mjs",
    "fails closed before selection when an inventory row mistypes relied-on fields",
    [],
    { status: 3, stderr: /inventory row 0[\s\S]*(isActive|agents)/ },
    {
      env: {
        ...orcaEnv([
          { match: "worktree ps", stdout: psResult([mistyped]) },
          { match: "linear issue ORB-130", stdout: issueResult("ORB-130", "Done") },
        ]),
        ORBIT_TEARDOWN_SCRIPT: mistypedStub.path,
        ORBIT_REAPER_TEARDOWN_LOG: mistypedStub.log,
      },
    },
  )

  const mistypedIdentity = worktree(join(root, "reaper", "mistyped-identity"), {
    path: 130,
    isMainWorktree: "false",
    isArchived: 0,
    linkedLinearIssue: 130,
  })
  check(
    "reap-worktrees.mjs",
    "validates path, primary, archive, and Linear link types on every row",
    [],
    { status: 3, stderr: /inventory row 0[\s\S]*path[\s\S]*isMainWorktree[\s\S]*isArchived[\s\S]*linkedLinearIssue/ },
    { env: orcaEnv([{ match: "worktree ps", stdout: psResult([mistypedIdentity]) }]) },
  )

  check(
    "reap-worktrees.mjs",
    "requires integer inventory totalCount",
    [],
    { status: 3, stderr: /totalCount is not an integer/ },
    { env: orcaEnv([{ match: "worktree ps", stdout: psResult([], { totalCount: "0" }) }]) },
  )

  check(
    "reap-worktrees.mjs",
    "requires boolean inventory truncated",
    [],
    { status: 3, stderr: /truncated is not a boolean/ },
    { env: orcaEnv([{ match: "worktree ps", stdout: psResult([], { truncated: 0 }) }]) },
  )

  const donePath = join(root, "reaper", "done")
  const nonDonePath = join(root, "reaper", "non-done")
  const stub = stageTeardownStub("selective")
  const inventory = [
    worktree(join(root, "reaper", "main"), { isMainWorktree: true, linkedLinearIssue: null }),
    worktree(join(root, "reaper", "unlinked"), { linkedLinearIssue: null }),
    worktree(nonDonePath, { linkedLinearIssue: "ORB-126" }),
    worktree(donePath, { linkedLinearIssue: "ORB-127" }),
  ]
  check(
    "reap-worktrees.mjs",
    "removes only an inactive linked Done worktree",
    [],
    { status: 0, stdout: /REAPED ORB-127[\s\S]*SKIPPED_NON_DONE ORB-126[\s\S]*REAPER OK/ },
    {
      env: {
        ...orcaEnv([
          { match: "worktree ps", stdout: psResult(inventory) },
          { match: "linear issue ORB-126", stdout: issueResult("ORB-126", "In Review") },
          { match: "linear issue ORB-127", stdout: issueResult("ORB-127", "Done") },
        ]),
        ORBIT_TEARDOWN_SCRIPT: stub.path,
        ORBIT_REAPER_TEARDOWN_LOG: stub.log,
      },
    },
  )
  const calls = existsSync(stub.log) ? readFileSync(stub.log, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)) : []
  T(
    "reap-worktrees.mjs: reaper delegates the exact Done path to safe teardown",
    calls.length === 1 && calls[0].join(" ") === `--worktree path:${donePath}`,
    `teardown calls: ${JSON.stringify(calls)}`,
  )

  const activeNonDonePath = join(root, "reaper", "active-non-done")
  const agentNonDonePath = join(root, "reaper", "agent-non-done")
  const nonDoneStub = stageTeardownStub("live-non-done")
  check(
    "reap-worktrees.mjs",
    "ignores active and agent-bearing worktrees only after proving they are non-Done",
    [],
    { status: 0, stdout: /SKIPPED_NON_DONE ORB-131[\s\S]*SKIPPED_NON_DONE ORB-132[\s\S]*REAPER OK reaped=0 skipped=2/ },
    {
      env: {
        ...orcaEnv([
          {
            match: "worktree ps",
            stdout: psResult([
              worktree(activeNonDonePath, { isActive: true, linkedLinearIssue: "ORB-131" }),
              worktree(agentNonDonePath, { agents: [{ state: "working" }], linkedLinearIssue: "ORB-132" }),
            ]),
          },
          { match: "linear issue ORB-131", stdout: issueResult("ORB-131", "In Review") },
          { match: "linear issue ORB-132", stdout: issueResult("ORB-132", "In Progress") },
        ]),
        ORBIT_TEARDOWN_SCRIPT: nonDoneStub.path,
        ORBIT_REAPER_TEARDOWN_LOG: nonDoneStub.log,
      },
    },
  )
  T(
    "reap-worktrees.mjs: active and agent-bearing non-Done worktrees never reach teardown",
    !existsSync(nonDoneStub.log),
    `teardown log unexpectedly exists at ${nonDoneStub.log}`,
  )

  for (const [label, identifier, overrides] of [
    ["active-done", "ORB-133", { isActive: true }],
    ["agent-done", "ORB-134", { agents: [{ state: "working" }] }],
  ]) {
    const unsafePath = join(root, "reaper", label)
    const unsafeStub = stageTeardownStub(label, { exit: 1 })
    check(
      "reap-worktrees.mjs",
      `passes a linked ${label} worktree to teardown and exposes its refusal`,
      [],
      { status: 1, stderr: new RegExp(`REAP_FAILED ${identifier}`) },
      {
        env: {
          ...orcaEnv([
            { match: "worktree ps", stdout: psResult([worktree(unsafePath, { ...overrides, linkedLinearIssue: identifier })]) },
            { match: `linear issue ${identifier}`, stdout: issueResult(identifier, "Done") },
          ]),
          ORBIT_TEARDOWN_SCRIPT: unsafeStub.path,
          ORBIT_REAPER_TEARDOWN_LOG: unsafeStub.log,
        },
      },
    )
    const unsafeCalls = existsSync(unsafeStub.log) ? readFileSync(unsafeStub.log, "utf8").trim().split(/\r?\n/).filter(Boolean) : []
    T(
      `reap-worktrees.mjs: linked ${label} refusal is observed at the exact worktree path`,
      unsafeCalls.length === 1 && JSON.parse(unsafeCalls[0]).join(" ") === `--worktree path:${unsafePath}`,
      `teardown calls: ${JSON.stringify(unsafeCalls)}`,
    )
  }

  const failingStub = stageTeardownStub("teardown-fails", { exit: 1 })
  check(
    "reap-worktrees.mjs",
    "fails closed when a Done candidate cannot be safely removed",
    [],
    { status: 1, stderr: /REAP_FAILED ORB-128/ },
    {
      env: {
        ...orcaEnv([
          { match: "worktree ps", stdout: psResult([worktree(join(root, "reaper", "unsafe"), { linkedLinearIssue: "ORB-128" })]) },
          { match: "linear issue ORB-128", stdout: issueResult("ORB-128", "Done") },
        ]),
        ORBIT_TEARDOWN_SCRIPT: failingStub.path,
        ORBIT_REAPER_TEARDOWN_LOG: failingStub.log,
      },
    },
  )

  check(
    "reap-worktrees.mjs",
    "fails closed on a truncated Orca inventory",
    [],
    { status: 3, stderr: /inventory is truncated/ },
    { env: orcaEnv([{ match: "worktree ps", stdout: psResult([], { truncated: true, totalCount: 1 }) }]) },
  )
}

export { reapWorktreeCases as cases }
