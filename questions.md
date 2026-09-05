# Questions for Thomas

Questions raised by the unattended redesign run (**D90**). The run does not stop on anything here; it
works around the question and records it.

**The bar for putting a question here**, applied literally before anything is added: ask "if Thomas
answers *follow the best approach*, can I continue?" If yes, it is not a question. Decide it against
`design/canvas/`, `DESIGN.md` and the brain, and move on. Only a question that survives that test
belongs in this file.

**Status: no open questions.**

---

## Answered without asking, and why

Kept so the same question is not raised twice.

### The three design-system gaps on the upgrade screen (ticket 421)

`.claude/rules/core.md` rule 6 says expanding the design system is Thomas's call, and the ticket body
repeats it, so this looked like a genuine question.

It fails the test. The granted drawing already specifies the values: `design/canvas/Orbit Pro.dc.html`
gives the display-face heading as Space Grotesk, 28px/1.18 at the 412 shell and 34px/1.15 wide, weight
500, tracking `-0.02em`. Encoding a value the canvas has already decided is not an expansion of the
system, it is the system catching up to its own granted authority. Rule 6 governs a value the system
LACKS and nobody has chosen. This one is chosen.

So: build the gaps to the drawing's values. Where the drawing is silent on a gap, that specific gap
comes back here.

### Price-loading skeleton composition (thomasluizon/orbit-tickets#421)

Answered by Thomas on 2026-09-05. The drawing specifies three settings skeleton rows per tier.
Asking for tier-shaped skeleton geometry was asking to invent a new shape; it fails the
"follow the best approach" test. Keep the drawn rows and reserve the height occupied by the loaded
tier cards so the price response does not shift the layout. Height reservation is composition,
not a new token, radius, colour or spacing value, so core rule 6 does not block it.

Measure the loaded cards, including annual, monthly and coupon content, rather than copying the
ticket's approximate 260px. If the reservation requires an off-scale spacing value, record that
specific measured value here. The composition decision is answered; its implementation remains
outstanding on this branch.

### Whether a screen still waits for review before merging

Answered by D90 itself. It does not, for the rest of the redesign. Everything else stands: the canvas,
`DESIGN.md` and its precedence ladder, the step 6 sweep, Pullfrog, and the gates.
