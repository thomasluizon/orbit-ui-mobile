---
name: add-shared-type
description: Adds a new Zod schema to `packages/shared` with cross-repo hook stubs. Use when the user asks to add a new type, schema, or DTO that needs to be shared between web and mobile.
---

# Add a shared type

Adds a new Zod schema + inferred TypeScript type to `packages/shared/src/types/`, exports it from the barrel, and stubs the consumer-side hooks in both apps so the type flows through to UI immediately.

## Inputs

- **Type name** (PascalCase, e.g. `HabitTag`, `RetrospectiveEntry`).
- **Fields** — a list of field name + Zod type pairs. Prompt the user for them if missing.
- **Domain** — which existing file in `packages/shared/src/types/` it belongs to (e.g., `habit.ts`, `profile.ts`). Create a new file only if no domain fits.

## Steps

1. **Locate the domain file.** Read `packages/shared/src/types/index.ts` to see the barrel. Read the closest domain file. If none fits, create `packages/shared/src/types/<domain>.ts`.
2. **Add the Zod schema.** Match the existing style — `export const FooSchema = z.object({...})`, then `export type Foo = z.infer<typeof FooSchema>`.
3. **Export from barrel.** Add the new type to `packages/shared/src/types/index.ts`.
4. **(If the type matches an API response)** Update or add the matching entry in `packages/shared/src/api/endpoints.ts` and `packages/shared/src/query/keys.ts`.
5. **Stub consumers** (only if the user confirms they want UI right away):
   - `apps/web/hooks/use-<resource>.ts` — TanStack Query hook returning `Foo[]` or `Foo`.
   - `apps/mobile/hooks/use-<resource>.ts` — mirror.
6. **Verify**: `npm run type-check` in each touched workspace.

## Skip

- DO NOT create files in `packages/shared/src/types/` for one-off shapes that aren't shared between apps. Those live in the consuming app.
- DO NOT add an API endpoint unless the user asked for one. The type might be purely local (e.g., a UI state shape).

## Output

Brief report of files touched + any contract change implications. If an API endpoint was added, remind the user that the orbit-api side needs the matching DTO + controller. Suggest the `add-api-endpoint` skill for full cross-repo scaffolding.
