---
name: handoff
description: Compact the current session into a handoff document a fresh agent can resume from. Use when the context is getting long, you are switching tasks, or you want to end a session and continue clean without losing the thread.
argument-hint: [note about what the next session is for]
---

# Handoff: compact the session for a fresh agent

**Input**: $ARGUMENTS (optional note on what the next session should focus on)

## Objective

Squeeze the current conversation down to its resumable core: a single document a fresh Claude (or opencode) session can read to pick up exactly where this one left off, without inheriting this session's bloated context.

## Principles

- **Compaction, not transcript.** Capture only what is needed to resume: the active task, the decisions that matter, and the next concrete steps.
- **Reference, never copy.** Anything already written down (a GitHub issue, a `.claude/plans/*.md`, a PRD, an ADR, a commit, a diff, a PR) is linked by path or number, never pasted in.
- **Redact secrets.** Strip API keys, tokens, and PII before writing.

## Steps

1. Identify the live thread: what is actively being worked on now, the key decisions made this session, and what is left. Exclude anything already captured in a durable artifact.
2. Gather references: open PR(s), branch names in both repos, the issue number, plan/PRD/report paths under `.claude/`, and any files mid-edit.
3. Note the suggested next skills/steps (e.g. `/implement`, `/pr-review`) and any open question or risk.
4. Write the handoff to `.claude/handoffs/<kebab-topic>.md` (create the dir if missing). Tailor the emphasis to `$ARGUMENTS` if given.

## Output format

```
# Handoff: <topic>
Written: <date> · Next session: <the $ARGUMENTS focus, or "continue">

## State
- Task: <one line>
- Branch(es): ui-mobile <branch> · api <branch> (if touched)
- PR(s): #<n> (<status>)  ·  Issue: #<n>

## Done this session
- <decision / change, referencing files by path>

## Next steps
1. <concrete next action> — suggested: /<skill>
2. ...

## References (not copied)
- Plan: .claude/plans/<file>
- <other artifacts by path/URL>

## Open questions / risks
- <anything unresolved>
```

Keep it short. A good handoff is the conversation squeezed to just its resumable core.
