# SPLIT-WEB-2 -> SPLIT-MOBILE-2 (rule-10 web<->mobile dup)

Agent SPLIT-WEB-2 owns the web half of round-4 rule-10. Summary of what changed on the
web side and what (if anything) the mobile agent must do.

## NO new shared helper was created for mobile to adopt.

The only rule-10 lift candidate that resolved this round was `highlightText`, and it did
NOT need a new shared helper: the shared util `@orbit/shared/utils` `highlightText`
(packages/shared/src/utils/highlight-text.ts, exported via the utils barrel) already
existed. This round:

- WEB: deleted the byte-identical local `highlightText` in
  `apps/web/components/ui/highlight-text.tsx` and rewired the component to import the
  shared util. (The web component was the only remaining local copy.)
- MOBILE: `apps/mobile/components/ui/highlight-text.tsx` ALREADY imports the shared
  `highlightText` (line 3) at the current baseline c8f4292 — nothing to do. The round-3
  06-quality note ("still local both sides") was stale (written against 6399d00).

=> rule-10 `highlightText` is now fully resolved on BOTH platforms. No mobile action.

## The remaining web<->mobile byte-identical bodies are sanctioned platform adapters (D12) — DEFER:adapter on both sides.

I did NOT lift any of these (lifting would require a queue/storage adapter abstraction AND
editing apps/mobile, which is out of my scope). The mobile agent has already registered
these as DEFER:adapter in wave3-deferrals.md (round-4 mobile section). The web twins carry
the same disposition (registered in wave3-deferrals.md round-4 web rule-10 section):

- use-tags.ts onMutate x3, use-checklist-templates.ts onMutate x2, use-goals.ts onMutate,
  use-notifications.ts onMutate x3 — identical optimistic-cache patch logic; platform
  mutationFn differs (web Server Action via app/actions/* vs mobile performQueuedApiMutation
  + SQLite offline queue). Core not extractable without threading the queue adapter.
- use-tag-selection.ts / use-dismiss-guard.ts wrappers — shared CORE already lifted (D33,
  @orbit/shared/hooks). The wrapper bodies are the platform adapter shells (web hooks vs RN
  state). Whole-wrapper lift would touch both twins; below the value line.
- use-login-code-entry.ts onCodeInput — completeness already routes through shared
  isVerificationCodeComplete/VERIFICATION_CODE_LENGTH (D33); residual is web input events vs
  RN TextInput key handling.
- lib/pending-notification-deletes.ts queuePendingNotificationDelete — web localStorage vs
  mobile SQLite-backed offline store; storage seam differs.
- use-habits.ts findCachedGoals (web) / lib/habit-mutation-helpers.ts:374 (mobile) — identical
  cache-read shape; mobile's lives in the offline mutation-helpers module.
- use-tour-mock-data.ts, use-habit-form.ts setGeneral, onboarding/goal/habit/chat anon pairs
  — view/handler bodies identical to twins but bound to each platform's primitives/form
  instance.

No mobile-side change is requested from this strand. If a future round decides to lift the
optimistic-cache `onMutate` pattern, it needs a shared `applyOptimistic<T>(queryClient, key,
patch)` core + a per-platform mutationFn injection — a cross-repo refactor, not this sweep.
