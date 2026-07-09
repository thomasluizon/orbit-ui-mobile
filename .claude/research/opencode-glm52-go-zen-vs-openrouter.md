# OpenCode + GLM‑5.2: Go + Zen vs OpenRouter

**Question:** For running GLM‑5.2 and other open‑weight models in the OpenCode coding agent, which is the better setup for a solo dev — **(A)** OpenCode **Go** (flat sub) spilling over to **Zen** when capped, or **(B)** OpenCode + **OpenRouter** pay‑as‑you‑go?

**Researched:** 2026‑07‑09 (all facts verified live that day; re‑verify pricing before betting on it — it moves).
**Method:** 4 parallel research agents (OpenCode Go docs, OpenCode Zen + integration docs, OpenRouter live `/endpoints` API, community sentiment). Config schema confirmed against opencode.ai/docs.

---

## Bottom line

**Option A — Go primary + Zen spillover — wins for a solo dev.** Go's "$10/mo buys up to ~$60/mo of at‑cost usage" subsidy beats OpenRouter's cheaper *per‑token* price at every realistic volume, and Go/Zen serve **vetted full‑precision weights** while OpenRouter is a **quantization lottery** unless you babysit provider pinning. Treat OpenRouter as an optional escape hatch (catalog gaps or extreme volume), not the main path. The make‑or‑break for Go is **model‑routing discipline** — reserve GLM‑5.2 for hard tasks; default to a cheaper model or you hit the caps in hours.

> Note: "Go" and "Zen" are **OpenCode's own products**, not Z.ai's subscription. OpenCode the agent is free/MIT‑licensed; Go/Zen are optional paid model access.

---

## What each path is

| | **OpenCode Go** | **OpenCode Zen** | **OpenRouter** |
|---|---|---|---|
| Pricing model | Flat **$10/mo** ($5 first mo) | Pay‑as‑you‑go | Pay‑as‑you‑go |
| Basis | $10 → up to **$60/mo at‑cost draw**, capped **$12/5h · $30/wk · $60/mo** | **At cost**, only card fee (4.4% + $0.30/top‑up), no token markup | Provider list price, no token markup + **~5.5% top‑up fee** |
| Catalog | **13 curated open models** (open‑only) | **Superset**: Go's open models **+ frontier** (Claude Opus 4.8, GPT‑5.5, Gemini 3.x, Grok 4.5) | **Hundreds**, 27+ providers each, `:free` variants |
| GLM‑5.2 price | $1.40 / $4.40 per 1M (draws vs cap) | $1.40 / $4.40 per 1M | **$0.55–0.63 / $1.72–1.98** cheapest fp8 @1M ctx → $1.40/$4.40 first‑party |
| Quality control | Curated, full‑precision, US/EU/SG hosted | Curated, benchmarked per model | **Variable** — silent fp4/fp8/int4 unless pinned |
| Fallback | **"Use balance" toggle** → auto‑spills to Zen credits when capped (one‑time console setting, then automatic) | (is the spillover target) | DIY `model_fallback` / manual switch |

**Key structural fact:** Go and Zen charge the *same* per‑token price for shared models (GLM‑5.2 = $1.40/$4.40 on both). Go is **not** a cheaper tier — it's a **subsidized flat rate** ($10 → ~$60 of at‑cost usage); Zen is the uncapped at‑cost overflow behind the same account. That's why the Go→Zen "Use balance" toggle exists, and it is exactly the "go + zen when go hits the limit" pattern.

---

## Cost/benefit — the crossover

Modeling a GLM‑5.2 "$1.40‑rate" workload vs OpenRouter's cheapest usable fp8 provider (~$0.55/$1.72, StreamLake @1M ctx):

| Monthly GLM‑5.2 volume | **Go + Zen (A)** | **OpenRouter only (B)** | Winner |
|---|---|---|---|
| Light (~$20 draw, ~10M tok) | **$10** flat | ~$8 + fee | Wash — A wins on quality/simplicity |
| Medium–heavy (full $60 cap, ~30M tok) | **$10** flat | ~$24 + fee | **A by ~2.4×** |
| Very heavy (~$150 draw, ~75M tok) | $10 + ~$90 Zen overflow ≈ **$100** | ~$61 | **B cheaper** — but Go base + OpenRouter overflow ≈ **$45** beats both |

- Up to ~$60/mo of draw, **A crushes it** — the $10 subsidy swamps OpenRouter's per‑token edge, and you rarely touch Zen.
- Only a *sustained* >$60/mo GLM‑5.2 user finds B's per‑token savings win, and even then the optimum is **Go base + OpenRouter (fp8‑pinned) as overflow** (~2.5× cheaper spillover than Zen), not "OpenRouter only".

---

## Community sentiment (mid‑2026)

- **GLM‑5.2 = consensus #1 *open* coder** ("GLM 5.2 and Kimi 2.7 are the goats"). First open model past 80% Terminal‑Bench and to beat GPT‑5.5 on SWE‑Bench Pro; ~1/6 Claude's cost. Still a notch behind Claude on hardest multi‑file work; **verbose/slow/token‑hungry** (~43k output tok/task). One real Next.js feature built for **$0.265**.
- **OpenCode Go = "real bargain, but supplementary."** 4.5/5 reviews, stable. Universal complaint: **GLM shreds the dollar caps** ("49% of monthly on day one"; GLM gives ~23× fewer requests than DeepSeek Flash for the same $10). One single‑reporter GLM‑5.2 quota‑desync bug (429 at ~6% usage).
- **Zen** — "at cost" pricing well‑regarded ("most transparent of the three"), curation praised. Isolated gripes: rate‑limits even when paying, opaque errors, **$20 auto‑reload surprise**.
- **OpenRouter** — loved for flexibility/uptime and fastest to patch broken tool‑calling; top anxiety is **silent quantization** (fp4/fp8 degrading quality). "Fine if you pin providers and restrict quantization; on defaults it's a quality lottery." Canonical "$247 surprise bill" cautionary tale.
- **On the fallback pattern:** experienced users advise *against* naive "one model until throttled." Winning pattern = **proactive tiered routing** (cheap inner loop, GLM‑5.2 reserved).

---

## Recommendation for a solo dev

1. **Buy OpenCode Go ($5 first month)** — cheapest quality‑controlled way to run GLM‑5.2 + the open fleet.
2. **Route by tier** (biggest lever): cheap model (DeepSeek V4 Flash / MiniMax M3) for the inner loop; **reserve GLM‑5.2 for hard tasks.**
3. **Set the safety net:** ~$20 on Zen + enable **"Use balance."** Capping never blocks mid‑task; you spill to at‑cost curated tokens (and get frontier Claude/GPT/Gemini on tap).
4. **Add OpenRouter only if you outgrow it** (>$60/mo GLM‑5.2 draw, or a model not in Zen's catalog) — wire it as the fp8‑pinned overflow instead of Zen.

**Don't make OpenRouter your primary (B):** you forfeit Go's subsidy, pay from token one, and inherit quantization roulette + surprise‑bill risk — for a per‑token saving that only matters at volumes a solo dev rarely hits.

---

## Ready‑to‑use `opencode.json`

Provider IDs (`opencode-go`, `opencode-zen`, `openrouter`), Go model IDs, the OpenRouter GLM‑5.2 slug (`z-ai/glm-5.2`), and the agent schema (`mode`: primary/subagent/all) are all confirmed from opencode.ai/docs on 2026‑07‑09.

```json
{
  "$schema": "https://opencode.ai/config.json",

  "model": "opencode-go/minimax-m3",
  "small_model": "opencode-go/deepseek-v4-flash",

  "provider": {
    "openrouter": {
      "models": {
        "z-ai/glm-5.2": {
          "options": {
            "provider": {
              "quantizations": ["fp8", "bf16", "fp16"],
              "sort": "price",
              "allow_fallbacks": true
            }
          }
        }
      }
    }
  },

  "agent": {
    "heavy": {
      "description": "Hard multi-file / architectural / agentic tasks — GLM-5.2 on the Go subscription",
      "mode": "primary",
      "model": "opencode-go/glm-5.2"
    },
    "overflow": {
      "description": "GLM-5.2 via OpenRouter, fp8-pinned. Use when Go is capped and 'Use balance' is off",
      "mode": "primary",
      "model": "openrouter/z-ai/glm-5.2"
    }
  }
}
```

**Tiers this creates**

| Tier | Slot | Model | When |
|---|---|---|---|
| Trivial | `small_model` (auto) | DeepSeek V4 Flash ($0.14/$0.28) | titles/summaries |
| Inner loop (default) | `build` (default) | MiniMax M3 ($0.30/$1.20, 1M ctx) | bulk coding — protects $12/5h cap |
| Hard | `heavy` (Tab) | **GLM‑5.2** ($1.40/$4.40) | architecture, gnarly multi‑file, agentic |
| Overflow | `overflow` (Tab) | GLM‑5.2 via OpenRouter fp8 | Go throttled + Zen toggle off |

**Activation (in order)**
1. Subscribe at opencode.ai/go → TUI `/connect` → **OpenCode Go** → paste key.
2. `/connect` → **OpenRouter** → paste key (or `OPENROUTER_API_KEY`). Only for the `overflow` agent.
3. Top up ~$20 on Zen → enable **"Use balance"** in the OpenCode web console (account setting, not config). Once on, `overflow` is largely redundant.

**Knobs**
- Placement: global `~/.config/opencode/opencode.json` (`C:\Users\thoma\.config\opencode\opencode.json`), or an `opencode.json` in a project root. Merge, don't clobber.
- fp8 pinning: `quantizations` filter excludes the fp4/int4 routes that degrade GLM‑5.2; `sort:"price"` picks cheapest fp8. To hard‑pin cheapest full‑1M provider, add `"order": ["novita"]`.
- Prefer GLM‑5.2 as default? Swap top‑level `"model"` to `"opencode-go/glm-5.2"` and point `heavy` at MiniMax M3 — expect to hit the $12/5h wall faster.

---

## Confidence & caveats

- **High:** Go price/caps, Go=Zen identical per‑token rates, "Use balance" toggle, Zen at‑cost model, OpenRouter fees + quantization variance, config schema, GLM‑5.2 as top open coder. Cross‑verified (Go and Zen agents independently pulled $1.40/$4.40 and the toggle; OpenRouter numbers from live `/endpoints` API).
- **Lower:** exact request‑count estimates (assumption‑driven); Go's weekly/monthly roll mechanics (only 5h confirmed rolling); Reddit specifics (fetch‑blocked → via aggregators, direction consistent, upvote counts unverified); one GLM‑5.2 Go 429 bug is single‑reporter.

## Load‑bearing sources
- OpenCode: opencode.ai/go, /docs/go, /docs/zen, /docs/providers, /docs/config, /docs/agents (all "Last updated Jul 9, 2026")
- OpenRouter: openrouter.ai/z-ai/glm-5.2, /api/v1/models/*/endpoints, /docs/features/provider-routing, /docs/api-reference/limits, /blog/announcements/simplifying-our-platform-fee, /blog/insights/the-open-weight-models-that-matter-june-2026
- Reviews: thomas-wiegold.com/blog/opencode-go-review, bitdoze.com/opencode-go-plan, tonyreviewsthings.com/opencode-go-review, knolli.ai/post/opencode-go, help.apiyi.com/en/opencode-go-subscription-worth-it-review-en.html
- Community/quality: news.ycombinator.com/item?id=48338956, docs.bswen.com/blog/2026-03-24-glm-alternative-providers-guide, dev.to/danielbergholz/testing-glm-52-on-opencode-im-impressed-1780, medium.com/@jatinkrmalik (oh-my-openagent routing guide)
