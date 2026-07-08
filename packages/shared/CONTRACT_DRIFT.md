# Contract-drift gate

The `Contract Drift` CI job (`.github/workflows/test.yml`) catches when the
`orbit-api` OpenAPI contract has moved away from the version this consumer last
captured. It regenerates a Zod snapshot with [orval](https://orval.dev) from
orbit-api `main`'s committed `openapi.json` and fails if the fresh output differs
from the committed snapshot at `src/types/__generated__/api.generated.ts`.

The hand-written Zod in `src/types/*` stays the sole runtime source of truth. The
generated file is **never imported** — it is a diff target only (excluded from the
barrel, from `tsc`, from ESLint, and from coverage). The gate detects _"the spec
moved"_, not _"the hand-written schema matches the spec"_; that reconciliation is
the human step this failure prompts.

## When the gate fails on your PR

The API spec changed since the snapshot was last re-baselined. Do this:

1. Review the `orbit-api` change that moved the spec.
2. If the part of the contract you actually consume changed (a field you read was
   added / renamed / retyped), hand-update the matching Zod schema in
   `src/types/*` — following the append-only, deploy-API-first contract rules in
   the root `CLAUDE.md`.
3. Re-baseline the snapshot and commit it:
   ```bash
   npm run generate:zod -w @orbit/shared
   git add packages/shared/src/types/__generated__/api.generated.ts
   ```

## Regenerating locally

`npm run generate:zod -w @orbit/shared` fetches the spec from orbit-api `main`:
`https://raw.githubusercontent.com/thomasluizon/orbit-api/main/src/Orbit.Api/openapi.json`
(this is what CI uses).

To regenerate against a local `orbit-api` checkout instead of `main`, point
`ORBIT_OPENAPI_SPEC` at its `openapi.json`:

```bash
ORBIT_OPENAPI_SPEC=/path/to/orbit-api/src/Orbit.Api/openapi.json \
  npm run generate:zod -w @orbit/shared
```

Output is byte-deterministic: orval is pinned via the lockfile, the Zod target is
pinned (`override.zod.version: 4`), and `.gitattributes` forces LF so Windows and
Linux CI produce identical bytes.

## Dependency pins that keep orval runnable

Two pins in the **root** `package.json` `devDependencies` exist solely so orval's
transitive tools resolve the majors they need (both are hoisted next to older
majors used elsewhere in the monorepo). Do not remove them:

- `ajv@^8.20.0` — orval's `@scalar/openapi-parser` → `ajv-draft-04` hard-requires
  `ajv/dist/core` (ajv 8). Without this, eslint's `ajv@6` wins the root slot and
  orval crashes. eslint keeps its own nested `ajv@6`.
- `commander@~15.0.0` — orval's typed CLI (`@commander-js/extra-typings@15`) needs
  a `commander@15` peer. Without this, `expo-modules-autolinking`'s `commander@7`
  wins the root slot (no `.conflicts()`) and the orval CLI crashes.
  `expo-modules-autolinking` keeps its own nested `commander@7`.

## Cross-repo coupling

The fetch URL is the single coupling point with `orbit-api` (paired: api #296,
which emits and commits `src/Orbit.Api/openapi.json`). Until #296 is merged the raw
`main` URL 404s, so the `generate:zod` step **errors and the job fails** on any run
— which self-enforces the required ordering: **#296 must merge before #419**. The
committed snapshot was generated from #296's spec, so the gate turns (and stays)
green the moment #296 lands. Only after that should `Contract Drift` be added to
`main`'s required status checks.
