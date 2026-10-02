# Perfil Pro entry inventory

The scope is the Orbit Pro row directly after the account row in Perfil, on web and Android. Existing allowance panels and subscription screens retain their behavior. No overlay is added.

| Surface | Owner | States |
|---|---|---|
| Web Perfil | `apps/web/app/(app)/profile/_components/profile-settings-content.tsx` | Free, active trial, paid Pro, lifetime Pro, profile loading and unavailable |
| Android Perfil | `apps/mobile/app/(tabs)/profile/_components/profile-settings-content.tsx` | Free, active trial, paid Pro, lifetime Pro, profile loading and unavailable |

Free and active trial open `/upgrade`, which displays the Pro pitch. Paid Pro opens the same route, which displays Assinatura. Lifetime Pro has a read-only row without a chevron, matching the allowance panel's lack of a billing action.

The row uses the existing ListRow title and meta value roles without a leading icon or badge. Metadata can wrap to keep the localized trial end date visible. The row appears only after a profile supplies the plan. Both locales use the existing plan labels and a translated trial end date template.

Behavior tests mount each Perfil owner in both locales and exercise all four plan states. Source review covers the inherited focus, hover, press, spacing and theme treatments. Live visual and assistive technology verification follows the whole redesign review.
