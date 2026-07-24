# Gate-owned exclusions (D11): what an audit must never flag

**At a glance:** the D11 boundary for every `/audit-*` and `/prod-readiness` run. Gates own
the mechanical layer, audits own judgement, never both. A finding a gate already fails on is
noise, not signal. This is the single list of those gates, so the four audit skills and
prod-readiness cannot drift on where the line sits; each skill also names its own
kind-specific exclusions inline.

REBUILD.md D11: "An audit looks only for what no gate can check. Gates own the mechanical
layer. Audits own judgement. Never both."

## The mechanical layer (never a finding)

| Gate | Owns (do NOT re-flag) |
|---|---|
| ESLint `local/*` | comment policy (`local/no-comments`), the enumerated spacing scale (`local/spacing-scale`), `console` bans, `any` bans, the animate-presence rules, and every other `local/` rule |
| `guards.yml` Dash Ban (`tools/check-dashes.mjs`) | em/en dashes in code and copy |
| `guards.yml` Copy Register (`tools/check-copy.mjs`) | the banned copy register |
| `guards.yml` Suppressions Ratchet | a rising ESLint-suppression count |
| `guards.yml` Expo SDK Pin | a drifted Expo SDK pin |
| `guards.yml` Cross-Platform Parity | a one-sided web/mobile UI change (a missing mirror) |
| Roslyn `ORBIT0001..0005` | narration comments, redundant transaction rollbacks, a controller with no class-level `[Authorize]`/`[AllowAnonymous]`, raw `DateTime.UtcNow` for user-facing dates, a `DbSet<T>` with no `modelBuilder.Entity<T>` config |
| `react-doctor.yml` (required) | React correctness: effect cleanup, hydration/browser-global in render, impure updaters, prop-callback-in-render, plus the react-doctor a11y and perf rules. The standing full-repo backlog is mechanical debt for the ORB-46 project, not an audit finding. |
| `visual.yml` | the four-surface visual-regression snapshots |
| `perf.yml` (`apps/web/lighthouserc.json`) | the authed-Today LCP / TBT / script-bundle-size budgets on web |
| `arch-map.yml` | architecture-map drift |

## The half-mechanical rule

When a concern is half-mechanical (a gate proves presence, judgement proves correctness),
audit ONLY the judgement half and name which half the gate owns. Two examples:

- `ORBIT0003` proves a controller carries `[Authorize]`; whether that handler scopes its
  query to the caller `userId` is judgement, and is in scope.
- GitGuardian owns committed-secret shape detection; whether a key is used per-request
  instead of set globally, or a secret reaches a log sink, is architecture the scanner cannot
  see, and is in scope.
