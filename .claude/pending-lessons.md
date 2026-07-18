# Pending lessons (staging — not loaded into context)

Reviewed and promoted via `/lesson`. Delete each entry once promoted to a rule/hook or dropped.

## 2026-07-14 — sweep-merge can race a re-triggered review on a BEHIND PR → merges past CHANGES_REQUESTED
- Trigger: `tools/merge-sweep-cov.sh` merging any PR that is BEHIND main (require-up-to-date) and therefore needs an update-branch. Hit once on orbit-api #403 (a HIGH backend-contract finding shipped to main + deployed before the re-review landed; the fix went to the orphaned head branch, not main).
- Type: checkable (the sweep script can enforce this deterministically).
- Proposed home: a guard inside `tools/merge-sweep-cov.sh` — after its update-branch step, re-poll `gh pr view <n> --json reviewDecision` until the re-triggered `review` check reaches a terminal state, and BLOCK the merge unless it re-settles to APPROVED (never merge on the pre-update APPROVED snapshot). Secondary signal to detect a past occurrence: the PR's head branch survives deletion (a post-merge push re-created it) = an orphaned fix that never reached main — scan for surviving head branches after a sweep.
- Draft: In the sweep, sequence = update-branch → wait-for-checks-terminal (INCLUDING `review`) → re-read reviewDecision → if APPROVED and required checks green (or coverage-only), merge; else abort + report. Do not read reviewDecision once before the update-branch and reuse it.
- Interim operational guard (until promoted): for every BEHIND-PR sweep tonight, after merge re-check `reviewDecision` + whether the head branch still exists; if flipped/orphaned, fix-forward onto main.

## 2026-07-17 — stop deferring / shipping workarounds instead of the best, complete implementation
- Trigger: ANY task, but sharply when a subagent returns a workaround or an "X would be an API change / follow-up / other-bundle scope" note. Instances: #539 b5 phase 1 shipped "Próxima conquista" on `lockedAchievements[0]` + overall earned/total (a mislabeled placeholder) instead of the orbit-api per-achievement-progress change; left all-view habit drill as deep-expand to satisfy an old test; called the decorative Sparkles removal "b6 scope, deferred."
- Type: judgment (a heuristic "deferral-word" hook would false-fire on legitimate cross-bundle scope, so prohibition-as-lint is wrong here; this is a posture rule).
- Proposed home: (1) a `feedback` memory fact — the strongest durable form; (2) a one-liner in a scoped rule (`.claude/rules/planning-and-artifacts.md` or `review-and-audit.md`). Both, since it's cross-activity.
- Draft rule text: "Do the best, most complete implementation, always — including cross-repo API changes. Never scope down a real fix, never present workaround-plus-followup as done, and never relay a subagent's 'X would be an API change / follow-up' as a deferral — that note is a signal to DO X now. The word 'deferred' in your own output is a red flag to stop and do the real thing. Legitimate exception: a genuinely separate, pre-agreed bundle in an approved epic decomposition — and even then, fold it in if it's cheap."

## Graduated

- 2026-07-08 "don't offer optional next-steps" + 2026-07-09 proactivity failures (assume/ask/optional/improvise) → merged as one class and graduated to the global **proactivity guard** (`~/.claude/hooks/proactivity-reminder.mjs` UserPromptSubmit re-injection + `~/.claude/hooks/proactivity-guard.mjs` Stop class-gate). See `project_proactivity_guard` memory. Cleared 2026-07-09.
- 2026-07-14 "opencode + Zen" is the opencode Zen gateway, NOT Z.ai → promoted to the `feedback_opencode_zen_not_zai` memory and to the `OpenCode Go plus Zen over OpenRouter` ADR in the brain vault, which carries the full naming trap + the pricing rationale. Cleared 2026-07-16.
