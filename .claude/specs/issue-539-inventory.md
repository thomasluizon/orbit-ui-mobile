# #539 whole-app visual transformation — SURFACE INVENTORY

**Purpose:** the exhaustive, status-tracked list `visual-delivery.md` rule 1 mandates. A row flips
to `done` ONLY when a seeded light+dark screenshot artifact exists that a reviewer can spot-check
against `DESIGN.md` + the `KQMPM`/`N8aEDF` mockups (rule 4). A self-reported "looks good" is NOT
evidence (rule 5). Status is always "N/M", never "done", until every row is `done` with an artifact
(rule 8).

**Legend:** `done` = artifact exists, judged vs DESIGN.md · `partial` = some work landed, not re-verified ·
`todo` = untouched / not yet rendered this epic · each web row has a `mobile` mirror unless noted.

**Fixture:** seeded 2026-07-18 (this session) via authenticated BFF `fetch` — 3-level family
(Water → Morning routine → Big glass → First sip, drill at tier 3), childless (Correr 5km), checklist
(Rotina da manhã 0/3), long-title + long-desc (Beber dois litros…), color emoji, gamification
non-zero (level 2, XP 136, streak 1, 4 earned + locked achievements). Gap: fresh completed/overdue
occurrences thin (completion endpoint not located this session — existing Jun/Jul history covers calendar).

## Baseline established this session (2026-07-18)
- **Stack:** docker pg + orbit-api :5000 + web :3001 (prior-session server, intermittently freezes —
  a fresh restart is advised before the next screenshot batch).
- **Verified done (real render, artifact captured):** Today / `/(app)` index (web) — tonal family
  panels, thin progress ring, rail modules (Restantes/Sequência/Nível/Conquistas + Consistência +
  Próxima conquista), de-badged Astra card, account chip ("thomaslrgregorio / Orbit Pro"), single-row
  panels, long-title clean 2-line truncation, color emoji, violet drill `›` on Big glass. **This is the
  b5 hero work — it is genuinely good.**

## Web routes (29)
| # | route | status | notes / known defect |
|---|-------|--------|----------------------|
| 1 | `/(app)` Today | **done** (web) | b5 hero; mobile mirror todo |
| 2 | `/(app)/about` | todo | |
| 3 | `/(app)/achievements` | todo | |
| 4 | `/(app)/advanced` | todo | |
| 5 | `/(app)/ai-settings` | todo | "Recursos de IA" Sparkles (b6 icon) |
| 6 | `/(app)/calendar` | todo | **DEFECT:** default grid+tabs, stat-tile labels wrap 2 lines ("Melhor sequência", "Total de registros"), misaligned — full redesign; 4 sub-views (Mês/Semana/Intervalo/Agenda) |
| 7 | `/(app)/calendar-sync` | todo | |
| 8 | `/(app)/explore` | todo | |
| 9 | `/(app)/insights` (Análises) | todo | |
| 10 | `/(app)/preferences` | todo | |
| 11 | `/(app)/profile` (Perfil) | todo | stat tiles vs mockup |
| 12 | `/(app)/public-profile` | todo | |
| 13 | `/(app)/retrospective` | todo | |
| 14 | `/(app)/social` | todo | |
| 15 | `/(app)/social/challenges` | todo | |
| 16 | `/(app)/social/challenges/[id]` | todo | |
| 17 | `/(app)/streak` | todo | |
| 18 | `/(app)/support` | todo | |
| 19 | `/(app)/upgrade` (paywall) | todo | |
| 20 | `/(app)/wrapped` | todo | |
| 21 | `/(auth)/login` | todo | |
| 22 | `/(auth)/auth-callback` | todo | |
| 23 | `/(chat)/chat` (Astra full page) | todo | |
| 24 | `/(onboarding)/onboarding` | todo | |
| 25 | `/(public)/delete-account` | todo | |
| 26 | `/(public)/privacy` | todo | |
| 27 | `/(public)/terms` | todo | |
| 28 | `/(public)/u/[slug]` | todo | |
| 29 | `/r/[code]` | todo | |

Also: Todos + Geral habit views (share the habit-list component with Today — inherit b5 partially,
but not yet re-rendered → treat as partial/todo).

## Modals / dialogs / sheets / drawers (16)
| # | component | status | notes / known defect |
|---|-----------|--------|----------------------|
| 1 | `habits/create-habit-modal` | todo | Sparkles marker (b6) |
| 2 | `habits/edit-habit-modal` | todo | |
| 3 | `habits/habit-detail-drawer` | todo | |
| 4 | `habits/reschedule-sheet` | todo | |
| 5 | `goals/create-goal-modal` | todo | |
| 6 | `goals/edit-goal-modal` | todo | |
| 7 | `goals/goal-detail-drawer` | todo | |
| 8 | `navigation/notification-detail-modal` | todo | |
| 9 | `onboarding/feature-guide-drawer` | todo | |
| 10 | `referral/referral-drawer` | todo | |
| 11 | `share/share-card-sheet` | todo | |
| 12 | `shell/rail-drawer` | todo | |
| 13 | `tour/tour-replay-modal` | todo | |
| 14 | `ui/confirm-dialog` | todo | **DEFECT:** full-bleed `Salvar` pill on desktop (edit-name modal is this) — DESIGN.md L258+L455; also fix the `no-fullbleed-button` gate (`flagFullWidthProp:false` misses it) |
| 15 | `ui/create-api-key-modal` | todo | |
| 16 | `ui/trial-expired-modal` | todo | |

## Cross-cutting known defects (fold into the passes above)
- [ ] **Remove "Perfil" from left nav** (redundant w/ account chip; mockup omits it) — CONFIRM the chip
  reaches `/profile` first, else this orphans the route (product rule 4). Nav = `app-sidebar.tsx` + mobile.
- [ ] **Depth-2 leaf indentation** — a LEAF at depth ≥1 doesn't reserve the chevron column, so its icon
  sits ~30px left of a chevron-bearing sibling (seen on the "Test" family L2 leaf; Water family renders
  fine because Big glass HAS a drill chevron). Fix in `habit-row.tsx` web + mobile.
- [ ] **"Buscar hábitos" search input** overflows its container + double focus-ring.
- [ ] **Hydration console error** on `app-sidebar` — confirm in incognito (likely a Thomas extension; b5
  didn't touch that padding). If it repros clean, it's ours.
- [ ] **Sequência shows "0 dias"** on the rail while profile reports currentStreak 1 — minor data-mapping
  check.

## Icon migration (b6, folds into the same PR — Phase 3)
Lucide → Tabler both platforms behind a NEW shared `<Icon>` wrapper per platform (~130 icons, 326
callsites). Kill Sparkles-as-AI-marker. Mechanical + build/lint-verifiable → the best Workflow fan-out
candidate; needs the wrapper designed first (serial prerequisite). See spec b6 decision block.

## Status
**1 / (29 web routes + 16 modals + mobile mirrors) verified done.** Hero (Today web) is done and good;
the whole-app taste pass, the ~5 cross-cutting defects, and the icon migration remain. This is a
multi-session grind — the per-surface render-verify loop is serial main-session work and cannot be faked.
