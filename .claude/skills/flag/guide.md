# Feature flags

> **At a glance** - account targeting through `/flag`, plain and version flags, adding and
> retiring a flag, and how build selection relates to API versions.

## Operating a flag

Ask the agent in plain English: "In production, turn the redesign on for me", "In staging,
who has the new calendar?", or "In production, turn calendarSync off for everyone".
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

## Plain flags and version flags

| Kind | What the flag selects | How the client uses it |
|---|---|---|
| Plain | A code path within one build | Both platforms call `useFlag('key')`, which reads the account's API-resolved flag. |
| Version | A complete build | `redesign` selects the legacy or redesign build; the selected build determines the API version it sends. |

A plain flag uses one build and does not select an API version. Keep the same key
and behavior on web and Android. The shared resolution logic and thin platform hooks must
agree. Unknown keys and cold starts resolve off. Refreshes occur at launch, after sign-in,
and on web focus or Android foreground. Last good values belong to one account; sign-out
and account switches clear them.

`redesign` is the version flag. It selects a build rather than wrapping the whole redesign
in `useFlag` branches inside one build:

- **Web:** both builds synchronize the host-only `orbit_design` cookie with the account's
  resolved `redesign` flag. The edge router at `app.useorbit.org` serves the redesign origin
  for `orbit_design=redesign` and the legacy origin otherwise. A flag refresh updates or
  clears the cookie and reloads once when needed. Sign-out clears it. Both builds use the
  same public host and session.
- **Android:** one Play binary supports both JavaScript bundles with a compatible native
  layer and shared runtime version. At launch, the account's last known flag selects the
  `legacy` or `redesign` update channel. Legacy is embedded for fresh installs and failure
  recovery. Flag refreshes after sign-in and on foreground affect the next launch;
  sign-out returns to legacy. Switching must not create a reload loop.

Removing account targeting returns an account to legacy after refresh and reload or relaunch
only if global enablement is also off. The redesign build sends `api-version: 2.0`.
The legacy build omits the header and receives v1. Changing a flag does not publish a build,
update bundle, edge router, or API contract.

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

Version flags need their build and routing infrastructure retired as well. Do not delete
`redesign` as though it were a plain conditional while clients still select builds with it.

## API versioning and rollout prerequisites

The API version is a request contract, separate from account rollout. One API service
accepts `api-version: 1.0` and `api-version: 2.0`; no header defaults to v1. A breaking
contract change belongs in v2 while v1 keeps working for older clients. Retire v1 only
after the supported client population sends v2, using `MinSupportedVersion` to enforce
the supported mobile floor. Enabling a plain flag does not select v2.

The rollout spans separate tickets. Check their delivery and the selected environment's
deployments before treating the build switches as available:

| Capability | Delivery reference |
|---|---|
| Per-account API resolution and admin MCP management | [#1414](https://github.com/thomasluizon/orbit-tickets/issues/1414) |
| Parsed config, shared flag logic, and platform `useFlag` hooks | [#1415](https://github.com/thomasluizon/orbit-tickets/issues/1415) |
| Header versioning and v1 compatibility | [#1416](https://github.com/thomasluizon/orbit-tickets/issues/1416) |
| Web edge router and redesign origin | [#1417](https://github.com/thomasluizon/orbit-tickets/issues/1417) |
| Design cookie and web v2 headers in both builds | [#1418](https://github.com/thomasluizon/orbit-tickets/issues/1418) |
| Android native compatibility, update channels, and bundle switch | [#1419](https://github.com/thomasluizon/orbit-tickets/issues/1419) |

An admin flag change can be verified independently of those client deployments. Report
client switching as unverified when its prerequisites have not been delivered.
