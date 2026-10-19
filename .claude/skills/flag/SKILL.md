---
name: flag
description: Inspect or change Orbit feature flags in production or staging from plain requests such as turning the redesign on for an account or finding who has a feature. Uses the admin-only Orbit MCP tool manage_feature_flags.
---

# Flag

Operate flags for the owner through Orbit MCP. Read [guide.md](guide.md) for flag semantics,
build selection, adding flags, and API versions. Do not change database rows, cookies, builds,
or PostHog settings to fulfill a flag request.

## Establish the request

Use the environment explicitly named in the request or already established in the session.
Name **production** or **staging** in every progress update, clarification, and result.
If neither is established, ask which environment before calling Orbit. Verify the selected
MCP connection belongs to that environment; an action has no environment argument.

Discover `manage_feature_flags` and read its current input schema. It is admin-only and
requires a credential allowed to manage flags. If unavailable, denied, or not found, stop
and report the environment and access problem. Do not switch environments or bypass MCP.

## List, identify, act, verify

1. Always call `manage_feature_flags` with `action: "list"` first on the selected connection.
   Preserve the target flag's description, global setting, account emails, and plan requirement
   as the before state. Match the request to the returned key and description. Ask about an
   ambiguous match; never invent a key or silently create a missing flag.
2. Resolve targets to exact emails. Use emails returned by Orbit, including the listed flag's
   accounts. For "me", use the authenticated profile returned by an available Orbit read tool
   only when that identity is established as the owner; an admin connection can belong to
   someone else. Otherwise ask for the exact email. Never infer identity from a display name,
   repository owner, or local configuration. The list contains targeted accounts, not an
   account directory: absence does not mean an email is unknown. For an explicitly supplied
   email absent from the list, let the management tool validate it; do not pretend it was
   confirmed by the initial list. It resolves emails case-insensitively and rejects a batch
   with unknown emails before writing. State the environment, key, and intended emails before
   a write; confirm returned emails against those targets after it.
3. Map the request using the table below. A clear request authorizes that change. Do not ask
   for another approval unless the tool itself requires confirmation or the scope is unclear.
   Use only parameters confirmed in the discovered schema. If the tool requests confirmation
   or step-up verification, follow its returned flow and retry the same arguments only with
   the resulting token. Never report a pending operation as applied.
4. After every write, list again on the same connection, including after an error or uncertain
   response when listing remains available. Verify the requested final state and exact account
   emails from the tool's answer. For a multi-action change, use each fresh list as the next
   before state. Stop on an error, unknown email, or mismatch; report any completed portion.
   After a timeout, inspect the list before considering a retry. Do not repeat a write whose
   intended result is already present.
5. Report the environment, key, before and after global settings and account emails, and any
   plan restriction. Distinguish stored targeting from effective access. For `redesign`, explain
   that web refreshes the flag and reloads the matching build; Android applies a refreshed flag
   at the next launch. A verified flag write does not prove a client switched builds.

| Request | Action and parameters |
|---|---|
| "Who has the new calendar?", "list flags" | `list`; report the matching key, global setting, listed emails, and plan requirement. No write. |
| "Turn the redesign on for me", "enable X for these emails" | `enable_for_accounts`, `key`, `emails`. Verify each requested email appears afterward. |
| "Turn X off for these emails" | `disable_for_accounts`, `key`, `emails`, when global enablement is off. Verify those emails are absent afterward. |
| "Turn X on for everyone" | `enable_for_everyone`, `key`. Verify global enablement is on; plan requirements still apply. |
| "Turn X off for everyone" | `disable_for_everyone`, `key`, then `disable_for_accounts` for all remaining emails in the fresh list. Verify global enablement is off and the account list is empty. |
| "Create a flag" | `create`, `key`, one-line `description`. First verify the key is absent; afterward verify it exists, is globally off, and has no targeted accounts. Creation does not add feature code. |

## Scope and effective access

Global enablement and account targeting are additive. An account must also meet the plan
requirement. Removing an account while global enablement is on cannot turn the feature off
for that account. Explain this and ask the owner to choose the intended rollout before
making a broader change. Do not disable it globally to satisfy a request about one account.

"Only these accounts" requires global enablement off and removal of other targets. Treat
that as a replacement only when the request explicitly says so. Enabling an account does
not otherwise remove anyone. If the requested state already holds, report the unchanged
before and after from the list without a write.

If a final list cannot be obtained, report verification as incomplete, including any write
response and last observed state. Never claim success from the write response alone.
