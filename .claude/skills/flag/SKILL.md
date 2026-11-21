---
name: flag
description: Inspect or change Orbit feature flags in production or staging from plain requests such as turning a feature on for an account or finding who has a feature. Uses the admin-only Orbit MCP tool manage_feature_flags.
---

# Flag

Operate flags for the owner through Orbit MCP. Do not change database rows, cookies, builds or PostHog settings to fulfill a flag request.

The API stores flags and account targets in the Orbit database. Production and staging keep separate state. A flag resolves on for an account when `(enabled for everyone OR account is targeted) AND account meets the plan requirement`. `GET /api/config` returns the resolved `features` map of the caller.

## Establish the request

Use the environment that the request names or the session already holds. Name **production** or **staging** in every update and result. If neither is known, ask which one. Check that the MCP connection belongs to that environment, because an action has no environment argument.

Discover `manage_feature_flags` and read its current input schema. It needs an admin credential. If it is missing or denied, stop and report the environment and the access problem. Never switch environments or bypass MCP.

## List, identify, act, verify

1. Call `manage_feature_flags` with `action: "list"` first. Keep the description, the global setting, the account emails and the plan requirement of the target flag as the before state. Ask about an ambiguous match. Never invent a key or silently create a flag.
2. Resolve each target to an exact email. For "me", use the profile that an Orbit read tool returns, and only when it is the owner. Otherwise ask. The list holds targeted accounts only, so an email that is absent is not unknown. The tool validates a new email and rejects a batch with an unknown email.
3. Map the request with the table below. A clear request authorizes that change. Use only parameters that the discovered schema confirms. If the tool asks for confirmation, follow its flow and retry the same arguments with the token. Never report a pending operation as applied.
4. After every write, list again on the same connection, also after an error. Check the final state and the exact emails. Stop on an error, an unknown email or a mismatch, and report the completed part. After a timeout, read the list before a retry.
5. Report the environment, the key, the before and after global setting and emails, and any plan restriction. A verified write does not prove that a client refreshed its config.

| Request | Action and parameters |
|---|---|
| "Who has the new calendar?", "list flags" | `list`; report the key, the global setting, the emails and the plan requirement. No write. |
| "Turn calendar_integration on for me", "enable X for these emails" | `enable_for_accounts`, `key`, `emails`. Verify each email appears afterward. |
| "Turn X off for these emails" | `disable_for_accounts`, `key`, `emails`, when global enablement is off. Verify those emails are absent. |
| "Turn X on for everyone" | `enable_for_everyone`, `key`. Verify global enablement is on. |
| "Turn X off for everyone" | `disable_for_everyone`, `key`, then `disable_for_accounts` for the emails left in the fresh list. Verify the setting is off and the list is empty. |
| "Create a flag" | `create`, `key`, one-line `description`. Verify the key is absent first, then that it exists and is globally off. Creation adds no feature code. |

Global enablement and account targeting are additive. Removing one account while global enablement is on cannot turn the feature off for it. Explain this and ask the owner for the rollout before a broader change. "Only these accounts" needs global enablement off and the other targets removed.

## Client flags and a new flag

Both platforms call `useFlag('key')` and read the flag that the API resolved. A flag selects a code path inside one build. It never selects an API version. Unknown keys and cold starts resolve off. Keep the same key and behavior on web and Android.

To add a flag:

1. Seed a disabled `AppFeatureFlag` in `orbit-api` through a migration, in its own ticket. Deploy the API first, so `/api/config` returns the key before the client ships.
2. Read `useFlag('key')` in the owning web and Android components. Keep both branches complete.
3. Add Vitest coverage on both platforms for the enabled and the disabled path.
4. Deploy the clients, then ask `/flag` to enable the feature for exact emails. Verify both platforms before a global rollout.
5. When the feature is on for everyone, remove the conditional on both platforms. Retire the API flag through a migration after the supported clients no longer read the key.

The API version is a request contract, separate from account rollout. A breaking contract change belongs in `api-version: 2.0`. Enabling a flag never selects it.
