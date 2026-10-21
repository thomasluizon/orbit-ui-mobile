# Habit row surfaces

The owner standard in landing Figma file `aLwwyaY3Dtw1NVesAWsNO7`, rows `7:72` and `7:84`, is “esse e o novo padrao dos habitos”. A habit row owns its radius 20 body, current card surface fill and an inset 1px hairline outline that consumes no layout space. Web uses an inset box shadow; Android uses a noninteractive absolute outline over the body. Its 28px check has radius 12 and retains a separate 48px target.

| Surface | Web owner | Android owner | Coverage |
|---|---|---|---|
| Hoje root and drill lists | `components/habits/habit-list.tsx` | `components/habit-list.tsx` | Root leaf, parent, inline child, deeper drill row, expanded and collapsed family |
| Habit detail child list | `components/habits/habit-detail-screen.tsx` | `components/habits/habit-detail-screen.tsx` | Each child owns its fill and border; the group adds neither |
| Row completion | `components/habits/habit-check.tsx`, `habit-row-check-circle.tsx`, `habit-row-trailing.tsx` | Same paths | Empty, done, overdue, bad habit slip, partial parent progress, completed parent, disabled and unavailable |
| Selection mode | `components/habits/habit-row-trailing.tsx` | Same path | Leaf and parent status glyphs retain the shape without becoming another action |
| Keyboard focus | Habit check target and `app/globals.css` | Habit check target through `components/ui/inset-focus-pressable.tsx` | One inset indicator follows the check perimeter; no glyph indicator |

Independently bordered rows have 4px separation within a Hoje family and 12px between families. Habit detail child rows retain 12px separation. Android spacing belongs to the unpainted wrapper so it does not enlarge the bordered body.

Depth-1 wells and titles add one 16px leading inset: canonical body padding is 24 for a child and 8 for a root. This keeps the independent body at the list edge and the trailing 48px targets in place, preserving the available title width without a reserved disclosure column on leaves. Both the primary content and large-text supporting metadata use that depth-specific edge. List, detail and leading-slot owners add no further indentation. Drill rows reset to display depth 0; ancestry never adds another offset. The reference HabitRow contracts already accept depth 0 or 1 and need no public prop change.

Both platforms retain row minimum heights, typography, emoji wells, disclosure, selection, completion, detail, overflow, drag and long-press behavior. Skipping advances the schedule and removes the row from that day; it does not add a skipped check state. Empty, loading and failed lists contain no row checks and keep their existing state surfaces. Their sheets, dialogs and menus retain their existing actions.

`StatusRing`, `ParentRing` and `ProgressRing` remain circular outside the habit row. Calendar event and time-grid status glyphs, the habit detail header, goals, Progresso, Astra blocks and onboarding previews retain their separate components.

Web Vitest measures the production row with compiled CSS at 320, 412 and 1352, in both themes, at normal and 200% text. It checks the depth-specific well inset, visible check, inset outline token, zero layout borders, row fill, zero and partial parent progress and focus. The paired list suites cover Hoje, Todos, Geral, drill resets and selection with leaf and parent children. Android Vitest mounts the row across the same width, theme and text-scale axes and measures the well through Yoga alongside the noninteractive absolute outline, zero body border width, accessible parent counts, state colours and focus. Habit detail composition tests measure its single child inset and retain the group spacing and native fill coverage. The hermetic layout workflow measures production web child wells in both locales and themes at normal and 200% text. Device rendering and whole-screen visual inspection remain outside the component tests.

## Item type metadata

The shared row owners render `Tarefa` / `Task` or `Hábito` / `Habit` once as the first
12px Geist Mono token in one wrapping metadata flow below the title and optional stored description.
Type never ellipsizes or becomes a badge. Existing time, status and parent counts retain their order.
A nonempty checklist appends one decorative ListChecks glyph and the actual checked/total count,
including zero and complete counts. Duplicate item texts remain separate entries; child-habit progress
is independent. The glyph is 16px normally and 24px above 130% text, at stroke width 1.5 in the
metadata foreground. Empty checklists add no token, separator or gap. Checklist completion changes
neither the habit's logged state nor its actions. The primary and selection naming paths reuse
Checklist and the localized row-progress phrase once; visual metadata is hidden from accessibility. The same content reaches Hoje, Todos,
Geral, search, inline children, drill lists, detail children and Astra-owned shared rows. Detail
headers retain `Tarefa única` / `One-time task` or `Hábito` / `Habit` beneath their full-width
rename heading, matching the full form choices. The row selector derives from the same schedule
classification and uses the dedicated task caption key. Primary and selection accessible names
match the short visible row type exactly once; visual copies stay hidden from accessibility.
This vocabulary change preserves typography, insets, controls, targets and available width.
Large text grows the row.

At default text, the primary action owns the first 4px of trailing clearance as internal padding.
Its sibling control group retains 4px gaps with no outer gap. The clipping and focus owner extends
through that space while text columns, control positions and whole-row centring remain unchanged.

Above 130% text, every row uses a full-row primary action and a supporting footer. The heading
keeps the title, optional description and independent first-line controls. Exactly one metadata
flow leads with the complete type and includes existing metadata and any checklist count. The footer shares the
title's leading edge through the existing 48px spacer, keeps an 8px trailing and bottom inset,
and adds 4px above type only when the description heading supplies no bottom padding. At default
text, a token wider than the heading's available text column uses the same footer. Web observes
the actual column and whole-token bounds; native receives their layout widths. The normal
320px child-parent maximum-count case demonstrates the insufficient column. Footer placement
reverses when the column fits again and preserves first-title-line controls; ordinary normal
rows retain whole-row centring. Whole tokens wrap with natural row growth and no ellipsis. Native visual heading and footer content stay hidden from
accessibility because the primary action already names the type and metadata.

Stored description rendering is owned by its separate row amendment. When carried together, its
order is title, description and one metadata flow beginning with type. This amendment adds no description copy,
hover redesign or row inset change.

## Description and feedback composition

All canonical rows in Hoje, Todos, Geral, inline families, drill/reset and habit-detail children
share the paired `habit-row-content.tsx` owners. Root leaves, parents, child leaves and child parents
render stored plain text previews between title and metadata. Selection, done, overdue, bad,
partial progress, unavailable and read-only rows retain that content and their independent actions.
Empty, loading, error and capacity surfaces add no placeholder. Calendar events, detail headers,
onboarding and Astra cards retain their separate owners.

`stripInlineMarkdown` supplies the inert preview without changing source text or adding a request.
Normalized-empty content adds no element or gap. The role is Geist Sans 14/400, line height 1.55,
fg-3 at rest and fg-2 during row feedback, with the canonical 4px stack gap. Default text uses one
naturally ellipsized line; above 130% text it permits two lines with row growth. Supporting type and
metadata follow the heading with its existing per-depth text edge. The full description and copy
action remain in the existing detail disclosure. Web uses the preview as the body's accessible
description; Android includes it in the hint alongside the existing future-date explanation.
Selection keeps one preview and no focusable action under an aria-hidden ancestor.

Body feedback replaces the row's existing fill across its radius-20 perimeter, including the trailing
region. Controls remain semantic siblings and paint independently, including the structural selection checkbox in checked and unchecked states. Body hover promotes the inset hairline to hairlineStrong. Web authors the 380ms background and outline transition on the painted row in both directions, with immediate press, sibling-control suppression and reduced-motion feedback. Android selection hover restores on exit and cancelled press without invoking selection or detail. The check's flex wrapper removes
inline baseline space; no translation offsets its glyph. Normal rows centre the 28px check and its
48px target on the actual row axis, with and without descriptions. Large text retains first-title-line
alignment. The original single depth inset and family gaps remain unchanged.

Paired description behavior tests cover plain text, Markdown labels, inert HTML-looking content,
malformed input, normalized-empty content and unchanged source. Chromium Vitest measures title,
preview and metadata order, role and one/two-line bounds, check/target centres, replacement paint,
control isolation and overflow at 320, 412 and 1352 in both themes and normal/200% text. Android Yoga
checks the corresponding layout and row-owned press/hover bounds. Native font rasterization and
real assistive technology remain device-verification boundaries. The hermetic layout lane owns
whole-page evidence and independent rendered review precedes pushing.

Paired metadata regressions mount real rows, list builders and detail child consumers. They cover
empty, zero, partial, complete and maximum checklists, duplicate entries, received-data replacement,
parent progress, selection and meaningful naming. Native Yoga exercises actual glyphs at 320, 412
and 1352 in both locales and themes at normal, 200% and 250% text, delivering measured layout events
to the fit owner. The Chromium Vitest fixture mounts the live React row and exercises measured
footer entry, selection replacement and return. Markup-only geometry does not prove that observer
path; frozen production rendering and physical Android acceptance remain separate requirements.
