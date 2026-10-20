# Google sign-in surfaces

> **At a glance** - the Google sign-in mark on both login screens, including theme, locale and request states.

| Surface | Owner | Coverage |
|---|---|---|
| Web login email step | `apps/web/app/(auth)/login/email-step.tsx` | Light and dark; English and Brazilian Portuguese; idle, invalid email, sending, Google request, Google failure, offline, referral and onboarding entry |
| Android login email step | `apps/mobile/components/auth/email-step.tsx` | The same themes, locales and states as web |

The Google mark occupies the existing leading slot of `PillButton`. Its visible label names the action; the SVG contributes no accessible name or focus stop. During a Google request, the primitive replaces the mark with its busy spinner and retains the label. Offline and email-request states disable the action without removing the mark.

The four-colour paths come from the [Google sign-in HTML configurator](https://developers.google.com/identity/branding-guidelines#render-html-button). Both platforms render the same shared SVG path asset. The 20px mark, 10px label gap and 12px horizontal padding follow the [Google sign-in guidelines](https://developers.google.com/identity/branding-guidelines#padding) within the existing button anatomy.

The composed login Vitest suites cover the inventory. Device rendering and browser appearance require separate inspection; this inventory does not claim rendered evidence.
