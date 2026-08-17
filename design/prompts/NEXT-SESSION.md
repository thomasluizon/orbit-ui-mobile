# The prompt for the next session

Copy the fenced block below into a fresh Claude Code session started in `orbit-ui-mobile`.

Written 2026-08-17, at the end of a long session that produced good artefacts and two bad prompts.
The reason this handoff exists: **`screens.md` was written from `DESIGN.md` alone, without checking a
single claim against the API's real data model, and it told the canvas to draw a state that cannot
exist.** That is the defect to remove, not just the symptom.

---

```
Continue Orbit ticket #36, the canvas-first redesign. Do NOT write app code and do NOT open the
Claude Design canvas in this session. This session RESEARCHES, then rewrites one file.

## Why you exist

design/prompts/screens.md holds eight paste-ready prompts for the Claude Design screens project. Paste
1 has already run and produced "Orbit Hoje.dc.html". Thomas reviewed it and found four defects, and
the root cause of the worst one is the prompt itself: it was written from DESIGN.md without checking
one claim against the API, so it instructed the canvas to draw a habit in a "frozen" state.

There is no such thing. StreakFreeze in orbit-api is (UserId, UsedOnDate): it freezes a DAY for a
USER's streak. Habit has no freeze and no pause member at all. So the prompt asked for a state the
product cannot produce, the canvas obediently drew it, and Thomas had to ask what it meant.

**Your job is to make that class of mistake impossible, then rewrite screens.md.** Thomas said, in his
words: "i dont want these misconceptions to happen anymore".

## Phase 1: research, and go deep

**Run this phase as ONE workflow, and write nothing else with one.** Thomas will say "use a workflow";
that is the explicit opt-in. Two reasons, and neither is speed. The reading is 32 tickets with their
comments plus two repos plus the whole decision register, and read inline that fills the context and
reproduces the exact bloat that ended the previous session, whereas a workflow returns conclusions and
leaves the dumps outside. And the research needs an adversarial stage whose only job is to try to
FALSIFY each traced state, which is the failure mode being fixed here.

Fan out by source, one agent per slice, then a verify stage over the assembled inventory, then a
completeness critic asking what surface, state or gate was never checked.

**Phase 3 is written solo, by you, in one voice.** Do not fan out the rewrite. Eight prompts written by
eight agents give eight registers, and a single consistent voice is most of that file's value.

Effort stays at high. Depth of reasoning was never the bottleneck: the previous session reasoned
plenty and simply did not run the grep. Raise it only if the vault contradictions turn out tangled.

Read, do not skim.

1. **The whole app, from source.** Both repos. For every surface a screen prompt will describe, answer
   from code, never from a document:
   - what states can that surface actually be in, and what field or row proves each one
   - what the API returns, field by field, and what it does NOT return
   - which values are derived and which are typed, because a derived value renders differently
   - what is gated, by which config key, with which compiled-in default
   `architecture.json` is the map; read it instead of exploring blindly, then confirm the specifics in
   the source it points at.
2. **The brain vault**, especially every decision touching the redesign. Read the register
   `2 Areas/20-29 Orbit Engineering/Decisions/` in full, and D69 and D70 word for word:
   - "Astra is a layer with a front door, not a fourth tab"
   - "Pro is Astra without the daily ceiling, and goals leave the paywall"
   Also read the price ADR and hot.md. Some notes contradict each other; when they do, the later one
   wins and you say so explicitly rather than quietly picking.
3. **Every redesign ticket on the board.** 32 are open in the "539 Redesign" milestone as of
   2026-08-17. Read them WITH THEIR COMMENTS, because several carry decisions that supersede their own
   bodies. The ones that own screens: #42 #44 #46 #47 #50 #53 #55 #56 #57 #58 #61 #63 #67 #69 #71 #72
   #73 #74 #75 #76, plus #217 #318 #320 #329. Note especially that #46's title still says
   "colour-as-data", which D69 killed, so its title lies.
4. **The repo's own design record**: DESIGN.md in full, design/prompts/waves.md,
   design/prompts/RUN-LOG.md, design/prompts/screens.md, BRAND.md, FEATURES.md.

Build one artefact from all of it before you write any prompt: **a state inventory**, per surface,
where every state names the code that produces it. A state you cannot trace to code does not go in a
prompt. Put it in the scratchpad, not in the repo.

## Phase 2: ask me everything

Batch your questions and ask them. Do not guess and do not soften them. I would rather answer twelve
questions once than find twelve wrong screens later. For each question give me your recommended answer
so I can just say yes.

Two I already know you will need to ask, so start there:
- Frozen: it is a user-day, not a habit. Where does it render? My instinct is Calendario's day cells
  and the streak repair in Progresso, and nowhere on Hoje.
- The Astra proactive line on Hoje: Thomas said the summary "looks weird". Decide what it should be
  before redrawing it, and show me the shape.

## Phase 3: rewrite design/prompts/screens.md

Same format: paste-ready fenced blocks, one per screen, nothing left to compose. Keep what works about
it, which is the standing brief carrying every settled decision so no prompt repeats one, and each
brief saying what the screen is FOR and what it must not become rather than listing what is on it today.

Change what does not work:
- **Every state named in a prompt must be traceable to code.** Cite the file where it is not obvious.
- **Never name a status, field or gate that the API cannot produce.**
- Fold in the four defects found on the first Hoje (below), so the rewrite does not reproduce them.

## The four defects already found on Orbit Hoje.dc.html

These are diagnosed and NOT yet fixed. Three are design system bugs, so they are fixed in the design
system project `918bd5d7-839c-4dd0-811b-4a8781f60507`, not in a screen. Confirm each one yourself
before you act on it.

1. **The tab bar icon is not aligned with its label.** `components/brand/Icon.jsx` renders a Tabler
   webfont glyph in an `<i>`, and `TabBar` gives it `display:block;width:22px;height:22px`. The glyph is
   TEXT inside that block, so it sits at the text origin rather than centred, and any glyph narrower
   than 22px reads as shifted left. Fix it in `Icon` itself, so every consumer benefits: make it a
   self-centring square, `display:inline-flex` with both axes centred and width and height equal to
   `size`. Inline styles beat the class rule, so nothing else needs touching.
2. **StatusRing uses emoji and punctuation as iconography.** Its glyph map is `❄`, `!` and `→`.
   DESIGN.md says Tabler only, and says emoji appear only as a user-chosen habit icon inside a row
   well, never as UI iconography. That is three violations in one line. Replace them with Tabler icons
   and verify each name against `@tabler/icons-react` at ^3.46.0 rather than assuming it; note that the
   webfont on the canvas is 3.31.0, so a name added after 3.31 will not render there.
3. **`frozen` is not a habit status.** Remove it from anything habit-shaped and say in the `.d.ts` what
   it actually marks. `HabitRow` must not offer it.
4. **EmptyState hand-draws the retired mark.** It inlines a tilted ellipse with an accent arc. That
   draft mark was replaced on 2026-08-16 and its assets deleted, and a hand-drawn ellipse is a fourth
   identity carrier where DESIGN.md allows exactly three: the orbital mark, the Astra glyph, ring
   indicators. Thomas asked for the real logo. Use `OrbitMark`, with a prop so an Astra-owned empty
   state can use `AstraGlyph` instead. The accent then lives only on the one filled action, which is
   already there, so DESIGN.md's "empty-state invitation arc" phrasing in accent role 1 needs updating
   too.

## Standing rules

- Never write an em dash or an en dash, anywhere, including the vault and ticket bodies. The gate is
  `node tools/check-dashes.mjs --files <paths>`.
- Work on `redesign/main`. It has no CI and no Pullfrog, so a green PR is not a reviewed PR.
- Ask Thomas on any product or taste call. Make mechanical choices yourself. He is terse: assert the
  obvious option and ask for confirmation, never present a menu.
- Take every identifier from live output in this run, never from memory. Reading a stale local register
  cost this project a duplicate ADR number on 2026-08-16.
- Thomas's Claude Design weekly limit was at 75 percent on 2026-08-17. Research is cheap here; canvas
  turns are not. Spend the research budget in Claude Code and hand him prompts.

## What is already true, so do not redo it

- The design system project is a design system again: no composed screens in it, both shells rebuilt,
  Composer, Proposed and BlockFrame built, every Components card rendering dark and light.
- Two colour derivation bugs fixed: light mode never repointed `--primary-dim`, and `--primary-hover`
  put white at 3.70:1 on the primary button. Hover now darkens to `#B74E12`.
- Contrast is measured against every surface, in DESIGN.md, with three limits deliberately left open
  for Thomas. Do not "fix" those three.
- The screens project's pinned copy of the design system is current and syncs automatically.
- `design/canvas/tools/build-ds-bundle.mjs` exists for when the write API leaves `_ds_bundle.js` and
  `_ds_manifest.json` stale, which it does whenever the app itself did not do the editing.
```
