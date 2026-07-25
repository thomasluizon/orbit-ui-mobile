---
name: bug
description: One bug report in, ONE executable Linear ticket out, same 6.2 template and check-ticket.mjs validation as /feature. Requires a red repro (or an honest "unreproduced, evidence below") before the ticket exists. Writes no code and fixes nothing; /orchestrate or a direct session picks the ticket up.
argument-hint: <what is broken, plus any error text or screenshot>
effort: medium
---

# /bug: report -> one Linear ticket

Rule 1 of `.claude/rules/core.md` binds BEFORE the ticket exists: the repro goes red
first. That repro command (or the Sentry issue link, or the exact manual steps when
neither exists) goes in the ticket body's Test scenarios section as the first entry,
marked as the red case that must turn green.

1. Reproduce (or gather the evidence: Sentry via the MCP, logs via Render MCP, DB via
   the read-only postgres MCP). Never ask Thomas to paste what a tool can fetch.
2. Draft ONE ticket with the 6.2 sections. Severity and blast radius go in Problem.
   Root-cause hypotheses go in Technical details, labelled as hypotheses.
3. Label: exactly one `repo:*`; `parity:yes|no` for ui; `visible-effect` when the fix
   changes pixels. If the fix genuinely spans repos, that is TWO tickets (api blocks
   ui) even for a bug (D4).
4. Validate with `node tools/check-ticket.mjs --file <draft>`, create via
   `orca linear create` (team ORB, state Todo), re-validate with `--issue`, print the
   identifier.

No fixing inside this skill, even for a one-liner: the ticket is the record that makes
the fix reviewable.
