# Calendar day card surface inventory

**At a glance:** the Android and web surfaces covered by #1143, including their disclosure and recovery states.

Each item covers both platform mirrors.

1. **Month day card:** populated, empty, loading, failed, loggable and read-only days. Owners: `apps/web/components/calendar/calendar-day-detail.tsx` and `apps/mobile/app/(tabs)/calendar/_components/calendar-day-detail.tsx`.
2. **Week day sheet:** the same day-detail composition, reached from the week view. Owners: `apps/web/app/(app)/calendar/page.tsx` and `apps/mobile/app/(tabs)/calendar.tsx`.
3. **Events sheet:** three-event preview, full list, search above twenty, no-match recovery and event-to-import handoff. Owners: both `calendar-day-events.tsx` mirrors beside day detail.
4. **Habit title sheet:** full text from loggable and read-only habit rows. Owners: both day-detail mirrors and `apps/web/components/ui/check-row.tsx` / `apps/mobile/components/ui/check-row.tsx`.
5. **Calendários sheet:** connection status, dated last sync, auto-sync, sync pending/failure/retry, calendar selection and single-event import selection. Owners: both `components/calendar-sync/calendar-import-content.tsx` mirrors and their `CalendarSyncBoundary` components.
6. **Free account entry:** one Calendários row with a Pro badge leading to upgrade. Owners: both day-detail mirrors and the calendar route owners.
7. **Disconnected entry:** one Calendários row opening the sheet, including offline recovery there. Owners: both day-detail and import-content mirrors.
8. **Perfil calendar-sync entry:** opens the Calendários sheet for Pro accounts and retains the upgrade destination for free accounts. Owner: `packages/shared/src/utils/profile-navigation.ts`, consumed by both profile routes.

Geometry evidence uses populated pt-BR fixtures with twenty-one events and a habit at widths 320 and 360, normal and enlarged text. Behavioral fixtures also cover eight events, free accounts, disconnected accounts, mutation failures and account replacement. The work order excludes app sessions, servers, screenshots and device runs; native measurements use the repository's font and layout harness.
