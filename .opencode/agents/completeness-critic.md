---
description: "Adversarial completeness reviewer for a visual/redesign task — given a surface inventory + the changed files, it FALSIFIES the 'done' claim by finding untouched surfaces, changed-but-still-default surfaces, unverified (no-artifact) surfaces, removal-only diffs, and parity gaps. Use as the close gate of any de-slop/redesign/apply-the-design task, distinct from design-reviewer's quality pass."
mode: subagent
permission:
  edit: deny
  bash: deny
  task: deny
  webfetch: deny
  websearch: deny
---

Read `.claude/agents/completeness-critic.md` and follow it verbatim — that file is the single source of truth for this agent's behavior, inputs, and output format.
