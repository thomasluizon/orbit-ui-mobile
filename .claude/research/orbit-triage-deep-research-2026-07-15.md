# Orbit triage deep-research — 4 tracks (2026-07-15)

> **At a glance:** Source-verified deep-research on four Orbit decisions — (1) Astra AI-chat eval methodology, (2) feature flags for the stack, (3) auto-updated architecture diagram, (4) design-as-code / anti-slop tooling. Audience: solo dev, cost-sensitive, pre-launch. Every load-bearing fact was fetched live and dated this run; inferences are flagged. Produced via the `/deep-research` skill (orchestrator + 4 parallel research subagents + independent spot-checks).

**The four questions**
1. Best way to test/eval Astra (OpenAI tool-calling agent) prompt→behavior, given "unit-tests-only, no integration/E2E" (harness must live outside `dotnet test`, like `bench/`).
2. Best feature-flag approach for Next.js web + Expo Android + .NET API where mobile lags via Play — validate "extend the existing AppConfig endpoint" vs a vendor.
3. Most reliable way to keep an auto-updated multi-repo architecture diagram — foglamp.dev risk vs self-hosted.
4. Design-as-code / anti-slop tooling fit for a stack with a mature DESIGN.md + tokens + `local/*` lint gates — pencil.dev, anti-slop MD (slop.md/chiefkeef.md), emilkowalski/skills, plus `improve-ui` (added mid-session).

---

## TRACK 1 — Evaluating Astra's prompt→tool-call correctness

### Recommendation
Use **promptfoo's HTTP provider pointed at the real, running Astra endpoint**, as a standalone eval folder run in CI — **nightly + on any change to the system prompt or a tool schema — entirely outside `dotnet test`** (mirrors how `bench/` runs BenchmarkDotNet). It's **MIT, free**, YAML-driven, hits the *deployed* agent with near-zero glue, and **OpenAI acquired promptfoo (March 2026) and is sunsetting its own Evals product**, so it's the durable bet.

Per case, layer three assertions on the response:
1. `is-valid-openai-tools-call` — structural: the call conforms to the tool JSON schema (deterministic).
2. a `javascript` assertion over the extracted `tool_calls` — the real gate: assert **tool name == Y** and **key args ≈ Z** (exact for IDs/enums, fuzzy/semantic tolerance for free-text).
3. `llm-rubric` (or `g-eval`) — LLM-as-judge on the **final natural-language answer** only.

Run each case **k≥3** and gate on "≥m of k" (pass^k) — `seed`/temperature 0 do **not** give determinism. promptfoo's default on-disk cache keeps re-runs cheap. Full-suite ≈ **~$1/run** on gpt-4.1-mini; judge tokens are rounding error.

**Alternatives & when to switch:** *Microsoft.Extensions.AI.Evaluation* (stay in C#; has a `ToolCallAccuracyEvaluator`, but it's LLM-judge-based, so you'd still hand-write the deterministic tool+arg asserts in a standalone console project). *DeepEval (Python)* — the only framework with a **deterministic** tool-selection+args+ordering metric out of the box; switch if your arg-matching outgrows a JS assertion.

### Q1 — Leading eval tools (2026)
**Strategic context (verified):** OpenAI is **deprecating its Evals platform** — read-only Oct 31 2026, shutdown Nov 30 2026 ([OpenAI Evals guide](https://developers.openai.com/api/docs/guides/evals)). OpenAI **acquired promptfoo, announced March 9 2026, "will remain open source"** ([OpenAI](https://x.com/OpenAI/status/2031052793835106753), [CNBC](https://www.cnbc.com/2026/03/09/open-ai-cybersecurity-promptfoo-ai-agents.html), [TechCrunch](https://techcrunch.com/2026/03/09/openai-acquires-promptfoo-to-secure-its-ai-agents/)).

| Tool | What | Runtime | OSS/license | Paid | Tests live HTTP agent? | Built-in tool-call metric? |
|---|---|---|---|---|---|---|
| **promptfoo** | Test prompts/agents/RAG, red-team | Node/JS CLI, YAML | **MIT**, free forever | Enterprise "Custom" | **Yes** — HTTP provider + `transformResponse` | Structural (`is-valid-openai-tools-call`); exact tool+args via `javascript` |
| **OpenAI Evals API** | Hosted grading | REST + Python | No (hosted), **shutting down** | tokens only | **No** (grades pre-generated transcripts) | via `python` grader |
| **DeepEval** | "Pytest for LLM apps" | Python | **Apache-2.0**, free | Confident AI cloud from **$9.99/user/mo** | **Yes** (feed your `tools_called`) | **Yes — `ToolCorrectnessMetric` (deterministic)** |
| **Braintrust** | Eval/observability SaaS | SDKs incl. **C#** | Closed SaaS; `autoevals` MIT | Free $0; **Pro $249/mo** | **Yes** (`task` fn) | None built-in (write scorer) |
| **Langfuse** | Tracing + evals | Python/TS | **MIT** (except `ee/`) | Hobby $0; Core $29; Pro $199; Ent $2,499 | Yes (ingestion) | None (LLM-judge/custom) |
| **Openlayer** | Governance/eval SaaS | Python SDK | SDK Apache-2.0, platform proprietary | Basic free; Enterprise custom | Mostly (SDK/OTel) | **Yes — "Tool call correctness"** |
| **Custom LLM-judge** | Your own judge+parser | any | free | judge tokens | Yes (you write it) | whatever you code |

Only **DeepEval** (deterministic) and **Openlayer** ship a *named* tool-selection+args metric. promptfoo has structural tool-call assertions + a one-line `javascript` exact-match, and is the only OSS option that natively drives your *deployed* agent over HTTP.
Sources: [promptfoo LICENSE](https://github.com/promptfoo/promptfoo/blob/main/LICENSE) · [pricing](https://www.promptfoo.dev/pricing/) · [HTTP provider](https://www.promptfoo.dev/docs/providers/http/) · [assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs/) · [DeepEval](https://github.com/confident-ai/deepeval) + [ToolCorrectnessMetric](https://deepeval.com/docs/metrics-tool-correctness) · [Braintrust pricing](https://www.braintrust.dev/pricing) · [Langfuse](https://langfuse.com/pricing) · [Openlayer](https://www.openlayer.com/products/llm-agent-evaluation).

### Q2 — Deterministic vs LLM-judge; combining; flakiness
2026 consensus = **deterministic first**. Anthropic: *"deterministic graders where possible, LLM graders where necessary"* ([Demystifying evals, Jan 9 2026](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)). Hamel Husain: assertion checks are **Level 1** (every change); LLM-judge is **Level 2**, added later, needs *"100+ labeled examples, weekly maintenance"* ([hamel.dev/blog/posts/evals](https://hamel.dev/blog/posts/evals/), [FAQ](https://hamel.dev/blog/posts/evals-faq/)) — so keep judge scope small.
Combine exactly as your split: deterministic on the **tool step** (invocation → selection → structural args), LLM-judge on the **holistic answer**.
**Design warning (fact):** Anthropic says **do NOT assert the exact tool *sequence*** — *"overly brittle… grade what the agent produced, not the path."*
**Non-determinism:** `seed` does **not** guarantee determinism ([OpenAI seed cookbook](https://developers.openai.com/cookbook/examples/reproducible_outputs_with_the_seed_parameter)); temp 0 isn't a fix (multi-turn tool loops amplify nondeterminism). **Metric to adopt: run each case k times, report pass^k** (all k succeed) — 70% per-attempt → pass@3 ≈ 97% but **pass^3 ≈ 34%** ([philschmid](https://www.philschmid.de/agents-pass-at-k-pass-power-k)). Arg tolerance: exact for IDs/enums, LLM-judge only for free-text arg semantics.
**Realistic flakiness:** multi-turn tool agents are genuinely flaky under the consistency metric (τ-bench: GPT-4o < 25% at pass@8) — [INFERENCE, high] for a near-single-turn tool-selection case at temp 0, per-case flake is low single-digit % but not zero and compounds; gate on pass^k, treat a flipping case as a signal to tighten it. A 100% pass rate usually means the eval is too easy.

### Q3 — Running evals in a .NET shop
**Path 1 (recommended, least glue): promptfoo over HTTP against the real agent.** HTTP provider is purpose-built for "evaluate the deployed service": template `{{prompt}}`, POST JSON, parse with `transformResponse` (JSON path or `file://parser.js`) to extract `tool_calls`. Tests the **real C# agent, not a reimplementation**. Lives as a repo folder invoked by `npx promptfoo eval` in CI, outside `dotnet test`.
**Path 2 (stay in C#): Microsoft.Extensions.AI.Evaluation** ([Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/ai/evaluation/libraries), NuGet 10.4.0). Purpose-built **`ToolCallAccuracyEvaluator`** + `IntentResolutionEvaluator` + `TaskAdherenceEvaluator`; any `IChatClient` (OpenAI directly); built-in caching; `dotnet aieval` console. **Caveat:** those agent evaluators are **LLM-judge under the hood** — for the deterministic tool+args half you'd still hand-write xUnit/FluentAssertions over the returned JSON, in a standalone console eval project (mirroring `bench/`).
**(c) Golden-transcript/record-replay:** don't build a bespoke replay harness — promptfoo's default disk cache *is* your record/replay; pair with a checked-in golden set of expected tool+args.
**Least-effort robust setup:** ~30–50 promptfoo YAML cases, each = messy user string + `is-valid-openai-tools-call` → `javascript` (tool name + key args, fuzzy value tolerance) → `llm-rubric` (final answer). `repeat: 3`, gate "≥2 of 3". Own CI job (nightly + on prompt/tool-schema change).

### Q4 — Cost / latency / CI gating
**Cadence:** full ~30–50 suite **nightly** (reuse existing nightly harness) + a **sampled subset on PRs that touch the system prompt or a tool schema**; ordinary code PRs skip it.
**Caching:** promptfoo caches provider responses by default (disk `~/.promptfoo/cache`, 14-day TTL; errors not cached; `repeat>1` separate namespaces) ([caching docs](https://www.promptfoo.dev/docs/configuration/caching/)); the [GitHub Action](https://www.promptfoo.dev/docs/integrations/github-action/) posts before/after PR comments.
**Live gpt-4.1-mini pricing:** **$0.40/1M input, $0.10/1M cached, $1.60/1M output** ([model page](https://developers.openai.com/api/docs/models/gpt-4.1-mini)). ⚠️ It has dropped off OpenAI's headline pricing page (now GPT-5.6/5.5/5.4; gpt-5.4-mini $0.75/$4.50, gpt-5.4-nano $0.20/$1.25) — **confirm gpt-4.1-mini is still available for your account before launch**; a current-gen mini may undercut it.
**Worked cost (assumptions stated):** ~12k-token fixed prefix (60 tool schemas + system prompt) [INFERENCE — measure your real number], ~3 model calls/case, ~40k input + ~800 output/case → ~$0.017/case.

| Cases | k=1 | k=3 (pass^k) |
|---|---|---|
| 30 | ~$0.52 | ~$1.55 |
| 40 | ~$0.69 | ~$2.07 |
| 50 | ~$0.86 | ~$2.59 |

Well under ~$1 for one full-suite run; ~$1.50–$2.60 at k=3. Nightly ≈ **$25–75/mo before caching**; OpenAI prompt caching (~75% off the fixed prefix) roughly halves per-case input. LLM-judge is rounding error (~$0.03 for 40 cases w/ a mini judge).

---

## TRACK 2 — Feature flags

### Recommendation (high confidence)
**Extend the existing `AppConfig` endpoint. Do not adopt a vendor.** For a solo dev, pre-launch, cost-sensitive, with a .NET API that already serves a startup config payload, rolling your own remote flags is the correct 2026 call. The regret-triggers that push teams to a vendor (multi-team coordination, RBAC/audit/compliance, polyglot SDK upkeep, hundreds of flags) are enterprise concerns; none apply.
The slam-dunk: **you don't hand-roll the hard part.** .NET's first-party **`Microsoft.FeatureManagement`** ships a **`TargetingFilter`** that does consistent-hash percentage rollout (same user always gets the same answer, feature key mixed into the hash for independent rollouts) plus user/group targeting and variants — battle-tested % rollout + kill-switch as a NuGet, evaluated **server-side**, returning resolved values in the AppConfig response. Mobile does zero hashing.
**If ever forced to a vendor:** **GrowthBook Cloud** (free: 3 seats, *unlimited* flags, MIT, official .NET + React + React-Native SDKs) or **Flagsmith** (free: 50k req/mo). Both still lose to extending your endpoint (duplicate infra). **Rule out PostHog** (already declined). **Firebase Remote Config is a trap** — its server-side SDK does **not** support .NET (Node/Python/Go/Java only), so your API can't evaluate it; client min fetch interval is 12h in prod.

**Orbit grounding (from the codebase):** you **already have** an `AppFeatureFlag` entity + `AppFeatureFlags` table exposed via `ConfigController` `/api/config` as `features{key:{enabled, planRequirement}}`, plus `packages/shared/src/types/config.ts` (`featureFlagSchema`), `utils/config.ts`, and `apps/web/hooks/use-config.ts`. Today it's used for **plan-gating** (Pro vs free). So on/off + plan gates already ship — the net-new work is the **remote kill-switch** and **% rollout** for a can't-hotfix mobile app.

### Recommended shape
- **Schema** — extend the AppConfig DTO with an optional typed `flags` object (fits your append-only, deploy-API-first contract; old mobile ignores unknown keys). Server evaluates per-user, returns **resolved values** not rules. Mirror as Zod in `packages/shared`.
- **Storage** — flags MUST live in the **DB** (the table already exists) or a hot-reloadable source, **not `appsettings.json`** (a Render appsettings change needs a redeploy — too slow for a kill-switch). DB-backed = flip a row, effective next client refresh. This is the one "must-build" piece for kill-switch speed.
- **Evaluation** — `Microsoft.FeatureManagement` `TargetingFilter`, keyed on your stable user id, in the API. % rollout + kill-switch server-side.
- **Refresh** — fetch at launch + on app foreground/resume (mobile) and navigation/interval (web); refetch on foreground so a kill-switch flip lands within one resume.
- **Fallback (mobile-critical)** — cache last response (SecureStore mobile / memory+cookie web); on fetch failure use **last-known-good**, else **default-off**. A failed fetch must never *enable* a risky/expensive feature.
- **Rollout without a store release** — ship dark; server's %-bucketing on stable user id decides visibility; raise the % in the DB.

### Q2 — Vendor free tiers (live, July 2026)
| Vendor | Free tier | OSS self-host | .NET/React/RN SDK | First paid |
|---|---|---|---|---|
| **ConfigCat** | 10 flags, 2 envs, unlimited seats/MAU, 5M downloads/mo | No | Yes/Yes/Yes | **Pro $110/mo** |
| **Flagsmith** | 50k req/mo, unlimited flags/envs, 1 member | **Yes (BSD-3)** | Yes/Yes/Yes | Start-Up $40/mo |
| **PostHog** | 1M flag req/mo, then usage | Yes | Community/Yes/Yes | usage-based |
| **Unleash** | Self-host Community only (Apache-2.0); **no permanent free hosted** | **Yes (Apache-2.0)** | Yes/Yes/Yes | Cloud $75/seat; self-host min 5 = $375/mo |
| **GrowthBook** | **Cloud Starter free: 3 seats, unlimited flags**; self-host free | **Yes (MIT)** | Yes/Yes/Yes | Cloud Pro $40/seat/mo |
| **LaunchDarkly** | Developer free: unlimited seats, 1 project/3 envs | No | Yes/Yes/Yes | Foundation ~$8.33/1k client MAU |

Sources: [ConfigCat](https://configcat.com/pricing/) · [Flagsmith](https://www.flagsmith.com/pricing) · [PostHog](https://posthog.com/pricing) · [Unleash](https://www.getunleash.io/pricing) · [GrowthBook](https://www.growthbook.io/pricing) · [LaunchDarkly](https://launchdarkly.com/pricing/) · [FlagShark OSS comparison 2026](https://flagshark.com/blog/open-source-feature-flag-tools-compared-2026/). The "free but self-host" options (Unleash, GrowthBook self-host) add a Docker service + Postgres = *more* infra. Only zero-infra free clouds worth a look: GrowthBook Cloud, Flagsmith.

### Q1/Q3 — Roll-your-own soundness, must-haves, build-vs-buy
Sound at your scale — practitioner guidance converges on "config-over-HTTP first; graduate to a service when complexity demands" ([Timdeschryver](https://timdeschryver.dev/blog/feature-flags-in-net-from-simple-to-more-advanced), [Unleash build-vs-buy](https://www.getunleash.io/blog/feature-flags-build-buy)). Must-haves: typed schema; **bulk-evaluate at startup + cache** (never one call per flag); default-off/last-known-good; kill-switch as a cheap fast path (~60s refresh); **% rollout via consistent hashing** (hash `flagKey+userId`, include the key so rollouts are independent — `TargetingFilter` implements this) ([oneuptime](https://oneuptime.com/blog/post/2026-01-30-percentage-rollout-flags/view), [Unleash hashing](https://www.getunleash.io/blog/hashing-it-right-solving-a-gradual-rollout-puzzle), [Microsoft Learn](https://learn.microsoft.com/en-us/azure/azure-app-configuration/feature-management-dotnet-reference)); keep flags short-lived. Regret point (TCO, no dashboard/audit/RBAC, if/else sprawl, polyglot SDKs) is a real **enterprise** threshold — a solo dev with <20 flags + a hashing library is nowhere near it. **Verdict: build — genuinely fine, not a corner cut.**

### Q4 — Mobile (Expo SDK 57, can't hotfix)
Fetch-at-launch + cache is the established pattern; serve cached instantly, refresh in background (stale-while-revalidate) ([Expo feature-flags guide](https://docs.expo.dev/guides/using-feature-flags/), [PostHog RN caches in AsyncStorage w/ no TTL](https://posthog.com/docs/libraries/react-native)). Remote kill-switch works precisely because the flip is server-side (no store release). **Gotcha:** EAS Update (OTA) is a *different* tool — swaps the JS bundle, coarse/all-or-nothing per channel; use flags for kill-switch/rollout of already-shipped code, EAS Update to *ship* code. Fail safe: failed fetch → last-known-good; unknown flag → off.

---

## TRACK 3 — Auto-updated architecture diagram

### Recommendation
**Committed cross-repo Mermaid, regenerated by a nightly Claude Code job; foglamp kept only as an optional share link.**
1. **Source of truth:** a committed `ARCHITECTURE.md` at the `orbit-ui-mobile` root with a ` ```mermaid ` block. **GitHub renders it natively — zero build step, versioned, diffable in PRs.**
2. **Auto-regeneration:** a scheduled GitHub Actions job (slot beside `rollup.yml`/`commit-sweep.yml`) runs **Claude Code headless (`claude -p`)** against a new `/architecture-map` skill that checks out all three repos and emits ONE cross-repo Mermaid diagram; commit back on diff only (git-diff gate → `chore/architecture-map` PR). Nightly (not per-merge) is right for a solo dev: cheap, current within 24h, no per-PR token spend, naturally spans three separate git histories.
3. **Optional share link:** keep publishing to foglamp `/scan` as a *throwaway* pretty AI-usage map — never canonical.

### Q1 — foglamp risk
Primary product = **LLM/AI-agent observability** ([foglamp.dev](https://www.foglamp.dev/), [Product Hunt](https://www.producthunt.com/products/foglamp)). Pricing: **Free $0** (10k spans/mo, **3-day retention**, 1 project), **Pro $49/mo** (1M spans, 14-day), Enterprise custom ([pricing](https://www.foglamp.dev/pricing)). The `/scan` map is a **marketing side-feature** ("maps how your repo uses AI"; account-free) — **no documented permanence/SLA/retention for an anonymous published scan** (all retention clauses are account/plan-tied; [privacy, upd. June 10 2026](https://www.foglamp.dev/privacy)). Terms are "as is," "may add/change/remove features," free-plan liability capped $100 ([terms](https://www.foglamp.dev/terms)). The edit-token `POST api.foglamp.dev/scan` mechanism is **undocumented**. Company is very young; no SLA below Enterprise. **Verdict (high confidence): unfit as system of record; fine as a disposable regenerable link.** (Name also collides with the unrelated Apache-2.0 `foglamp/FogLAMP` IoT platform.)

### Q2 — In-repo diagram-as-code (all free/OSS)
| Tool | License | Renders natively on GitHub? | Solo-dev maintainability |
|---|---|---|---|
| **Mermaid** | MIT | **Yes — the only one** (inline in any `.md`) | **Highest.** Weak at large scale; C4 syntax still experimental |
| **LikeC4** | MIT ([repo](https://github.com/likec4/likec4)) | No — needs `npx likec4` build or export to PNG/Mermaid; [`likec4/actions`](https://likec4.dev/tooling/github/) | Medium. Proper C4 but **DSL is hand-maintained, NOT auto-derived** |
| **Structurizr** | DSL/CLI/Lite free; **server paid** ([pricing](https://docs.structurizr.com/server/pricing)) | No | Medium/low; most mature C4 but pulls toward paid server |
| **D2** | MPL-2.0 ([repo](https://github.com/terrastruct/d2)) | No — CLI → SVG/PNG | Medium. **Best auto-layout**, but every view is a build artifact |

For "renders on GitHub, zero infra," **Mermaid is the only native option.** D2 is the upgrade if layout quality hurts (accept a CI build step).

### Q3 — What stays current vs rots
1. **CI regen on merge → commit back** — current by construction. **CodeBoarding** (MIT, ~2.3k★, v0.13.0 Jul 13 2026; static analysis + LLM; **outputs Mermaid**; [GitHub Action](https://github.com/marketplace/actions/codeboarding-action) w/ incremental updates; **supports C# + TypeScript**) is the closest off-the-shelf match — **but single-repo**, so it wouldn't unify your three repos in one map.
2. **Scheduled/nightly regen** — current within a day; cheaper; **best fit for a 3-repo map** (one job checks out all three).
3. **Hand-maintained committed DSL** — **rots** (LikeC4/Structurizr fall here unless kept in sync).
4. **Hosted one-shot generators (GitDiagram, foglamp `/scan`)** — stale the instant code changes + vendor-dependent. [GitDiagram](https://github.com/ahmedkhaleel2004/gitdiagram) (MIT, ~15.8k★, outputs Mermaid) is one-shot cached, no auto-update.

### Q4 — Best home for this setup
Write a **`/architecture-map` Claude Code skill** (mirrors `/rollup`, `/commit-sweep`) → emits one Mermaid into `ARCHITECTURE.md`; add **`architecture-map.yml`** on a nightly `schedule:` + `workflow_dispatch`, commit-on-diff, add the file to the CLAUDE.md docs registry. Optionally also POST the scan to foglamp in the same job and drop the URL in the PR body, explicitly non-canonical. (If you'd rather buy than build: run CodeBoarding's action per-repo and draw the cross-repo seams by hand.)

---

## TRACK 4 — Design-as-code / anti-slop tooling

### Ranked verdict
| Rank | Item | Verdict | Why |
|---|---|---|---|
| 1 | **`improve-ui` (ibelick/ui-skills)** | **ADOPT (web)** | Audits `apps/web` against your OWN DESIGN.md/tokens/components; read-only (writes `design-plans/`); complements DESIGN.md-as-source-of-truth. Web-only but token/CSS-agnostic. |
| 2 | **emilkowalski/skills** | **ADOPT (web) + harvest to mobile** | Fills the motion gap DESIGN.md doesn't cover; free, MIT, one command, on your exact web stack. Web-only → mobile gets ideas not code. |
| 3 | **anti-slop MD (slop.md / chiefkeef.md)** | **HARVEST into DESIGN.md** (brand-safe), don't adopt wholesale | Its blanket "no purple gradients/glows" **conflicts** with your intentional navy-violet brand; redundant with `impeccable` + `design-reviewer` + lint. chiefkeef.md unverifiable. |
| 4 | **pencil.dev** | **SKIP the pipeline** (optional one-off web ideation) | Canvas-as-source-of-truth + web-React/Tailwind output fights DESIGN.md authority, semantic tokens, lint gates, and mobile parity; no RN/Expo output. |

### pencil.dev — full analysis
**What it is (fact, from [pencil.dev](https://www.pencil.dev/) + [docs](https://docs.pencil.dev/getting-started/ai-integration)):** a local **design-to-code canvas app** — not a Figma clone, not a standalone AI image generator. You compose UI on an infinite canvas in `.pen` files; it runs a **local MCP server**, and an external agent (**Claude Code (primary), Cursor, Codex**) connects over MCP to read/modify/generate both designs and code. Cmd+K prompts inline. Explicitly a "vibe-coding" front-end: *"Pencil generates nothing on its own"* — the AI agent does the generation.
**Pricing/OSS (fact, [pricing](https://www.pencil.dev/pricing)):** *"Pencil is currently free… In the future, we may introduce paid features or plans."* Early-access, no tiers, **not open source** (no license/repo surfaced). Real cost is the agent you bring (Claude Code $20/mo + API usage on heavy sessions). Founders signal future paid plans.
**Integration (fact + inference):** documented outputs are **React components + Tailwind CSS** (also HTML/CSS). It can **read an existing codebase** — docs show *"Recreate all components from src/components in Pencil,"* *"Import the design system from our Tailwind config,"* and bidirectional *"Update all React components to match the Pencil designs."* So it *can* ingest a Tailwind token config. **No React Native / Expo / NativeWind output is documented anywhere found** (searches returned only unrelated Apple-PencilKit packages). Confidence high that it's web-React/Tailwind-centric.
**Complement or conflict?** Mostly **conflict** for your setup:
- **Source-of-truth clash** — DESIGN.md is the authoritative hand-authored spec with semantic tokens (`--bg`,`--fg`,`--primary`,`--gradient-header`); pencil makes the **canvas** the source and generates code from it → two competing sources of truth.
- **Bypasses your gates** — agent-generated Tailwind won't natively emit your semantic tokens or clear `local/*` ESLint gates (em-dash ban, hardcoded-brand-color ban, narration-comment ban) unless heavily steered.
- **Breaks parity** — web-only React/Tailwind output has no NativeWind/Expo equivalent → every pencil surface is a parity-contract violation to hand-port.
- **Where it *could* complement** — a throwaway **web-only** exploration of a brand-new surface before you hand-author it into DESIGN.md. But you already have `impeccable` + the `dev-server`/`/profile` loop for that.
**Verdict: SKIP for the pipeline.** Free early-access means a one-off web-ideation trial is ~free if you're curious, but don't wire it into a mature DESIGN.md + dual-platform + lint-gated workflow. Sources: [pencil.dev](https://www.pencil.dev/) · [pricing](https://www.pencil.dev/pricing) · [docs](https://docs.pencil.dev/getting-started/ai-integration).

### improve-ui (ibelick/ui-skills) — added mid-session
Install: `npx skills add https://github.com/ibelick/ui-skills --skill improve-ui`. Reads **DESIGN.md + repo guidance + design tokens/variables/themes + component primitives/variants + resolved CSS**. Audit gates: **Surface Selection → System Reconstruction → Candidate Proof** (each finding needs 3 proofs: *Contract* "cite a binding design decision," *Runtime* "value reaches the surface via traced path," *Correction* "one deterministic change") **→ Falsification** (re-open sources to test whether a difference is deliberate). **Output:** a Markdown findings table (ranked by confidence/impact/reach/cost) + one recommended improvement + optional self-contained plans under `design-plans/`. **Read-only** on product source (never installs deps, formats, commits, or mutates the tree). Explicitly **discards** a11y/routes/data/perf/architecture/code-quality unless bound by a design contract. **Web-only** (no RN/Expo/NativeWind mention) but token/CSS-variable-agnostic, so it works on `apps/web`. Inspired by shadcn's `improve` skill. **This is the best-fit tool of the four** — it enforces *your* DESIGN.md rather than imposing an external aesthetic, and its read-only/plan-based shape matches your agentic gate model. Sources: [ibelick/ui-skills](https://github.com/ibelick/ui-skills).

### anti-slop MD (slop.md / chiefkeef.md)
**slop.md** — by **@aaayandev**, announced on X ~July 14 2026, described as an **~80,000-char markdown** that strips common AI-slop design language (a general guideline to drop into an agent's context). **Distribution unconfirmed** — the only primary source ([the X post](https://x.com/aaayandev/status/2077078710499287410)) is paywalled (HTTP 402); no confirmed GitHub/Gumroad/download URL found. **"chiefkeef.md" (~724,300 chars) — CANNOT verify it exists** (targeted searches returned zero evidence of a real accessible file). The *rules attributed to it* (ban box-shadows, emojis, "LIVE" badges, purple-to-blue gradients, ~220 overused AI words) are **generic to the whole anti-slop genre** — confirmed in adjacent public projects: [bitjaru/styleseed](https://github.com/bitjaru/styleseed) ("74 rules"), [tasteskill.dev](https://www.tasteskill.dev/docs), impeccable.style — all ban purple/blue gradients, decorative/default shadows, glows, and keep banned-AI-word lists.
**Value over your DESIGN.md + lint gates? Mostly no** — you already have the `impeccable` skill (your own anti-slop system w/ an "AI-slop test"), a `design-reviewer` subagent that runs it on every diff, and lint gates banning em-dashes/hardcoded brand colors/narration. An 80k-char generic file is a context-heavy, lower-precision version of what your stack already enforces deterministically. **Direct CONFLICT:** these files blanket-ban purple/violet gradients + glows; Orbit's brand is a **deliberate navy-violet anchor with `--gradient-header` (#22094f→transparent) and glow CTAs** — a generic file can't tell "AI-slop purple gradient" from "the brand's intentional violet header."
**Verdict (updated per your steer — you're open to de-slopping and think chiefkeef might be useful):** don't skip — **harvest brand-safe rules into a de-sloppified DESIGN.md**, but **codify the intentional violet gradient + glows as deliberate** so improve-ui won't flag them. The clearest harvest: a banned-AI-copy-word list (→ a small `local/*` ESLint rule or a DESIGN.md copy section). Do **not** import its color/gradient/shadow rules wholesale. (Still want the chiefkeef/slop.md link to harvest any unique rules; the genre-common rules are already covered by the public sources above.)

### emilkowalski/skills
Install: `npx skills@latest add emilkowalski/skills` (**MIT**, free; author ex-Vercel/Linear, made Sonner/Vaul/animations.dev). Skills: **emil-design-eng** (core: <300ms UI anims, `ease-out` entries, animate only `transform`/`opacity`, scale from `0.95`, never `transition: all`), **review-animations**, **improve-animations** (read-only auditor → self-contained `plans/`), **find-animation-opportunities**, **animation-vocabulary**, **apple-design**. **Stack: web only** — SKILL.md files target CSS, Framer Motion/`motion`, WAAPI, React Spring, GSAP, Tailwind, Radix/Base UI/shadcn; **React Native / Expo / Reanimated are NOT mentioned.** Fit: `apps/web` = full value; `apps/mobile` = principles transfer, code doesn't (mobile-motion equivalent = **Reanimated 4 + react-native-worklets** — which you already pin to SDK 57 — plus **Moti** for declarative springs). Adopt first: **emil-design-eng + improve-animations + animation-vocabulary.** Complements DESIGN.md (motion is its thinnest axis; no color/component conflict). Sources: [github.com/emilkowalski/skills](https://github.com/emilkowalski/skills) · [improve-animations SKILL.md](https://github.com/emilkowalski/skills/blob/main/skills/improve-animations/SKILL.md) · [animations.dev](https://animations.dev/).

### Best-path for design tooling
**De-slop/harden DESIGN.md** (harvest brand-safe anti-slop rules, keep the intentional violet gradient + glows) → **adopt `improve-ui`** to audit `apps/web` against DESIGN.md (→ `design-plans/`) → **adopt emil skills** for motion (web) + port principles to mobile Reanimated/Moti. Web-only tools (improve-ui, emil) leave a mobile gap covered by your existing `impeccable` + `design-reviewer` + manual parity. **pencil.dev = skip.**

---

## Vendor billing matrix (prod)
Already paying: **Render ($7), Vercel, Resend** (confirmed by Thomas). **Supabase → Pro $25/mo — DECIDED (Thomas, 2026-07-15)** ("I will pay for Supabase"); Free auto-pauses after 7 days idle + 500 MB cap = unfit for prod. OpenAI = usage (live; watch cost per #529). Google Play = $25 once + rev cut (have account). Stripe/AdMob = money-**in**. Firebase FCM / Google Calendar / ipapi.co = free tiers (ipapi rate-limited). Domain useorbit.org = paid yearly (own it). **Open confirmations:** Sentry (free likely fine at volume), Cloudflare (DNS/proxy for api — free fine), SonarCloud (free only if repos public — paid if private), EAS/Expo (free build tier can get tight). Full evidence inventory: all three repos, `file:line` per service (see session notes).

---

## Decisions locked (2026-07-15)
- **Evals:** promptfoo HTTP → real Astra endpoint, `evals/` folder, CI nightly + on prompt/tool-schema change, outside `dotnet test`; structural + JS tool/arg asserts + llm-rubric; pass^k (k=3).
- **Feature flags:** extend AppConfig (no vendor); `Microsoft.FeatureManagement` TargetingFilter; DB-backed; Zod in shared; fetch-at-launch+foreground; last-known-good/default-off. Scope = **full now** (kill-switch + % rollout) per Thomas.
- **Diagram:** committed `ARCHITECTURE.md` Mermaid, nightly Claude Code regen (`architecture-map.yml`, commit-on-diff); foglamp = throwaway link.
- **Design tooling:** de-slop DESIGN.md → improve-ui (web) → emil motion (web + mobile principles); pencil.dev skip; anti-slop harvested into DESIGN.md.
- **ADHD marketing:** test as content/ASO angle first (brain decision note written).
- **Supabase:** Pro $25/mo.

## Filing plan (pending Thomas's plan adjustments)
Create: **A** eval harness · **B** feature flags (full) · **C** design/UX quality (de-slop DESIGN.md + improve-ui + emil) · **D** create-habit modal spacing + normalization · **E** auto-updated diagram · **F** ADHD content/ASO experiment (orbit-landing-page). Update: **#395** (billing matrix) · **#529** (link A+B). A+B under #529; grouping per Thomas's approval.
