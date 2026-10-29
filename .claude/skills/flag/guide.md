# Feature flags

> **At a glance** - account targeting through `/flag`, adding and retiring flags, retired
> build selection, and API compatibility.

## Operating a flag

Ask the agent in plain English: "In production, turn calendar_integration on for me", "In staging,
who has the new calendar?", or "In production, turn calendar_integration off for everyone".
[The `/flag` skill](SKILL.md) maps the request to the admin-only Orbit MCP tool
`manage_feature_flags`. The owner does not edit flags by hand.

The agent names production or staging, lists first, identifies the flag and exact account
emails from Orbit's answers, changes the requested scope, then lists again and reports the
before and after. An explicitly supplied new target email is validated by the write; the
initial list is not an account directory. Unknown emails reject the whole batch. Missing
admin access stops the operation. Production and staging have independent flag state.

The API stores flags and account targets in the Orbit database. PostHog handles analytics,
not flag resolution. A flag resolves on for an account when:

```text
(enabled for everyone OR account is targeted) AND account meets the plan requirement
```

`GET /api/config` returns the calling account's resolved `features` map. Each key retains
the `{ enabled, planRequirement }` shape. Clients consume that answer rather than rebuilding
account targeting locally. Admin listings describe stored rollout settings, not proof that
every listed account meets its plan requirement or has refreshed its client.

Global disablement preserves the targeted account list. To turn a flag off for everyone,
the agent disables it globally and removes every listed target, verifying both afterward.
There is no per-account exclusion while a flag is globally enabled. Removing one target
cannot override global enablement.

The management contract is implemented in
[`FeatureFlagTools.cs`](https://github.com/thomasluizon/orbit-api/blob/1b886bdfe11bce7248d1bade793b703e6e374343/src/Orbit.Api/Mcp/Tools/FeatureFlagTools.cs),
[`FeatureFlagManagement.cs`](https://github.com/thomasluizon/orbit-api/blob/1b886bdfe11bce7248d1bade793b703e6e374343/src/Orbit.Application/FeatureFlags/FeatureFlagManagement.cs),
and [`FeatureFlagManagementService.cs`](https://github.com/thomasluizon/orbit-api/blob/1b886bdfe11bce7248d1bade793b703e6e374343/src/Orbit.Infrastructure/Services/FeatureFlagManagementService.cs).
Read the selected environment's discovered tool schema and real answers before depending
on parameter or response fields. The tool supports listing, creation, and enablement changes;
flag deletion belongs to code retirement, not an invented MCP action.

## Client flags

A flag selects a code path within one build. Both platforms call `useFlag('key')`,
which reads the account's API-resolved flag. A flag does not select an API version.
Keep the same key and behavior on web and Android. The shared resolution logic and thin
platform hooks must agree. Unknown keys and cold starts resolve off. The general config
cache and platform refresh behavior remain in place. Last good values belong to one
account; sign-out and account switches clear them.

## Retired redesign selection

The promoted redesign ships from `main` on web and Android. The `redesign` flag no longer
selects a build in these clients. Web deletes a leftover `orbit_design` cookie on the next
visit without reading a flag or reloading, and account reset also clears it. Android launches
the embedded bundle with updates disabled in production and staging; a design choice saved
by an older build is ignored. These clients no longer write design choices or select update
channels.

The API no longer has a `redesign` flag. A migration deleted its seed and account targets
after the production `MinSupportedVersion` rose to 1.3.91, which drops every build that
still read the key, so `/api/config` no longer returns `redesign`. There is no flag to list, enable
or disable for the redesign.
Web releases select production from `main` or staging from a selected branch; both serve
the promoted redesign without account-based build routing. Changing an account flag does
not publish a build or change an API contract.

## Adding a plain flag

1. Choose one key and a one-line description. Seed a disabled `AppFeatureFlag` in the API
   through a migration, using its domain factory and any required plan restriction. Keep
   API work in its own repository and ticket. Deploy the API first so the key is present
   in `/api/config` before the client feature ships. MCP `create` can create a runtime
   flag, but does not replace a durable seed or implement the feature.
2. Read `useFlag('key')` in the owning web and Android components using their platform
   hooks. Keep both branches of behavior complete and keep business logic shared. Unknown
   keys stay off; do not add an enabled placeholder or duplicate the API's targeting rules.
3. Add Vitest behavior coverage on both platforms for enabled and disabled paths. Exercise
   the owning feature's behavior, including its off path. Reuse the hook tests for account
   isolation, refresh, and failure behavior rather than copying their implementation.
4. Deploy the clients, then ask `/flag` to enable the feature for exact emails in the named
   environment. Verify targeting through MCP and feature behavior on both platforms before
   asking for a global rollout. A plan restriction still applies when enabled for everyone.
5. Once the feature is on for everyone and rollback through the flag is no longer needed,
   remove the conditional and its obsolete code branch on both platforms. Retire the API
   flag and cascading account targets through a migration after supported clients no longer
   need the key. Coordinate retirement with mobile adoption; an old build that still checks
   a deleted key resolves it off. Remove obsolete tests and documentation with the branch.

Retiring a build selector also requires retiring its routing infrastructure and accounting
for older installed clients before the API key can be removed.

## API versioning and rollout prerequisites

The API version is a request contract, separate from account rollout. One API service
accepts `api-version: 1.0` and `api-version: 2.0`; no header defaults to v1. A breaking
contract change belongs in v2 while v1 keeps working for older clients. Retire v1 only
after the supported client population sends v2, using `MinSupportedVersion` to enforce
the supported mobile floor. Enabling a plain flag does not select v2.

The flag management and API compatibility contracts are tracked separately:

| Capability | Delivery reference |
|---|---|
| Per-account API resolution and admin MCP management | [#1414](https://github.com/thomasluizon/orbit-tickets/issues/1414) |
| Parsed config, shared flag logic, and platform `useFlag` hooks | [#1415](https://github.com/thomasluizon/orbit-tickets/issues/1415) |
| Header versioning and v1 compatibility | [#1416](https://github.com/thomasluizon/orbit-tickets/issues/1416) |
| Retired redesign client readers | [#1635](https://github.com/thomasluizon/orbit-tickets/issues/1635) |
| Routing Worker retirement and API seed coordination | [#1626](https://github.com/thomasluizon/orbit-tickets/issues/1626) |
| `redesign` seed and account target removal after the 1.3.91 floor | [#685](https://github.com/thomasluizon/orbit-tickets/issues/685) |

An admin flag change can be verified independently of client deployments. Verify a flag
through the selected environment's MCP answers and its remaining client behavior.
