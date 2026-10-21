---
name: astra-eval
description: Run or extend the on-demand Astra prompt-to-behavior eval corpus and interpret its pass^3 launch report. Use for Astra capability checks, not UI tests or API behavior fixes.
---

# Astra eval

Read the Astra section of [TESTING.md](../../../TESTING.md) for fixture requirements,
environment keys, adding cases, and the pending trace adapter.

For an offline harness check, run `npm ci --prefix evals/astra --workspaces=false`, then
`npm test --prefix evals/astra`. This uses local providers and intercepted HTTP requests;
it does not start a server or spend model credits.

For a requested live capability run, use the configured disposable eval accounts and their
fixture reset executable. Never substitute a personal account. Confirm the named environment
and credentials are configured without displaying their values, then run
`cd evals/astra && npx promptfoo eval`. The same run is available through the `Astra eval`
workflow's manual dispatch. Do not add a schedule or automatic trigger.

Read `evals/astra/reports/summary.md`. Report each case's three-attempt outcome and distinguish
failed behavior from incomplete tool evidence. An incomplete report cannot approve launch.
The model comparison was superseded by server-owned model selection; do not send a model
override. Keep ORB-20 open while the trace adapter or live capability verification is pending.

When adding a case, keep exact ID and enum assertions, tolerant text matching, and unordered
compound tool requirements. Bulk cases require one bulk call and forbid single-item calls.
Grade only the final answer with `llm-rubric`. Verify the fixture reset can recreate the case
before each of the three attempts. Run the offline tests after changing the corpus or assertions.

Do not attach raw promptfoo databases, responses, or traces to a pull request. The summary
contains only case identifiers and counts. Record behavior failures on the work ticket;
this skill does not authorize behavior changes, ticket writes, or outbound messages.
