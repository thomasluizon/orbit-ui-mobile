#!/usr/bin/env node
import { collectProgressWindow } from "./lib/progress-window.mjs"
import { runBounded } from "./lib/bounded-process.mjs"
import { githubEnvironment, redactSecrets, repositorySlug } from "./lib/github-auth.mjs"
import { configuredRepositorySlug } from "./lib/admission.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { REPO_ROOT } from "./lib/run-state.mjs"

const USAGE = `usage: progress-window.mjs --session <id> [--transcript <path>] [--transcripts-dir <path>]

Print one JSON report since the previous owner-typed /progress across project sessions.
Skip the current invocation. With no previous report, use the open chain start, then session start.
Read live merges, release runs, closed and created tickets across configured repositories.
Release time is dispatch creation; branch is the source named in the title, dispatchBranch
is the workflow ref. Missing title metadata stays null, never inferred from that ref.
Decisions and owner questions include archived chains and overlapping sessions.
conversation is the fallback for sessions without a decision log: owner prompts and assistant
text replies, each capped at 1,500 characters plus a visible truncation marker.
The report identifies its baseline and prints window.startedAt in ISO UTC, plus localStartedAt.
No baseline prints baseline: unavailable and performs no remote reads.

  --session <id>       exact current session id (required)
  --transcript <path>  current transcript when not recorded in run state
  --transcripts-dir <path>  override the project transcript directory
  --help, -h          print this usage and exit 0

exit codes: 0 report produced; 1 source, interval or response error; 2 invalid arguments`

const argv = process.argv.slice(2)
if (argv.includes("--help") || argv.includes("-h")) {
  process.stdout.write(`${USAGE}\n`)
  process.exit(0)
}
const options = {}
for (let index = 0; index < argv.length; index++) {
  const key = { "--session": "sessionId", "--transcript": "transcriptPath", "--transcripts-dir": "transcriptsDirectory" }[argv[index]]
  const value = argv[++index]
  if (!key || !value || value.startsWith("-") || options[key]) {
    process.stderr.write(`${USAGE}\n`)
    process.exit(2)
  }
  options[key] = value
}
if (!options.sessionId) {
  process.stderr.write(`${USAGE}\n`)
  process.exit(2)
}

let secrets = []
try {
  const config = readOrchestratorConfig()
  let authentication
  const report = await collectProgressWindow({ ...options, repoRoot: REPO_ROOT,
    repositories: ["ui", "api", "landing"].map((key) => ({ key,
      slug: configuredRepositorySlug(config.repos[key], repositorySlug(config.repos.ui).split("/")[0]) })),
    ticketRepository: config.tickets.repository,
    readPages: async (path, projection, source) => {
      const auth = await (authentication ??= githubEnvironment(config.repos.ui).then((auth) => {
        secrets = auth.secrets
        return auth
      }))
      const runLimit = 10000
      const args = source.kind === "releases"
        ? ["run", "list", "--repo", source.slug, "--workflow", source.workflow, "--all", "--created", source.createdSince,
          "--limit", String(runLimit), "--json", "databaseId,displayTitle,headBranch,conclusion,status,createdAt,updatedAt,url"]
        : ["api", "--paginate", path, "--jq", projection]
      const result = await runBounded(process.env.GH_BIN || "gh", args,
        { env: auth.environment, timeoutMs: config.timeouts.gitRemoteSeconds * 1000 })
      if (result.error || result.status !== 0) throw new Error(`GitHub read failed at ${path}: ${result.stderr || result.error?.message || result.status}`)
      if (source.kind === "releases") {
        const runs = JSON.parse(result.stdout)
        if (!Array.isArray(runs) || runs.length >= runLimit) throw new Error(`incomplete release listing at ${path}`)
        return [{ total_count: runs.length, workflow_runs: runs.map((run) => ({ id: run.databaseId,
          display_title: run.displayTitle, head_branch: run.headBranch, conclusion: run.conclusion === "" ? null : run.conclusion,
          status: run.status, created_at: run.createdAt, updated_at: run.updatedAt, html_url: run.url })) }]
      }
      return result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line))
    },
  })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} catch (error) {
  process.stderr.write(`progress-window: ${redactSecrets(error.message, secrets)}\n`)
  process.exit(1)
}
