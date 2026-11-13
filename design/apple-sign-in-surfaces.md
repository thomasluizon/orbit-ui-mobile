# Apple sign-in and billing surfaces

> **At a glance** - Apple sign-in owners, store configuration, subscription management and verification boundaries.

| Surface | Owner | States |
| --- | --- | --- |
| Web login | `apps/web/app/(auth)/login/email-step.tsx` | Configured, hidden without public client, offline and busy |
| Mobile login | `apps/mobile/components/auth/apple-sign-in-button.tsx` | Pill button with the Apple mark and Google's text size on iOS (native sign-in) and Android (browser session); hidden without public client |
| Web callback | `apps/web/app/(auth)/auth-callback/auth-callback-content.tsx` | State mismatch, expired handoff, session changed, reactivated account and signed in |
| Mobile callback | `apps/mobile/components/auth/apple-auth-callback.tsx` | The same handoff outcomes, with SecureStore state and session ownership |
| Native iOS sign-in | `apps/mobile/lib/apple-auth.ts` | Random state, SHA-256 nonce, silent cancellation and existing login completion |
| Store purchases | `apps/mobile/hooks/store-billing-provider.tsx` | One authenticated store connection; verification before finishing; launch recovery and explicit restore |
| Subscription | Both `/upgrade` routes | App Store plan and usage; native management on iOS; iPhone instruction without a link elsewhere |
| Account deletion | Both delete-account modals | Apple cancellation warning before account deletion |

All authored copy uses the paired English and Brazilian Portuguese locales. The iOS and Android
buttons use the pill button with the Apple mark, because the system control cannot take the app's
text size. Apple's guidelines allow a custom title font, weight, size and corner radius. Web keeps
its existing login button anatomy.

`EXPO_PUBLIC_APPLE_CLIENT_ID` and `NEXT_PUBLIC_APPLE_CLIENT_ID` are required build variables for the
mobile and web buttons. The web, Android and iOS release workflows stop before the build when the
value is empty. The apps read each variable only as a flag that shows or hides the button. The
API's `AppleSignIn__WebClientId` and `AppleSignIn__NativeClientId` settings choose the `client_id`
that goes to Apple. By convention, each value names the API client its flow signs in with: the
grouped Services ID (`AppleSignIn__WebClientId`) for web and Android, and the bundle identifier
(`AppleSignIn__NativeClientId`) for native iOS:

| Build | Variable | Value |
|---|---|---|
| Web production | repository `PRODUCTION_NEXT_PUBLIC_APPLE_CLIENT_ID` | `org.useorbit.app.web` |
| Web staging | repository `STAGING_NEXT_PUBLIC_APPLE_CLIENT_ID` | `org.useorbit.app.staging.web` |
| Android production | environment `Production` `EXPO_PUBLIC_APPLE_CLIENT_ID` | `org.useorbit.app.web` |
| Android internal | environment `android-internal` `EXPO_PUBLIC_APPLE_CLIENT_ID` | `org.useorbit.app.staging.web` |
| iOS production | environment `ios-production` `EXPO_PUBLIC_APPLE_CLIENT_ID` | `org.useorbit.app` |
| iOS staging | environment `ios-staging` `EXPO_PUBLIC_APPLE_CLIENT_ID` | `org.useorbit.app.staging` |

The API owns Apple's authorize URL, callback and single-use handoff. Android returns through the existing verified App Link. Web stores its client
state in a temporary secure httpOnly cookie; the session uses the existing strict cookie writer.
Native iOS sends the nonce digest to Apple and the raw nonce to the native API endpoint.

`EXPO_PUBLIC_APP_STORE_MONTHLY_PRODUCT_ID` and `EXPO_PUBLIC_APP_STORE_YEARLY_PRODUCT_ID` select
the two App Store subscriptions. Their values must match the API's `AppStore__MonthlyProductId`
and `AppStore__YearlyProductId`. Prices come from the matching store products; the configured identifiers select the monthly and yearly periods.
The paywall includes automatic renewal terms and links to Terms and Privacy. It omits referral
discounts on iOS. Referral drawers, prompts and shared invitations use their existing neutral copy on iOS. Stripe and Play plans keep their server entitlement on iOS without a billing link.
Lifetime access keeps its existing server entitlement.

Vitest covers provider precedence, store requests, cancellation, pending approval, verification,
restore, launch recovery, state rejection and cookie installation. StoreKit sandbox purchases,
Apple credentials, TestFlight restoration and sign-in on devices require separate rollout evidence.
