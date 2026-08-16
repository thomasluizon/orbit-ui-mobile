# The per screen prompt template

> **At a glance** - fill the five slots, paste, done. It is short on purpose: the canon lives in the
> design system project, which the canvas reads on every generation, so repeating it here pays for it
> twice. Run wave 0 first, because this template points at what wave 0 builds.

## How to use it

1. Work in the **one screen project** that holds every screen document, not a new project per screen.
2. Fill `SCREEN`, `JOB`, `CONTENT`, `STATES` and `OPEN`. Delete nothing else.
3. Paste. One screen is one turn. Two or three screens per session, because the canvas shares the
   ordinary usage pool.
4. When it lands, pull it into the repository with `/design-sync` before starting the next one.

## The template

---

Build the **SCREEN** screen for Orbit as one interactive document, following
`guidelines/screen-contract.md` in the design system. Read that file first and obey it, including the
report it asks for at the end.

**Its job:** JOB

**Content, top to bottom:** CONTENT

**States:** the contract's nine, and specifically STATES

**Shell:** compose `Shell412` and `ShellWide`, switched by `CanvasControls`. Never rebuild a shell
inline.

**Say back before you build:** the screen's job in one sentence, the one focal element and what you
demoted for it, and the one memorable move, which must come from the Orbit mark, the Astra glyph or
the ring language and never from added decoration.

**Open, so ask me rather than decide:** OPEN

---

## Filling the slots

**SCREEN**: the name a person would say, for example Metas or Criar hábito.

**JOB**: one sentence, what a person came here to do. Not a description of the layout.

**CONTENT**: the real entries, with the variety that makes the rules visible. On a list screen name
the count and the mix of statuses. On a form screen name the fields and which one can fail. On a
detail screen name what leads and what trails.

**STATES**: only the ones that need saying beyond the nine. Copy for the empty, error and at capacity
text belongs here, in pt-BR, because inventing it on the canvas is how a banned word gets in.

**OPEN**: anything the spec genuinely does not settle for this screen. Keep it to real questions. If
the list is empty, write `nothing`.

## Worked example, the Metas screen

Build the **Metas** screen for Orbit as one interactive document, following
`guidelines/screen-contract.md` in the design system.

**Its job:** see which goals are moving and open the one that is not.

**Content, top to bottom:** the screen heading, then five goals, each a panel carrying its title, a
mono meta line of progress in real units, and a `ProgressRing`. One goal is at 100 percent and its
ring is therefore neutral, two are part way and keep the accent, one has not started, one is overdue.

**States:** the contract's nine, and specifically empty `Nenhuma meta ainda` with a `Criar meta`
action, error `Não foi possível carregar suas metas. Verifique sua conexão e tente de novo.` with
`Tentar de novo`, and at capacity `Limite de 5 metas. Arquive uma meta para criar outra.`

**Shell:** compose `Shell412` and `ShellWide`, switched by `CanvasControls`.

**Say back before you build:** the job, the focal element and what you demoted, and the one
memorable move.

**Open, so ask me rather than decide:** whether a goal panel shows its linked habits inline or only
on the detail screen.
