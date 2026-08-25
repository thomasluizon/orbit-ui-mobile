# The canvas documents

> **At a glance** - the Claude Design canvas, which is THE authority for every redesign surface.
> Twenty-one screens plus the design system tokens. Build from these. The eleven documents in
> `superseded/` are a record of an earlier pass and are not a target.

## The authority

**Thomas granted this export on 2026-08-25**, which is what gives it authority. `DESIGN.md` records
the grant in its D42 paragraph, and `CLAUDE.md` points here. Without that grant a canvas export
carries nothing, and the eleven in `superseded/` still carry nothing.

**Precedence is a ladder, defined in `DESIGN.md` D42.** `## Information architecture` outranks every
drawing on whether a surface should exist. `## Bans` outranks every drawing, so a granted export
never authorises a banned value. **Below those two the drawing wins**, over `DESIGN.md` prose, a
ticket body, and this file. `DESIGN.md` remains the written spec and the place mechanical rules are
enforced, but a drawing here outranks a sentence there (D42).

Each `.dc.html` is **one screen as one interactive document**, not a picture of a screen. It carries
a control bar with four axes, mode, width, state and locale, and renders the whole matrix from one
build.

| document | screen |
|---|---|
| `Orbit Hoje.dc.html` | Hoje, the habit list, the core loop |
| `Orbit Calendario.dc.html` | calendário, the month grid, the day cell and the event row |
| `Orbit Progresso.dc.html` | progresso, and the goals that live inside it |
| `Orbit Perfil.dc.html` | perfil and settings |
| `Orbit Habit Create.dc.html` | criar hábito |
| `Orbit Habit Detail.dc.html` | one habit, its history and its actions |
| `Orbit Astra Conversation.dc.html` | the Astra conversation overlay and side panel |
| `Orbit Wrapped.dc.html` | Wrapped, its cover and its pager |
| `Orbit Onboarding.dc.html` | onboarding |
| `Orbit Entrar.dc.html` | entrar |
| `Orbit Verificacao.dc.html` | the code entry |
| `Orbit Assinatura.dc.html` | assinatura |
| `Orbit Pro.dc.html` | the Pro surface |
| `Orbit Avisos.dc.html` | avisos, the notification surface |
| `Orbit Busca.dc.html` | busca |
| `Orbit Celebracao.dc.html` | the celebration set |
| `Orbit Estados.dc.html` | the shared state set |
| `Orbit Offline.dc.html` | the offline surface |
| `Orbit Sobre.dc.html` | sobre |
| `Orbit Sobreposicoes.dc.html` | the overlay set |
| `Orbit Widget Android.dc.html` | the Android home screen widget |

## The design system, under `_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/`

`_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/tokens/` holds the **166 authoritative token values**. A number typed into a component that
disagrees with a token here is wrong, whatever any document says.

| file | what it fixes |
|---|---|
| `_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/tokens/colors.css` | the surface ladder, the foreground ramp, the one accent and the status set |
| `_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/tokens/spacing.css` | exactly ten values: 0 4 8 12 16 24 32 48 64 96. **20, 28, 40 and 56 must not appear** |
| `_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/tokens/shape.css` | the radius scale, the shadows and the motion durations. Radius 999 means interactive |
| `_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/tokens/typography.css` | three families and a closed size set: 12 14 16 17 20 22 28 34 44 60 |
| `.../tokens/fonts.css`, `.../tokens/base.css` | the font faces, repointed at the tracked binaries in `design/brand/fonts/`, and the reset |
| `_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/styles.css` | the shared component styles |
| `_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/_ds_manifest.json` | the inventory: 41 component names with their canvas source paths, and 36 guideline cards with a one-line summary each |

**A component in the manifest is a promoted primitive. A component that appears only inside a screen
is drawn inline there**, and the screen is its reference. Both are equally binding.

**A guideline-card subtitle names a component and summarises it in one line. It is an index entry, not
a specification.** The Actions card says only "Button variants and the FAB, dark and light", while the
screens deliver the variants, sizes, states and measurements. The binding specification of any
component is: the token values, `styles.css`, and every screen that draws it, with the screen named in
its ticket as the reference. Read those, not the subtitle.

## What is deliberately not committed

* **The font binaries.** `design/brand/fonts/` already carries them.
* **`support.js`**, the canvas runtime. It is vendor code and its em dashes fail the repository dash
  gate.
* **`_ds_bundle.js`**, which is compiled output carrying no readable component source.
* **`_adherence.oxlintrc.json`**, the canvas's own lint config. Nothing here consumes it, and its
  messages carry em dashes the dash gate rejects.

### Reading them, and rendering them

**Reading works from a checkout.** The markup is plain HTML with a `{{ }}` template layer, each
screen carries a prose report block explaining its own decisions, and every stylesheet link resolves
against the design-system tree committed beside them. That is what an implementer needs and it is why this
export is here.

**Rendering does not work from a checkout, by design.** Each document also pulls `support.js` and
`_ds/<uuid>/_ds_bundle.js`, and neither is committed. To see one rendered, export the project archive
from Claude Design and open it there, or drop those two files and the font binaries beside these.

The `_ds/<uuid>/` directory keeps the export's own UUID name because the screens link through it.
Flattening it silently breaks every stylesheet reference.

The manifest lists 41 components by `sourcePath`. **Those `.jsx` files are not in this export**; the
paths are provenance from the canvas sessions. What specifies a component is stated once above: the
token values, `styles.css`, and the screens that draw it.

## `superseded/`

Eleven documents from the pass that predates the information architecture (2026-08-16). They reskin
the app that existed and draw a habit tracker with a chat tab, so **every one of them contradicts
`DESIGN.md` section `## Information architecture`**. They are kept as a record of what the canvas
produces when the prompt describes the screen that exists instead of the job the screen does.

They live in their own folder rather than beside the authority because prose asking an implementer to
ignore a file in front of them is not a control. `Orbit Insights.dc.html` was deleted on 2026-08-16
with the `/insights` route.
