---
name: deep-research
description: Answer an open-ended "what's the best way to…?" question with orchestrated multi-agent deep web research. Decompose the question, fan out narrow research subagents in parallel, verify the load-bearing claims adversarially, iterate to saturation, then synthesize ONE opinionated, source-backed, decision-ready recommendation. Orbit-aware (dual-repo stack, solo-dev cost calibration). Use for technology/vendor choices, architecture & tooling decisions, cost comparisons, migration approaches, or best-practice questions — anything whose answer needs current external evidence beyond the codebase. Not for code edits, single-fact lookups, or questions answerable from the repo alone.
argument-hint: <research question> [--quick | --deep]
---

# Deep Research

**Input**: $ARGUMENTS

Turn an open question — *"find the best possible way to make this project's background jobs durable across restarts and retries"* — into a **decision-ready, evidence-backed recommendation**. The method is **orchestrator-worker**: you (the orchestrator) frame and decompose the question, fan out narrow research subagents in parallel, verify the claims the answer hinges on, loop until the picture saturates, and synthesize **one opinionated recommendation** with sources, concrete numbers, and confidence notes. You stay in the main session and interact; the subagents do the heavy reading so their raw dumps never bloat this context.

**Golden rule**: every load-bearing claim in the final answer traces to a **source fetched this run** (URL + "as of <date>"), or it's explicitly flagged as inference. Pricing, limits, and features change — training memory is a starting hypothesis, never the evidence.

## Provenance & self-containment

The method here is adapted at authoring time from current **multi-agent deep-research practice** (the orchestrator-worker / lead-researcher pattern: a coordinator decomposes, parallel workers gather, a verification pass refutes, a synthesizer commits), specialized to Orbit's dual-repo reality and solo-dev economics. The skill file embeds **no live marketplace dependency** — the only network calls are the research the subagents perform at run time, which *is* the function.

---

## Phase 0 — Frame the question (before any fan-out)

Don't research yet. First pin:

1. **Restate the goal** in one line, and define what **"best" means here** — the decision axes the recommendation will be scored on. Pick the ones that apply: cost · setup/maintenance effort · risk/blast-radius · reversibility · fit-to-existing-stack · performance/latency · security/compliance · DX. Name them; they become the columns of the final options table.
2. **State constraints & assumptions explicitly** (root CLAUDE.md §1). Default Orbit constraints below — adjust if the question implies otherwise.
3. **Ask only load-bearing unknowns.** If a missing fact would change the recommendation (budget ceiling, must-keep vendor, deadline, "is X already in place"), use `AskUserQuestion` — recommended option first, batched, **one round if possible**. If it wouldn't change the answer, pick the sensible default, **state it**, and move on. Do not interrogate for trivia.
4. **Decide depth** (mode table) and **whether codebase facts are needed** — if the question touches Orbit's own code/config/contracts, plan an `Explore` agent to run *in parallel* with the web agents (e.g. an env-var/dependency/contract inventory), not after.

### Mode detection — parse `$ARGUMENTS`

| Signal | Mode | Fan-out | Verify |
|---|---|---|---|
| `--quick`, "just check", single narrow axis | **Quick** | 1–2 agents | single confirm |
| default | **Standard** | 3–4 agents (the 3-concurrent cap, +1 queued) | targeted re-confirm of top claims |
| `--deep`, "exhaustive", "go crazy", "be thorough"; or high-stakes / hard-to-reverse | **Deep** | waves of agents + **loop-until-saturation** | adversarial refute-panel on every load-bearing claim |

Raise the **3-concurrent subagent cap** only when the user said "go crazy / no cap / all at once" (root CLAUDE.md).

---

## Phase 1 — Decompose into research axes

Break the question into **non-overlapping slices**, each ownable by one subagent with zero overlap (two agents must never research the same thing). Slice by whichever fits:

- **by option / vendor** — one agent per candidate (Supabase branch vs. project; Render vs. Fly vs. Railway).
- **by dimension** — cost & limits · DX & setup · security/compliance · ecosystem maturity.
- **by modality** — official docs/pricing/changelogs · community & forums · head-to-head comparisons · the codebase (Explore).
- **by sub-question** — the distinct questions hiding inside the ask.

For each axis write a crisp **objective** + an **output contract** (the exact structured findings to return). List the axes and the agent assignment before spawning.

---

## Phase 2 — Fan out parallel research subagents

Use the **Agent tool**: `general-purpose` for web research, `Explore` for codebase slices. Launch them in one message (respecting the concurrency cap; queue extras). **Every research agent prompt embeds this contract** — it is the quality core of the skill:

> **Objective:** <the slice's narrow goal>.
> **Answer exactly these questions:** <numbered list>.
> **How:** Do *deep* research — multiple searches, follow citations, go past the first page. **Fetch primary/official sources** (docs, pricing, changelog, spec, release notes) and **verify each load-bearing fact against the LIVE page** — do NOT answer from memory; prices/limits/features change. Get **current, dated** info ("as of <today's year>"); note when a source was last updated.
> **Return:** a short recommendation up top, then a section per question with **concrete facts** (exact $ amounts, limits, version numbers) and a **source URL** for each. **Separate hard cited facts from your own inference — flag inferences and state confidence.** Resolve any contradiction you hit rather than reporting both. Decision-ready, no padding.

For **Deep** mode, give parallel agents **distinct lenses** on the same target (e.g. one "official pricing", one "real-world gotchas/forums", one "head-to-head vs alternatives") instead of N identical searches — diversity surfaces what redundancy can't.

---

## Phase 3 — Verify the load-bearing claims (adversarial)

Pull out the handful of facts the recommendation will **hinge on** (a price, a hard cap, a licensing rule, a compatibility/version constraint). For each, in Standard mode re-confirm against a second independent source; in Deep mode spawn a small **refute panel** — agents prompted to *disprove* the claim, defaulting to "unverified" on a single source.

- **Resolve contradictions, don't average them.** When two agents disagree, dig until one wins with a primary source (a blog said "12", the official doc + changelog said "1" → trust the doc).
- **Right-size enterprise advice.** A generic source will say "separate org, separate account, isolate everything." Recalibrate to **Orbit's actual scale** (solo dev, tiny footprint, cost-sensitive): strip cautions that only matter at enterprise volume and say so. This judgment is the difference between a useful answer and a scary one.

---

## Phase 4 — Gaps & iterate (loop until saturation)

Run a **completeness critic** over what you have: *what's missing — an option never researched, a claim still unverified, a modality not searched, a cost not quantified, a constraint from Phase 0 not addressed?* 

- If there are real gaps and the mode warrants → spawn another **wave** (back to Phase 2 for just the gaps).
- **Stop** when a wave returns nothing materially new (loop-until-dry), the answer is decision-ready against every Phase-0 axis, or you've hit **diminishing returns** (new passes only restate or bikeshed). Don't loop forever — quit when rounds go style-only.
- **No silent caps.** If you bounded coverage (top-N options, skipped a region/language, sampled), say so in the output.

---

## Phase 5 — Synthesize ONE decision-ready recommendation

Findings first, then the call — and **be opinionated** (don't hand back an un-ranked survey). Synthesize; never relay raw agent dumps. Structure:

- **Recommendation** — the single best path, up top, in one or two sentences.
- **Options table** — candidates × the Phase-0 decision axes, with **concrete numbers** ($/mo, limits, versions) in the cells.
- **Why** — the reasoning, tied back to the axes and the stated constraints.
- **Cost & effort** — for Orbit, give a **cheapest-viable vs. best-practice split** with real $ figures, and a **now-vs-later timeline** when the cheap path defers a cost.
- **Citations** — source URLs for every load-bearing fact.
- **Confidence & caveats** — what's certain vs. inferred, and what to re-verify before betting on it.
- **Sequenced next steps** — what to do first.

---

## Phase 6 — Capture

Offer (don't do unsolicited):

- **Memory** — save the decision + the durable facts to `C:\Users\thoma\.claude\projects\C--Users-thoma-Documents-Programming-Projects-orbit-ui-mobile\memory\` (check for an existing memory to update first), with a one-line pointer in `MEMORY.md`.
- **Report** — write the full findings to `.claude/research/<kebab-name>.md` (`mkdir -p .claude/research`).
- **Issue** — open a tracking issue if the result is actionable work.

---

## Orbit context (frame every subagent with the relevant slice of this)

- **Dual repo, launched from `orbit-ui-mobile`** (reach `orbit-api` via absolute paths). `orbit-ui-mobile`: Turborepo — `apps/web` (Next.js), `apps/mobile` (Expo SDK 57, **Android only**), `packages/shared` (Zod types/i18n/endpoints). `orbit-api`: .NET, EF Core, Postgres, MediatR CQRS.
- **Vendors in play** (so research is grounded, not abstract): Supabase (Postgres + Auth), Render (.NET API), Vercel (web), OpenAI (Astra/AI), Resend (email), Sentry + Discord (observability), Google Play Billing + Stripe (subscriptions).
- **Audience calibration:** solo developer, cost-sensitive, pre-full-prod-launch. Recommend at **solo-dev scale**, not enterprise — always price the option and prefer the cheapest path that isn't a footgun.
- **Cross-cutting rules** the answer must respect when relevant: cross-platform parity (web ↔ mobile), backward-compat / deploy-order for shared contracts, and `DESIGN.md` for any UI/design question.
- When the question touches Orbit's own code, an `Explore` agent reading the repos is part of the fan-out — not a substitute for the web research.

---

## Guardrails — do NOT

- **Answer from training memory alone.** If a fact wasn't fetched this run, it's unverified — say so or go get it. The skill's whole value is *current, cited* evidence.
- **Relay raw subagent reports.** Synthesize into one opinionated deliverable; cut the padding and the enterprise scare-framing.
- **Hand back a survey with no recommendation.** Be opinionated about which option has the best leverage for *this* user.
- **Over-prescribe.** Don't recommend enterprise isolation/tooling to a solo dev; right-size cost and effort.
- **Fabricate URLs or numbers.** A missing/unverifiable fact is reported as such, never invented.
- **Exceed the 3-concurrent subagent cap** unless the user opted into more.
- **Loop past diminishing returns**, or run forever chasing a marginally better source.
- **Implement or refactor during research** — findings first; write code only if the user asks after seeing the recommendation.
- **Translate the brand words** "Orbit" / "Astra" — literal everywhere.

---

## When to use the Workflow tool instead

If the user has explicitly opted into multi-agent orchestration (e.g. "ultracode", "use a workflow") *and* the research is large (many options × dimensions, or loop-until-dry over a big space), the same Phase 1→5 method maps cleanly onto a Workflow script (`parallel`/`pipeline` for the fan-out, a loop for saturation, a synthesis stage). Otherwise — the default — run it here with the Agent tool, exactly as the phases describe.
