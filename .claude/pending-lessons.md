# Pending lessons (staging, not loaded into context)

Reviewed and promoted via `/lesson`. Delete each entry once promoted to a rule/hook or dropped.

Queue is empty.

## Graduated

- 2026-07-08 "don't offer optional next-steps" + 2026-07-09 proactivity failures (assume/ask/optional/improvise) → merged as one class and graduated to the global **proactivity guard** (`~/.claude/hooks/proactivity-reminder.mjs` UserPromptSubmit re-injection + `~/.claude/hooks/proactivity-guard.mjs` Stop class-gate). See `project_proactivity_guard` memory. Cleared 2026-07-09.
- 2026-07-14 "opencode + Zen" is the opencode Zen gateway, NOT Z.ai → promoted to the `feedback_opencode_zen_not_zai` memory and to the `OpenCode Go plus Zen over OpenRouter` ADR in the brain vault, which carries the full naming trap + the pricing rationale. Cleared 2026-07-16.
- 2026-07-14 sweep-merge races a re-triggered review on a BEHIND PR and merges past CHANGES_REQUESTED (orbit-api #403) → graduated to a **gate**, not prose: `tools/merge-sweep-cov.sh` and `tools/merge-sweep.sh` now block every merge path until the `review` check on the CURRENT head SHA settles, re-read `reviewDecision` after it does, and scan merged PRs' head branches at end of sweep, exiting 1 on a re-created (orphaned) branch. Cleared 2026-07-24.
- 2026-07-24 background subagents idle on phantom "background waiters" while babysitting CI → promoted to `.claude/skills/orchestrate/SKILL.md`, "Delegation discipline → Waiting is foreground work, on both sides": the subagent-side foreground-poll contract plus the parent-side rule that "standing by" is not progress. Cleared 2026-07-24.
