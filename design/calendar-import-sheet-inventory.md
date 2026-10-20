> **At a glance** - the Calendars sheet surface inventory and its web and Android mirrors.

# Calendars sheet

The sheet lets a person choose Google calendars and review events before importing them into Orbit.
The sheet primitive owns outer padding, scrolling and the pinned footer. Each content group shares
that inset. The import rules and per-event issue slot remain owned by the shared calendar utilities.

| Surface | Web owner | Android owner | States |
|---|---|---|---|
| Connection and last sync row | `components/calendar/calendar-sync-boundary.tsx` | `app/(tabs)/calendar/_components/calendar-sync-boundary.tsx` | Connected and never synced, synced, disconnected, syncing, sync failed, offline |
| Automatic sync switch | Same boundary | Same boundary | On, off, pending, offline, Pro required, permission changes during a request |
| Calendars to read | `components/calendar-sync/calendar-picker-section.tsx` | Same relative component | Loading, empty, load failed, save failed, selected, unselected, expanded name, paginated |
| Event list | `components/calendar-sync/calendar-import-content.tsx` | Same relative component | Loading, empty, error, offline, review suggestions, select all, paginated |
| Event row | `components/calendar-sync/calendar-sync-event-row.tsx` | Same relative component | Selected, unselected, import issue, collapsed, expanded, suggestion dismissal |
| Import result | `components/calendar-sync/calendar-import-content.tsx` | Same relative component | Importing, success, partial failure, failure with retry |
| Pinned footer | `app/(app)/calendar/page.tsx` | `app/(tabs)/calendar.tsx` | Import selected, zero selected, offline |

## Removal

Remove the separate timestamp label, standalone sync pill, duplicated event heading and provider
description dump. Preserve recurrence, reminder count, calendar source, issue text, dismissal,
selection, pagination including opening a later event, account reset and complete event titles through in-place disclosure.

## Composition

Connection and last sync share a row, with refresh in its trailing action slot. A labelled switch
explains automatic discovery, followed by calendars to read and consistent event rows. Groups use
24 spacing, with 4 or 8 inside each group. The footer retains one trailing, label-hugging import
action through `ActionRow`. The sheet remains the only page-level scroller.

## Verification

Cover the connected, synced, syncing, failed and Pro states in both platforms' Vitest suites.
Cover collapsed and expanded event text without duplicate headings or provider descriptions.
Supported widths include 412 and 1200; native text geometry and rendered images require the
orchestrator's authorized visual verification.
