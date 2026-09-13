# Orbit tool inventory

> **At a glance** - the retained inventory for Astra and MCP tool counts that no generated artifact carries.
> Re-verify every count against the named `orbit-api` source before changing or restating it.

## Astra AI

Astra is the in-app assistant on the chat surface (web `/chat`, mobile `chat`). Backing tools are registered in `orbit-api/src/Orbit.Api/Extensions/ServiceCollectionExtensions.AiServices.cs` - **61 `IAiTool` implementations** total.

| Feature | Description | Gating | Platform | Locale notes |
|---|---|---|---|---|
| Conversational chat | Natural-language coach that creates, logs, updates, and explains your habits and goals | Free (5 msgs/day) · Pro (50 msgs/day) | Both | en + pt-BR; AI replies in the user's language |
| Tool breadth - habits | 14 tools: create/update/delete, log, skip, duplicate, move, reorder, sub-habits, checklist, query, metrics | Free (Pro-gated actions inherit their feature's gate) | Both | - |
| Tool breadth - habit bulk ops | 5 tools: bulk create/delete/log/skip and bulk emoji update | Free | Both | - |
| Tool breadth - goals | 10 tools: create/query/update/delete, status, progress, link habits/goals, AI review, reorder | Free, except the AI review, which is Pro | Both | - |
| Tool breadth - tags | 5 tools: assign, list, create, update, delete | Free | Both | - |
| Tool breadth - profile & preferences | 4 tools: get profile, update preferences, set color scheme, set AI summary | Free / Pro per setting | Both | - |
| Tool breadth - checklist templates | 3 tools: get, create, delete reusable templates | Free | Both | - |
| Tool breadth - notifications | 3 tools: get, update, delete reminders | Free | Both | - |
| Tool breadth - calendar | 2 tools: calendar overview, manage Google Calendar sync | Pro (calendar is Pro) | Both | - |
| Tool breadth - summary & retrospective | 2 tools: daily summary, retrospective | Pro (active trial included) | Both | - |
| Tool breadth - referrals | 2 tools: referral overview, referral code | Free | Both | - |
| Tool breadth - subscriptions | 2 tools: subscription overview, manage subscription | Free | Both | - |
| Tool breadth - API keys | 2 tools: get, manage keys | Pro (API keys are Pro) | Both | - |
| Tool breadth - support & account | 2 tools: send support request, manage account | Free | Both | - |
| Tool breadth - gamification | 1 tool: gamification overview | Free | Both | - |
| Tool breadth - feature help | 1 tool: describe an Orbit feature | Free | Both | - |
| Voice input | Speak instead of type; transcribed via `POST /chat/transcribe`; per-language flag picker | Free (counts as an AI message) | Both | Multi-language transcription |
| Image analysis | Photograph a schedule/to-do/calendar; Astra extracts habits for review (vision turns skip tools) | Free (counts as an AI message) | Both | - |
| Smart reschedule | Astra analyzes your routine and suggests better times/days | Pro | Both | - |
| Proactive check-ins | Astra-initiated nudges | Pro | Both | - |
| Daily message cap + ad top-up | 5/day free, 50/day Pro, reset at local midnight; rewarded ad grants +5, cap 3/day | Free / Pro; ads free-non-trial only | Both | - |

## MCP / Automation

Orbit's MCP server lets external assistants (Claude, ChatGPT, any MCP client) drive your account. Endpoint `POST /mcp` (`orbit-api/.../WebApplicationExtensions.cs`). Tools defined in `orbit-api/src/Orbit.Api/Mcp/Tools/*.cs` - **79 `[McpServerTool]` methods across 15 tool classes**.

**MCP access is effectively Pro-gated:** a working credential requires an API key, and API-key create/read/manage is a Pro capability (`PayGateService.cs` -> `CanReadApiKeys`/`CanManageApiKeys`). OAuth is also supported for dynamic client registration.

| Feature | Description | Gating | Platform | Locale notes |
|---|---|---|---|---|
| MCP server endpoint | `POST /mcp` - connect any MCP-capable assistant to your Orbit account | Pro (needs an API key) | Both (server-side; setup UI in AI Settings) | - |
| Habit tools | 22 tools - the largest surface: create/update/log/skip/reorder/move, sub-habits, checklists, metrics | Pro (via key); actions inherit feature gates | Both | - |
| Goal tools | 11 tools - create, query, update, status, progress, link | Pro | Both | - |
| Agent-ops tools | 8 tools - batched/agentic operations and clarification handling | Pro | Both | - |
| Notification tools | 7 tools - read and manage reminders | Pro | Both | - |
| Profile tools | 7 tools - profile and preference reads/writes | Pro | Both | - |
| Tag tools | 5 tools - full tag CRUD and assignment | Pro | Both | - |
| Subscription tools | 4 tools - subscription state and management | Pro | Both | - |
| Checklist-template tools | 3 tools - reusable checklist templates | Pro | Both | - |
| Gamification tools | 3 tools - XP, levels, achievements, streaks reads | Pro | Both | - |
| API-key tools | 2 tools - manage keys from within MCP | Pro | Both | - |
| Calendar tools | 2 tools - calendar overview and sync | Pro | Both | - |
| Account tools | 1 tool - account-level operations | Pro | Both | - |
| Feature tools | 1 tool - feature discovery/description | Pro | Both | - |
| Support tools | 1 tool - submit support requests | Pro | Both | - |
| Auth: OAuth 2.0 | Dynamic client registration (`OAuthController.cs`) | Pro | Both | - |
| Auth: API keys | Scoped, BCrypt-hashed, read-only or full, per-scope, revocable keys (`ApiKeyAuthenticationHandler.cs`). Creating a key from AI Settings sends a 6-digit code to the account email and opens `/step-up`; resend unlocks after 60 seconds, the code expires after 10 minutes, and exhausted attempts lock verification for 15 minutes. Success returns to AI Settings and opens key creation. | Pro | Both | - |

*Counts in this document are verified against `orbit-api` source: `ServiceCollectionExtensions.AiServices.cs` (61 AI tools) and `Mcp/Tools/*.cs` (79 MCP tools across 15 classes). Re-verify against source before restating a count.*
