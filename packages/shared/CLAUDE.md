# packages/shared

Pure TypeScript that `apps/web` and `apps/mobile` both import. `shared-import-boundary.test.ts` enforces that it holds no React, Next.js or React Native import.

- Zod schemas in `types/<domain>.ts` are the contract with `orbit-api`. If the API returns a field, the schema declares it. If the API does not return a field, the schema does not declare it. Call `.parse` at trust boundaries only.
- `api/endpoints.ts` is the single source of API paths. Add a new path there first, then the `orbit-api` route, then the Zod schema, then the web Server Action and the mobile `apiClient` call.
- `en.json` and `pt-BR.json` hold the same keys. The `i18n key usage` CI job fails on a missing key.
- `theme/color-schemes.ts`, `theme/neutral-ramp.ts` and `theme/type-roles.ts` hold the color and type tokens. Web reads them through `app/globals.css` and `lib/theme-dom.ts`. Mobile reads them through `createTokensV2()` in `apps/mobile/lib/theme.ts`.
- `GET /api/config` needs authorization. A signed-out client gets 401 and falls back to `DEFAULT_CONFIG`. Retrospective access comes from the API setting, never from hard-coded Pro access.
- A streak freeze is banked automatically and spent by hand. `RepairableGapDates` does not depend on the freeze bank.
- Account deletion deactivates the account for a bounded grace period, and sign-in cancels it. Never claim that deletion has no recovery.
