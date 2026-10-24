# Astra pending reply surfaces

**At a glance:** the pending reply owners, replacement states and verification boundaries on
web and Android.

| Surface | Owner | Pending and terminal states | Verification |
|---|---|---|---|
| Web full-screen conversation in the compact and wide shells, from every conversation entry | `apps/web/components/chat/conversation.tsx` | Immediately after send; first text, tool step or block; error, cancellation and allowance notice; reduced motion | Composer Vitest drives the real send and stream consumer. Isolated Chromium Vitest measures the pending line and real reply at 412px and 1352px in both themes. |
| Android full-screen conversation, including wide windows, from every conversation entry | `apps/mobile/components/chat/conversation.tsx` and `pending-reply.tsx` | The same pending, replacement, terminal and reduced-motion states | Composer Vitest drives the real send and stream consumer. Yoga measures the rendered conversation's pending line and reply at 412px and 1352px. |

The dots reserve one reply line at the assistant start edge. A new Astra run shows its
24px participant mark on the row above, with an 8px gap before the dots. An Astra continuation
reserves no mark row. The indicator adds no card, control or visible copy. The existing `chat.trace.working` message supplies one stable polite
announcement outside the busy feed. Completed replies retain their separate announcement.
Tool progress replaces the dots and shares that work announcement.

The empty state becomes the thread when send appends the person's message. Existing messages
stay in place, and each later send uses the same pending slot after its new user turn. The pulse
pauses when the person scrolls the pending line out of view, and ends after the existing
skeleton pulse count while the dots stay visible. Pausing never hides the dots: feed clipping
owns visibility, including when keyboard dismissal or a window resize exposes the pending
line without a scroll event. Layout-only reveal checks cover both widths and motion preferences
without reattaching follow-latest or rendering the native conversation on scroll.

These hermetic checks do not prove native text rasterization or screen-reader speech on a device.

## Final answer boundary

Provisional answer deltas remain hidden on both platforms. Pending dots stay visible until final
delivery unless running tools replace them. Cancellation, offline/transport failure, allowance and
account replacement retain their terminal owners. Completed steps move into their request's
collapsed disclosure after the answer. A block-only final answer completes the turn and receives
one localized polite announcement; unreadable sole answers announce their visible recovery line.
The feed remains silent outside those announcement owners.
