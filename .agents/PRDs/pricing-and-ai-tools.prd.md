# PRD: BRL Pricing End-to-End + AI Tools Expansion

*Combined initiative covering one bug-fix track and four AI-tools tracks. Generated 2026-05-18 from interview + audit. Status: DRAFT.*

---

## 1. Executive Summary

Two unrelated-but-co-scoped initiatives:

**A. BRL pricing end-to-end.** Today the Orbit app displays Pro Anual at R$ 99,90/ano in Brazil, but Stripe Checkout shows $39.99 USD. These are two different prices, not a conversion mismatch. Brazilian users get sticker-shocked at checkout and the gross-margin / FX risk is unmanaged. Fix: create a BRL price in Stripe, detect Brazilian users, route them to BRL checkout so the displayed and charged amounts match.

**B. AI tools expansion.** Orbit already runs a sophisticated v2 agent-operation framework (`AgentOperationExecutor`) shared between the MCP server (for Claude.ai users) and the in-app `/api/chat`. An audit surfaced a security gap (~45 MCP per-entity tools bypass the executor), a missing capability ("explain how Orbit works" — no behavioral introspection), parity gaps in both directions, and a 1641-line mobile chat god-component. Expand both surfaces to feature parity, add a behavioral-explanation tool, and route everything through the policy/audit/ownership pipeline.

**MVP goal:** Brazilian users charged in BRL by Stripe Checkout. AI surface is exhaustive (any UI operation is also an AI operation), self-describing (AI can explain product rules), and uniformly audited.

---

## 2. Mission

Make Orbit's commerce honest in every locale, and make Orbit's AI tools the strongest expression of the product — capable of *doing* everything a user can do in the UI, and *explaining* everything the system does.

**Core principles:**

1. **One policy surface.** Every AI mutation — chat or MCP — flows through `AgentOperationExecutor`. No silent bypass paths.
2. **Capability parity, not feature drift.** A capability added to one AI surface must land on the other.
3. **Explainable by code, not by hallucination.** Rule semantics (streak math, frequency cadence, PayGate, XP) live in versioned content the AI reads at call time, not in the system prompt.
4. **Locale-honest pricing.** The number the user sees is the number their card is charged, in the currency of their country.
5. **Cross-platform parity.** Per `AGENTS.md`: every web change ships to mobile.

---

## 3. Target Users

| Persona | Description | Why this PRD matters |
|---------|-------------|----------------------|
| **Brazilian Pro shopper** | Mobile user in Brazil, sees R$ 99,90/ano, clicks Subscribe | Today gets dollar checkout. Tomorrow gets BRL checkout matching what they saw. |
| **Claude.ai power user** | Connects Orbit MCP from Claude.ai for habit management | Today: explicit MCP tools bypass audit and have parity gaps vs in-app. Tomorrow: complete, audited surface. |
| **In-app chat user** | Talks to Orbit AI inside `apps/web` or `apps/mobile` | Today: chat is missing reorder/bulk-create/retrospective/tags-CRUD/etc. Cannot ask "how do streaks work" and get a real answer. Tomorrow: can do anything the UI does and explain anything the product does. |
| **Owner / on-call dev (Thomas)** | Operates Orbit, debugs AI flows, reads audit logs | Today: MCP per-entity tools don't audit; mobile chat is unmaintainable. Tomorrow: every AI action is traceable, mobile chat code is shaped like web. |

---

## 4. Scope

### Repo Touch Matrix

| Capability | `orbit-ui-mobile` (Frontend) | `orbit-api` (Backend) | Shared |
|------------|------------------------------|------------------------|--------|
| BRL price in Stripe | small (price display, checkout call) | medium (locale routing, new price config) | tiny (endpoint constants if any) |
| Route MCP through executor | none | large (refactor ~45 tools) | none |
| Close MCP-only chat-tool gaps | small (chat UI handles new tools) | medium (add ~7 `IAiTool` impls) | small (shared types if needed) |
| Close chat-only MCP-tool gaps | none | medium (add ~7 `[McpServerTool]` wrappers) | none |
| `describe_feature` tool | small (chat UI renders rich content) | medium (curated content bundle + tool) | small (content lives in shared markdown) |
| Mobile chat refactor | large (extract god-component to hooks) | none | medium (new shared composer core) |
| Correlation IDs in chat responses | small (UI surfaces ID) | small (already in audit, just return) | tiny |

### In Scope (checkboxes)

**Track 1 — Stripe BRL**
- [ ] BRL annual + monthly prices in Stripe dashboard — **already exist** (confirmed). Add their Price IDs to `Stripe:Prices:BRL:{Annual,Monthly}` config alongside USD
- [ ] Backend: detect Brazilian users by `User.TimeZone` matching an IANA Brazilian zone (`America/Sao_Paulo`, `America/Bahia`, `America/Fortaleza`, `America/Manaus`, `America/Belem`, `America/Boa_Vista`, `America/Campo_Grande`, `America/Cuiaba`, `America/Eirunepe`, `America/Maceio`, `America/Noronha`, `America/Porto_Velho`, `America/Recife`, `America/Rio_Branco`, `America/Santarem`). All other timezones (and missing/UTC) route to USD
- [ ] Backend: webhook handling unchanged (Stripe normalizes amount/currency on its side)
- [ ] Frontend: BRL price displayed in app remains R$ 99,90/ano and is the SAME amount Stripe Checkout shows
- [ ] Both apps (web + mobile) trigger the locale-aware checkout
- [ ] Pricing/parity test: a Brazilian Pro shopper sees R$ at every step

**Track 2 — Safety (route MCP through executor)**
- [ ] Refactor every `[McpServerTool]` in `orbit-api/src/Orbit.Api/Mcp/Tools/*.cs` to delegate to `AgentOperationExecutor` via `execute_agent_operation_v2`, OR be deleted in favor of the existing `execute_agent_operation_v2` MCP entry point
- [ ] Fix `NotificationTools.cs` direct-DbContext writes — route through MediatR
- [ ] Add integration tests for `/api/ai/pending-operations/{id}/{confirm,step-up,verify,execute}` (HTTP-level, not just unit)
- [ ] Add an integration test that proves a read-only API-key credential cannot mutate via any MCP path
- [ ] Audit row written for every MCP mutation

**Track 3 — Comprehensiveness**

Chat tools to add (each = thin `IAiTool` wrapping an existing MediatR command):
- [ ] `reorder_habits`
- [ ] `reorder_goals`
- [ ] `update_checklist` (checklist items, not templates)
- [ ] `bulk_create_habits`
- [ ] `bulk_delete_habits`
- [ ] `get_daily_summary`
- [ ] `get_retrospective`
- [ ] `get_habit_metrics`
- [ ] `list_tags`, `create_tag`, `update_tag`, `delete_tag` (chat today only has `assign_tags`)

MCP tools to add (each = thin `[McpServerTool]` delegating to `AgentOperationExecutor`):
- [ ] `manage_subscription` (checkout / portal / claim_ad_reward)
- [ ] `manage_calendar_sync` (set_auto_sync, dismiss_import, dismiss_suggestion, run_sync)
- [ ] `manage_account` (reset / request_deletion / confirm_deletion)
- [ ] `manage_api_keys` + `get_api_keys`
- [ ] `manage_notifications` (push subscribe / unsubscribe / test_push)
- [ ] `get_checklist_templates`, `create_checklist_template`, `delete_checklist_template`
- [ ] `send_support_request`

**Track 4 — Explanation**
- [ ] New content bundle: `orbit-api/src/Orbit.Application/Chat/Content/FeatureExplanations/*.md` — one file per behavioral topic (streaks, frequencies, gamification XP, PayGate, schedule math, freezes, notifications, AI memory). Versioned and authored from existing service code as ground truth.
- [ ] New tool registered on BOTH surfaces: `describe_feature(feature_key: enum)` — returns the matching markdown blob plus structured metadata (related capabilities, related app surfaces, version hash).
- [ ] Content bundle build step: a unit test that asserts every `feature_key` value has an existing file (no dangling references).
- [ ] Chat system prompt drops static rule descriptions (today scattered across `BuildPromptSupplement`) and points the model at `describe_feature` instead.

**Track 5 — Polish**
- [ ] Extract platform-agnostic composer state into `packages/shared/hooks/use-chat-composer-core.ts`. Both `apps/web/hooks/use-chat-composer.ts` and `apps/mobile/hooks/use-chat-composer.ts` become thin wrappers injecting platform-specific I/O.
- [ ] `apps/mobile/app/chat.tsx` shrinks to a layout consumer.
- [ ] Return `correlationId` in `ChatResponse` (already plumbed through audit — just surface it).
- [ ] Replace hardcoded tool-ordering switch in `ProcessUserChatCommand.cs` (`create_habit → create_sub_habit → assign_tags → everything else`) with an explicit declared ordering attribute or dependency graph on `IAiTool`.

### Out of Scope

- [ ] Multi-currency beyond BRL+USD (EUR, GBP, etc) — defer to a future PRD
- [ ] User-pickable currency override (auto-routed only)
- [ ] AI-driven anomaly detection ("you skipped this habit 5 days, archive?") — separate feature, not part of this PRD
- [ ] Replacing `MaxToolIterations = 5` cap — flagged as smell, but tuning belongs in a separate experiment
- [ ] Rebuilding the `AgentOperationExecutor` framework itself — keep, expand, route everything through it
- [ ] Localizing `describe_feature` content beyond `en` — Portuguese pass deferred to a follow-up

---

## 5. User Stories

### Pricing (Stripe BRL)

- [ ] **As a Brazilian Pro shopper**, when I tap "Assinar Anual" showing R$ 99,90/ano, I want Stripe Checkout to also show R$ 99,90 and charge my card in BRL, so I don't get sticker-shocked and abandon. *(Frontend + backend)*
- [ ] **As a non-Brazilian Pro shopper**, my checkout behavior is unchanged — I still see USD. *(Backend)*
- [ ] **As the owner**, when a Brazilian user buys Pro, the Stripe Customer record is BRL and the webhook events match — no manual reconciliation. *(Backend)*

### AI Tools — Safety

- [ ] **As the owner**, every MCP mutation writes an audit row I can correlate to a `correlationId`, so post-incident I can answer "which Claude.ai session did this?" *(Backend)*
- [ ] **As an API-key holder with read-only scope**, any attempt to mutate via MCP is denied with `read_only_credential`, never silently succeeds. *(Backend)*

### AI Tools — Comprehensiveness

- [ ] **As an in-app chat user**, when I say "reorder my habits so 'meditate' is first", the AI does it. Today it can't. *(Backend chat tool + UI handles the response)*
- [ ] **As an in-app chat user**, "create a morning routine with 4 habits" creates them in one shot. Today the chat AI lacks `bulk_create_habits`. *(Backend)*
- [ ] **As a Claude.ai user**, "cancel my Pro subscription" works. Today MCP has no subscription-management tool. *(Backend, both: parity-required)*
- [ ] **As an in-app chat user**, "list my tags / rename 'work' to 'job' / delete 'old'" all work. Today chat has only `assign_tags`. *(Backend)*

### AI Tools — Explanation

- [ ] **As any user**, asking "how do streaks work?" returns a concrete, accurate description (with freeze count, gap rules, reset behavior) — not a guess. *(Both surfaces)*
- [ ] **As any user**, asking "what does 'every 3 days' mean exactly?" returns the anchor-date + modular-arithmetic explanation that matches `HabitScheduleService`. *(Both surfaces)*
- [ ] **As the owner**, when product rules change (e.g., new XP table), I update one Markdown file and both AI surfaces speak the new truth without a deploy of new prompt-engineering. *(Backend content bundle + tool)*

### AI Tools — Polish

- [ ] **As a mobile chat user**, my experience matches web's because both consume the same composer logic. *(Parity-required frontend refactor)*
- [ ] **As a support-bound user**, my chat session has a visible correlation ID I can paste into a bug report. *(Both surfaces)*

---

## 6. Architecture & Patterns

### Stripe BRL Routing

Today: a single Stripe price ID (USD) is used regardless of locale.

Tomorrow: a small price-resolver service that picks `PriceId` based on the authenticated user's `User.TimeZone`.

```csharp
// orbit-api/src/Orbit.Application/Subscriptions/Services/IPriceResolver.cs
public interface IPriceResolver {
    StripePrice Resolve(string? userTimeZone, BillingInterval interval);
}

// Implementation reads from IConfiguration:
//   Stripe:Prices:USD:Annual / Stripe:Prices:USD:Monthly
//   Stripe:Prices:BRL:Annual / Stripe:Prices:BRL:Monthly
//
// Brazilian IANA zones (canonical list, see Phase 1 deliverable):
//   America/Sao_Paulo, America/Bahia, America/Fortaleza, America/Manaus,
//   America/Belem, America/Boa_Vista, America/Campo_Grande, America/Cuiaba,
//   America/Eirunepe, America/Maceio, America/Noronha, America/Porto_Velho,
//   America/Recife, America/Rio_Branco, America/Santarem
//
// Any unrecognized or null timezone → USD (fail-safe to historical behavior).
```

The checkout-session creation handler asks the resolver for a price ID, passes that into Stripe. Webhook handlers don't change — Stripe stamps `currency` on the subscription itself.

The BR-timezone set is defined as a `static readonly HashSet<string>` so lookup is O(1). If a future PRD expands beyond BR+US, replace the set with a config-driven `{ TimeZone → Currency }` map (or move to an explicit `User.Country` field per OQ #1 follow-up).

### AI Tools — Re-routing MCP through Executor

Today the per-entity MCP tools look like:

```csharp
// orbit-api/src/Orbit.Api/Mcp/Tools/HabitTools.cs (sketch)
[McpServerTool, Description("Create a new habit")]
public async Task<string> CreateHabit(CreateHabitParams p) {
    var result = await _mediator.Send(new CreateHabitCommand(p));
    return Format(result);
}
```

Tomorrow they go through the executor:

```csharp
[McpServerTool, Description("Create a new habit")]
public async Task<string> CreateHabit(CreateHabitParams p) {
    var req = new AgentExecuteOperationRequest {
        OperationId = "create_habit",
        Surface = AgentExecutionSurface.Mcp,
        Arguments = AgentArgumentMap.From(p),
        Principal = User,
    };
    var result = await _executor.ExecuteAsync(req, ct);
    return _formatter.Format(result);
}
```

This buys: ownership check, policy evaluation, read-only-credential enforcement, audit row, pending-confirmation flow for destructive ops, step-up auth for high-risk ops. All for free.

Alternative considered: delete the per-entity MCP tools entirely and rely solely on `execute_agent_operation_v2` as the MCP entry point. Rejected because (1) named tools are easier for Claude.ai to discover and call, (2) we'd lose the typed parameter binding that MCP gives us.

### AI Tools — `describe_feature`

Content lives in `orbit-api/src/Orbit.Application/Chat/Content/FeatureExplanations/`:

```
streaks.md
frequencies.md
gamification.md
paygate.md
schedule-math.md
freezes.md
notifications.md
ai-memory.md
```

Each file has YAML frontmatter:

```yaml
---
key: streaks
display_name: "How streaks work"
related_capabilities: [HabitsRead, GamificationRead]
related_surfaces: [today, gamification]
version: 2026-05-18
---

# How streaks work

Every habit has a streak counter. A streak increments when…
```

Tool definition:

```csharp
public record DescribeFeatureParams(string FeatureKey);

[AiTool("describe_feature", "Explain how an Orbit product feature works")]
public class DescribeFeatureTool : IAiTool<DescribeFeatureParams, DescribeFeatureResult> {
    // Loads the Markdown file at startup, exposes its content + metadata
}
```

A unit test enumerates every `FeatureKey` enum value and asserts a corresponding `.md` file exists with valid frontmatter. Build fails on drift.

### Mobile Chat Refactor

Today `apps/mobile/app/chat.tsx` is 1641 lines holding composer state, tool-call rendering, image upload, history paging, error handling.

Target shape mirrors web's `apps/web/hooks/use-chat-composer.ts` — extract a `use-chat-composer.ts` hook in `apps/mobile/hooks/`, leave `chat.tsx` as a layout-only file under 300 lines.

---

## 7. API Contract

### Stripe / Subscriptions

No new public endpoints. Existing `POST /api/subscription/checkout` (or equivalent) accepts an optional `currency` hint (or auto-resolves from the authenticated user's profile/country).

### New AI Tools

All new tools follow the existing `IAiTool` + `[McpServerTool]` patterns. Schemas registered in `AgentCatalogService.cs`. No new top-level controller endpoints.

#### `describe_feature`

```
GET (chat tool call) / MCP tool call
Input: { feature_key: "streaks" | "frequencies" | "gamification" | "paygate" |
                      "schedule-math" | "freezes" | "notifications" | "ai-memory" }
Output: {
  feature_key: string,
  display_name: string,
  content_markdown: string,
  version: string,
  related_capabilities: string[],
  related_surfaces: string[]
}
```

---

## 8. UI/UX

### Stripe Checkout (web + mobile)

- The price card in `apps/{web,mobile}/.../subscription/` already shows "R$ 99,90/ano" for Brazilian users. No display change.
- The "Assinar Anual" tap currently produces a USD checkout URL. After this PRD, it produces a BRL checkout URL for Brazilian users.
- Parity required: both `apps/web` and `apps/mobile` must trigger the same backend route and observe the same currency.

### Chat (web + mobile)

- New chat tools (reorder, bulk_create, describe_feature, etc.) need UI rendering. Most reuse existing tool-call card patterns — confirm during planning.
- `describe_feature` calls return markdown. The chat UI already renders markdown bodies; this is "render the `content_markdown` field as the assistant message body" — no new component, possibly a "Learn more" footer linking the related app surface.
- Mobile chat refactor must not visibly change behavior — it's a pure code-shape refactor. Smoke test: tool-call interactions, image upload, retry on error, history paging all work identically before/after.

### i18n

- `describe_feature` content is `en` only for V1 (Out of Scope above). Existing `en.json` / `pt-BR.json` strings unchanged.

---

## 9. Data Model

Minimal changes.

- **No new tables.** Existing `AgentAuditEntries` table is sufficient for denied-summary aggregation.
- **No new domain entities.**
- **New configuration:** `Stripe:Prices:BRL:Annual` and `Stripe:Prices:BRL:Monthly` (plus existing USD pair) in Render env vars.
- **Migration:** none required for V1.

---

## 10. Security & Configuration

- **MCP audit gap is the highest-priority security item** in this PRD. Today an MCP API-key-bearer can mutate habits/tags/goals/notifications without an audit row. This PRD closes that by routing every MCP tool through `AgentOperationExecutor` (Phase 2).
- **Read-only credentials:** `AgentPolicyEvaluator` already returns `read_only_credential` denial; routing MCP through the executor activates it for the per-entity tools.
- **Step-up auth:** unchanged. Already covers high-risk ops (`manage_account`, `manage_api_keys`).
- **Stripe webhook signing:** unchanged.
- **CORS, security headers, request size limits:** unchanged.
- **`describe_feature` content** is non-sensitive product documentation — no auth restriction beyond the existing chat/MCP auth.

---

## 11. Success Criteria

### Track 1 — Stripe BRL

- [ ] Brazilian user buying Pro Anual sees "R$ 99,90" on Stripe Checkout page and gets a BRL charge on their card statement
- [ ] Non-Brazilian users still see USD checkout, no regression
- [ ] Stripe Dashboard shows BRL subscriptions tracked separately from USD
- [ ] Integration test: checkout-session creation for a `BR`-country user produces a session with `currency: brl` and `amount: 9990`

### Track 2 — Safety

- [ ] Every MCP mutation tool produces an audit row in `AgentAuditEntries`
- [ ] `NotificationTools.cs` no longer touches `DbContext` directly; all writes go through MediatR
- [ ] Integration test exists for each of: confirm, step-up issue, step-up verify, execute (HTTP-level)
- [ ] Integration test exists proving read-only API key cannot mutate via any MCP tool
- [ ] Zero `[McpServerTool]` methods send to `IMediator.Send` directly (lint rule or test)

### Track 3 — Comprehensiveness

- [ ] Capability parity test: for every `AgentCapability` in `AgentCatalogService`, if `chatTools[]` is non-empty then `mcpTools[]` is non-empty (and vice versa) UNLESS the capability is in an explicit exemption list (e.g., direct-flow auth ops)
- [ ] All new tools (chat-side and MCP-side) registered in the catalog with correct `risk_class`, `confirmation_requirement`, and `scope`

### Track 4 — Explanation

- [ ] `describe_feature` returns valid markdown for every key in the enum
- [ ] System prompt shrinks (target: at least 20% reduction in prompt-tokens dedicated to product rules)
- [ ] User-acceptance: asking the AI "how do streaks work" returns content that matches `UserStreakService` behavior (verified by a small test that compares describe_feature output against a curated golden file)

### Track 5 — Polish

- [ ] `apps/mobile/app/chat.tsx` is under 300 lines
- [ ] `packages/shared/hooks/use-chat-composer-core.ts` exists; both `apps/web` and `apps/mobile` consume it
- [ ] Every chat response includes `correlationId`

### Overall

- [ ] Zero parity regressions on existing tools
- [ ] `npm run lint && npm run type-check && npm test` passes
- [ ] `dotnet build && dotnet test tests/Orbit.IntegrationTests` passes
- [ ] No `console.log` in any new frontend code
- [ ] All new user-facing strings exist in both `en.json` and `pt-BR.json`

---

## 12. Implementation Phases

### Phase 1 — Stripe BRL (small, independent, ships first)

| # | Deliverable | Repos |
|---|-------------|-------|
| 1.1 | Add the BRL Price IDs (already exist in Stripe) to `Stripe:Prices:BRL:{Annual,Monthly}` env config alongside the existing USD pair, in every env (Render dashboard + local dev) | api (config) |
| 1.2 | Implement `IPriceResolver` + BR-timezone set | api |
| 1.3 | Update checkout-session creation handler to call `IPriceResolver` with `User.TimeZone` | api |
| 1.4 | Startup health check: fail-fast if any of the 4 price IDs are missing | api |
| 1.5 | Integration test: user with `TimeZone=America/Sao_Paulo` produces BRL session; user with `TimeZone=America/New_York` (and null) produces USD | api |
| 1.6 | Manual E2E: Brazilian user buys Pro Anual, sees R$ 99,90 on Stripe Checkout, charged in BRL | both |

**Validation:** Stripe test-mode purchase from a BR-timezone user lands a BRL subscription. Other timezones unaffected.

### Phase 2 — Safety (route MCP through executor, foundation for Phase 3)

| # | Deliverable | Repos |
|---|-------------|-------|
| 2.1 | Wire `AgentOperationExecutor` resolution into MCP `HabitTools.cs` | api |
| 2.2 | Repeat for `GoalTools`, `TagTools`, `ProfileTools`, `UserFactTools`, `AchievementTools`, `StreakTools`, `NotificationTools`, `ReferralTools`, `SubscriptionTools`, `AgentTools` | api |
| 2.3 | Fix `NotificationTools.cs` direct-DbContext bypass — route through MediatR | api |
| 2.4 | Integration tests for `/api/ai/pending-operations/*` (all four steps) | api |
| 2.5 | Integration test proving read-only API key cannot mutate via MCP | api |
| 2.6 | Lint or test rule: no `[McpServerTool]` may call `IMediator.Send` directly | api |

**Validation:** every existing MCP tool still works; audit table now records each call; read-only key test passes.

### Phase 3 — Comprehensiveness (parity gaps)

| # | Deliverable | Repos |
|---|-------------|-------|
| 3.1 | Chat tools: `reorder_habits`, `reorder_goals`, `update_checklist`, `bulk_create_habits`, `bulk_delete_habits`, `get_daily_summary`, `get_retrospective`, `get_habit_metrics` | api |
| 3.2 | Chat tools: `list_tags`, `create_tag`, `update_tag`, `delete_tag` | api |
| 3.3 | MCP tools: `manage_subscription`, `manage_calendar_sync`, `manage_account`, `manage_api_keys`, `get_api_keys`, `manage_notifications`, `send_support_request` | api |
| 3.4 | MCP tools: `get_checklist_templates`, `create_checklist_template`, `delete_checklist_template` | api |
| 3.5 | Capability-parity test (chat ↔ MCP) | api |
| 3.6 | UI rendering for new chat tool responses (web + mobile, parity-required) | ui-mobile |

**Validation:** parity test passes; manual tour exercises each new tool on both surfaces.

### Phase 4 — Explanation

| # | Deliverable | Repos |
|---|-------------|-------|
| 4.1 | Claude reads `UserStreakService`, `HabitScheduleService`, gamification code, PayGate logic, and notification scheduler, then authors the Markdown bundle (streaks, frequencies, gamification, paygate, schedule-math, freezes, notifications, ai-memory). Each file's frontmatter cites the source file:line range it was derived from | api |
| 4.2 | `DescribeFeatureTool` (`IAiTool` + `[McpServerTool]`) | api |
| 4.3 | Bundle-completeness unit test + drift test (snapshots key constants from referenced services; fails if they change without an explanatory content update) | api |
| 4.4 | System prompt trim — remove static rule descriptions, point at `describe_feature` | api |
| 4.5 | UI: render `describe_feature` markdown response in chat (web + mobile, parity-required) | ui-mobile |

**Validation:** AI answers "how do streaks work" correctly on both surfaces; golden-file test on `describe_feature("streaks")` output matches an expected snippet derived from `UserStreakService`.

### Phase 5 — Polish

| # | Deliverable | Repos |
|---|-------------|-------|
| 5.1a | Extract platform-agnostic composer state/logic into `packages/shared/hooks/use-chat-composer-core.ts` (state machine, history merging, validation, retry policy — no I/O) | ui-mobile (shared) |
| 5.1b | `apps/web/hooks/use-chat-composer.ts` becomes a thin wrapper around the core hook that injects the web-side I/O (Server Action call) | ui-mobile (web) |
| 5.1c | `apps/mobile/hooks/use-chat-composer.ts` mirror-wrapper injecting mobile-side I/O (`apiClient` direct call). `apps/mobile/app/chat.tsx` shrinks to a layout consumer | ui-mobile (mobile) |
| 5.2 | Surface `correlationId` in `ChatResponse` (api) + render in chat UI footer (web + mobile, parity-required) | both |
| 5.3 | Replace hardcoded tool-ordering switch with declared attribute/graph | api |

**Validation:** `apps/mobile/app/chat.tsx` < 300 lines; both apps import the same `use-chat-composer-core` from `@orbit/shared`; correlationId visible in any chat session; composer logic edits go through one file, not two.

---

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Routing 45 MCP tools through executor breaks one or more in subtle ways | Existing Claude.ai integrations regress mid-conversation | Phase 2 lands behind a feature flag `mcp_route_through_executor`; flip per-tool after integration tests; keep the old code path one release before deletion |
| Stripe BRL price ID config drift between envs | Wrong amount charged in production | Treat price IDs as required config — startup health check fails fast if missing for either currency × interval |
| `describe_feature` content drifts from actual code behavior | AI confidently misexplains the product | Each markdown file has a "verified against" code reference in frontmatter; a CI test snapshots key constants from the relevant service and fails if they change without a corresponding content update |
| Mobile chat refactor introduces regressions in image upload / history paging | Mobile chat partially broken | Refactor is pure code-move; manual E2E checklist covers image upload, history paging, tool-call rendering, retry, error states before merge |
| Brazilian country detection misidentifies users | A non-BR user gets BRL checkout, or vice versa | See Open Question 1; fall back to existing USD pricing if detection is ambiguous (fail-safe to historical behavior) |
| Parity test (chat ↔ MCP) becomes a maintenance burden | Adds friction to legitimate asymmetries | Exemption list in the test for known direct-flow ops (auth flows etc.); document in the test why each exemption exists |

---

## 14. Open Questions

1. ~~**How is "Brazilian user" determined for Stripe routing?**~~ → **RESOLVED:** use `User.TimeZone` against the canonical Brazilian IANA-zone list (15 zones, see Section 6 architecture sketch). Anything else → USD.
2. ~~**Do BRL price IDs already exist in Stripe dashboard or do we create them?**~~ → **RESOLVED:** BRL and USD prices both exist. Phase 1 just wires the IDs into config.
3. ~~**Are there any non-Brazilian users today who should get BRL?**~~ → **RESOLVED:** Brazil maps to BRL, everyone else maps to USD. Portugal / Lusophone Africa get USD for V1.
4. ~~**`describe_feature` content authoring**~~ → **RESOLVED:** Claude reads the relevant services (`UserStreakService`, `HabitScheduleService`, gamification code, PayGate logic, notification scheduler) and authors the bundle as part of Phase 4.1. Each markdown file cites the source code line range it was derived from. Bundle-completeness + drift test in Phase 4.3 keeps it honest.
5. ~~**Mobile chat refactor — mirror web exactly, or extract shared?**~~ → **RESOLVED:** extract to `packages/shared/hooks/use-chat-composer-core.ts` (platform-agnostic state + logic). Both apps wrap it with platform-specific I/O. Phase 5.1 split into 5.1a/5.1b/5.1c.
6. ~~**Gating `/api/ai/audit/denied-summary`**~~ → **RESOLVED:** endpoint dropped from scope. It was an audit-surfaced opportunity (originally bundled under Polish), not part of the brain dump. The `AgentAuditEntries` table can be queried directly via psql when denial data is needed.

---

## Appendix — Audit Findings Referenced

This PRD is grounded in a code audit completed 2026-05-18. Key file references:

- `AgentOperationExecutor.cs` — `orbit-api/src/Orbit.Infrastructure/Services/AgentOperationExecutor.cs`
- `AgentCatalogService.cs` — `orbit-api/src/Orbit.Infrastructure/Services/AgentCatalogService.cs` (lines 363–1273 for tool registrations, 1126–1273 for app surfaces, 1276+ for data catalog)
- `AgentPolicyEvaluator.cs` — `orbit-api/src/Orbit.Infrastructure/Services/AgentPolicyEvaluator.cs` (line 90–91 for `read_only_credential` denial)
- MCP toolsets — `orbit-api/src/Orbit.Api/Mcp/Tools/*.cs` (11 files, ~45 explicit tools)
- Chat tool implementations — `orbit-api/src/Orbit.Application/Chat/Tools/Implementations/*.cs` (46 `IAiTool` registrations)
- `ChatController.cs` — `orbit-api/src/Orbit.Api/Controllers/ChatController.cs`
- `AiController.cs` — `orbit-api/src/Orbit.Api/Controllers/AiController.cs`
- `ProcessUserChatCommand.cs` — pending-op ordering switch lines 264–270; `MaxToolIterations = 5` line 87; background work line 606–633
- `NotificationTools.cs` MCP — direct DbContext writes lines 10, 19–34, 38–53, 56–66, 68–84
- Mobile chat — `orbit-ui-mobile/apps/mobile/app/chat.tsx` (1641 lines)
- Web chat composer — `orbit-ui-mobile/apps/web/hooks/use-chat-composer.ts`

---

*Status: DRAFT — needs validation against Open Questions and PRD review.*
*Next step: resolve Open Question 1 (country detection), then `/create-stories .agents/PRDs/pricing-and-ai-tools.prd.md`.*
