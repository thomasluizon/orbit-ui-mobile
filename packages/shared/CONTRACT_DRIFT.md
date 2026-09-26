# Contract drift

The `Contract Drift` pull request job in `.github/workflows/test.yml` regenerates
`src/types/__generated__/api.generated.ts` from the orbit-api commit recorded in
`src/types/__generated__/api.spec.commit`. The two files must agree. A later
orbit-api merge cannot change the result of an existing UI pull request.

The generated file is a diff target only. It is excluded from the barrel, `tsc`,
ESLint, and coverage. The hand-written Zod schemas in `src/types/*` remain the
runtime contract. Review the generated diff before updating those schemas. Follow
the append-only and deploy-API-first rules in the root `CLAUDE.md`.

## Rebaseline pull requests

`.github/workflows/contract-rebaseline.yml` runs every six hours on the default
branch, `main`. It also accepts the `orbit-api-contract-drift`
`repository_dispatch` event. GitHub runs both triggers from the default branch;
the `redesign/main` port is separate. The `generate` job compares the committed
OpenAPI spec at the pin with orbit-api `main`. When the spec bytes differ, it
regenerates with `orval@8.37.0` and updates the pin. The `publish` job opens or
updates the single `chore/contract-snapshot` pull request against `main`. It
never pushes to `main`.
The branch name and workflow concurrency group keep repeat runs on one pull
request. A spec change that produces identical Zod output still updates the pin,
so the review shows the spec moved.

Review that pull request's generated diff. If the consumed contract changed,
update the matching hand-written Zod schemas in the shared package before
merging.

The workflow runs two jobs. The `generate` job runs `npm ci` and Orval with a
read-only token and uploads only the two generated files. The `publish` job
installs nothing and mints a repository-scoped GitHub App token with
`contents: write` and `pull-requests: write`. It uses that token to push and
open or update the pull request, so the pull request starts its checks without
manual approval. It commits and pushes with `core.hooksPath=/dev/null`, so no
install script or repository hook runs while the write token exists.

Create a GitHub App installed only on `thomasluizon/orbit-ui-mobile` with
Contents and Pull requests read/write permissions. Set its App ID as the
repository Actions variable `CONTRACT_REBASELINE_APP_ID` and its private
key as the repository Actions secret `CONTRACT_REBASELINE_APP_PRIVATE_KEY`.
The App token is minted only in `publish`; `generate` never receives either
credential. Without both settings, `publish` fails before pushing a branch.

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
