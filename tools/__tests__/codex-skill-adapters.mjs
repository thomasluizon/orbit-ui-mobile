#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { T, failureCount } from "./_harness.mjs"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

const check = (name, condition, detail) => {
  T(name, condition, detail)
}

const codexSkillAdapterCases = () => {
for (const name of ["feature", "ticket", "orchestrate"]) {
  const adapterPath = resolve(ROOT, `.agents/skills/${name}/SKILL.md`)
  const canonicalPath = `.claude/skills/${name}/SKILL.md`
  const body = existsSync(adapterPath) ? readFileSync(adapterPath, "utf8") : ""

  check(`${name} Codex adapter exists`, body.length > 0, `${adapterPath} is missing`)
  check(
    `${name} Codex adapter defers to its canonical Claude skill`,
    body.includes(canonicalPath),
    `${adapterPath} does not name ${canonicalPath}`,
  )
  check(
    `${name} Codex adapter passes the caller arguments unchanged`,
    /arguments unchanged/i.test(body),
    `${adapterPath} does not preserve the caller arguments`,
  )
  check(
    `${name} Codex adapter stays thin`,
    body.length > 0 && body.length < 700 && !/Phase [A-Z0-9]|tools\/|orca linear|gh pr|launch-worker/i.test(body.replace(canonicalPath, "")),
    `${adapterPath} copies workflow logic or exceeds the 700-byte adapter ceiling`,
  )
}

const orchestratePath = resolve(ROOT, ".claude/skills/orchestrate/SKILL.md")
const orchestrate = readFileSync(orchestratePath, "utf8")
const localReviewStart = orchestrate.indexOf("**The local `/pr-review`")
const localReviewEnd = orchestrate.indexOf("- D7:", localReviewStart)
const localReview = localReviewStart >= 0 && localReviewEnd > localReviewStart
  ? orchestrate.slice(localReviewStart, localReviewEnd)
  : ""

check("orchestrate has a local review contract", localReview.length > 0, "the local /pr-review contract is missing")
check(
  "the orchestrator owns review launch and workers wait",
  /orchestrator owns the review cycle/i.test(localReview) && /workers do not invoke or authorize/i.test(localReview) && /launch-pr-review\.mjs/i.test(localReview),
  "the canonical orchestrator contract does not close the worker-origin review path",
)
check(
  "workers receive only passed-back repair findings",
  /only the stable finding and its evidence/i.test(localReview) && /not been passed back/i.test(localReview),
  "the canonical review contract does not constrain worker repairs to orchestrator evidence",
)
check(
  "every pull request enters the local review loop",
  /every pull request/i.test(localReview) && !/harness diffs only|only when .*diff touches|gets no local pass/i.test(localReview),
  "the local review contract is still path-gated",
)
check(
  "each head uses the dedicated context-free Codex launcher",
  localReview.includes("tools/launch-pr-review.mjs") && /brand-new, context-free Codex review/i.test(localReview),
  "the local review contract does not launch a fresh Codex context for each head",
)
check(
  "NEEDS_WORK returns to the same implementation worker and worktree",
  localReview.includes("NEEDS_WORK") && /same implementation worker/i.test(localReview) && /same worktree/i.test(localReview),
  "the repair loop does not preserve worker and worktree ownership",
)
check(
  "a pushed repair starts a brand-new review round",
  /pushes a new head/i.test(localReview) && /brand-new/i.test(localReview) && /loop/i.test(localReview),
  "the local review contract does not repeat on each new head",
)
check(
  "only current-head APPROVE completes local review",
  /current-head `?APPROVE`?/i.test(localReview),
  "the local review contract has no positive current-head approval gate",
)
check(
  "normal mode waits for Thomas and never merges",
  /normal mode/i.test(orchestrate) && /never merges/i.test(orchestrate) && /Thomas/i.test(orchestrate),
  "the attended completion contract does not explicitly stop for Thomas",
)
check(
  "sleep mode positively requires current-head APPROVE before ordinary merge",
  /--sleep[\s\S]{0,1200}current-head `?APPROVE`?[\s\S]{0,1200}(ordinary|non-admin) merge/i.test(orchestrate),
  "the unattended merge contract does not positively gate on current-head review evidence",
)
check(
  "obsolete one-shot and head-move stop language is gone",
  !/exactly ONCE|never one pass per review round|never a re-run after a head move|head moves after verification, stop/i.test(localReview),
  "the local review contract still contains one-shot or stop-on-head-move behavior",
)
check(
  "orchestrate does not claim merge-sweep-cov has an admin path",
  !/merge-sweep-cov\.sh`?:[^\n]*[\s\S]{0,180}use `--admin`/i.test(orchestrate),
  "the obsolete merge-sweep-cov admin statement remains",
)
check(
  "orchestrate reaps completed worktrees at startup",
  /startup[\s\S]{0,500}tools\/reap-worktrees\.mjs/i.test(orchestrate),
  "the orchestrator does not invoke the completed-worktree reaper before launch",
)
check(
  "orchestrate keeps the durable model matrix consistent",
  /Codex main: Sol, high\s*\|\s*Luna, max\s*\|\s*fresh Sol, high/i.test(orchestrate)
    && /Claude main: Opus 5, high\s*\|\s*Luna, max\s*\|\s*fresh Sol, high/i.test(orchestrate)
    && /model map defaults to gpt-5\.6-luna at max reasoning/i.test(orchestrate)
    && !/defaults? to gpt-5\.6-terra|Terra-medium is the routine default/i.test(orchestrate),
  "the canonical runbook contradicts the configured Luna/max implementation default",
)
check(
  "orchestrate routes NEEDS-WORK without spending the review-only state",
  /\| `NEEDS-WORK` \|[^\n]*same implementation worker[^\n]*durable finding relaunch budget/i.test(orchestrate)
    && /\| `AWAITING-REVIEW` \|[^\n]*never spend a worker relaunch/i.test(orchestrate),
  "NEEDS-WORK and AWAITING-REVIEW do not carry distinct relaunch contracts",
)
}

const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (direct) {
  const before = failureCount()
  codexSkillAdapterCases()
  const failures = failureCount() - before
  console.log(`\n${failures === 0 ? "CODEX SKILL ADAPTER CONTRACT OK" : `CODEX SKILL ADAPTER CONTRACT FAILED (${failures})`}`)
  process.exitCode = failures === 0 ? 0 : 1
}

export { codexSkillAdapterCases as cases }
