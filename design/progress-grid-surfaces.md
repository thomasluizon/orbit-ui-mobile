# Progresso card layout inventory

**At a glance:** responsive achievement cards and the adjacent list audit on web and Android.

The owners are `apps/web/app/(app)/progress/_components/progress-content.tsx` and
`apps/mobile/components/progress/progress-content.tsx`, rendered by each platform's Progresso route.

| Surface | States and coverage | Layout contract |
| --- | --- | --- |
| Achievement category grid | Earned, unearned, progress, three cards, single card, empty and locked | Count tracks from available content width, with a 260px readable minimum and the existing 740px shell cap; retain category headings and uniform track widths, including an incomplete last row. Android scales the minimum with accessibility text size. |
| Achievement card content | Long translated names and descriptions, earned chip, progress bar | Cards share their row height and grow with text. The header can move its complete chip onto another line; the chip's text stays whole. |
| Window stat tiles | Loaded, loading and enlarged text | Existing tiles already share the row and fill its width. Retain their smaller figure minimum and maximum of three columns. |
| Goal list | All, filtered, sortable and empty | Existing goal cards occupy the full content width. Retain the vertical reorder list; it leaves no half-width card gap. |

The granted `Orbit Progresso.dc.html` supplies the card treatment and its compact and wide
compositions. The shell cap limits the current achievement grid to two tracks at the largest
window; additional tracks depend on available content width rather than a device classification.

Vitest measures isolated rendered web geometry at 412, 600, 840 and 1352px in both locales.
Android render and Yoga cases cover the same widths, resizing, the content cap and row stretching.
The hermetic layout workflow covers the owning web route. Native text rendering and physical
fold transitions require device verification; the render tests do not claim that evidence.
