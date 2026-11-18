---
name: astra-eval
description: Run or extend the on-demand Astra prompt-to-behavior eval (the core set gate for an assistant pull request, and the launch corpus) and interpret its pass^k report. Use for Astra capability checks, not UI tests or API behavior fixes.
---

# Astra eval

Read the Astra section of [TESTING.md](../../../TESTING.md) for fixture requirements, environment keys,
the exact commands and the request-bound opt-in trace adapter.

For an offline harness check, run `npm ci --prefix evals/astra --workspaces=false`, then
`npm test --prefix evals/astra`. This uses local providers, recorded staging streams and intercepted HTTP
requests; it does not start a server or spend model credits.

## The gate for an assistant pull request: the core set

Each pull request that changes the assistant gets one live run of the core set, from a local checkout, on a staging
build of that branch, before merge. Do not add a schedule or an automatic trigger. Regenerate `catalog.yaml` from a
clean API checkout at the evaluated commit first; the run refuses another commit.

The core set is `evals/astra/core/situations.yaml`: 21 situations, each in 3 frozen phrasings, each in English and
pt-BR. Each case sends `POST /api/chat/stream` as a shipped client does (the shared context builder with a
`conversationId`, the shared history builder, card answers through `blockAnswer`). The grader reads the outcome: the
change list of the held previews (kind, target records, changed fields), the questions that came before the preview,
and the saved state after approval. An offer (`suggested` with a removal) and a field that the server derives are not
requested changes: the change list keeps them apart, and the person approves the preview as shown. A `stored` field is
derived unless a held write in the eval trace names it: a clear (`clear_fields`, `clear_parent` or an empty array), or
any edit in the `edits_json` of a held revision. It grades no tool name. `llm-rubric` grades only the text of a read
answer. The core set does not load when a situation expects a change whose saved state the readback cannot read
(`core/corpus.mjs`), so no live turn spends on it.

The gate is two runs from `evals/astra`, then one merge:

- `npx promptfoo eval --config core/must-pass.promptfooconfig.yaml` runs the must-pass cases at k=3. A case passes
  only when all 3 attempts pass (pass^3).
- `npx promptfoo eval --config core/other.promptfooconfig.yaml` runs the other cases at k=1.
- `node core/merge.mjs --run-cost-usd <measured cost> --baseline <baseline summary.json> <run summaries>` writes
  `reports/core/summary.md`: k and pass^k for each case, pass^k for each family and locale, the questions before a
  preview, the measured model calls, the seconds and the cost of each case, and the gate verdict.

k=3 is the default. Set `ORBIT_EVAL_MUST_PASS_K=1` on both runs to run the must-pass cases at
k=1 only for a change whose model input equals the model input of `main`: for each turn, the API sends the model
the same model and effort, instructions, tool declarations and messages as `main` does (rows 3a, 3b and 4 of the
build queue of #2129). The pull request body of that change says why its model input is equal. Each window and
the merged report state their k. The merge refuses a k=1 window, rerun or baseline in a k=3 verdict, and a k=3 one
in a k=1 verdict, so a k=1 gate compares with a baseline of `main` that also ran with `ORBIT_EVAL_MUST_PASS_K=1`.

`ORBIT_EVAL_ASTRA_PATH` names the path that a run measures: `block-first`, the default, for the API without the
`ai_change_plan` flag, or `change-plan` for the API with that flag on. Set it on both core set runs and on the launch
corpus run. The run reads `/api/config` for each eval account before its first turn, and it stops when
`features.ai_change_plan.enabled` does not agree with the path. `catalog.yaml` holds the lists of both paths: the
`block-first` lists under their own keys, and the `change-plan` lists under `changePlan`. Each window and each merged
report state their path, and a summary with no path measured `block-first`. The merge refuses windows of two paths in
one verdict. A `change-plan` run compares with the `block-first` baseline of `main`.

On the `change-plan` path the model sends each account change in one typed change list. The API declares that list in
one of two shapes (`AI:ChangePlanShape`), and `changePlan` holds one set of lists for each shape. The trace names each
change by its kind in each shape, so no run names its shape: a trace is valid when the lists of one shape accept every
call of it. That path declares no `present_plan` and no single write form that a bulk form covers. `TESTING.md`
`### Change list declarations` has the detail.

The gate passes when every must-pass case passes, the pass^k rate of the core set is at or above the baseline, no
attempt asks more often than its case allows, and one model call costs at most the D147 limit. An attempt stops one
question past the allowed count and keeps that count. The baseline is the merged report of `main` in which every case has a verdict; the baseline run of `main`
passes `--as-baseline` in place of `--baseline`. These local runs are the only live runs of the gate.

No rerun on the same build replaces a failure. A failed attempt fails its case for that build, and the merge refuses
a second result for a case that passed or failed. A failure of the build is a failed attempt: a wrong preview, a reply
without a preview and without a choice, question or fitting list card (a question in text is never a valid ask), HTTP
5xx, a stream without a final event, a failed approval. Only a throttle, a spend ceiling, a failed precondition, a
failed rubric grader, a card turn without the trace that its answer needs, or a preview turn without the trace that
shows a `stored` field is no evidence; it leaves the case incomplete, and only such a case continues in a later window.
A turn that gives no evidence adds no counted model calls.

A reply that the grader cannot read is a grader limit, not a behavior failure: the case has no verdict, and the merge
refuses a later window of the same build for it. Each kind clears only through `--rerun` on a later API commit of the
pull request; until then the gate of that build stays incomplete. Extend the grader before that rerun.

- A preview limit (`The grader cannot classify a held preview`): `attempts/<case>-r<n>.json` keeps the held previews
  as `heldPreviews`, with the fields that the held writes name (`written`), so the extended grader regrades them
  offline with `gradePreview({ questionsBeforePreview, previews, written })`. Record that verdict on the work ticket;
  the merge does not take it.
- A card limit (a same-title or list card that the grader cannot answer): the attempt ended at the card, before any
  preview, so the evidence keeps no preview. Only the rerun measures it.

After a fix, the failed cases and the cases with a grader limit run once more live on the fixed build. This is the
single permitted rerun: a case has one. Give its summaries to the merge with `--rerun`: the rerun takes the place of
the first result, and the report names each build and marks the case `rerun on <commit>`. `--rerun` declares which
windows belong to a later build, so the merge refuses a later build given first without the flag.

Staging can serve another API commit before each case has a verdict: after a fix, or after a release of another
commit. A case without a verdict (no window held it, or its attempts gave no evidence) then runs on the new build, in
the same `--rerun` windows, and uses no rerun. A pass or a fail there is its first verdict (`first verdict on <commit>`
in the report). A case that stays incomplete there has no verdict (`no verdict on <commit>`). The counts on the line of each
later build hold only the cases whose final entry comes from that build. A case that passed keeps its build. The attempts of one case always come from one build. Give the `--rerun` windows of one build together, in
build order.

A fix round never calls the provider: replay recorded real provider responses offline at the model-service port,
following the `orbit-api` `tests/Orbit.Application.Tests/Fixtures/` pattern, or use a fake completion client.

The server owns the model and the effort: the values that the newest accepted brain ADR on the assistant model names
(D147 today: `gpt-6-luna` at low effort). Send no model override. A change of model or effort is the owner's decision
and becomes an ADR first.

## Spend rules

Eval traffic uses `AI__EvalApiKey`, the separate OpenAI key for the `Orbit Eval` project with a hard monthly limit.
An eval account without that key fails closed and never falls back to the production key. The API enforces
`AI__EvalDailyBudgetUsd`, a hard shared ceiling per UTC day per environment for all eval accounts together, including
accounts with `astra_eval_unmetered`: 1.20 USD on staging and 0.50 USD on production (`infra/configuration.tf` in
`orbit-api`). A ceiling stop ends that UTC day's window; the run
continues with its incomplete cases in the next UTC day's window. Never continue it on another account, key or
environment, reset a counter, raise a ceiling or rotate accounts to finish.

Write the cost estimate on the owning ticket before any paid-key run (cases x attempts x calls x price, from the
newest measured figures). Record the actual cost there afterward: read it from the API's daily `AI cost` line for the
eval purpose and pass it to the merge as `--run-cost-usd`. A core set run stays under the daily ceiling in each
window. The launch corpus gate runs once, with a 2 USD spend ceiling for that run; the ceiling returns to the daily
value of its environment after it.

Use the configured disposable eval accounts and their fixture reset executable. Never substitute a personal account.
Enable the existing `astra_eval_trace` account flag through `/flag` only for disposable fixtures, record its previous
state, and restore it after the run. The core set run reads `/api/config` before its first turn and stops when the flag
is off. For a `change-plan` run, turn on `ai_change_plan` for the eval accounts in the same way. The eval alone sends the opt-in header and a fresh request ID for each turn;
ordinary app requests stay default-off. Confirm the named environment and credentials are configured without
displaying their values.

## Reports

Read `reports/core/summary.md` for the core set and `reports/summary.md` for the launch corpus. Report each case's
configured-attempt outcome and distinguish failed behavior from incomplete evidence. Missing, mismatched, withheld or
skipped evidence cannot approve a gate. A held `PendingConfirmation` preview proves only a proposal; the saved state
readback proves the write.

Preserve each window's sanitized summaries and `attempts/` directory before another run overwrites them. The merged
report links each attempt of a failed case to the `attempts/` file of its window, so keep each window directory where
the merge read it. Do not attach raw promptfoo databases, responses, or traces to a pull request. The summary holds
case identifiers, counts, measurements, the failure reasons and the paths of the private evidence; the evidence itself
stays in `attempts/`. Record behavior failures on the work ticket; this skill does not authorize behavior changes,
ticket writes, or outbound messages.

## The launch corpus

`scenarios.yaml` and `composition-scenarios.yaml` are the full corpus (`npx promptfoo eval`, one attempt per case). This
local run is the only live run of the corpus. It
grades request-bound tool evidence against the lists of its path in `catalog.yaml` and stays until the old assistant
path is deleted. The read before `ask` and the `selection_required` clause apply to the `block-first` path only: on the
`change-plan` path the API needs no read before `ask`, and its `ask` takes `about` and `several`. Merge its
window summaries in chronological order with `node merge-reports.mjs`; a continuation replaces only incomplete case
entries. `--rerun` declares the single permitted rerun of a failed case after a fix; a rerun on the same build never
replaces a failure. Follow `TESTING.md` `### Daily windows and combined report` for the exact commands.

For an offline assertion audit, run `node evals/astra/replay.mjs <source-window> <separate-output>`. The audit replays
each call against the lists of the path that the window summary states. Keep request
schemas distinct from continuation instruction constraints: the API retains the cacheable `ask` schema throughout the
turn, including nullable draft bindings on every form. The audit never calls the provider or judge and retains
semantic rubric verdicts. Offer attempt artifacts retain sanitized issued offers, selected keys and declared mutation
scope; older artifacts that omit this context cannot prove why a lifecycle failed.

Keep ORB-20 open through live capability verification after all carrying code is deployed to the API the gate runs
against (staging, or production with the disposable eval accounts). Source adapter tests cannot replace that
acceptance.

Composition acceptance belongs to #26. The corpus covers its English and Portuguese real-pipeline cases after the API
composition producer and #1620's paired consumers are deployed through the current `main` release workflow. Cover
every #1617 family, block-only success, compound queries and legacy or missing-kind clients. Missing or skipped
composition assertions cannot approve broad activation of `astra_block_first`. Local rendering tests do not replace
that evidence. Each composition case declares its family, locale, client capabilities and composition policy.
Supported clients require ordered parts; legacy and missing-kind cases require readable fallbacks. Keep the structural
composition check and semantic rubric together: the rubric catches paraphrased repetition of figures.

Medical correction cases first issue the original request through the same HTTP provider, verify its trace and
preview, then submit the correction with that actual answer as history. Each attempt uses its own pending preview; no
write is approved. Count this setup call in the existing allowance. The existing-parent fixture binds Post Lunch to
`ORBIT_EVAL_HABIT_ID` and Before Bed to `ORBIT_EVAL_SECOND_HABIT_ID`. Do not create duplicate parents to satisfy a
case.

## Add a case

A core set situation states the outcome: the expected change list, the allowed questions, and the answer the person
gives. Add a situation with its 3 phrasings in both locales; never edit a committed situation, because the corpus
digest ties each report to the cases it measured. pt-BR phrasings read as a Brazilian wrote them.

A launch corpus case keeps exact ID and enum assertions, tolerant text matching, and unordered compound tool
requirements. Bulk cases require one bulk call and forbid single-item calls. Grade only the final rendered answer
projection with `llm-rubric`; it includes visible blocks and preview fields, excludes traces and execution payloads,
and accepts block-only replies. Verify the fixture reset can recreate the case before each configured attempt. Run
the offline tests after changing a corpus or its assertions.
