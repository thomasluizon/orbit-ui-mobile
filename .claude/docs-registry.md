# Docs registry

**At a glance:** every repository doc that `CLAUDE.md` does not load, with its purpose and when to read it. `CLAUDE.md` points here.

Grep a doc's `At a glance` header before loading it. Registry rows and glance headers describe stable purposes; update them only when a purpose changes. Record amendments in the document body.

| Doc | Purpose |
|---|---|
| `BRAND.md` | Audience, positioning and principles; read before brand, copy, positioning or design-direction work, and before ORB-30. |
| `DESIGN.md` | UI specification, authority order, information architecture and bans; read before frontend work. |
| `questions.md` | Run-level redesign questions, decision criteria and resolved composition decisions. |
| `design/canvas/` | Granted drawings, design tokens and surface amendments, including live Astra block actions, chart figures and feminine pt-BR stale copy. Outranks DESIGN.md prose on appearance; never its Information architecture or Bans. |
| `design/apple-sign-in-surfaces.md` | Apple sign-in owners, rollout configuration, store purchases and verification boundaries. |
| `design/google-sign-in-surfaces.md` | Google sign-in mark owners and theme, locale and request-state coverage. |
| `design/habit-form-surfaces.md` | Paired create/edit type and date owners, restored production capabilities and verification boundaries. |
| `design/habit-row-surfaces.md` | Habit row owners, rounded-square check states, per-row surfaces, retained behaviours and web and Android verification boundaries. |
| `design/personal-text-focus-inventory.md` | Expanded typed-text owners, native action separation, overflow-only keyboard stops, unclamped rename headings and the mobile adapter. |
| `design/calendar-day-surfaces.md` | Calendar day paint owners, full-column targets, loading geometry and platform mirrors. |
| `design/empty-state-surfaces.md` | Shared empty-state consumers, mark size, Astra thread composition, completed-day action spacing and paired verification. |
| `design/habit-view-surfaces.md` | Hoje, Todos and Geral surface owners, scoped header search at every width, retained actions, state coverage, long-list rendering and platform mirrors. |
| `design/label-row-control-inventory.md` | Label-row inline control consumers, shared centring and first-line alignment, platform mirrors and geometry coverage. |
| `design/field-inset-inventory.md` | Text control owners, typed foreground ownership, drawn inline padding, shared checklist add Input insets, platform mirrors and field geometry verification. |
| `design/interaction-fill-surfaces.md` | Interaction fill owners, neighbour clearance and platform geometry coverage. |
| `design/input-question-surfaces.md` | Input surfaces outside the habit and goal flows, their owners, status under the form rule and the remaining surfaces. |
| `design/calendar-import-sheet-inventory.md` | Calendars sheet surfaces, platform owners, retained behavior and verification boundaries. |
| `design/icon-action-surfaces.md` | Universal icon-action consumers, accessible names, shared target geometry and retained text boundaries on web and Android. |
| `design/sheet-footer-inventory.md` | Sheet footer owners, platform mirrors and states covered by the trailing-action contract. |
| `design/progress-grid-surfaces.md` | Responsive Progresso achievement tracks, card text, adjacent stat and goal list audit, platform owners and geometry coverage. |
| `design/goal-forecast-surfaces.md` | Reachable goal forecast owners, supplied metrics, mirrored states and verification boundaries. |
| `design/create-goal-sheet-inventory.md` | Direct goal creation entries, shared form states, linked-habit picker and platform coverage. |
| `design/astra-conversation-participants.md` | Astra participant avatar owners, continuation spacing, text, block and running tool trace alignment, and pending reply replacement. |
| `design/astra-one-small-step-surfaces.md` | Astra starting-step block owners, complete request actions, text disclosure and platform verification boundaries. |
| `design/astra-block-copy-surfaces.md` | Astra reply code-block copy owners, independent confirmations, user and description exclusions, and platform verification boundaries. |
| `design/astra-pending-reply-surfaces.md` | Astra pending reply owners, terminal replacements, polite announcement ownership and hermetic verification boundaries. |
| `design/astra-mark-only-surfaces.md` | Assistant action labels, inline form-fill icons, localized prompts and habit-detail composer disclosure owners. |
| `design/astra-preview-surfaces.md` | Astra preview item semantics, counted actions, breakdown footer disclosure, deletion confirmation, revision, terminal outcomes and responsive parity. |
| `design/mcp-web-guide-surfaces.md` | Claude Web connection guide client selector, settings entry, OAuth steps, confirmed endpoint copy states and platform verification owners. |
| `design/progress-surfaces.md` | Progresso overview and sub-screen owners, retained figures and actions, states and verification coverage. |
| `design/subscription-surfaces.md` | Assinatura presentation inventory, shared frame start edge and wide shell ownership, shared purchase consumers, retained billing transitions and platform verification owners. |
| `.claude/manifests/feature-parity.json` | Generated web and Android capability inventory, removal citations and restoration tracking; NOT committed. Run `git fetch origin main && node tools/check-feature-parity.mjs --write` to create it locally; CI regenerates and uploads the evidence artifact. |
| `tools/feature-parity-rules.json` | Exact capability relocations, owner removal citations and restoration tickets; the checker derives completion from source. |
| `.claude/specs/orbit-prod-release.md` | Production release rules, capability restoration scope and release verification. |
| `AGENTS.md` | Codex's entry doc; defers to `CLAUDE.md`. |
| `apps/web/DEPLOYMENT.md` | Web image build, GitHub settings, and production and staging Render releases. |
| `packages/shared/CONTRACT_DRIFT.md` | Pinned API snapshot check and automated rebaseline. |
| `.claude/skills/pr-review/rubric.md` | The dimensions `/audit-code-quality` audits against; its only consumer. |
| `gating-matrix.json` | Generated inventory of PayGate methods, config keys, and feature flags at the `thomasluizon/orbit-api` repository root; run `node tools/gating-matrix.mjs` there to create it. |
| `FEATURES.md` | Retained Astra and MCP tool-count inventory and social compatibility references that no generated artifact carries; verify every count against its named `orbit-api` source. |
| `.claude/skills/flag/SKILL.md` | Inspect and change production or staging feature flags through admin Orbit MCP, with before and after verification. |
| `.claude/skills/flag/guide.md` | Plain and version flags, account targeting, flag lifecycle, build selection, and API versioning. |
| `TESTING.md` | Test authoring rules, suite catalog, CI ownership and local verification commands. |
| `architecture.json` | Generated route and screen map, plus endpoints, dependencies, i18n ownership, and test coverage; NOT committed (#470). Run `node tools/arch-map.mjs` once, then read it INSTEAD of exploring the codebase; it also writes `architecture.html` and the `architecture.mmd` diagram. Its first key is a `provenance` block whose `generatedFrom` hashes every input the generator read, so a copy can be checked against the tree in front of you. |
| `.claude/rules/core.md` | Always-loaded judgement and D89/D90 operating-contract pointers. |
| `.claude/calibration.json` | Agent and skill model calibration, effort settings and launch contracts. |
| `.claude/skills/ticket/SKILL.md` | GitHub ticket creation, labels, relations, and milestone rules; generated architecture maps are read locally and never committed. |
| `.claude/skills/orchestrate/SKILL.md` | Ticket execution, worker dispatch, verification, review, readiness and session relay procedures. |
| `.claude/skills/handoff/SKILL.md` | Spec-driven handoff, living work orders, in-flight inventory and session relay procedures. |
| `.claude/skills/crank/SKILL.md` | Maximum orchestrator scheduling within existing caps and quality gates, with durable relay inheritance and an explicit disable mode. |
| `.claude/skills/sleep/SKILL.md` | Unattended orchestrator entry, session adoption and owner reporting. |
| `.claude/skills/auto-work/SKILL.md` | Continuous Sentry, mailbox, store-review and board intake on the canonical sleep lifecycle, with durable source marks and registered idle wakeups. |
| `.claude/skills/wrap-up/SKILL.md` | Closes a session in one command: `/progress`, then `/questions`, then `/handoff`, with `--sleep` and `--crank` passed through to the last one. An open chain extends both reporting passes across every relay and the current session before owner handoff closes it. |
| `.claude/skills/questions/SKILL.md` | Owner decision criteria and the procedure for unavoidable manual actions. |
| `.claude/skills/progress/SKILL.md` | Product-level progress reporting from live delivery artifacts. |
| `.claude/playbooks/redesign-screen.md` | Thirteen-screen D76 loop; D90 suspends human steps 1/3/7/8, keeps 2/4/5/6 and the ui-skills sweep. |
| `.claude/rules/visual-delivery.md` | Visual inventory and critic gates; D90 moves human inspection to the whole-redesign review. |
| `.claude/skills/android-generate/SKILL.md` | Local APK build, and the emulator install path. Read before building or running the Android app. |
| `.claude/skills/ios-generate/SKILL.md` | Local staging simulator build, install, launch and process verification through Xcode Device Hub. |
| `.claude/skills/android-release/SKILL.md` | Dispatching `android-release.yml` to a Google Play track. |
| `.claude/skills/ios-release/SKILL.md` | Internal TestFlight releases, app and widget signing, and Apple enrollment prerequisites. |
| `.claude/skills/release/SKILL.md` | Planning production and staging gaps, with pinned releases and live commit verification. |
| **D1..D42 register** | Historical decision record in the brain vault: `2 Areas/20-29 Orbit Engineering/Decisions/`. Current ticket routing is defined in `CLAUDE.md`. |
