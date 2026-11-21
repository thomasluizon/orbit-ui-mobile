---
name: astra-eval
description: Run the on-demand Orbit AI prompt-to-behavior eval (the core set gate for an AI pull request, and the launch corpus) and read its pass^k report. Use for Orbit AI capability checks, not UI tests or API fixes.
---

# Orbit AI eval

Read the capability eval section of [TESTING.md](../../../TESTING.md) for fixture requirements, environment keys and the exact commands.

For an offline check, run `npm ci --prefix evals/astra --workspaces=false`, then `npm test --prefix evals/astra`. It uses local providers and recorded staging streams. It starts no server and spends no model credit.

## The gate for an AI pull request: the core set

Each pull request that changes the Orbit AI gets one live run of the core set. Run it from a local checkout, against a staging build of that branch, before merge. Add no schedule and no automatic trigger. Regenerate `evals/astra/catalog.yaml` from a clean API checkout at the evaluated commit first. The run refuses another commit.

The core set is `evals/astra/core/situations.yaml`. It holds 21 situations, each in 3 frozen phrasings, each in English and pt-BR. Each case sends `POST /api/chat/stream` as a shipped client does. The grader reads the outcome: the held previews, the questions before the preview, and the saved state after approval. It grades no tool name. `llm-rubric` grades only the text of a read answer.

The gate is two runs from `evals/astra`, then one merge:

- `npx promptfoo eval --config core/must-pass.promptfooconfig.yaml` runs the must-pass cases at k=3. A case passes only when all 3 attempts pass (pass^3).
- `npx promptfoo eval --config core/other.promptfooconfig.yaml` runs the other cases at k=1.
- `node core/merge.mjs --run-cost-usd <measured cost> --baseline <baseline summary.json> <run summaries>` writes the core report with the verdict.

The gate passes when all of these hold:

- Every must-pass case passes.
- The pass^k rate of the core set is at or above the baseline.
- No attempt asks more often than its case allows.
- One model call costs at most the limit of the newest accepted model ADR.

The baseline is the merged report of `main`. Run `main` with `--as-baseline` in place of `--baseline`.

Set `ORBIT_EVAL_MUST_PASS_K=1` on both runs only for a change whose model input equals the model input of `main`. Say why in the pull request body. A k=1 gate compares only with a k=1 baseline of `main`. The merge refuses a mix of k values.

No rerun on the same build replaces a failure. A failed attempt of the build fails its case. A throttle, a spend ceiling, a failed precondition or a missing trace is no evidence. It leaves the case incomplete, and only that case continues in a later window. After a fix, give the failed cases one more live run on the fixed build, and pass its summaries to the merge with `--rerun`. A reply that the grader cannot read is a grader limit. It has no verdict and clears only through `--rerun` on a later API commit.

A fix round never calls the provider. Replay recorded provider responses offline, or use a fake completion client.

The server owns the model and the effort, from the newest accepted model ADR. Send no model override. A change of model or effort is the owner's decision and becomes an ADR first.

## Spend rules

Eval traffic uses `AI__EvalApiKey`, the separate key of the `Orbit Eval` project with a hard monthly limit. An eval account without that key fails closed. The API enforces `AI__EvalDailyBudgetUsd`, a shared ceiling of 0.50 USD for each UTC day and environment. It counts every eval account, also an `astra_eval_unmetered` account.

- A ceiling stop ends the window of that UTC day. The run continues with its incomplete cases in the next window.
- Never continue on another account, key or environment. Never reset a counter, raise a ceiling or rotate accounts.
- The launch corpus gate runs once, with a 2 USD ceiling for that run. The ceiling returns to 0.50 USD a day after it.

Write the cost estimate on the ticket before any paid-key run: cases x attempts x calls x price, from the newest measured figures. Record the actual cost there afterward. Read it from the daily `AI cost` line of the API for the eval purpose, and pass it to the merge as `--run-cost-usd`.

Use the configured disposable eval accounts and their fixture reset executable. Never use a personal account. Enable the `astra_eval_trace` account flag through `/flag` only for disposable fixtures, record its previous state, and restore it after the run. Confirm that the environment and credentials exist without you showing their values.

## Reports

Read the report that the merge writes: the core report for the core set, the combined report for the launch corpus. Report the outcome of each case. Separate a failed behavior from incomplete evidence. Missing, mismatched or skipped evidence cannot approve a gate. A held `PendingConfirmation` preview proves only a proposal. The saved state readback proves the write.

Keep the sanitized summaries and the attempts directory of each window before another run overwrites them. Attach no raw promptfoo database, response or trace to a pull request. Record behavior failures on the work ticket. This skill does not authorize a behavior change, a ticket write or an outbound message.

## The launch corpus

`evals/astra/scenarios.yaml` and `evals/astra/composition-scenarios.yaml` are the full corpus. Run it with `npx promptfoo eval`, one attempt for each case. This local run is the only live run of the corpus. Merge the window summaries in time order with `node merge-reports.mjs` from `evals/astra`. Follow the `Daily windows and combined report` section of TESTING.md for the commands. For an offline assertion audit, run `node evals/astra/replay.mjs <source-window> <separate-output>`.
