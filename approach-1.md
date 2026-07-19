# Approach 1 — rebuilding the #539 visual-verification harness

Written 2026-07-19. Everything below was established in one session: the research is cited to
primary sources fetched that day, the measurements were run against this repo, and the failed
experiments are recorded alongside the successful ones because two of them killed designs that
looked obviously right.

---

## 1. The problem, stated precisely

Orbit is doing a whole-app visual redesign (#539) with AI agents. The harness meant to verify it
has been declared "fixed" by six consecutive sessions and was never fixed.

The signature failure: **an agent redesigned one view, passed 100% of the automated gates, and
reported "the design is applied" while roughly fifty other surfaces were untouched.**

The harness built in response then failed in new ways:

| # | Measured failure | How it was established |
|---|---|---|
| 1 | `route-explore` is **byte-identical** to the pre-#539 baseline `7d7c42c3` yet scored `transformed` on **both** judge votes, while genuinely redesigned surfaces scored `broken` | `git diff --quiet 7d7c42c3 HEAD -- explore/page.tsx` → identical; verdict read from `verdicts.json` |
| 2 | The count drifted 16 → 20 → 19 → 20 with nobody editing | repeated runs, recorded in the prior handoff |
| 3 | Zero mobile coverage: all 224 cells were `apps/web`, though `apps/mobile` is larger (85,209 lines vs 78,495) | grep for `apps/mobile` in the manifest → 0 |
| 4 | Inventory derived by filename regex, so the command palette and the onboarding wizard (which lives in `layout.tsx`) were **absent entirely** | read of `surface-manifest.mjs` |
| 5 | No state axis, and the mandatory seed fixture makes empty states **unrenderable** | a human found an empty-state defect in 10 seconds that ~100 judge votes never saw |
| 6 | mtime + PNG-sha256 invalidation meant a shared-component edit un-verified many surfaces at once — DRY behaviour decayed the metric | read of `check-surface-coverage.mjs` |
| 7 | A judge call could block 30 min against a headless child's 600s tool ceiling | prior session's run logs |
| 8 | Recall against the 12 known human-found defects had **never been measured** | absence |
| 9 | `.gitignore` ignored `.claude/specs/`, `.claude/drive/`, `.artifacts/` — every lesson evaporated between sessions | `grep -n` on `.gitignore` |
| 10 | "State two numbers" was **prose inside the gate**; its only measured effect was destroying a drive child's status line | read of the hook |

One correction to the inherited diagnosis, verified this session: **`check-surface-coverage.mjs`
alone was already deterministic** — two runs produced byte-identical output. The drift came from
the *judge* and from *mtime staleness*, not from the checker. That mattered, because it told me
the fix was not "make the checker deterministic" but "get the nondeterministic thing out of the
completion path".

---

## 2. Research (primary sources, fetched 2026-07-19)

### 2.1 Can a multimodal LLM judge certify that a UI is good?

No. This is the single most decisive result, and it explains failure #1 directly.

| Finding | Source |
|---|---|
| MLLMs score **F1 20.4% on Text Overflow, 31.2% on Collision** — near random on exactly the defect classes at issue | [UI-Lens, CVPR 2026](https://openaccess.thecvf.com/content/CVPR2026/html/Xiang_UI-Lens_Assessing_General_MLLMs_Potential_to_Automate_UI_Display_Quality_CVPR_2026_paper.html) |
| Pairwise UI-quality accuracy ~60% overall, and **drops to near chance when two UIs are close in quality** — precisely the unchanged-vs-redesigned boundary | [MLLM as a UI Judge, arXiv:2510.08783](https://arxiv.org/html/2510.08783v1) |
| Pointwise ICC 0.58–0.77; **44.7% of score variance is within-question noise**; **≥11 trials for 95% reliability** (this harness used 2) | [The Coin Flip Judge, arXiv:2606.13685](https://arxiv.org/html/2606.13685) |
| A judge can be **highly repeatable and systematically biased at the same time** — re-running twice and seeing agreement is *not* calibration | [Reliability without Validity, arXiv:2606.19544](https://arxiv.org/abs/2606.19544) |
| Position/verbosity/self-enhancement biases; even GPT-4 flipped ~40% of verdicts on order alone | [MT-Bench, arXiv:2306.05685](https://arxiv.org/abs/2306.05685) |
| Pairwise framing **amplifies** judge bias rather than correcting it | [The Comparative Trap, arXiv:2406.12319](https://arxiv.org/pdf/2406.12319) |
| VLMs localise aesthetic problems at **0.199 IoU** even for GPT-5; reasoning models do *not* outperform non-reasoning ones here | [Can VLMs Assess Graphic Design Aesthetics?, arXiv:2603.01083](https://arxiv.org/html/2603.01083) |
| Purpose-built defect *pipelines* do far better (F1 80–87%) than a general "judge this screenshot" prompt | [arXiv:2604.19081](https://arxiv.org/html/2604.19081v1) |

**Read across:** `route-explore` scoring `transformed` twice is not a bug in our prompt. It is the
modal, published behaviour of this class of system at 2 votes.

### 2.2 Delta-based visual regression

| Finding | Source |
|---|---|
| Playwright `toHaveScreenshot` supports `threshold`, `maxDiffPixels`, `maxDiffPixelRatio`, `animations`, `caret`, `stylePath`, `mask`, `clip` | [playwright.dev/docs/test-snapshots](https://playwright.dev/docs/test-snapshots) |
| Screenshots are **not** guaranteed reproducible across OS/GPU/fonts — Playwright bakes the platform into the baseline filename rather than trying | same |
| **No tool solves "a global design-token change makes every screenshot differ."** Chromatic's own TurboSnap docs state a change to the global theme config forces a full rebuild across every story | [Chromatic TurboSnap](https://www.chromatic.com/docs/turbosnap/) |
| Practitioner consensus: pixel-diff's honest job is **regression**, not proving work happened; a token-driven redesign *should* flip every baseline and is handled as one bulk re-baseline | [BrowserStack false-positive guide](https://www.browserstack.com/guide/how-to-reduce-false-positives-in-visual-testing) |
| Magnitude metrics exist: `odiff` returns `diffPercentage` natively; `pixelmatch` returns a raw count | [odiff](https://github.com/dmtrKovalenko/odiff), [pixelmatch](https://github.com/mapbox/pixelmatch) |
| Chromatic free 5,000 snapshots/mo, Starter **$179/mo**; Percy free 5,000/mo; Lost Pixel OSS free self-hosted; reg-suit free | vendor pricing pages |

### 2.3 React Native / Expo

| Finding | Source |
|---|---|
| **No cheap deterministic RN pixel pipeline exists.** Chromatic RN is an **early-access "sneak peek" (2026-05-13), not GA**, no published RN pricing | [Chromatic RN post](https://www.chromatic.com/blog/react-native-visual-testing-sneak-peek/) |
| Maestro `assertScreenshot` defaults to a **95% match threshold** — an explicit admission pixel-exactness is unattainable | [Maestro docs](https://docs.maestro.dev/reference/commands-available/takescreenshot) |
| Detox: Expo support is "entirely a community driven effort"; open animation-flake issues remain unresolved | [Detox + Expo](https://wix.github.io/Detox/docs/19.x/guide/expo/) |
| `react-native-owl` — one release in ~18 months (1.5.0, 2025-01-14), no managed-workflow support | [npm](https://www.npmjs.com/package/react-native-owl) |
| `jest-image-snapshot` + react-test-renderer **cannot work** — RTL produces a serialized tree, not pixels | [jest-image-snapshot](https://www.npmjs.com/package/jest-image-snapshot) |
| Expo ships **no** first-party visual-regression tool; EAS Workflows documents Maestro for E2E | [Expo EAS Workflows](https://docs.expo.dev/eas/workflows/examples/e2e-tests/) |

### 2.4 Design-system adoption via static analysis

| Finding | Source |
|---|---|
| `dependency-cruiser` ships a documented `reachable` rule and a `--reaches` CLI flag — a real transitive-closure primitive | [rules-reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) |
| `react-scanner` works on `.tsx` unmodified, emits per-instance component/prop usage; **stale** (1.2.0, 2024-10-04) | [npm](https://www.npmjs.com/package/react-scanner) |
| **Radius Tracker is dead** — last release v0.0.9, 2022-03-15 | [releases](https://github.com/rangle/radius-tracker/releases) |
| Omlet: free tier 1 user / 4 scans per 30 days; Intro **$159/mo**; RN support **unconfirmed** | [omlet.dev/pricing](https://omlet.dev/pricing/) |

**Conclusion:** buy nothing. Everything needed is already in the repo or is a Node script.

---

## 3. Experiments — including the two that failed

This is the part that matters most, because both failures looked obviously correct beforehand.

### 3.1 FAILED — whole-import-closure hash

**Hypothesis:** hash the transitive import closure of a surface; if it differs from the baseline,
the surface was worked on.

**Result: refuted.** `route-explore`'s closure is **167 files**, of which **20 changed** — via the
shared app shell. It reported `CHANGED`.

```
apps/web/app/(app)/explore/page.tsx
  closure: 167 files
  7d7c42c3=cdc10b5b66ee9b24  HEAD=6cfd19a2016071dd  -> CHANGED
  changed files in closure: 20
```

Everything reaches everything through the shell. **Discarded.**

### 3.2 PASSED — ownership-scoped delta

**Hypothesis:** a file is *owned* by a surface when exactly one surface's closure reaches it. Only
owned files count.

```
explore      closure 167  owned  1  ownedChanged  0  -> UNTOUCHED
calendar     closure 198  owned 14  ownedChanged 10  -> WORKED-ON
social       closure 197  owned 19  ownedChanged 16  -> WORKED-ON
upgrade      closure 162  owned 11  ownedChanged  6  -> WORKED-ON
preferences  closure 162  owned  8  ownedChanged  4  -> WORKED-ON
```

Clean separation, runs in seconds, works identically on `apps/mobile`. **Adopted.**

### 3.3 FAILED then FIXED — source-text delta is gameable

The adversarial council pass raised a fatal objection: **`prettier --write` across `apps/` touches
every owned file and flips every surface to WORKED-ON in one commit**, with zero design work.

Fix: compare a **visual signature** rather than file text. Parse with the TypeScript compiler API
and keep only what can change pixels — JSX element and attribute names, every string and numeric
literal (where classNames, style values, tokens and copy live), and property paths
(`theme.spacing.md`). Drop comments, whitespace, import declarations, type nodes, and — after a
first cut failed — the **root identifier** of a property chain, so renaming `items.map(i => i.id)`
to `entry => entry.id` is not a visual change.

Measured:

```
must be IDENTICAL (no visual work happened):
  STABLE   pure prettier reformat (quotes, semis, wrapping)
  STABLE   variable-rename codemod
  STABLE   comment added / removed
  STABLE   import reorder

must DIFFER (real visual change):
  DETECTED  REAL restyle (radius, padding, gap)
  DETECTED  REAL token swap in-file
  DETECTED  REAL structural change (element swapped)
```

(`prettier-plugin-tailwindcss`, which reorders class strings, is **not installed** in this repo —
verified. Installing it would make class order a signature input.)

### 3.4 The refuters' verdict, and why the design changed shape because of it

Two independent adversarial agents returned **FUNDAMENTALLY BROKEN** and **WILL BECOME THE SEVENTH
FAILURE**. Their strongest point is correct and I accepted it:

> **"Was this surface visually transformed" is not decidable from source text.** Orbit's design
> system is *built* so a systemic redesign touches the token file, not consumers — so a real
> transformation can leave every consumer signature identical, while a class-reordering codemod
> flips every signature with no design change.

That is fatal to signature-delta **as a grant**. It is not fatal to it **as a veto**. Which forced
the reframe the whole design now rests on:

> **The gate's job is not to certify that work happened. It is to make an *unearned claim*
> structurally impossible. Nothing grants automatically; the deterministic signals only ever
> withhold.**

---

## 4. The architecture

A cell is `DONE` only when **all three** hold. They are independent, and only one of them grants.

| Axis | What it is | Direction | Deterministic? |
|---|---|---|---|
| `touched` | an owned file's **visual signature** differs from baseline `7d7c42c3` | **veto only** | yes |
| `defectClear` | an independent judge report exists for the cell, pinned to that signature, with **no blocker finding** | **veto only** | yes (reads a recorded file) |
| `signed` | a human tick in `.claude/manifests/signoff.json` | **the only grant** | yes |

Supporting pieces:

- `.claude/manifests/surfaces.json` — the committed denominator. Enumerated from the **Next.js
  router + expo-router + the component graph** (an overlay is a component that *directly* imports
  an overlay base or mounts its own portal — not a filename regex). Carries **frozen ownership**,
  so a second surface importing a shared file cannot silently un-own it and move a third surface's
  status. Carries a **state axis**.
- `tools/visual-signature.mjs` — the TS-AST fingerprint. Fail-closed: unparseable returns `null`
  and never counts as work.
- `tools/calibrate-judge.mjs` — measures judge recall against the 12 human-found defects.
- `forbid-gate-tamper` — blocks agents from writing `signoff.json` **by any path**, with no
  sanctioned agent writer at all.

### What was deleted

- **The judge's power to grant.** It is now a defect detector that can only withhold.
- **mtime staleness** and **PNG-sha256 verdict binding** — the two mechanisms that made DRY work
  decay the metric.
- **The answer key in the judge prompt.** `issue-539-user-found-defects.md` was being fed to the
  judge; one recorded finding literally says it cannot verify "known defect #2", *by number*. Any
  apparent detection may have been regurgitation, which made recall unmeasurable.
- **The conformance axis I had planned.** Lint already gates merge in CI; a per-surface re-check
  duplicates an existing gate and, as the adversary showed, passes for free on surfaces that never
  had violations.

### Measured results

```
route-explore   touched 0/4   "no owned file's visual signature differs from 7d7c42c3"
route-calendar  touched 8/8   9 owned files changed

full gate run twice, unchanged tree:
  f2be9f1dce31f2f0a6cc432ce1271ad7c2a75090cb33db1fcec1d0b08e483d46  run A
  f2be9f1dce31f2f0a6cc432ce1271ad7c2a75090cb33db1fcec1d0b08e483d46  run B
  diff: BYTE-IDENTICAL

shared-primitive edit (PillButton, reached by 89 files): count moved by 0

inventory: 56 -> 171 surfaces (99 web + 72 mobile), 804 cells
  command palette: PRESENT   onboarding wizard in layout.tsx: PRESENT

judge calibration vs the 12 human-found defects:
  ADJUDICATED RECALL: 0/12 (0.0%)   structurally invisible: 5/12
```

---

## 5. What this approach does NOT do

- It does not measure taste. Nothing automatic does; a human tick is the only grant.
- It does not capture empty/loading/error states yet. The axis exists (120 cells); the capture does not.
- It has no React Native pixel pipeline, because none exists that is cheap and deterministic.
- `touched` is defeatable by a deliberate no-op sweep (e.g. adding `data-x=""` everywhere). That
  only removes a veto; it grants nothing.
- The pinned baseline is single-use: after #539 merges, "changed since `7d7c42c3`" stops meaning
  anything until it is re-pinned. It is printed on every run so a stale baseline is visible.

---

## 6. Why this is the best approach

**Because it is the only one that survived a serious attempt to kill it.** Four councillors and
two dedicated refuters attacked it; two of my own mechanisms died in the process (whole-closure
hashing, then source-text delta). What is left is what could not be refuted.

Concretely, it is better than the alternatives on the axes that actually caused six failures:

1. **It puts the nondeterministic component outside the completion path.** Every prior design had
   an LLM verdict *inside* the gate, so the gate inherited the LLM's variance. Here the gate reads
   files and hashes them. "Run it twice, get the same answer" is true **by construction**, not by
   luck — and that is now asserted by `test-hooks`, not by prose.

2. **It fails in the safe direction.** Every axis withholds; only a human grants. The specific
   catastrophe — *an agent reports the whole app done* — is no longer a matter of the agent being
   careful. It is unreachable: the file that grants completion cannot be written by an agent, and
   both write paths are blocked (demonstrated live this session).

3. **It matches what the evidence says each instrument can actually do.** The judge is used only
   where the literature supports it — finding blatant defects — and its measured recall (0/12) is
   *printed*, so a clean sweep can never be mistaken for quality. The deterministic signals are
   used only for the question they can answer: "did anyone touch this?" Nothing is asked to
   certify taste, because nothing available can.

4. **It deletes more than it adds.** The judge's grant power, mtime invalidation, PNG-hash
   binding, the answer key, and a planned conformance axis are all gone. The one genuinely new
   file is a ~150-line AST fingerprint. Every previous "fix" added a checker; this one removes
   four mechanisms and adds one.

5. **It covers both platforms honestly.** Mobile is now 72 surfaces / 348 cells in the denominator
   rather than invisible, and *because* the completion axes are static, mobile gets real coverage
   with no rendering — while every single output line states that RN has no pixel evidence, so the
   number can never be over-read.

6. **It widened the denominator instead of narrowing it.** 56 → 171 surfaces. The wide number is
   what made the original failure visible; making the ratio look better was never the goal.

The honest summary: this approach cannot tell you the app looks good. **No available instrument
can.** What it can do — and what six sessions of machinery failed to do — is make it impossible to
*claim* the app looks good without a human having actually looked.
