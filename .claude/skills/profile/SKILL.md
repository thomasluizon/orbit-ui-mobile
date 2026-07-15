---
name: profile
description: Targeted web performance profiling via the chrome-devtools MCP — trace a surface, analyze the Core Web Vitals insights, try one optimization, re-trace, and report the before/after delta. Use when investigating a slow web surface, chasing a red Lighthouse budget gate, or verifying a perf change moved the number. Interactive and on-demand — its automatic twin is the CI Lighthouse budget gate, not this skill.
argument-hint: <url | surface | blank=current page>
---

# Profile: Targeted Web Performance

**Input**: $ARGUMENTS

Profile one web surface against a real Chrome, read its Core Web Vitals insights, try one optimization, re-trace, and report the before/after delta. This is the interactive, hands-on twin of the CI Lighthouse budget gate: the gate profiles automatically and reds a PR; this skill is the loop for diagnosing *why* a surface is slow, or proving a fix actually moved the metric.

## When to use

- The Lighthouse budget gate went red and you need to find which insight blew the budget.
- A web surface feels slow and you want the measured CWV breakdown, not a guess.
- You changed something on a hot path and need the before/after delta to prove it helped (or didn't).

## Operating rules

- **Wraps the chrome-devtools MCP** performance tools — no new dependency; the MCP drives a real Chrome. Verify the server is connected before starting.
- **Profile a production-like build.** `next build` + `next start` (bring the stack up via `/dev-server`), never `next dev` — dev-mode traces are dominated by HMR and unminified bundles and do not reflect prod.
- **Fix ONE form-factor + viewport** for the whole before/after comparison. Use `emulate` to pin viewport, CPU-throttle, and network conditions; changing any of them mid-comparison invalidates the delta.
- **`performance_start_trace({reload:true})` reloads the *current* page** — so `navigate_page` to the target URL BEFORE starting the trace. An authed surface needs a logged-in session already established in the driven Chrome.

## The loop

1. **Navigate.** `navigate_page({type:'url', url})` to the target surface (default: the current page).
2. **Baseline trace.**
   - Load-time (LCP / CLS): `performance_start_trace({reload:true, autoStop:true})` — reloads and auto-stops when load settles.
   - Interaction (INP): `performance_start_trace({reload:false, autoStop:false})`, perform the ONE interaction, then `performance_stop_trace()`.
3. **Analyze.** For each insight the trace flags, `performance_analyze_insight({insightSetId, insightName})` (e.g. `LCPBreakdown`, `DocumentLatency`, `RenderBlocking`) to get the located cause.
4. **One hypothesis, one change.** Form a single hypothesis from the top insight; make ONE code change.
5. **Re-trace + compare.** Rebuild, repeat steps 1–3 *identically*, and compare LCP / INP / CLS / TBT baseline → after.
6. **`lighthouse_audit` is a11y / SEO / best-practices ONLY** — it excludes performance. Never read a CWV number from it.

## Reporting

- A short before/after table (LCP / INP / CLS / TBT, baseline → after), each moved row tied to the `file:line` changed, plus one recommendation (ship / keep digging / revert).
- Always state the build mode and the pinned viewport — an unlabeled or `next dev` trace is not comparable.
- A null result is a result: if the change did not move the metric, say so and revert it.

## Guardrails — do NOT

- **Micro-optimize.** At Orbit's solo-dev scale, chase only the insight that actually moves a Core Web Vital; skip sub-millisecond noise.
- **Bundle changes.** One change per re-trace, or you cannot attribute the delta.
- **Trace `next dev`** or vary the viewport between runs — either makes the comparison meaningless.
- **Read performance from `lighthouse_audit`.** CWV come from `performance_start_trace` / `performance_analyze_insight` only.
- **Turn this into a CI gate.** It is interactive by nature; the automatic budget check is the Lighthouse gate, not this skill.
