# Rebuilding a redesign screen

**At a glance:** the D76 eight-step loop for one of the thirteen screens, and the ui-skills sweep
that closes it. Read it before you write a work order for a screen ticket. Groundwork tickets do not
use this; they run autonomously through `/orchestrate`.

The loop exists because an agent cannot tell that its own output is mediocre. Every step that feels
skippable is one that was skipped before and produced a screen Thomas rejected on sight.

## The eight steps

Steps 1 to 4 happen with Thomas, in conversation, before any code exists.

1. **Look at the screen running**, together.
2. **A subagent judges it** against `design/canvas/<screen>.dc.html` and `DESIGN.md`, with the audit
   skills: `ibelick/improve-ui`, `Leonxlnx/redesign-skill`, `MengTo/redesign-existing-projects`, plus
   `emilkowalski/improve-animations` when it moves. The question is "is this the best it can be, and
   where is it not", never "what is this".
3. **Grill Thomas** with the questions that judgement raises. Product questions only; settle the
   engineering calls yourself (D82).
4. **Settle the design.** Write the decisions and the audit's verified findings into the ticket body,
   including any finding you threw out, so nobody re-files it.
5. **Build**, from the ticket, with a worker.
6. **Sweep what was built** with the ui-skills, below.
7. **Thomas looks at it running**, `/dev-server` for web, `/android-generate` for mobile. His eyes
   are the evidence.
8. **He approves and the next screen starts**, or it goes back into the loop.

**A screen being built with no conversation behind it is out of contract.** Stop and open the
conversation instead.

When step 4 moves a screen off the canvas, Thomas's approval in that conversation is the grant.
Record the deviation on the ticket, then push it back with `DesignSync`.

## Step 6, the sweep

Skills are fetched per ticket and never installed (D16). Skills from the `ibelick/ui-skills`
registry are fetched with:

    npx --yes ui-skills get <owner>/<name>          # prints the skill to stdout, so redirect it

The `jakubkrehel/make-interfaces-feel-better` namespace is in that registry; it is not a path in
the `jakubkrehel/skills` repository. The `better-*` suite is in that separate repository and must
be fetched by raw URL, noting the `skills/` path segment:

    https://raw.githubusercontent.com/jakubkrehel/skills/main/skills/<name>/SKILL.md

`vercel-labs/web-design-guidelines` is a pointer, not a rule set. Fetch what it points at, or the
lane sweeps nothing:

    https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md

This is the complete source inventory for the sweep; every skill below maps to exactly one fetch
source:

| source | skills |
|---|---|
| `npx --yes ui-skills get <owner>/<name>` | `anthropics/frontend-design`, `jakubkrehel/make-interfaces-feel-better`, `emilkowalski/animation-vocabulary`, `raphaelsalaja/mastering-animate-presence`, `iart-ai/accessible-animation`, `ibelick/fixing-accessibility`, `wshobson/wcag-audit-patterns` |
| `https://raw.githubusercontent.com/jakubkrehel/skills/main/skills/<name>/SKILL.md` | `jakubkrehel/better-ui`, `jakubkrehel/better-accessibility`, `jakubkrehel/better-layout`, `jakubkrehel/better-writing`, `jakubkrehel/better-typography`, `jakubkrehel/better-colors`, `jakubkrehel/interface-review`, `jakubkrehel/better-interface` |
| `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md` | the Vercel guideline text |

Four read-only lanes, then the two repository agents as the close gate.

| lane | skills | owns |
|---|---|---|
| execution | `anthropics/frontend-design`, `jakubkrehel/better-ui`, `jakubkrehel/make-interfaces-feel-better` | polish mechanics, concentric radii, optical alignment |
| motion, when it animates | `emilkowalski/animation-vocabulary`, `raphaelsalaja/mastering-animate-presence`, `iart-ai/accessible-animation` | every animation names a purpose from the `DESIGN.md` closed list, and reduced motion |
| gates | the Vercel guideline text, `ibelick/fixing-accessibility`, `wshobson/wcag-audit-patterns`, `jakubkrehel/better-accessibility` | WCAG 2.2 AA, focus, targets |
| the change | `jakubkrehel/interface-review`, then `jakubkrehel/better-interface` in full mode with all six owners it routes to: `jakubkrehel/better-accessibility`, `jakubkrehel/better-layout`, `jakubkrehel/better-writing`, `jakubkrehel/better-typography`, `jakubkrehel/better-colors`, `jakubkrehel/better-ui` | classifies each finding Introduced, Regression or Pre-existing, then reviews every routed domain |

`interface-review` is the lane that decides what belongs in this pull request and what becomes a
ticket, because it reviews a change rather than a screen. Run it before `better-interface`.

Close with the repository's own `design-reviewer` on the diff and `completeness-critic` against the
surface inventory. `completeness-critic` is what catches a feature the rebuild dropped.

## What Thomas checks, so a work order carries it

- **Wrapping is a defect on buttons, chips, tabs and navigation labels**, at every supported width.
  Preserve the named `DESIGN.md` exceptions: a `StatTile` label reserves up to two lines, and an
  `Input` may be multiline. Headings and body copy follow its measure and wrapping rules.
- **A rebuild never drops a feature.** Removal is authorized only where he decided it.
- **Compose motion wherever `DESIGN.md`'s frequency and purpose gates permit it.** A 100-plus-per-day
  interaction gets no animation budget, ever, and purposeless motion is deleted. Where those gates
  do permit motion, a screen composing none of its own fails his 2026-09-02 point 5, whatever else
  is right about it.
- **A whole screen ships, with nothing old left on it** (D86). No mid-stack partial.

## Traps this screen family sets

- **The local API cannot reach Stripe**, so a plans response comes back empty and monetization
  surfaces render no tiers. That is the environment. Test those with fixtures, not with localhost.
- **A granted drawing outranks `DESIGN.md` prose, and `## Information architecture` and `## Bans`
  outrank the drawing** (D42). A granted export never authorises a banned value.
- **Faithfulness to the drawing is not quality.** The `thomasluizon/orbit-tickets#351` worker applied
  the granted Button contract faithfully and deleted 31 `accessibilityLabel` props
  (`thomasluizon/orbit-tickets#375`). A lane is allowed to argue
  with the canvas; that is why step 2 exists.
- **A sweep lane that reports "the structure is sound" on a screen Thomas called horrible has not
  done the work.** Send it back with the specific thing it failed to see.
