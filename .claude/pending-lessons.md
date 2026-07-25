# Pending lessons (staging, not loaded into context)

Reviewed and promoted via `/lesson`. Delete each entry once promoted to a rule/hook or dropped.

## DROPPED 2026-07-24 - a found defect is not fixed until the mechanism that prevents its recurrence exists

Not promoted, deliberately. Root `CLAUDE.md` rule 6 already says "gates over prose" and did not
hold, so a ninth prose rule in the always-loaded tier was more of the thing that already failed.
The two machines built the same day cover the real cases: orbit-ui-mobile PR #604 (harness defects
found in a run become ONE Linear ticket, mechanically) and `chore/harness-execution-gate` (a
`guards.yml` job that EXECUTES `tools/**`, plus a structural guard that goes red when a tool is
added without coverage). Kept only as the `feedback_permanent_fix_is_the_deliverable` memory.
Original entry below for the record.

### Original entry

- Trigger: any turn that finds or is handed a defect, in any repo. Not path-scoped and not skill-scoped, so nothing can trigger it for me.
- Type: judgment (the general form is not machine-checkable; specific instances graduate into gates, see below)
- Proposed home: `.claude/rules/core.md` as a new numbered rule. It qualifies under core.md's own admission test: it applies in any turn, and no skill invocation reliably precedes it.
- Measured evidence: the ORB-75 `/orchestrate` run, 2026-07-24. Thomas had to say "make it permanent" three separate times in one session. (1) After I hit four worker-launch gotchas and reported them as prose in chat. (2) After I diagnosed the mid-turn-send truncation and again only described it. (3) After I hand-spawned a one-off independent verification agent, which he correctly identified as a manual act that the next session would not repeat. Each time the escalation to a machine came only after he pushed. His words: "do i have to EVERYTIME say i want a permanent fix?"
- Why the existing rules did not hold: root `CLAUDE.md` already carries rule 6 "Gates over prose" and the overriding "best implementation, always" principle, and `.claude/rules/core.md` rule 3 already forbids re-flagging what a gate enforces. All three are phrased as preferences about where a rule should LIVE. None of them says that shipping the one-off repair alone is incomplete work. The gap is not knowledge, it is the definition of done.
- Draft:

  ### N. A defect is fixed when it cannot recur, not when it stops happening

  Finding a defect makes the preventing mechanism part of the deliverable, not a follow-up:
  a test that fails on the old behaviour, a lint or analyzer rule, a CI job, or a structural
  guard that goes red when coverage rots. Ship it in the same turn as the repair.

  The test is one question: **would the next session have to rediscover this?** A fix I
  perform by hand, a caution written into a report, and a note in a PR body all fail it.
  Never make the user ask for permanence; treat "make this permanent" as a defect in the
  work already delivered.

  Two bounds so this does not become gold-plating. A genuinely one-shot act (a credential
  rotated, a stray file deleted) has nothing to recur and needs no gate. And where a run's
  own contract forbids editing the harness mid-run (see `/orchestrate`, "a run RECORDS
  harness defects, it never repairs them"), the mechanism is the recorded ticket that
  carries the defect out of the session, not an in-run edit.

- Graduating instances already built from this same session, which are the gate half of this lesson: `tools/launch-worker.mjs` / `nudge-worker.mjs` / `worker-status.mjs` (orbit-ui-mobile PR #604) turn six measured launch failures into refusals, and the `chore/harness-execution-gate` work adds a `guards.yml` job that EXECUTES `tools/**` plus a structural guard failing on any tool added without coverage.

## Graduated

- 2026-07-08 "don't offer optional next-steps" + 2026-07-09 proactivity failures (assume/ask/optional/improvise) → merged as one class and graduated to the global **proactivity guard** (`~/.claude/hooks/proactivity-reminder.mjs` UserPromptSubmit re-injection + `~/.claude/hooks/proactivity-guard.mjs` Stop class-gate). See `project_proactivity_guard` memory. Cleared 2026-07-09.
- 2026-07-14 "opencode + Zen" is the opencode Zen gateway, NOT Z.ai → promoted to the `feedback_opencode_zen_not_zai` memory and to the `OpenCode Go plus Zen over OpenRouter` ADR in the brain vault, which carries the full naming trap + the pricing rationale. Cleared 2026-07-16.
- 2026-07-14 sweep-merge races a re-triggered review on a BEHIND PR and merges past CHANGES_REQUESTED (orbit-api #403) → graduated to a **gate**, not prose: `tools/merge-sweep-cov.sh` and `tools/merge-sweep.sh` now block every merge path until the `review` check on the CURRENT head SHA settles, re-read `reviewDecision` after it does, and scan merged PRs' head branches at end of sweep, exiting 1 on a re-created (orphaned) branch. Cleared 2026-07-24.
- 2026-07-24 background subagents idle on phantom "background waiters" while babysitting CI → promoted to `.claude/skills/orchestrate/SKILL.md`, "Delegation discipline → Waiting is foreground work, on both sides": the subagent-side foreground-poll contract plus the parent-side rule that "standing by" is not progress. Cleared 2026-07-24.
