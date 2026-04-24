<!-- Context: project-intelligence/business | Priority: high | Version: 1.0 | Updated: 2026-04-24 -->

# Orbit Business Domain

> Orbit is a personal habit tracker focused on helping users build consistency through habits, goals, streaks, reminders, and progress feedback.

## Project Identity

| Field | Value |
|-------|-------|
| Name | Orbit |
| Category | Personal habit tracker |
| Primary goal | Help users consistently track and improve habits |
| Platforms | Web and mobile |
| Public app | `https://app.useorbit.org` |
| API | `https://api.useorbit.org` |

## Product Needs

- Users need reliable habit tracking across web and mobile.
- Users need local date correctness for daily habits.
- Users need clear feedback, reminders, progress, and recovery from offline states.
- Users in English and Brazilian Portuguese need localized UI strings.

## Value Proposition

- Consistent habit tracking with web/mobile parity.
- Habit scheduling that respects local dates and backend schedule calculations.
- Offline-aware experiences for mobile and web.
- Shared contracts reduce behavioral drift between platforms.

## Product Constraints

- Web and mobile must have the same behavior.
- Auth must be secure on each platform.
- User-facing strings must be localized.
- API contracts are owned by the external .NET service.
- Frontend changes must respect backend schedule ownership.

## Success Criteria For Agent Work

- Changes preserve web/mobile parity.
- Validation happens before submission, not only on the backend.
- Query keys, endpoints, and types stay centralized in `@orbit/shared`.
- UI follows the existing Orbit design system rather than generic component patterns.

## Related Files

- `technical-domain.md`
- `business-tech-bridge.md`
- `AGENTS.md`
