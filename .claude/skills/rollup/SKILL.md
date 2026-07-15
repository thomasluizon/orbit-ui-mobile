---
name: rollup
description: Thin cross-repo CI/nightly health roll-up. Runs `tools/rollup.sh`, which reads the LATEST `main`-branch run of each tracked quality gate across all three Orbit repos (orbit-ui-mobile + orbit-api + orbit-landing-page) and prints ONE consolidated GREEN/RED verdict. Reads run conclusions only - it executes no tests and audits nothing, so it does not overlap /validate (which runs lint/type/test) or /prod-readiness (the LLM pre-launch audit). Use for a fast "is main healthy across all three repos right now?" check. Its automatic twin is the nightly `.github/workflows/rollup.yml`.
argument-hint: (none)
---

# Roll-up

The on-demand twin of the nightly `rollup.yml`. It reads the latest `main` run of
every tracked CI/nightly quality gate across the three Orbit repos and prints ONE
consolidated verdict. It **reads run conclusions only** - no tests, no build, no audit,
no `claude-code-action`. This is a mechanical status meta-read, distinct from
`/validate` (which *executes* lint/type/test) and `/prod-readiness` (a heavy LLM
pre-launch audit with a GO/NO-GO verdict).

## Run it

```bash
bash tools/rollup.sh
```

That is the whole skill: the workflow and this skill call the SAME script (DRY). Run it
from the orbit-ui-mobile repo root with an authenticated `gh` (it reads `GH_TOKEN` /
`GITHUB_TOKEN` from the environment). It reads all three PUBLIC repos, so a normally
`gh auth login`-ed local session is enough.

## Present the result

Show the markdown report the script prints, then state the one-line verdict and the
exit code:

- **GREEN (exit 0)** - every hard-tier gate's latest `main` run is healthy. `pending`
  (a run in progress) and `no-run` (no `main` run yet) count as green-with-note.
- **RED (exit 1)** - at least one hard-tier gate's latest `main` run failed; name the
  failing gate(s) from the report's "Failing hard gates" section.
- **TOOL ERROR (exit 2)** - `gh` is unauthenticated/unreachable, or a tracked hard-tier
  workflow no longer resolves on its default branch (the tracked table in
  `tools/rollup.sh` drifted). Surface it distinctly - it is not a green and not a red gate.

## Report-only

This skill READS and reports. It never opens or edits an issue - that is the workflow's
job on its nightly run (RED verdict upserts the one `rollup`-labeled tracking issue).
The tiers (hard / advisory / excluded) and their rationale live in `tools/rollup.sh`;
do not restate or fork them here.
