# #539 harness rebuild — session record, 2026-07-19 (evening)

Supersedes the afternoon handoff of the same name. That document was a list of what was
broken; this one is a list of what was rebuilt, what was measured, and what is still not true.

The full technical record — research with primary sources, the refuted mechanisms, the
adversarial pass — is `approach-1.md` at the repo root. This file is the honest status.

**Branch:** `feature/539-b5-apply-design`. Commits `17e68c96`, `32e65fcf`, `e4283c0f`,
`5a10aeb6`, `d8dcd183`.

---

## 1. The contract, item by item

The session was given ten conditions. **Eight are demonstrated with printed command output.
Two are not, and are named as such.**

| # | Condition | Status | Evidence |
|---|---|---|---|
| 1 | Measures delta, not conformance | **VERIFIED** | `route-explore` (byte-identical to `7d7c42c3`) reports `touched 0/4` with the reason printed; `route-calendar` reports `touched 8/8`, 9 owned files changed |
| 2 | Deterministic | **VERIFIED** | Full gate twice on an unchanged tree: identical sha256 `f2be9f1dce31f2f0…`, empty `diff`. Re-verified after committing |
| 3 | Covers both platforms / states its scope | **VERIFIED** | 72 mobile surfaces / 348 cells in the denominator; every run prints a SCOPE block naming both platforms and the RN caveat |
| 4 | Inventory complete | **VERIFIED** | Enumerated from the Next.js router, expo-router and the component graph. Command palette and the layout-hosted onboarding wizard now present; 56 → 171 surfaces; zero source files lost except a verified-correct aggregator |
| 5 | Reaches empty/loading/error states | **NOT DONE** | The axis exists (120 `empty` cells). Capture does not. See §3 |
| 6 | Does not decay under DRY work | **VERIFIED** | A real visual edit to `PillButton`, reached by **89 files**, moved the count by **0** |
| 7 | Verification fits the execution model | **PARTIAL** | Judge rewritten and no longer needs the answer key; **not** wired parent-side into `run.mjs`. See §3 |
| 8 | Calibrated against ground truth | **VERIFIED** | **0/12 (0.0%)** adjudicated recall, printed by `npm run surfaces:calibrate` |
| 9 | Memory survives | **VERIFIED** | `.gitignore` no longer eats `.claude/specs/`; durable evidence moved to committed `.claude/manifests/` |
| 10 | Honesty contract is code | **VERIFIED** | 27 new `test-hooks` assertions; the tool cannot print a completion number without its scope |

**Gates:** `test-hooks` → `ORBIT HOOK PARITY OK`. `turbo run type-check` → 3/3 successful.
`turbo run lint` → 0 errors (527 `local/spacing-scale` warnings, the documented report-only
baseline). `turbo run test` → mobile 1602/1602 passing on an isolated run; one flaky failure
appeared once under parallel turbo load and did not reproduce.

---

## 2. What changed, in one paragraph

The harness asked one question — *"did an independent vision judge call this surface
`transformed`?"* — and used the answer to **grant** completion. That is not a question a vision
model can answer. It now asks three independent questions and **only a human can grant**:
`touched` (an owned file's render-affecting signature moved since the baseline) and
`defectClear` (a judge report with no blocker) can only *withhold*; `signed` (a human tick in
`signoff.json`, which agents are structurally blocked from writing) is the only thing that
grants. The gate reads files and hashes them, so running it twice gives the same answer by
construction.

**Deleted:** the judge's grant power; mtime staleness; PNG-sha256 verdict binding; the
known-defect list that was being fed to the judge as an answer key; and a per-surface
conformance axis I had planned before the adversarial pass showed it passes for free.

---

## 3. What is still NOT true — read this before trusting the harness

**Item 5 — empty / loading / error states are enumerated but never photographed.** The
manifest carries 120 `empty` cells and `capture-surfaces.mjs` honestly reports them as
`state-not-capturable` rather than filling them with a populated screenshot. Reaching them
needs the hermetic mock-api harness (`apps/web/e2e/visual/`, whose fixtures are already empty
collections) wired to this manifest. **This matters because 5 of the 12 known human-found
defects live in exactly these states** — including the one a human found in 10 seconds. Until
this is built, those defects are invisible to every automated part of the system.

**Item 7 — judging still runs wherever it is invoked.** The judge no longer needs the answer
key and writes a cell-keyed report, but it is not wired into `run.mjs` parent-side, so a
headless drive child that runs `npm run surfaces:judge` can still block against its 600s tool
ceiling. **No real judge sweep has been run against the new output format**, which is why
`defect-clear` reads 0/804. Treat the new judge path as untested end to end.

**Beyond the ten:**

- `touched` can be cleared by a deliberate no-op sweep (`data-x=""` on every element). It only
  clears a veto and grants nothing, but do not read `touched 604/804` as "604 cells of real
  work" — read it as "604 cells are not disqualified".
- The 0/12 recall number is measured against the **contaminated** judge sweep on disk (the one
  that had the answer key). It is an *upper bound*. A clean sweep could be worse.
- The pinned baseline `7d7c42c3` is single-use and does not re-pin itself. After #539 merges,
  the `touched` axis quietly stops meaning anything. It is printed on every run so this is
  visible, but nothing enforces it.
- `surfaces.json` does not self-regenerate; `generatedFrom` can lag HEAD.
- The signature extractor is a heuristic over the TypeScript AST. It is stable against the four
  no-op sweeps I tested, but I did not test it against every possible codemod.

---

## 4. What I got wrong during this session (stated so it is not repeated)

- **My first mechanism was wrong and I nearly built it.** A whole-import-closure hash reports
  `route-explore` as CHANGED (167-file closure, 20 changed via the shell). Caught only because
  I ran it before writing the tool.
- **My second mechanism was gameable and I did not see it.** The adversarial council pass found
  that `prettier --write` defeats a source-text delta. I had not considered it.
- **My first calibration run reported 42.9% recall and it was false.** Three keyword "hits"
  were all spurious on reading. The honest number is 0. A tool that auto-scores string matches
  will manufacture a flattering number; the tool now forces adjudication and prints the matched
  text.
- **I proposed excluding files I had not authored from the commit.** Thomas corrected me; they
  were his. I should have asked rather than assumed.

---

## 5. Next actions, in order

1. **Thomas: look at a contact sheet and tick surfaces in `.claude/manifests/signoff.json`.**
   This is the only thing that moves the DONE number, and it is deliberately the only thing.
2. Run one real `npm run surfaces:judge` sweep against the new format so `defect-clear` becomes
   meaningful, and re-run `npm run surfaces:calibrate` against that clean (uncontaminated)
   sweep to get a recall number that is not an upper bound.
3. Wire the judge parent-side in `run.mjs` (item 7).
4. Wire the hermetic mock-api harness to the manifest for the `empty` state axis (item 5) —
   note the council's warning that this is where per-surface opener maintenance rots first, so
   scope it to the surfaces whose empty states actually carry known defects.
5. Fix the paywall on `route-upgrade` — a functional launch blocker, found by the judge.
