# Orbit Motion Audit

Status legend: `existing`, `missing`, `reworked`, `intentionally none`

| Surface | Scenario | Web | Mobile | Notes |
| --- | --- | --- | --- | --- |
| App navigation | Root app route shell (`/`, `/calendar`, `/profile`, `/chat`) | `reworked` | `reworked` | Shared route intent and native-smooth tab/stack transitions |
| App navigation | Forward push routes (`/upgrade`, `/support`, `/preferences`, `/calendar-sync`, `/advanced`, `/about`, `/achievements`, `/streak`, `/retrospective`) | `reworked` | `reworked` | Directional push/back motion |
| Auth navigation | Login, auth callback, auth redirects | `reworked` | `reworked` | Step transitions and non-jarring replace behavior |
| Public navigation | Privacy/public shell | `reworked` | `reworked` | Same shell rhythm as auth/public web |
| Overlay primitives | App overlay / bottom sheet / drawer | `reworked` | `reworked` | Shared sheet/dialog rhythm with reduced-motion fallback |
| Overlay primitives | Confirm dialog | `reworked` | `reworked` | Shared backdrop fade and panel spring |
| Overlay primitives | Popover / anchored menu | `reworked` | `reworked` | Shared menu entry/exit timing |
| Overlay primitives | Notification detail / goal detail / habit detail / referral / tour drawers | `reworked` | `reworked` | Covered by overlay primitives |
| Feedback surfaces | App toast / achievement / welcome-back / celebration overlays | `reworked` | `reworked` | Shared toast and success-feedback timing |
| Today flow | Tab switch | `reworked` | `reworked` | Active pill and content transition |
| Today flow | Date change | `existing` | `reworked` | Web already had slide/fade; mobile aligned to shared timing |
| Today flow | Search/filter/list refetch | `reworked` | `reworked` | Animated filter shells, refetch indicator/shell on web, animated list shell on mobile |
| Today flow | Selection mode / bulk action bar | `reworked` | `reworked` | Bulk action bar now enters/exits with shared selection timing on both platforms |
| Habit interactions | Complete habit | `existing` | `reworked` | Mobile completion pop/glow/card flash aligned with web reference |
| Habit interactions | Expand/collapse / reorder / create / duplicate / delete | `existing` | `existing` | Existing motion present; shared token follow-up still possible |
| Chat flow | Empty state to conversation | `existing` | `existing` | Existing shell motion kept |
| Chat flow | Message insertion / typing handoff / recording / language picker | `existing` | `existing` | Existing motion preserved; picker/sheet primitives now consistent |
| Settings/profile/support | Card/detail navigation | `reworked` | `reworked` | Route shell covers card/detail transitions |
| Settings/profile/support | Toggle groups / banners / destructive confirms | `existing` | `reworked` | Confirm/banner rhythm aligned through primitives |
| Theme change | Theme toggle and DOM/native token changes | `reworked` | `reworked` | Shared theme-change timing and reduced-motion handling |
| Accessibility | Reduced motion behavior | `reworked` | `reworked` | Shared contract now exports explicit reduced-motion presets |
