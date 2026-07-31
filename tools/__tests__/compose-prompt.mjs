import { readFileSync } from "node:fs"

import { T, stage, orcaEnv, check, INTERACTIVE_WORKER, stageLaunchWorker, linearIssueStub } from "./_harness.mjs"

const composePromptCases = () => {
  const output = stage("prompts/orb-125.md", "")
  const comments = [
    { user: { name: "Later reviewer" }, createdAt: "2026-07-28T10:00:00.000Z", body: "Later comment" },
    { user: { name: "First reviewer" }, createdAt: "2026-07-27T10:00:00.000Z", body: "First comment with ```ts\nconst answer = 42\n```" },
  ]
  const issue = { identifier: "ORB-125", description: "# Ticket body\n\nKeep this verbatim.", comments }
  const result = check(
    "compose-prompt.mjs",
    "writes the body and chronological, attributed comments without changing fenced Markdown",
    ["--issue", "ORB-125", "--output", output],
    { status: 0, stdout: /orb-125\.md/ },
    { env: orcaEnv([{ match: "linear issue ORB-125", stdout: JSON.stringify({ ok: true, result: { issue } }) }]) },
  )
  const prompt = readFileSync(output, "utf8")
  T(
    "compose-prompt.mjs: comment order, attribution, and fences survive composition",
    result.status === 0 && prompt.indexOf("First reviewer - 2026-07-27T10:00:00.000Z") < prompt.indexOf("Later reviewer - 2026-07-28T10:00:00.000Z") && /```ts\nconst answer = 42\n```/.test(prompt),
    prompt,
  )
  const launcher = stageLaunchWorker("compose-prompt", INTERACTIVE_WORKER)
  check("launch-worker.mjs", "accepts a composed prompt file unchanged", ["--issue", "ORB-75", "--prompt-file", output, "--dry-run"], { status: 0 }, { path: launcher.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const noComments = stage("prompts/no-comments.md", "")
  check(
    "compose-prompt.mjs",
    "omits the comments heading when the issue has no comments",
    ["--issue", "ORB-126", "--output", noComments],
    { status: 0 },
    { env: orcaEnv([{ match: "linear issue ORB-126", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-126", description: "# Body", comments: [] } } }) }]) },
  )
  T("compose-prompt.mjs: zero comments add no empty heading", !/Comments on this issue/.test(readFileSync(noComments, "utf8")))
}

export { composePromptCases as cases }
