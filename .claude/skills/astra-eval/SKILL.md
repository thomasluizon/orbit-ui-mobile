---
name: astra-eval
description: Run or extend the on-demand Astra prompt-to-behavior eval corpus and interpret its pass^3 launch report. Use for Astra capability checks, not UI tests or API behavior fixes.
---

# Astra eval

Read the Astra section of [TESTING.md](../../../TESTING.md) for fixture requirements,
environment keys, adding cases, and the request-bound opt-in trace adapter.

For an offline harness check, run `npm ci --prefix evals/astra --workspaces=false`, then
`npm test --prefix evals/astra`. This uses local providers and intercepted HTTP requests;
it does not start a server or spend model credits.

The paid live gate runs once, at app launch. Each failing case is rerun once; there is no
other live run. A fix round never calls the provider: replay recorded real provider responses
offline at the model-service port, following the `orbit-api`
`tests/Orbit.Application.Tests/Fixtures/` pattern, or use a fake completion client.
Eval traffic uses `AI__EvalApiKey`, the separate OpenAI key for the `Orbit Eval` project with a
hard monthly limit. An eval account without that key fails closed and never falls back to the
production key. The API enforces `AI__EvalDailyBudgetUsd`, a hard shared ceiling of 0.50 USD per
UTC day per environment for all eval accounts together, including accounts with
`astra_eval_unmetered`. A ceiling stop ends that UTC day's window; the gate continues with its remaining cases in the
next UTC day's window (`TESTING.md` `### Daily windows and combined report`). Never continue it
on another account, key or environment, reset a counter, raise a ceiling or rotate accounts to finish.
No paid-key probe runs without a written cost estimate on the owning ticket first; record the
actual cost there afterward.

Preserve each window's sanitized summaries and `attempts/` directory before another run overwrites
them. Merge all window summary paths in chronological order with `node merge-reports.mjs` from
`evals/astra`. A continuation replaces only incomplete case entries and retains completed companions.
For the single permitted rerun of a failed case, keep its original window in the inputs and prefix
the rerun window path with `--rerun`; that window must contain only previously failed cases.
Continue an interrupted rerun in an ordinary later window without another declaration. Already
passed cases and second reruns are rejected. The merged `sourceWindow` numbers refer to input path
positions; `superseded` preserves prior evidence without counting its attempts toward pass^3.
Follow `TESTING.md` `### Daily windows and combined report` for the exact commands.

For the app-launch gate, use the configured disposable eval accounts and their fixture reset
executable. Never substitute a personal account. Enable the existing
`astra_eval_trace` account flag through `/flag` only for disposable fixtures, record its
previous state, and restore it after the run. The eval provider alone sends the opt-in
header and a fresh independent request ID; ordinary app requests stay default-off.
Confirm the named environment and credentials are configured without displaying their values, then run
`cd evals/astra && npx promptfoo eval`. The same run is available through the `Astra eval`
workflow's manual dispatch. Do not add a schedule or automatic trigger.

Read `evals/astra/reports/summary.md`. Report each case's three-attempt outcome and distinguish
failed behavior from incomplete tool evidence. Missing, mismatched, withheld or skipped
evidence cannot approve launch. A held `PendingConfirmation` preview proves only a proposal, never a saved change.
The model comparison was superseded by server-owned model selection; do not send a model
override. Keep D147's server-owned `gpt-6-luna` low and the configured per-account policy
within the hard shared eval ceiling.
Keep ORB-20 open through live capability verification after all carrying code is deployed
to the API the gate runs against (staging, or production with the disposable eval accounts).
Source adapter tests cannot replace that acceptance.

When adding a case, keep exact ID and enum assertions, tolerant text matching, and unordered
compound tool requirements. Bulk cases require one bulk call and forbid single-item calls.
Grade only the final rendered answer projection with `llm-rubric`; it includes visible blocks and
preview fields, excludes traces and execution payloads, and accepts block-only replies. Verify the fixture reset can recreate the case
before each of the three attempts. Run the offline tests after changing the corpus or assertions.

Do not attach raw promptfoo databases, responses, or traces to a pull request. The summary
contains only case identifiers and counts. Record behavior failures on the work ticket;
this skill does not authorize behavior changes, ticket writes, or outbound messages.

Composition acceptance belongs to #26. The app-launch gate covers its English and Portuguese
real-pipeline cases after the API composition producer and #1620's paired consumers are deployed
through the current `main` release workflow. Cover every #1617 family, block-only success, compound queries and legacy or
missing-kind clients. Missing or skipped composition assertions cannot approve broad activation
of `astra_block_first`. Local rendering tests do not replace that evidence.

The composition corpus is `evals/astra/composition-scenarios.yaml`. Each case declares its family,
locale, client capabilities and composition policy. Supported clients require ordered parts;
legacy and missing-kind cases require readable fallbacks. Keep the structural composition check
and semantic rubric together: the rubric catches paraphrased repetition of figures. Reports must
include three complete attempts per case and aggregate pass^3 by family and locale.

Medical correction cases first issue the original request through the same HTTP provider, verify
its trace and preview, then submit the correction with that actual answer as history. Each attempt
uses its own pending preview; no write is approved. Count this setup call in the existing allowance.
The existing-parent fixture binds Post Lunch to `ORBIT_EVAL_HABIT_ID` and Before Bed to
`ORBIT_EVAL_SECOND_HABIT_ID`. Do not create duplicate parents to satisfy a case.
