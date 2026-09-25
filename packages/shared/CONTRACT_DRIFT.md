# Contract drift

The `Contract Drift` pull request job in `.github/workflows/test.yml` regenerates
`src/types/__generated__/api.generated.ts` from the orbit-api commit recorded in
`src/types/__generated__/api.spec.commit`. The two files must agree. A later
orbit-api merge cannot change the result of an existing UI pull request.
UI `main` pins orbit-api `main`. UI `redesign/main` pins orbit-api
`redesign/main`.

The generated file is a diff target only. It is excluded from the barrel, `tsc`,
ESLint, and coverage. The hand-written Zod schemas in `src/types/*` remain the
runtime contract. Review the generated diff before updating those schemas. Follow
the append-only and deploy-API-first rules in the root `CLAUDE.md`.

## Rebaseline pull requests

The default branch copy of `.github/workflows/contract-rebaseline.yml` runs every
six hours and on `orbit-api-contract-drift` `repository_dispatch`. It compares
UI `main` with orbit-api `main` and uses the single `chore/contract-snapshot`
pull request.

GitHub only runs scheduled workflows on the default branch. To rebaseline
`redesign/main`, dispatch the existing `Redesign drift control` workflow against
that ref:

```bash
gh workflow run redesign-drift.yml --ref redesign/main
```

The redesign workflow calls `.github/workflows/contract-rebaseline.yml` at the
same commit. It compares the pinned spec with orbit-api `redesign/main` and
opens or updates one `chore/contract-snapshot-redesign` pull request against UI
`redesign/main`. It never pushes to either base branch. Both jobs regenerate
with `orval@8.37.0`. A spec change that produces identical Zod output still
updates the pin, so the review shows that the spec moved.

Review that pull request's generated diff. If the consumed contract changed,
update the matching hand-written Zod schemas in the shared package before
merging. The `GITHUB_TOKEN` needs `contents: write` and
`pull-requests: write`; the repository's Actions setting must allow GitHub
Actions to create pull requests. A pull request opened with `GITHUB_TOKEN` may
require approval before its checks run.

## Regenerating locally

Read the full SHA from `src/types/__generated__/api.spec.commit`, download that
commit's `src/Orbit.Api/openapi.json`, and run orval from `packages/shared`:

```bash
pin=$(cat src/types/__generated__/api.spec.commit)
curl -fsSL "https://raw.githubusercontent.com/thomasluizon/orbit-api/$pin/src/Orbit.Api/openapi.json" -o /tmp/orbit-openapi.json
ORBIT_OPENAPI_SPEC=/tmp/orbit-openapi.json npx --yes orval@8.37.0 --config ./orval.config.ts
```

To adopt a newer API spec, change the pin to its full commit SHA, download that
commit's spec, regenerate, and commit the pin and snapshot together. The same
`ORBIT_OPENAPI_SPEC` variable can point at a local spec for investigation, but
the committed snapshot must regenerate from the pinned commit.

Output is byte-deterministic: orval is pinned at `8.37.0`, the Zod target uses
`override.zod.version: 4`, and `.gitattributes` forces LF line endings.

## Dependency pins that keep orval runnable

Two root `package.json` development dependencies keep orval's transitive tools
on their required majors:

- `ajv@^8.20.0` supplies `ajv/dist/core` to orval's
  `@scalar/openapi-parser` and `ajv-draft-04`. ESLint keeps its nested `ajv@6`.
- `commander@~15.0.0` supplies orval's typed CLI. Expo autolinking keeps its
  nested `commander@7`.
