> **At a glance** - Astra one-small-step block owners, request actions, text disclosure and verification boundaries.

# Astra one small step

One BlockFrame shows the supplied goal through its typed heading and the starting step as its prominent shared `typeRoles.h2` body line, including its line height and tracking. The heading uses PersonalText with its existing full-text sheet; the body uses PersonalTextDetails: full width, at most two lines or one unbroken token, then ellipsis with the full text available through its disclosure control. The goal carries the frame heading semantics. The frame omits counts.

| Surface | Web owner | Android owner | States and coverage |
|---|---|---|---|
| Negotiated block | `components/chat/block-registry.tsx`, `components/chat/one-small-step-card.tsx` | Same paths | Both languages, resting and acting; malformed blocks are skipped at the shared boundary. |
| Server-labelled actions | Same card owner | Same card owner | Three small ghost PillButtons with the Astra glyph, in BlockFrame's trailing ActionRow. Whole labels keep their natural widths; the row wraps at compact widths. The pills use the primitive's minimum-height path to grow around enlarged labels without shrinking or clipping text. Sending, offline and allowance limits disable the actions. |
| Goal and step disclosure | `components/ui/personal-text-details.tsx` | Same path | Fitting content stays static. Overflow offers one tap to the complete supplied text with an expanded accessibility state. |
| Fresh chat request | `components/chat/conversation.tsx`, `components/chat/message-bubble.tsx` | `components/chat/conversation.tsx`, `components/message-bubble.tsx` | The shared action hook sends exactly the server message through the current conversation sender, once per press. Existing history and approval previews stay with that sender. No action calls a record mutation or submits a confirmation token. |
| Legacy reply | Same message owner | Same message owner | Text-only fallback and replies without this block retain their existing rendering. |

Shared Vitest covers strict payload validation, advertised capabilities and guarded message submission. Paired component cases mount MessageBubble and drive the registered block, including localized labels and text disclosure. Composer tests verify each action's complete request and current history. Chromium Vitest measures the production primitives and stylesheet at phone and desktop widths at default and enlarged text sizes in both locales and themes. Android font-backed Yoga checks compare every label's bounds with its pill and every pill with its frame at default and enlarged text sizes, including width 320 in both locales. These native allocation checks do not prove device text rendering or TalkBack announcements.
