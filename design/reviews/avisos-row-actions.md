# Avisos row actions surface inventory

The notification inbox presents the same actions on web and Android. The granted Avisos canvas and DESIGN.md govern the row action and header marker.

1. Populated inbox at `/notifications`: unread and read rows, single and multiple items, the sibling delete target, and the header unread badge. Owners: both platforms' `components/navigation/notification-inbox.tsx`, `notification-list.tsx`, `notification-row.tsx` and `notification-bell.tsx`.
2. Loading, empty and failed inbox: the existing skeleton, empty invitation and retry stay reachable through `notification-list.tsx` on both platforms. Row actions appear only with items.
3. Pending row deletion: the selected row leaves the list and its unread count leaves the badge; the shell's `notification-delete-notice.tsx` offers Undo before the existing delayed delete commits on both platforms.
4. Failed row deletion: the existing mutation rolls back the row and count, and the shell notice offers Retry on both platforms.
5. Notification detail sheet: opening the row body still exposes its destination, mark-read and delete actions through `notification-detail-modal.tsx` on both platforms.
6. Clear-all confirmation: the existing irreversible confirmation in `notification-inbox.tsx` remains separate from reversible row deletion on both platforms.
7. Shell notification bell: the same neutral count badge retains its capped number and accessible total; the bell is static on the inbox route and navigates elsewhere on both platforms.

Verification uses Vitest component and ownership suites, with multiple producer-derived notification fixtures. No app server or interactive app inspection is part of this work order.
