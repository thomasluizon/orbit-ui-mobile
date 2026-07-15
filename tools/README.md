# tools/

> **At a glance** - reusable, agent-callable scripts for the Orbit harness, versioned with the repo.
> - A script lives here when it is worth running more than once. Throwaways go to the scratchpad, never here.
> - Every tool is non-interactive, supports `--help`, and returns meaningful exit codes (see `CONVENTIONS.md`).
> - POSIX `.sh` is the baseline; add a `.ps1` twin only when it must run in the user's PowerShell shell.
> - Add a new tool with `/make-tool`; add its row to the catalog below in the same change.

Reusable scripts an agent (or a human) invokes from the CLI. The bar for landing a file here: it has a single clear purpose and you will run it again. One-off commands stay in your shell history or the scratchpad.

Read `CONVENTIONS.md` before adding one. Use the `/make-tool` skill to scaffold it.

## Catalog

| Tool | What it does | Usage |
|---|---|---|
| `agent-review.sh` / `agent-review.ps1` | Cross-model second opinion (GLM-5.2 via opencode) on one claim or review finding. Thin wrapper over `.claude/skills/second-opinion/second-opinion.mjs`; prints one line of JSON (`AGREE` / `DISAGREE` / `UNSURE`, or a graceful `UNAVAILABLE`). | `agent-review --claim "<claim>"` or `agent-review < dossier.txt`; `--help` for options |
| `merge-sweep.sh` | Require-up-to-date server-side merge sweep: per PR, update-branch then poll `mergeStateStatus` until it is decidable and squash-merge. Skips on a failed required check or timeout. | `bash merge-sweep.sh <repo> <pr...>` |
| `merge-sweep-cov.sh` | Coverage-aware merge sweep: like `merge-sweep.sh`, but admin-overrides a SonarCloud failure that is solely new-code coverage (verified from the check-run summary), and skips anything more. | `bash merge-sweep-cov.sh <repo> <pr...>` |
| `rollup.sh` | Thin cross-repo CI/nightly health roll-up: reads the latest `main` run of each tracked quality gate across all three Orbit repos and prints ONE consolidated verdict (exit `0` green / `1` red / `2` tool-error). Reads run conclusions only; runs and audits nothing. Backs the `/rollup` skill and `.github/workflows/rollup.yml`. | `bash rollup.sh` (or `--help`) |
