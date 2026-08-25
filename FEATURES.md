# Orbit — Feature Inventory

> **At a glance** - the single code-derived, gating- and platform-aware map of every Orbit capability.
> - Downstream copy (Play listing, landing page, QA matrix) derives its rows from here, so nothing is undersold.
> - Gating: Free / Trial (7-day, full Pro except Retrospective) / Pro / Yearly-Pro, computed from `User` flags in `PayGateService.cs`.
> - Free limits: 5 AI messages per day. Habits are not a paid axis: the 1000 ceiling is an abuse guard, identical on every plan. Both = web + mobile (Expo, Android-only), with no iOS app.
> - Headline surfaces: Astra (61 AI tools), the MCP server (79 tools / 15 classes), sharing and referrals, the core tracker.
> - Read the whole doc before writing store, marketing, or QA copy.

The single, code-derived, gating- and platform-aware map of everything Orbit does. Downstream copy — the Play listing, the landing page, the store description, and the pre-launch QA matrix — derives its rows from here, so no feature is undersold or invisible and nothing needs feature archaeology.

**How to read this doc.** Every capability lives in a per-domain table with five columns: **Feature**, **Description** (one line), **Gating**, **Platform**, and **Locale notes**. Astra and MCP are listed at feature/category granularity with tool counts, not one row per tool.

**Gating vocabulary.** Tiers are computed from `User` flags in `orbit-api/src/Orbit.Application/Common/PayGateService.cs`, not an enum:

- **Free** — no Pro, no active trial.
- **Trial** — a 7-day grant set at signup with no card; grants full `HasProAccess` (everything Pro), **except** the Retrospective, which stays Yearly-Pro-only.
- **Pro** — monthly, yearly, or lifetime purchase (Play Billing on mobile, Stripe on web).
- **Yearly-Pro** — the yearly plan; a super-set that additionally unlocks the AI Retrospective.

**Limits (source: the live `AppConfigs` rows).** The AI
meter is **daily** and resets at the user's local midnight: **5** messages a day free, **50** a day on
Pro. **On the Astra allowance specifically, what Pro buys is ten times the free one rather than a
different product.** Pro does also carry its own entitlements, enumerated in the plan table below.

**Habits are not a paid axis.** The ceiling is **1000** live top-level habits, identical on every
plan, and it exists as an abuse guard rather than as an upsell.

**Sub-habits are Pro** (`SubHabitsProOnly`). A rewarded ad grants **+5** AI messages against that
day's allowance, capped at **3/day**, for free non-trial users only. Pro and trial users never see
ads.

Read from the production `AppConfigs` table on 2026-08-25: `FreeAiMessagesPerDay` 5,
`ProAiMessagesPerDay` 50, `FreeMaxHabits` 1000, `SubHabitsProOnly` true.

`AppConfigService.GetAsync` caches each key in memory for **30 minutes** and falls back to the
default its CALLER supplied when the row is absent, when its value cannot be parsed into the
requested type, and when the requested type is one `ConvertValue` does not handle. So a row edit
takes up to half an hour to take effect, and a malformed row is indistinguishable from a missing one.

That supplied default is a named constant only for the numeric limits: `DefaultFreeMaxHabits`,
`DefaultFreeAiMessages` and `DefaultProAiMessages`. `SubHabitsProOnly` passes the literal `true` and
has no constant at all, so there is no single file to read every fallback out of.

**Quote the row values above, never the constants.** `DefaultFreeMaxHabits` is 1000 while the
original seed migration wrote 10, so the two disagreed until a later migration raised the row.

**Platform vocabulary.** **Both** = web (Next.js) and mobile (Expo, Android-only). **Web-only** / **Mobile-only** flag the genuine platform-specific surfaces. There is **no iOS app**.

---

## The headline

### Astra — your AI habit coach
Astra is a conversational coach that can actually *act*, not just talk. Tell it "I ran today" and it logs the run; ask "how am I doing?" and it analyzes your real streaks and completion rates. It has built-in tools spanning habits, sub-habits, goals, tags, checklists, logging, reminders, calendar, and your account — so almost anything you can do by tapping, you can do by asking. It takes typed messages, **voice input** (speak instead of type, multi-language), and **images** (photograph a schedule and it extracts habits for review).

### Connect your assistant — Orbit speaks MCP
Orbit exposes a full **Model Context Protocol** server, so you can connect Claude, ChatGPT, or any MCP-capable assistant straight to your account and manage your habits and goals from wherever you already chat with AI. **79 MCP tools across 15 tool classes**, scoped to your account, secured by OAuth 2.0 dynamic client registration or scoped, hashed API keys. This is a rare consumer feature: Orbit is a habit tracker your favorite AI assistant can drive.

### Share progress and invite people you know
Celebrate progress with milestone cards and use personal referral links to invite people to Orbit.

### A serious core tracker underneath
Flexible scheduling (daily, weekly, monthly, yearly, flexible, one-time, general), sub-habits, checklists, bad-habit tracking with AI slip alerts, goals with velocity metrics, a color-coded calendar with Google Calendar import, XP and levels, achievement badges, streaks with streak-freeze protection, an Orbit Wrapped recap, and an Android home-screen widget.

---

## Astra AI

Astra is the in-app assistant on the chat surface (web `/chat`, mobile `chat`). Backing tools are registered in `orbit-api/src/Orbit.Api/Extensions/ServiceCollectionExtensions.AiServices.cs` — **61 `IAiTool` implementations** total.

| Feature | Description | Gating | Platform | Locale notes |
|---|---|---|---|---|
| Conversational chat | Natural-language coach that creates, logs, updates, and explains your habits and goals | Free (5 msgs/day) · Pro (50 msgs/day) | Both | en + pt-BR; AI replies in the user's language |
| Tool breadth — habits | 14 tools: create/update/delete, log, skip, duplicate, move, reorder, sub-habits, checklist, query, metrics | Free (Pro-gated actions inherit their feature's gate) | Both | — |
| Tool breadth — habit bulk ops | 5 tools: bulk create/delete/log/skip and bulk emoji update | Free | Both | — |
| Tool breadth — goals | 10 tools: create/query/update/delete, status, progress, link habits/goals, AI review, reorder | Free, except the AI review, which is Pro | Both | — |
| Tool breadth — tags | 5 tools: assign, list, create, update, delete | Free | Both | — |
| Tool breadth — profile & preferences | 4 tools: get profile, update preferences, set color scheme, set AI summary | Free / Pro per setting | Both | — |
| Tool breadth — checklist templates | 3 tools: get, create, delete reusable templates | Free | Both | — |
| Tool breadth — notifications | 3 tools: get, update, delete reminders | Free | Both | — |
| Tool breadth — calendar | 2 tools: calendar overview, manage Google Calendar sync | Pro (calendar is Pro) | Both | — |
| Tool breadth — summary & retrospective | 2 tools: daily summary, retrospective | Pro / Yearly-Pro | Both | — |
| Tool breadth — referrals | 2 tools: referral overview, referral code | Free | Both | — |
| Tool breadth — subscriptions | 2 tools: subscription overview, manage subscription | Free | Both | — |
| Tool breadth — API keys | 2 tools: get, manage keys | Pro (API keys are Pro) | Both | — |
| Tool breadth — support & account | 2 tools: send support request, manage account | Free | Both | — |
| Tool breadth — gamification | 1 tool: gamification overview | Free | Both | — |
| Tool breadth — feature help | 1 tool: describe an Orbit feature | Free | Both | — |
| Voice input | Speak instead of type; transcribed via `POST /chat/transcribe`; per-language flag picker | Free (counts as an AI message) | Both | Multi-language transcription |
| Image analysis | Photograph a schedule/to-do/calendar; Astra extracts habits for review (vision turns skip tools) | Free (counts as an AI message) | Both | — |
| Smart reschedule | Astra analyzes your routine and suggests better times/days | Pro | Both | — |
| Proactive check-ins | Astra-initiated nudges | Pro | Both | — |
| Daily message cap + ad top-up | 5/day free, 50/day Pro, reset at local midnight; rewarded ad grants +5, cap 3/day | Free / Pro; ads free-non-trial only | Both | — |

---

## MCP / Automation

Orbit's MCP server lets external assistants (Claude, ChatGPT, any MCP client) drive your account. Endpoint `POST /mcp` (`orbit-api/.../WebApplicationExtensions.cs`). Tools defined in `orbit-api/src/Orbit.Api/Mcp/Tools/*.cs` — **79 `[McpServerTool]` methods across 15 tool classes**.

**MCP access is effectively Pro-gated:** a working credential requires an API key, and API-key create/read/manage is a Pro capability (`PayGateService.cs` → `CanReadApiKeys`/`CanManageApiKeys`). OAuth is also supported for dynamic client registration.

| Feature | Description | Gating | Platform | Locale notes |
|---|---|---|---|---|
| MCP server endpoint | `POST /mcp` — connect any MCP-capable assistant to your Orbit account | Pro (needs an API key) | Both (server-side; setup UI in AI Settings) | — |
| Habit tools | 22 tools — the largest surface: create/update/log/skip/reorder/move, sub-habits, checklists, metrics | Pro (via key); actions inherit feature gates | Both | — |
| Goal tools | 11 tools — create, query, update, status, progress, link | Pro | Both | — |
| Agent-ops tools | 8 tools — batched/agentic operations and clarification handling | Pro | Both | — |
| Notification tools | 7 tools — read and manage reminders | Pro | Both | — |
| Profile tools | 7 tools — profile and preference reads/writes | Pro | Both | — |
| Tag tools | 5 tools — full tag CRUD and assignment | Pro | Both | — |
| Subscription tools | 4 tools — subscription state and management | Pro | Both | — |
| Checklist-template tools | 3 tools — reusable checklist templates | Pro | Both | — |
| Gamification tools | 3 tools — XP, levels, achievements, streaks reads | Pro | Both | — |
| API-key tools | 2 tools — manage keys from within MCP | Pro | Both | — |
| Calendar tools | 2 tools — calendar overview and sync | Pro | Both | — |
| Account tools | 1 tool — account-level operations | Pro | Both | — |
| Feature tools | 1 tool — feature discovery/description | Pro | Both | — |
| Support tools | 1 tool — submit support requests | Pro | Both | — |
| Auth: OAuth 2.0 | Dynamic client registration (`OAuthController.cs`) | Pro | Both | — |
| Auth: API keys | Scoped, BCrypt-hashed keys (`ApiKeyAuthenticationHandler.cs`); read-only or full, per-scope, revocable | Pro | Both (managed in AI Settings) | — |

---

## Sharing & Growth

| Feature | Description | Gating | Platform | Locale notes |
|---|---|---|---|---|
| Milestone sharing | Share a milestone card on a big streak/achievement | Free | Both | — |
| Referral / invite links | Personal invite link; referrals grow the community (`r/[code]`) | Free | Both | — |

---

## Habits & Tracking

Core tracker. Caps in `AppConstants.cs` (e.g. sub-habits max 20, depth max 5, tags/habit max 5).

| Feature | Description | Gating | Platform | Locale notes |
|---|---|---|---|---|
| Create habits | Name, description, frequency; via form or Astra | Free; the 1000 top-level ceiling is an abuse guard on every plan | Both | — |
| AI habit setup suggestion | "Suggest with AI" from the create or edit modal fills emoji, cadence, due time, and checklist from the habit name (create also proposes sub-habits) | Free; AI usage metered, over-limit blocked server-side (no client Pro-gate) | Both | — |
| Frequencies & scheduling | Daily, weekly-on-days, monthly, yearly | Free | Both | — |
| Flexible habits | Complete X times per week/month, no fixed days | Free | Both | — |
| General habits | No schedule, always visible | Free | Both | — |
| One-time tasks | Single-date tasks with no recurrence | Free | Both | — |
| Sub-habits | Break a habit into independently-completable steps | Pro | Both | — |
| Checklists | Per-habit item lists; auto-reset on log; saveable as templates | Free | Both | — |
| Logging & skip | Tap to complete/undo; skip preserves streak | Free | Both | — |
| Bad-habit tracking | Track habits to quit; streak counts clean days | Free | Both | — |
| Slip alerts | AI nudges before predicted slip times on bad habits | Pro | Both | — |
| Metrics & streaks | Current/best streak, weekly/monthly rates, totals | Free | Both | — |
| Drag & drop ordering | Reorder habit cards; order persists | Free | Both | — |
| End dates | Optional stop date on recurring habits | Free | Both | — |
| Goal linking | Link habits to goals for adherence tracking | Free | Both | — |
| Tags on cards | Color-coded tag badges on habit cards | Free | Both | — |
| Bulk actions | Multi-select to log/skip/delete (max 100/op) | Free | Both | — |
| Search & filters | Search by name, filter by frequency | Free | Both | — |
| AI daily summary card | AI summary card atop Today | Pro | Both | — |
| Reminders | Relative or scheduled per-habit push reminders | Free | Both | — |
| Duplicate habits | Clone a habit with all settings | Free | Both | — |
| Date navigation | Move between days; surfaces overdue habits | Free | Both | Overdue = DueDate < today |
| Show general on Today | Toggle general habits into the Today view | Free | Both | — |

---

## Goals

**Goals are free.** `CanAccessGoals` no longer exists in `PayGateService.cs`; the only gated goal
operation is the AI review (`CanUseGoalReview`), which two call sites check: `GetGoalReviewQuery` and
the Astra `GoalReviewTool`. Caps: max 10 goals/habit, 20 habits/goal.

| Feature | Description | Gating | Platform | Locale notes |
|---|---|---|---|---|
| Create goals | Title, target value, unit, optional deadline | Free | Both | — |
| Track progress | Update current value, notes, full history | Free | Both | — |
| Link habits | Connect habits for adherence tracking | Free | Both | — |
| Metrics dashboard | Velocity, projected completion, on-track/at-risk/behind | Free | Both | — |
| AI goal review | AI analysis of what's working and what needs attention | Pro | Both | — |
| Lifecycle | Active → completed → abandoned states | Free | Both | — |

---

## Calendar

Calendar integration is Pro (`PayGateService.CanAccessCalendar`). Max sync window 30 days; range cap 62 days.

| Feature | Description | Gating | Platform | Locale notes |
|---|---|---|---|---|
| Color-coded month view | Green all-done, orange missed, purple upcoming, dot indicator | Free (viewing your own data) | Both | — |
| Day details | Tap a day for scheduled habits and their status | Free | Both | — |
| Month navigation | Move between months; jump to current | Free | Both | — |
| Streak/pattern view | Completion patterns over time | Free | Both | — |
| Google Calendar import | Import events as one-time habits; auto-sync | Pro | Both | — |

---

## Gamification & Rewards

XP/gamification is **Free**, enabled by a feature flag (migration `EnableGamificationFreeTierFlag`), **not** PayGate-gated. Streak-freeze constants: 3/month, 7 days each (`AppConstants.cs`).

| Feature | Description | Gating | Platform | Locale notes |
|---|---|---|---|---|
| XP & levels | Earn XP for completing habits/goals; level up | Free | Both | — |
| Achievements & badges | Unlock badges for streaks, consistency, milestones | Free | Both | — |
| Streaks | Current and best streak per habit | Free | Both | — |
| Streak freeze | Shields a streak on a missed day; limited per month | Free | Both | — |
| Celebration overlays | Milestone/achievement celebration animations | Free | Both | — |
| Orbit Wrapped | Shareable recap of best streaks, wins, and stats | Free | Both | — |

---

## Widget

| Feature | Description | Gating | Platform | Locale notes |
|---|---|---|---|---|
| Home-screen widget | Today's habits at a glance — status, due times, checklist; rolls to tomorrow when today is empty | Free | **Mobile-only (Android)** — no web or iOS widget | App-fed, cache-first |

---

## Notifications

| Feature | Description | Gating | Platform | Locale notes |
|---|---|---|---|---|
| Notification bell | In-app notification center with unread indicator | Free | Both | — |
| Manage notifications | Mark read, delete, bulk actions | Free | Both | — |
| Configure reminders | Per-habit reminder times (at-time, minutes/hours, up to 1 day before) | Free | Both | — |
| Push notifications | Toggle push; test button; reminders delivered as push | Free | Both | Max 5 push subscriptions/user |

---

## Insights & Analytics

| Feature | Description | Gating | Platform | Locale notes |
|---|---|---|---|---|
| Insights dashboard | Completion trends, goal velocity, progress charts over custom ranges | Pro | **Web-only** (`/insights`) — no mobile screen (genuine platform gap) | Paywalled for non-Pro |

---

## Billing & Plans

| Feature | Description | Gating | Platform | Locale notes |
|---|---|---|---|---|
| Free tier | 5 AI msgs/day, goals, core tracking, gamification, milestone sharing, referrals | Free | Both | — |
| 7-day trial | Full Pro access (except Retrospective); set at signup, no card | Trial | Both | — |
| Orbit Pro | 50 AI msgs/day, sub-habits, calendar, daily summary, AI goal review, API keys/MCP, AI memory, proactive check-ins, slip alerts, all color schemes | Pro | Both | — |
| Yearly Pro | Everything in Pro **plus** the AI Retrospective | Yearly-Pro | Both | — |
| AI Retrospective | AI analysis over week/month/quarter/year | **Yearly-Pro only** | Both | — |
| Purchase — mobile | Play Billing (native verify + RTDN); backend is source of truth | — | Mobile | — |
| Purchase — web | Stripe checkout | — | Web | — |
| Rewarded ads | +5 AI messages per rewarded ad, cap 3/day | Free non-trial only | Both | Pro/trial never see ads |
| Min-version gate | Below `AppConfig.MinSupportedVersion` → 426; mobile hard-blocks, web shows refresh banner | — | Both | — |

---

## Settings & Account

| Feature | Description | Gating | Platform | Locale notes |
|---|---|---|---|---|
| Color scheme | 6 accent schemes (purple, blue, green, rose, orange, cyan) × dark/light | Free base; premium schemes Pro | Both | — |
| Language | English / Brazilian Portuguese; app, AI, and emails follow | Free | Both | Full en + pt-BR parity |
| AI daily summary toggle | Enable the Today summary card | Pro | Both | — |
| Marketing email consent | One-time opt-in prompt + "Product updates by email" toggle; consent stored in-app (DB is the source of truth for the code-based sender), self-hosted unsubscribe flips it back | Free | Both | en + pt-BR |
| Timezone | Auto-detected; drives due dates and "today" | Free | Both | — |
| Week start day | Monday or Sunday across all calendars | Free | Both | — |
| Support | Contact form from Profile | Free | Both | — |
| Delete account | In-app account deletion | Free | Both (in-app modal); web also has a public `/delete-account` compliance page | — |
| Explore | Discovery surface | Free | Web-only route; mobile folds it into Profile | — |

---

## Auth

| Feature | Description | Gating | Platform | Locale notes |
|---|---|---|---|---|
| Onboarding before auth | Pre-auth setup (habits, first log, optional goal, week-start/color prefs) buffered locally; signup is the final "save your plan" step, applied server-side exactly once | Free | Both | en + pt-BR |
| Import from another app | One-time post-login prompt to hand an existing routine to Astra | Free | Both | en + pt-BR |
| Email code login | Passwordless email verification code (max 3 attempts/15 min) | Free | Both | — |
| Google sign-in | OAuth via Google | Free | Both | — |
| Session — web | httpOnly, sameSite-strict, secure cookie via BFF | — | Web | — |
| Session — mobile | JWT in SecureStore (never AsyncStorage) | — | Mobile | — |

---

## Legal / Public pages

Play-required public URLs — they look unused in-app but must never be deleted.

| Feature | Description | Gating | Platform | Locale notes |
|---|---|---|---|---|
| Terms of Service | Public `/terms` | Free | Both | en + pt-BR |
| Privacy Policy | Public `/privacy` | Free | Both | en + pt-BR |
| Delete-account page | Public `/delete-account` (Play compliance) | Free | Web-only public page | — |
| About / Feature Guide | In-app guide covering Astra, Connect, Habits, Goals, Calendar, Rewards, Settings, Notifications | Free | Both | Fully i18n-driven (en + pt-BR) |
| Public referral landing | `r/[code]` invite entry point | Free | Both | — |

---

*Counts and gating in this document are verified against `orbit-api` source: `PayGateService.cs`, `AppConstants.cs`, `ServiceCollectionExtensions.AiServices.cs` (61 AI tools), and `Mcp/Tools/*.cs` (79 MCP tools across 15 classes). Re-verify against source before restating a gating claim.*
