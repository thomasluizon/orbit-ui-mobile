# Round-4 deferrals (orbit-api)

## DEF-R4-1 — v1 sync route `SyncController.GetChanges` (`[HttpGet("changes")]`) KEPT, not deleted

Contract sweep #8 (round-3) flagged the v1 `GetChanges` route as server-side dead because no `endpoints.ts` client constant points at it (the v1 client Zod schema was deleted in round-2; apps now use `sync.changesV2`). Task-3 decision: **KEEP the route + its v1 DTOs/handler/mappers.** Evidence the route is NOT zero-reference inside orbit-api and carries a backward-compat risk:

1. Live in-repo callers exist (not zero-caller):
   - `tests/Orbit.Infrastructure.Tests/Controllers/SyncControllerTests.cs:57,104` — two behavioral tests (`GetChanges_SinceIsTooOld_ReturnsGone`, `GetChanges_ReturnsUpdatedAndDeletedEntitiesForCurrentUser`) exercise the v1 action + assert on `SyncController.SyncChangesResponse`.
   - `src/Orbit.Infrastructure/Services/AgentCatalogService.cs:1234` — the agent `SyncRead` capability lists `"SyncController.GetChanges"` in its `controllerActions`; deleting the route would require editing the agent capability catalog.
2. Old-app-version backward-compat: Orbit is in open beta on Play (individual dev account, org migration pending — project memory). Older installed app builds that predate the v2 cutover may still issue `GET /api/sync/v2/changes`'s predecessor `GET /api/sync/changes`. Removing the route would 404 those clients mid-sync. The v2 route was added alongside v1 (both live), which is the standard additive-deprecation posture; there is no evidence the v1 floor is safe to remove yet.
3. The v1 DTOs it owns (`SyncChangesResponse`, `SyncEntitySet`, `BuildEntitySet`) are referenced only by the v1 action + its tests, so they are not independently dead — they are dead-with-the-route, and the route is being kept.

Disposition: no code change. Revisit once Play telemetry/minimum-supported-app-version confirms no installed client calls v1, AND the agent-catalog `controllerActions` entry + the two SyncController tests are migrated/removed in the same change. This is a deliberate keep, not an oversight.

---

# Round-4 a11y deferrals (orbit-ui-mobile) — D7 contrast residuals

These three are the ONLY contrast residuals left after the R4-A11Y sweep migrated every enumerated fg-4-as-text, placeholder-override, status-base-as-text, confirm-pill, tab-icon, and control-boundary site. Each was migrated to its prescribed token (a strict improvement); the residual sub-4.5 is inherent to the design and is documented here with computed WCAG ratios (relative-luminance; per-scheme × mode). Contrast script: `.claude/sweeps/107/round-2/contrast.mjs` + ad-hoc tint blends.

## DEF-R4-A11Y-1 — `--primary` as accent TEXT (links, text-buttons, dialog actions) — light-mode systemic, DEFER

`--primary`/`tokens.primary` is the locked navy-violet accent (DESIGN.md, "violet accent locked"). It is the app-wide design language for interactive accent text: text-buttons (`actionLink`, `secondaryActionText`, dialog confirm/cancel text), markdown/prose links (always `textDecorationLine: 'underline'` — a non-color affordance), step numbers, and the selected goal-chip label. ~24 mobile sites + the web equivalents.

Computed `--primary` as small text on the mode canvas (`bg`):

| Scheme | light on `#f8fafc` | dark on `#020618` |
|---|---|---|
| purple | 6.72 | 3.96 |
| blue | 5.01 | 5.36 |
| green | **3.08** | 9.09 |
| rose | 4.33 | 5.37 |
| orange | **3.44** | 6.98 |
| cyan | **3.46** | 8.52 |

Fails 4.5 as small text in: green/orange/cyan light (3.08–3.46), purple dark (3.96). Passes ≥4.5 elsewhere. As ICONS (3:1 non-text floor) every value passes, so primary-colored icons (e.g. reminder-section remove-X `X size={13}`, today checkmarks) are NOT failures and were left as-is.

Justification for deferral (not fixed): the only fix is a new per-scheme AA-darkened `--primary-text` token applied across the entire accent-text language — a design-system change to the locked accent, out of scope for a consumer-migration sweep and contrary to DESIGN.md. Every affected affordance carries a non-color cue (underline on links; button shape/position on text-buttons; selection ring+fill on the chip). WCAG 1.4.1 (color not sole indicator) is satisfied; only 1.4.3 (text contrast) is short, and only in the listed light schemes. Revisit as a dedicated DESIGN.md token decision (`--primary-text` per scheme) if accent-text AA is prioritized.

## DEF-R4-A11Y-2 — selected goal-chip `%` + label: `--primary-soft` on `--selection-bg` — light residual, DEFER

`goal-linking-field` selected chip (web `chip-active` + mobile `chipSelected`). MIGRATED this sweep: the `%` label and chip label from `--primary`→`--primary-soft` (web) / `tokens.primary`→`tokens.primarySoft` (mobile), and the UNSELECTED `%` from fg-4→fg-3. The primary-soft switch fully clears dark mode.

Computed `--primary-soft` on `--selection-bg` (chip-active fill = primary @ .18 light / .32 dark over canvas):

| Scheme | light | dark |
|---|---|---|
| purple | 4.91 | 6.39 |
| blue | 3.87 | 6.66 |
| green | **2.52** | 6.98 |
| rose | **3.16** | 6.19 |
| orange | **2.72** | 6.95 |
| cyan | **2.80** | 6.90 |

Dark: all ≥6.19 (pass). Light: green/orange/cyan/rose/blue 2.52–3.87 (fail 4.5). In light mode `--primary-soft == --primary` (locked accent), and the selection tint is very pale, so no token short of fg-1/fg-2 clears it — which would destroy the accent semantic. The selected state is conveyed redundantly (ring `inset 0 0 0 1px rgba(primary,.45)` + selection-bg fill + bold accent label), so selection is not color-only. Same locked-accent rationale as DEF-R4-A11Y-1.

## DEF-R4-A11Y-3 — amber status text on amber tint: badge + expiry-warning — light residual, DEFER

MIGRATED this sweep: `badge.tsx` amber tone and `expiry-warning` (both platforms) from `--status-overdue`/`tokens.statusOverdue` → `--status-overdue-text`/`tokens.statusOverdueText`. Strict improvement; dark fully clears.

Computed overdue text on its own tint background:

| Surface | base-token light | `-text`-token light | dark (`-text`) |
|---|---|---|---|
| badge (overdue @18% tint) | 2.52–2.62 | **3.72–3.87** | 6.29–7.29 |
| expiry-warning (overdue @10% tint) | 2.75 | **4.06** | 8.44 |

The `-text` token is the canon-prescribed fix and raises light contrast from ~2.5 to 3.7–4.1, but amber text on an amber tint cannot reach 4.5 without either darkening the `-text` value further (would fail on the dark canvas, where `-text` must stay `#fe9a00`) or darkening/removing the tint fill (a per-component design change). Both badge labels are 10.5px/600 uppercase and expiry copy is 13px; neither qualifies as AA-large. Deferred as the residual ceiling of the amber-on-amber treatment; the alternative is a tint/token redesign owned by DESIGN.md. The badge amber tone is decorative status emphasis (paired with the badge text content), not a sole status indicator.
