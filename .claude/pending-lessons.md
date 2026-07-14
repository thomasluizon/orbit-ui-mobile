# Pending lessons (staging — not loaded into context)

Reviewed and promoted via `/lesson`. Delete each entry once promoted to a rule/hook or dropped.

## 2026-07-14 — "opencode + Zen" is the opencode Zen gateway, NOT Z.ai
- Trigger: any research/pricing/scenario where the user says "opencode + Zen", "opencode go + zen", or similar for running GLM-5.2. Recurred 2+ times; user explicitly frustrated by the repeat.
- Type: judgment (context-dependent disambiguation — not cleanly hook-checkable without heavy false positives).
- Proposed home: memory pointer-fact (already captured live as `feedback_opencode_zen_not_zai` given active frustration).
- Draft: When the user frames a GLM-5.2 scenario as "opencode + Zen" / "opencode go + zen", the access + billing route is the **opencode Zen gateway** (provider "OpenCode Go", `opencode.ai/zen`, slug `opencode-go/glm-5.2`, metered pay-as-you-go). Do NOT price it as Z.ai's direct GLM Coding Plan subscription. GLM-5.2 is upstream a Z.ai/Zhipu model — cite Z.ai only as the model maker / benchmark source, never as the billing route unless the user explicitly says "Z.ai" or "GLM Coding Plan".

## 2026-07-14 — sweep-merge can race a re-triggered review on a BEHIND PR → merges past CHANGES_REQUESTED
- Trigger: `tools/merge-sweep-cov.sh` merging any PR that is BEHIND main (require-up-to-date) and therefore needs an update-branch. Hit once on orbit-api #403 (a HIGH backend-contract finding shipped to main + deployed before the re-review landed; the fix went to the orphaned head branch, not main).
- Type: checkable (the sweep script can enforce this deterministically).
- Proposed home: a guard inside `tools/merge-sweep-cov.sh` — after its update-branch step, re-poll `gh pr view <n> --json reviewDecision` until the re-triggered `review` check reaches a terminal state, and BLOCK the merge unless it re-settles to APPROVED (never merge on the pre-update APPROVED snapshot). Secondary signal to detect a past occurrence: the PR's head branch survives deletion (a post-merge push re-created it) = an orphaned fix that never reached main — scan for surviving head branches after a sweep.
- Draft: In the sweep, sequence = update-branch → wait-for-checks-terminal (INCLUDING `review`) → re-read reviewDecision → if APPROVED and required checks green (or coverage-only), merge; else abort + report. Do not read reviewDecision once before the update-branch and reuse it.
- Interim operational guard (until promoted): for every BEHIND-PR sweep tonight, after merge re-check `reviewDecision` + whether the head branch still exists; if flipped/orphaned, fix-forward onto main.

## Graduated

- 2026-07-08 "don't offer optional next-steps" + 2026-07-09 proactivity failures (assume/ask/optional/improvise) → merged as one class and graduated to the global **proactivity guard** (`~/.claude/hooks/proactivity-reminder.mjs` UserPromptSubmit re-injection + `~/.claude/hooks/proactivity-guard.mjs` Stop class-gate). See `project_proactivity_guard` memory. Cleared 2026-07-09.
