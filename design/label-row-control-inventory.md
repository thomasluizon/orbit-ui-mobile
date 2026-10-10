# Label row controls

**At a glance:** ListRow consumers whose inline values, badges, chevrons or switches share the label alignment contract on web and Android.

At the default text size, the label and inline accessory share a vertical centre. When the label wraps at accessibility text sizes, the accessory aligns to the first line. Both adapters own this behavior in `components/ui/list-row.tsx`; consumers inherit it without individual offsets.

| Surface | Rows | Web owner | Android owner |
| --- | --- | --- | --- |
| Perfil preferences | Timezone, week start, clock, language, theme choices, general habits with supporting description | `apps/web/app/(app)/profile/_components/profile-preferences-content.tsx` | `apps/mobile/app/(tabs)/profile/_components/profile-preferences-content.tsx` |
| Conta | Usage analytics, including save-error description; export status value | `apps/web/app/(app)/profile/_components/profile-account-content.tsx` | `apps/mobile/app/(tabs)/profile/_components/profile-account-content.tsx` |
| Astra settings | Check-ins and recap switches; locked Pro badge alternatives | `apps/web/app/(app)/profile/_components/profile-astra-content.tsx` | `apps/mobile/app/(tabs)/profile/_components/profile-astra-content.tsx` |
| Product email consent | Marketing consent switch in notification and consent surfaces | `apps/web/app/(app)/preferences/_components/marketing-consent-section.tsx` | `apps/mobile/components/marketing-consent/marketing-consent-section.tsx` |
| Perfil navigation | Pro status, Pro-gated entries and label chevrons | `apps/web/app/(app)/profile/_components/profile-settings-content.tsx` | `apps/mobile/app/(tabs)/profile/_components/profile-settings-content.tsx` |
| Calendar day details | Event counts, reconnect, retry and disclosure rows | `apps/web/components/calendar/calendar-day-detail.tsx`, `apps/web/components/calendar/calendar-day-events.tsx` | `apps/mobile/app/(tabs)/calendar/_components/calendar-day-detail.tsx`, `apps/mobile/app/(tabs)/calendar/_components/calendar-day-events.tsx` |
| Astra operation editing | Checklist checked state and boolean fields through Switch | `apps/web/components/chat/pending-operation-card.tsx` | `apps/mobile/components/chat/pending-operation-card.tsx` |

Trial-expired paused-feature description rows also use label mode. Their unclipped text geometry remains regression coverage, although they have no inline control.

The preferences geometry cases mount the owning composition in both locales at compact and wide widths. The Android switch cases replay measured text layout at both text sizes and after returning to a single-line label. The hermetic layout case covers both appearances and the transition to 200% text and back; its runner owns that verification.
