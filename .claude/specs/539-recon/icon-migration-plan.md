# #539 b6 — Lucide → Tabler icon migration plan

**Goal (spec b6):** kill Lucide, move to Tabler both platforms behind ONE wrapper file per platform so a future
set-swap is one file; kill Sparkles-as-AI-marker. Enforce structurally.

**Approach (best-implementation call, deviates from the literal "semantic-name `<Icon name>`" wording):**
a **wrapped re-export barrel** per platform. `<Check size={16} strokeWidth={2} />` JSX stays identical; only the
import SOURCE changes (`lucide-react` → the barrel). A `makeIcon` HOC normalizes Lucide props to Tabler
(`strokeWidth`→`stroke`, default stroke 1.8 per DESIGN.md, default size 22, pass `color`/`className`/`aria-*`
through). Delivers the spec's goals (one-file swap + prop normalization + no direct imports) with ~1/10th the
regression risk of rewriting 653 callsites to string names. A `no-restricted-imports` ESLint gate bans direct
`lucide-react` / `lucide-react-native` / `@tabler/*` imports outside the barrel — the structural enforcement
the spec wants ("direct-import callsites never recur"). Rationale logged for Thomas at session end.

## Barrel files
- Web: `apps/web/components/ui/icons.tsx` — `import { IconCheck, ... } from '@tabler/icons-react'`, wrap each,
  `export { WrappedCheck as Check, ... }`. Only the 93 used icons (tree-shaken).
- Mobile: `apps/mobile/components/ui/icons.tsx` — same from `@tabler/icons-react-native`.
- `makeIcon(TablerIcon)` → forwardRef component: maps `{ size=22, strokeWidth, stroke, color, ...rest }` →
  `<TablerIcon size={size} stroke={stroke ?? strokeWidth ?? 1.8} color={color} {...rest} />`. Keep a
  `LucideProps`-compatible prop type so callers and `ComponentType<LucideProps>` typings (e.g. sidebar
  `icon:`) keep compiling — the wrapper's prop type must be assignable where `LucideProps` was used.

## Deps
- Install `@tabler/icons-react` (web), `@tabler/icons-react-native` (mobile). Remove `lucide-react` /
  `lucide-react-native` after all callsites migrate. `@tabler/icons-react-native` needs `react-native-svg`
  (already present via other usage — verify).

## Icon name map
`.claude/specs/539-recon/icon-map.json` — 93 icons, Lucide→Tabler. 4 need visual-parity confirmation:
`CircleHelp→IconCircleHelp`, `FastForward→IconPlayerSkipForward`, `HelpCircle→IconCircleQuestion`,
`Settings2→IconSliders`. Collisions to one Tabler name are fine (barrel exports both Lucide names aliased):
`ListChecks`+`ListTodo`→IconListCheck, `CheckCircle`+`CheckCircle2`→IconCircleCheck. `Shuffle` is a custom
Orbit icon (not Lucide) — leave it. Web `Loader2` (15×) → `IconLoader2` (spinner); mobile uses RN
ActivityIndicator (no Loader2).

## Sparkles kill (17 usages — per context, NOT a rename)
- **Astra / AI markers → AstraMark glyph** (`components/ui/astra-mark` or existing AstraMark):
  web `reschedule-sheet.tsx:269`, `ai-settings/.../user-facts-list.tsx:110` (Ask Astra), `habit-form-fields.tsx:273,449`
  (AI tag/tweak suggestions), `navigation/notification-bell.tsx:36` (astra type), `profile/profile-nav-icon.tsx:27`
  (orbit key); mobile `reschedule-sheet.tsx:193`, `ai-settings-sections.tsx:507`, `habit-form-fields.tsx:198`,
  `habits/.../tags-section.tsx:165`, `navigation/notification-row.tsx:18`, `profile/profile-nav-icon.tsx:7`.
- **Generic info-card default icon → IconInfoCircle** (neutral): web+mobile `ui/info-card.tsx` default.
- **Gamification reward carrot → IconGift** (reward, not AI): web+mobile `profile/.../next-reward-carrot.tsx`.
- **Paywall premium marker:** web `upgrade/plan-card.tsx:95`, mobile `upgrade/pricing-footer.tsx:42` — the
  premium accent. Replace Sparkles with a non-AI premium mark consistent with de-slop; `IconRosetteDiscountCheck`
  or drop the icon and let copy carry it. Decide per render; prefer removing decorative Sparkles.
- AstraMark is NOT a Tabler icon; keep importing it from its own module — the icon-import ban must exempt AstraMark.

## Migration fan-out (after barrel exists, by DISJOINT directory)
Swap every `from 'lucide-react'`/`'lucide-react-native'` import to the barrel; apply Sparkles resolutions;
keep JSX. Then: add the `no-restricted-imports` gate, update DESIGN.md (Icons line: Tabler + barrel mandate),
remove lucide deps, validate build+tsc+lint both platforms.
