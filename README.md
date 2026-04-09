# Orbit

Orbit is a personal habit tracker built around one question: what matters today, and how do you keep the momentum going tomorrow?

The product combines daily habit tracking, streaks, goals, reminders, AI assistance, and calendar context into one experience across web and mobile.

## Product Highlights

- Track recurring habits, one-time tasks, general habits, and bad habits in the same system.
- Break bigger routines into sub-habits and checklists so progress feels concrete.
- Stay focused on the day with due, overdue, and upcoming habits in a today-first flow.
- Build momentum with streaks, streak freezes, achievements, XP, levels, and goals.
- Get reminders through push notifications, plus Android home screen widget support.
- Add schedule context by importing Google Calendar events into Orbit.
- Use AI features like chat, daily summaries, retrospectives, memory, and slip alerts.

## Product Principles

- Orbit is cross-platform: the web and mobile apps are meant to behave the same way.
- Orbit is privacy-conscious: habit data and conversations are used to provide the service, not to train AI models.
- Orbit is built for long-term consistency, not just checking boxes for a day.

## Platforms

| Platform | What it covers |
| --- | --- |
| Web | Full browser experience with server actions, BFF proxying, and push notifications |
| Mobile | Native Expo app with direct API access, offline-oriented storage, and device integrations |

## This Repository

This repo is the product frontend monorepo. The backend lives in a separate `orbit-api` codebase.

| Workspace | Purpose | Main tech |
| --- | --- | --- |
| `apps/web` | Browser app | Next.js 16, React 19, App Router |
| `apps/mobile` | Native app | Expo 55, React Native 0.83, Expo Router |
| `packages/shared` | Shared product logic | Zod schemas, API paths, query keys, i18n, theme, validation |

```text
apps/
  mobile/    Mobile product
  web/       Web product
packages/
  shared/    Shared domain logic and UI-facing contracts
```

## Running It Locally

### Prerequisites

- Node.js 20 or newer
- npm 11 or newer
- The separate `orbit-api` service if you want local backend access
- Expo tooling plus Android Studio and/or Xcode for native development

### Install

```bash
npm install
```

### Start

Run the web app:

```bash
npm run web
```

Run the mobile app:

```bash
npm --workspace @orbit/mobile run dev
```

Run every workspace `dev` task through Turbo:

```bash
npm run dev
```

## Environment

The codebase currently expects these variables when you want to override defaults:

- `API_BASE` for the web app backend URL. It falls back to `http://localhost:5000`.
- `EXPO_PUBLIC_API_BASE` for the mobile app backend URL. It falls back to the production API, so set this explicitly for local mobile development.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for web Supabase config.
- `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for mobile Supabase config.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` for web push notifications.
- `EXPO_PUBLIC_PROJECT_ID` for Expo push when you need to override the EAS project id.

## Common Commands

| Command | What it does |
| --- | --- |
| `npm run build` | Build all workspaces |
| `npm run dev` | Run all workspace `dev` tasks |
| `npm run lint` | Run lint tasks across workspaces |
| `npm run type-check` | Run TypeScript checks across workspaces |
| `npm run test` | Run unit tests across workspaces |
| `npm run test:e2e` | Run end-to-end tests through Turbo |

Useful workspace commands:

```bash
npm --workspace @orbit/web run test
npm --workspace @orbit/web run test:e2e

npm --workspace @orbit/mobile run android
npm --workspace @orbit/mobile run ios
npm --workspace @orbit/mobile run android:apk

npm --workspace @orbit/shared run test
```

## Contributing Notes

- Keep product behavior aligned between `apps/web` and `apps/mobile`.
- Put shared business rules, schemas, API contracts, and validation in `packages/shared` when possible.
- Keep user-facing strings in the i18n files instead of hardcoding copy.
