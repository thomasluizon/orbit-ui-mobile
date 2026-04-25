# Orbit

Personal habit tracker. Turborepo monorepo: Next.js 15 (web) + Expo/React Native (mobile) + @orbit/shared.

## For Agents Working on This Codebase

### Quick Orientation

- **Monorepo** managed by Turborepo. Three workspaces: `apps/web`, `apps/mobile`, `packages/shared`.
- **Shared package** (`@orbit/shared`) contains all types (Zod schemas), utils, i18n locales, theme data, API endpoint constants, TanStack Query key factories, and form validation schemas. Both apps import from it.
- **Web app** uses Next.js 15 App Router with Server Components by default. Client components marked with `"use client"`. State: Zustand (client) + TanStack Query (server). Auth via httpOnly cookies + BFF proxy.
- **Mobile app** uses Expo SDK 53 + Expo Router. Auth via SecureStore. Direct API calls (no BFF). SQLite offline queue.
- **API** is a separate .NET 10 codebase at `C:\Users\thoma\Documents\Programming\Projects\orbit-api`. OpenCode is usually launched from `C:\orbit`, but agents may read and edit this API repository whenever a request needs backend/API changes.

### API Repository Access

- Treat `C:\Users\thoma\Documents\Programming\Projects\orbit-api` as part of the Orbit working context when needed.
- If a feature requires backend support, update the API repository in the same task instead of stopping at frontend-only changes.
- Keep frontend and API contracts aligned: update shared endpoints, Zod types, request/response handling, and API implementation together when required.
- Do not invent API fields or behavior. Inspect and modify the API repository directly when backend support is needed.
- Preserve separate git histories: edits in `C:\orbit` and `orbit-api` belong to different repositories.

### Key Files

| What | Where |
|------|-------|
| Design system (CSS tokens) | `apps/web/app/globals.css` |
| Auth middleware | `apps/web/middleware.ts` |
| BFF catch-all proxy | `apps/web/app/api/[...path]/route.ts` |
| Server Actions (mutations) | `apps/web/app/actions/*.ts` |
| TanStack Query hooks | `apps/web/hooks/use-*.ts` |
| Zustand stores | `apps/web/stores/*-store.ts` |
| All Zod types | `packages/shared/src/types/*.ts` |
| API endpoint paths | `packages/shared/src/api/endpoints.ts` |
| Query key factories | `packages/shared/src/query/keys.ts` |
| Color scheme data | `packages/shared/src/theme/color-schemes.ts` |
| i18n locales | `packages/shared/src/i18n/en.json`, `pt-BR.json` |

### Conventions

- Zero `any`. Use `unknown` with narrowing.
- No `console.log` in production code.
- Named exports only. `kebab-case` filenames, `PascalCase` components.
- Server Components by default. `"use client"` only for hooks/events/browser APIs.
- Import types from `@orbit/shared/types`. Import query keys from `@orbit/shared/query`.
- All user-facing strings through i18n. Never hardcode display text.
- All mutations through Server Actions (web) or apiClient (mobile).
- Auth cookie: httpOnly, sameSite strict, secure always.

### Frontend Website Rules

#### Always Do First

- **Invoke the `frontend-design` skill** before writing any frontend code, every session, no exceptions.

#### Reference Images

- If a reference image is provided: match layout, spacing, typography, and color exactly. Swap in placeholder content with images via `https://placehold.co/` and generic copy. Do not improve or add to the design.
- If no reference image is provided: design from scratch with high craft using the guardrails below.
- Screenshot the output, compare against the reference, fix mismatches, and re-screenshot. Do at least 2 comparison rounds. Stop only when no visible differences remain or the user says so.

#### Local Server

- Always serve on localhost. Never screenshot a `file:///` URL.
- Start the dev server with `node serve.mjs`, which serves the project root at `http://localhost:3000`.
- `serve.mjs` lives in the project root. Start it in the background before taking screenshots.
- If the server is already running, do not start a second instance.

#### Screenshot Workflow

- Puppeteer is installed at `C:/Users/nateh/AppData/Local/Temp/puppeteer-test/`. Chrome cache is at `C:/Users/nateh/.cache/puppeteer/`.
- Always screenshot from localhost with `node screenshot.mjs http://localhost:3000`.
- Screenshots are saved automatically to `./temporary screenshots/screenshot-N.png`, auto-incremented and never overwritten.
- Optional label suffix: `node screenshot.mjs http://localhost:3000 label` saves as `screenshot-N-label.png`.
- `screenshot.mjs` lives in the project root. Use it as-is.
- After screenshotting, read the PNG from `temporary screenshots/` with the Read tool so the agent can see and analyze the image directly.
- When comparing, be specific: for example, "heading is 32px but reference shows ~24px" or "card gap is 16px but should be 24px".
- Check spacing and padding, font size, weight, line-height, colors with exact hex values, alignment, border radius, shadows, and image sizing.

#### Output Defaults

- Single `index.html` file with all styles inline unless the user says otherwise.
- Tailwind CSS via CDN: `<script src="https://cdn.tailwindcss.com"></script>`.
- Placeholder images: `https://placehold.co/WIDTHxHEIGHT`.
- Mobile-first responsive.

#### Brand Assets

- Always check the `brand_assets/` folder before designing. It may contain logos, color guides, style guides, or images.
- If assets exist there, use them. Do not use placeholders where real assets are available.
- If a logo is present, use it. If a color palette is defined, use those exact values. Do not invent brand colors.

#### Anti-Generic Guardrails

- Colors: never use the default Tailwind palette such as `indigo-500` or `blue-600` as the primary color. Pick a custom brand color and derive from it.
- Shadows: never use flat `shadow-md`. Use layered, color-tinted shadows with low opacity.
- Typography: never use the same font for headings and body. Pair a display or serif with a clean sans. Apply tight tracking such as `-0.03em` on large headings and generous line-height such as `1.7` on body text.
- Gradients: layer multiple radial gradients. Add grain or texture via SVG noise filter for depth.
- Animations: only animate `transform` and `opacity`. Never use `transition-all`. Use spring-style easing.
- Interactive states: every clickable element needs hover, focus-visible, and active states. No exceptions.
- Images: add a gradient overlay such as `bg-gradient-to-t from-black/60` and a color treatment layer with `mix-blend-multiply`.
- Spacing: use intentional, consistent spacing tokens, not random Tailwind steps.
- Depth: surfaces should have a layering system from base to elevated to floating, not all sit at the same z-plane.

#### Hard Rules

- Do not add sections, features, or content not in the reference.
- Do not improve a reference design. Match it.
- Do not stop after one screenshot pass.
- Do not use `transition-all`.
- Do not use default Tailwind blue or indigo as the primary color.

### Testing

- Unit: Vitest + React Testing Library. Config: `apps/web/vitest.config.ts`
- E2E: Playwright. Config: `apps/web/playwright.config.ts`
- Test factories: `packages/shared/src/__tests__/factories.ts`
- Run: `npx vitest run` (unit), `npm run test:e2e` (E2E)

### Cross-Platform Parity (MANDATORY)

**Every change MUST be applied to BOTH web and mobile.** No exceptions. A task is NOT complete until both platforms are updated.

- Modifying a hook in `apps/web/hooks/`? Update the equivalent in `apps/mobile/hooks/`.
- Adding a feature to a web page? Add it to the mobile screen too.
- Fixing a bug in mobile? Check and fix the same bug in web.
- Adding i18n keys? Both platforms must use them.
- Changing validation logic? It must live in `packages/shared/` or be duplicated identically.

The only differences allowed are platform adapters (BFF vs direct API, cookie vs SecureStore, shadcn vs NativeWind, next-intl vs i18next). Logic, features, behavior, data flow, and error handling must be identical.

**Before marking any task done, verify:** "Did I update both apps/web and apps/mobile?"

### Common Tasks

**Add a new page:** Create `apps/web/app/(app)/my-page/page.tsx` AND `apps/mobile/app/my-page.tsx` + register in `_layout.tsx`. Both must have the same features, states, and behavior.

**Add a new API endpoint:** Add path to `packages/shared/src/api/endpoints.ts`. Create Server Action in `apps/web/app/actions/`. Create direct API call in `apps/mobile/`. Add query key to `packages/shared/src/query/keys.ts` if it's a query.

**Add a new type:** Create Zod schema in `packages/shared/src/types/`. Export from `index.ts`. Both apps get it automatically.

**Add a new component:** Create in `apps/web/components/<feature>/` AND create parallel in `apps/mobile/components/`. Same features, same states, same logic.

**Add a new hook:** Create in `apps/web/hooks/` AND `apps/mobile/hooks/`. Same query keys, same data transformations, same error handling. Platform-specific differences only for auth headers and fetch implementation.

**Fix a bug:** Fix in the app where it was found, then check and fix in the other app too.
