---
name: drift-review
description: Review repeated Claude session evidence for workflow drift and stage human-approved lesson candidates without changing live rules.
argument-hint: ""
---

# Drift review

Detect repeated gaps between actual work and `.claude/**`. Propose only. Never edit a skill, rule,
playbook, agent, hook, lint rule, or any file outside the two explicit writes below.

1. Run `node tools/collect-session-evidence.mjs` from the project root and read its one JSON digest.
   Do not redirect it to disk. If extraction fails, report the error and stop without writing state.
2. Consider only clusters where `atThreshold` is true and `distinctSessionCount >= 3`. Exact-text
   clustering is evidence of repetition, not evidence of drift.
3. For each eligible cluster, search `.claude/**` for the workflow it concerns. A candidate qualifies
   only when the redacted human text contradicts the current files. Ignore requests, repeated work
   orders, and behavior already described correctly.
4. If nothing qualifies, say exactly `No pattern reached 3 distinct sessions and contradicted .claude/**.`
5. Append each qualifying candidate to `.claude/pending-lessons.md`. Use this exact shape and cap any
   digest quote at 200 characters:
   ```text
   ## <YYYY-MM-DD> - <one-line lesson>
   - Trigger: <task/files>; sessions: <sorted session ids>
   - Type: checkable | judgment
   - Proposed home: <hook name / lint rule / path-scoped rule / memory pointer>
   - Draft: <rule text or hook/lint sketch>
   ```
6. Write `{ "lastRun": "<YYYY-MM-DD>" }` to `.claude/drift-review-state.json` after every completed
   pass, including a pass with no candidates. This ignored state file is review timing metadata.
7. Stop. State how many clusters met the threshold, how many candidates were appended, and why every
   eligible cluster was accepted or rejected. Promotion still requires `/lesson` and human approval.

`.claude/pending-lessons.md` is tracked. A candidate deliberately leaves a reviewable Git change.
