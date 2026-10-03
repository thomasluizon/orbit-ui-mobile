# Calendar header surface inventory

The calendar header change covers web and Android mirrors. Existing data editing and Google
Calendar capabilities remain reachable through the new header disclosures.

| Surface | States and behavior |
| --- | --- |
| Month route | Profile loading/error, month loading/error/empty/future/populated, selected day and detail |
| Week route | Loading/error/populated, localized span, previous/next/current week, selected day |
| Agenda route | Loading/empty/populated day groups, selected day and preserved detail |
| Range route | Loading/error/populated, fourteen-day span, disabled next action, figures |
| Scrolling header group | Month title where applicable, equal view segments, compact and large text |
| Shell row | Options and notification bell, padded targets |
| Options menu | Checked repeat preference, Google Calendar, legend, sheet and anchored presentations |
| Month picker sheet | Selected month, local year browsing, cancellation, Este mês, completed dismissal |
| Year selector | Selected year, scrollable year list, return to month choices |
| Calendários sheet | Connection/sync/import states, existing Pro gate |
| Legend sheet | Full, partial, none and loggable rings, large text |
| Month grid and repeat filter | Actual four/five/six week rows, loading geometry, selected/range dates, persisted filtering |
| Back-to-top affordance | Calendar removal; return-to-top placement remains restricted to Hoje |

Source boundaries: calendar pages and their components, menu and date primitives, segmented
controls, shared calendar models and UI preferences. Root-tab reselection and the Hoje return-to-top action
are tracked separately by ticket #1146.
