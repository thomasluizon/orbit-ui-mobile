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
| `surface-manifest.mjs` | Derives the visual-surface inventory from the codebase (web routes, the multi-view Today root, overlays) into `.claude/manifests/surfaces.json`, expanded to one cell per surface x theme x locale. Emits **no status field** on purpose. Survives until the #539 Linear project completes (REBUILD.md D39), then folds into `arch-map.mjs`. | `npm run surfaces:manifest` |
| `capture-surfaces.mjs` | Playwright capture of one screenshot per manifest cell into `.artifacts/surfaces/`, against a running local stack. Reports every surface it cannot reach generically instead of skipping it. The evidence-gate screenshot mechanism (D7). | `ORBIT_AUTH_TOKEN=... npm run surfaces:capture` |
| `redesign-coverage.mjs` | Asserts the redesign denominator twice: every surface in `surfaces.json` is claimed by exactly one #539 redesign ticket (D35), and every `.tsx` under `apps/*/app` + `apps/*/components` maps to exactly one ticket by directory rule (D38); exits 1 on any unclaimed surface or orphaned file. Survives until #539 completes (D39). | `npm run redesign:coverage` (`--json`) |
| `arch-map.mjs` | Generates `architecture.json` + `architecture.html` (routes, parity pairs, endpoints, i18n ownership); the drift CI job (`arch-map.yml`) regenerates and fails on drift. | `node tools/arch-map.mjs` |
| `check-dashes.mjs` | The cross-repo dash ban (REBUILD.md 6.1.1): em dashes banned everywhere, en dashes only in numeric ranges. Backs the Dash Ban CI job, lefthook, and the shrink-only `dash-baseline.json`. | `--files <f>...` \| `--check-baseline` \| `--write-baseline` \| `--text "<s>"` |
| `check-copy.mjs` | The copy register: whole-file, values-only scan of locale copy for AI cliches, placeholder content, typed uppercase, and hardcoded brand colors. Backs the Copy Register CI job. | `node tools/check-copy.mjs --check` \| `--write-baseline` |
| `check-suppressions-ratchet.mjs` | Asserts the ESLint suppression baselines only shrink (escape hatch: the `ratchet:reseed` label). Backs the Suppressions Ratchet CI job. | `node tools/check-suppressions-ratchet.mjs` |
| `check-ticket.mjs` | Validates a Linear ticket body against the 6.2 template; rejects an incomplete ticket rather than letting a worker guess. | `node tools/check-ticket.mjs --help` |
| `wave-plan.mjs` | Reads a Linear project's tickets + `blockedBy` relations via the orca CLI and prints the merge-gated wave table for `/orchestrate`. | `node tools/wave-plan.mjs --help` |
