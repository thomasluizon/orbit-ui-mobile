# Apple sign-in and billing surfaces

> **At a glance** - Apple sign-in owners, store configuration, subscription management and verification boundaries.

| Surface | Owner | States |
| --- | --- | --- |
| Web login | `apps/web/app/(auth)/login/email-step.tsx` | Configured, hidden without public client, offline and busy |
| Mobile login | `apps/mobile/components/auth/apple-sign-in-button.tsx` | Apple's system control on iOS (native sign-in); the Apple pill on Android (browser session); hidden without public client |
| Web callback | `apps/web/app/(auth)/auth-callback/auth-callback-content.tsx` | State mismatch, expired handoff, session changed, reactivated account and signed in |
| Mobile callback | `apps/mobile/components/auth/apple-auth-callback.tsx` | The same handoff outcomes, with SecureStore state and session ownership |
| Native iOS sign-in | `apps/mobile/lib/apple-auth.ts` | Random state, SHA-256 nonce, silent cancellation and existing login completion |
| Store purchases | `apps/mobile/hooks/store-billing-provider.tsx` | One authenticated store connection; verification before finishing; launch recovery and explicit restore |
| Subscription | Both `/upgrade` routes | App Store plan and usage; native management on iOS; iPhone instruction without a link elsewhere |
| Account deletion | Both delete-account modals | Apple cancellation warning before account deletion |

All authored copy uses the paired English and Brazilian Portuguese locales.

Every Apple sign-in button follows Apple's Human Interface Guidelines for Sign in with Apple. It is
as tall as the Google pill (`SIGN_IN_BUTTON_HEIGHT`, 44) and has the same capsule corner radius. It
is white with a black logo and title on the dark theme, and black with a white logo and title on
the light theme. The title is 43% of the button height, so it is larger than the Google title. Each
platform uses artwork that Apple permits there:

| Platform | Button | Apple artwork |
| --- | --- | --- |
| iOS | `ASAuthorizationAppleIDButton` through `expo-apple-authentication`, 44 pt, corner radius 22 | The system control draws its own logo and localized title |
| Android | `PillButton brand="apple"`, 44 pt, title 19 | `apps/mobile/assets/auth/apple-sign-in-logo-on-*.png`, from `https://appleid.cdn-apple.com/appleid/button/logo` (size 44, no border, scales 1 to 4) |
| Web | `PillButton brand="apple"`, 44 px, title 19 | The left-aligned medium logo file from Apple Design Resources (`Logo-Sign-in-with-Apple`), in `apps/web/components/auth/apple-sign-in-logo.tsx` |

The [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple#Creating-a-custom-Sign-in-with-Apple-button)
say: "App Review evaluates all custom Sign in with Apple buttons." A custom button uses only Apple's
logo artwork, a logo file as tall as the button, a black or white logo and title, the system's
title-to-height proportion, and a margin of "at least 8% of the button's width" between the title
and the trailing edge. `APPLE_SIGN_IN_BUTTON` in `packages/shared/src/theme/button.ts` holds the
proportion, the margin and the two colour pairs. The busy state replaces the logo with the spinner,
as it does for Google.

The web uses the Design Resources file. Section 2A of the license in Apple's
`Logo-Sign-in-with-Apple.dmg` permits the artwork in apps that "run on Apple's iOS, macOS, watchOS,
or tvOS operating system software (and corresponding web-based or other versions of your software
applications that have the same title and substantially equivalent features and functionality as
your software applications for Apple's iOS, macOS, watchOS, or tvOS)". Android uses the logo
images from the button endpoint that
[Incorporating Sign in with Apple into other platforms](https://developer.apple.com/documentation/signinwithapple/incorporating-sign-in-with-apple-into-other-platforms)
documents for apps "that don't have access to the Sign in with Apple JS framework".

At large text, the Google pill and the Apple pills on Android and web follow the large-text rule of `DESIGN.md`. The title wraps
inside a taller pill, and the pill keeps the 22 corner radius. The logo or mark stays at the top,
on the first line of the title.

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
