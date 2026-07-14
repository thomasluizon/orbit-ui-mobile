# Operating model: why the "know-better-but-ship-worse + write-a-memory" loop happens, and the fix

> **At a glance** - why the "knows the rule but ships the worse default, then writes a memory" loop happens, and the fix.
> - The one change: stop writing "never do X" memory rules; encode every checkable rule as a deterministic guardrail (hook / lint / CI / type).
> - Keep memory and CLAUDE.md a lean, pruned pointer-index of load-bearing FACTS, not behavioral commandments.
> - For unmechanizable judgment, only external-signal verification helps (run the build / tests / an independent critic), never a remembered rule.
> - More rules lower adherence monotonically; prohibitions decay worse than requirements (all cited).
> - Read the whole doc for the mechanism, the citations, and what was applied to this repo.

Deep-research session 2026-07-06 (7 parallel research subagents, primary sources verified live). Triggered by the recurring failure: agent picks the conventional/worse default (JWT-claim admin auth over a live DB check; emits banned em-dashes it "knows" are banned), gets corrected, writes a "never do X" memory rule, repeats.

## The one operating change

**Stop writing "never do X" memory rules. For anything mechanically checkable, encode a deterministic guardrail (Claude Code hook / lint / CI / type) instead. Keep the memory + CLAUDE.md files as a lean, aggressively-pruned pointer-index of load-bearing FACTS, not behavioral commandments. For unmechanizable judgment calls, the only reliable lever is an external-signal verification pass (run the build/tests/types, or a genuinely independent critic) — never a remembered rule.**

## Why the loop happens (mechanism, cited)

- No hard gate in decoding: an in-context rule only re-weights the next-token distribution via attention; the conventional continuation already carries high mass, so it wins whenever the rule's weight is weaker. Constrained decoding exists precisely because the base loop has no enforcement (Grammar-Aligned Decoding, NeurIPS 2024, arXiv:2405.21047).
- "Knows the rule, violates it anyway" is measured: 8-99% knows-but-violates rate ("Models Recall What They Violate," arXiv:2604.28031). Models override even their own correct prior with context only ~60%+ of the time, confidence-gated (ClashEval, Stanford, NeurIPS 2024, arXiv:2404.10198).
- Ships-the-default is baked in by RLHF typicality bias — output collapses toward the stereotypical completion (Verbalized Sampling, arXiv:2510.01171); reinforced by sycophancy (Anthropic, ICLR 2024, arXiv:2310.13548).

## Why more memory rules make it worse (cited)

- Adherence drops monotonically with instruction count: gemini-2.5-pro 100%@10 -> 68.9%@500; prompt-level (all rules pass) ~ P(one)^n, GPT-4o 0.94@1 -> 0.21@10 (IFScale arXiv:2507.11538; ManyIFEval EMNLP 2025 arXiv:2509.21051).
- Irrelevant-to-the-current-task context degrades the task: a single distractor sentence drops accuracy (Shi, ICML 2023, arXiv:2302.00093); lost-in-the-middle U-shape (TACL 2024); context rot on 18 modern models (Chroma, Jul 2025). Anthropic: context is a finite attention budget, aim for the "smallest set of high-signal tokens" (Effective Context Engineering, Sep 2025).
- Prohibitions decay worse than requirements (73%->20% vs 100% held; Gamage arXiv:2604.20911); vendors (Anthropic/OpenAI) say phrase positively.
- Anthropic Claude Code docs, verbatim: "Bloated CLAUDE.md files cause Claude to ignore your actual instructions!" and "If Claude keeps doing something despite a rule against it, the file is probably too long and the rule is getting lost... Ruthlessly prune... delete it or convert it to a hook." (code.claude.com/docs/en/best-practices)

## What actually works (cited)

1. Deterministic guardrails the model doesn't control. Claude Code hooks: PreToolUse exit-2 is a hard block that even --dangerously-skip-permissions cannot bypass; Stop hook = "don't finish until green"; PostToolUse = auto-fix (code.claude.com/docs/en/hooks). This repo already proves the pattern: .claude/hooks/forbid-ts-antipatterns.mjs, csharp-authz.mjs, parity-nudge.mjs.
2. External-signal verification. Self-critique helps ONLY tied to tests/types/lint/independent critic (Reflexion 80%->91% via test execution, arXiv:2303.11366). Pure prose self-review is flat-to-negative (Huang, "LLMs Cannot Self-Correct Reasoning Yet," ICLR 2024, arXiv:2310.01798). "Run the build" beats "remember to be careful." Vanilla CoT even LOWERS constraint adherence; only constraint-targeted reasoning raises it (RAIF +11.74pp vs vanilla CoT -11.79pp, NeurIPS 2025 arXiv:2506.01413).
3. For genuine design forks (no external signal): force >=3 distinct options + a tradeoff table tied to THIS-case facts before choosing; generic CoT/reflection does NOT de-anchor (Anchoring Bias in LLMs, arXiv:2412.06593). This is a prose forcing-function — the honest weak spot; there is no guarantee here, only better odds.

## Matt Pocock on AGENTS.md (the user's citation)

The "90% can delete their AGENTS.md" line is apocryphal — NOT a verified Pocock quote. His real, sourced position: "Bad AGENTS.md files can make your coding agent worse and cost you tokens"; use "context pointers" (links the agent follows on demand); the no-op deletion test (if removing a line doesn't change output, cut it); ~150-200 instruction budget; "when you've corrected the agent for the same thing twice, that's a candidate line for AGENTS.md." Prescription is SHRINK-AND-REDIRECT to pointers + skills, not delete outright. Anthropic's own docs independently endorse the same. Sources: github.com/mattpocock/dictionary-of-ai-coding (AGENTS.md.md), aihero.dev/a-complete-guide-to-agents-md.

## Applied to this repo

- Built .claude/hooks/forbid-em-dashes.mjs (PostToolUse, exit-2 on em/en dashes in i18n JSON + email copy) and deleted the redundant em-dash memory. The demonstration in miniature: checkable rule -> guardrail -> rule leaves the context.
- Pending (needs a go): aggressively prune the ~31 "feedback" behavioral memories. Triage: (a) convert->guardrail then delete the lint/hook-enforced no-ops (no-narration-comments, no-eslint-disable, no-any); (b) keep as terse pointers the load-bearing project FACTS; (c) delete generic no-op bans that can't be mechanized and rarely fire.
