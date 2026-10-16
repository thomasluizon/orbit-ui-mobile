> **At a glance:** the Assinatura surface inventory, state presentations, retained billing actions and platform verification owners.

# Subscription surfaces

Assinatura lives at `/upgrade` on web and Android. It explains the current plan and hands billing changes to the provider. Both routes use the shared content frame, with the purchase column capped at 620 and the management column at 560 on wide windows. The frame starts at the shared start edge inside the centred shell column. Ticket #1384 owns centring on wide windows.

| Presentation | Hero and facts | Action and resources |
| --- | --- | --- |
| Free | Astra glyph, free-plan status and daily allowance comparison | Purchase tiers with four Pro resources, checkout and stay-free action |
| Trial | Astra glyph, remaining trial time and trial end date | Purchase tiers with four Pro resources, checkout and stay-free action |
| Monthly Stripe | Astra glyph, monthly plan, price and renewal date | Stripe portal, Pro resources, payment method, usage and invoices |
| Yearly Stripe | Astra glyph, yearly plan, price and renewal date | Stripe portal, Pro resources, payment method, usage and invoices |
| Monthly Play | Astra glyph, monthly plan and renewal date; native store price when available | Google Play subscriptions, Pro resources and usage |
| Yearly Play | Astra glyph, yearly plan and renewal date; native store price when available | Google Play subscriptions, Pro resources and usage |
| Expired | Astra glyph, end date, retained records and three separate lost entitlements | Reassubscribe into the purchase presentation; resources are explicitly labeled as included with Pro |
| Lifetime | Astra glyph and permanent entitlement | Pro resources and usage, without renewal or provider actions |
| Canceled with access | Astra glyph, cancellation status and access end date | Existing provider management, Pro resources and usage until access ends |
| Past due with access | Astra glyph, payment status and provider recovery explanation | Existing provider management, Pro resources and usage while access remains |

Each row has a web and Android presentation. Cancellation and payment-failure details come from the existing subscription summary; a retained Play entitlement uses the available status snapshot rather than requesting Stripe billing.

## Transition and boundary surfaces

- Loading uses settings skeletons and the existing busy state.
- Load failure offers retry for status, billing and plans.
- Offline preserves cached content and explains why provider and purchase actions are unavailable.
- Provider opening keeps the action label while busy. Failure stays beside its retry action. Returning refreshes status and billing.
- Payment-method editing and invoice downloads remain in the Stripe composition. Native invoice-opening failure remains visible.
- Usage and capacity notices remain on entitled management presentations. Expired and purchase presentations omit them.
- Reassubscribe opens the purchase presentation and focuses its heading.
- Purchase tiers retain period selection, localized prices, discounts, price reservations and checkout errors. Android retains purchase restoration.
- Every presentation retains visible back navigation and its originating destination.

## Shared consumers

`PricingSection` and `PlanSelection` serve the route and onboarding on both platforms. The subscription route owns its purchase-state Astra glyph, so the shared `ProPitch` retains the onboarding composition. `ProBenefits` supplies the same four resource rows to purchase tiers and subscription management without changing their meaning.

## Verification owners

Web state composition and Chromium geometry live in `apps/web/__tests__/pages/upgrade.test.tsx`. Android composition and Yoga geometry live in `apps/mobile/__tests__/screens/upgrade-screen.test.tsx`. Both cover the presentation matrix in English and Brazilian Portuguese, light and dark, at compact and wide widths. Notice and dashboard tests cover individual entitlement explanations and provider behavior.

Vitest geometry does not grant whole-screen visual or physical-device acceptance. Those remain separate inspection responsibilities under the active visual-delivery contract.
