---
globs: ["apps/**/*.tsx", "apps/**/*.ts", "packages/**/*.ts"]
description: React, TypeScript, Tailwind, shadcn/ui conventions for frontend code
---

# Code Style

## React & Next.js

- Functional components only. No class components.
- React Server Components by default. `"use client"` only for hooks/events/browser APIs.
- Prefer named exports over default exports.
- File naming: `kebab-case.ts` / `kebab-case.tsx`. Components: `PascalCase` in code.
- Hooks: `use-<name>.ts`. Stores: `<name>-store.ts`.

## UI

- shadcn/ui for all primitives (Button, Input, Dialog, Drawer, Badge, etc.)
- Tailwind utility classes in JSX. Design tokens via CSS custom properties in globals.css.
- CSS utility classes: `.form-label` and `.form-input` from globals.css.
- Icons: `lucide-react` (web), `lucide-react-native` (mobile).

## Forms

- react-hook-form + Zod resolver. Shared schemas in `@orbit/shared/validation/`.
- Inline error display below fields. Submit blocked when invalid.

## TypeScript

- **Zero `any`.** Use proper types, `unknown` with narrowing.
- **Error handling:** `catch (err: unknown)`. Use `getErrorMessage()` / `extractBackendError()`.
- **Shared types:** Import from `@orbit/shared/types`. Never inline shared unions.
- **Non-null:** Prefer `?? []` over `!` assertions.
- **No `console.log/error/warn`** in production.
- **JSON:** No trailing commas.
