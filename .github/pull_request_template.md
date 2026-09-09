## What changed

<!-- One or two sentences. What a reviewer needs before reading the diff. -->

## Test evidence

<!-- The commands you ran and their result. Not "tests pass": the command and its output. -->

## Review harness

<!--
Required on a UI pull request based on redesign/main, and checked by the "Redesign Review Harness"
job in guards.yml. Delete this whole section on any other pull request.

Run jakubkrehel/interface-review FIRST, because it decides what belongs in this pull request and
what becomes a ticket, then jakubkrehel/better-interface in full mode. Both live in
github.com/jakubkrehel/skills and are fetched by raw URL; `npx ui-skills get` does not serve them.
`.claude/playbooks/redesign-screen.md` step 6 carries the full source inventory.

Write one line each, saying what it found. "no findings" is a legitimate answer.
This gate only withholds. It never grants completion; a human still does that.
-->

- interface-review:
- better-interface (full mode):
