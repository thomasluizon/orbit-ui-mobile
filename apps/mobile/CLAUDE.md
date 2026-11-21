# apps/mobile: Expo SDK 58 and Expo Router

Android and iOS 17.4 or later client. It calls `orbit-api` directly, with no BFF. Tokens live in SecureStore. An SQLite queue holds offline mutations.

## Facts the code does not show

- Android ships through Google Play. iPhone and iPad ship to internal TestFlight. Keep Android-only native modules behind platform guards.
- `android/` and `ios/` are Expo prebuild output. Make a native fix in app config or a config plugin.
- `ORBIT_APP_VARIANT=staging` selects the staging app `org.useorbit.app.staging`. The default is production `org.useorbit.app`. `app.config.js` derives both from `app.json`.
- Only the access token enters the iOS widget Keychain group. The refresh token stays private to the app.
- Play builds include the x86_64 emulator slice. The full local path is `/android-generate --emulator`.
- An elevated child inside an `overflow: 'hidden'` parent disappears on Android. Use `elevation: 0` on the child, or shadow the parent.
- The app resizes and has no orientation lock. Use `useWindowDimensions` for render-time geometry. Never cache `Dimensions.get()` at module scope.
- ICU syntax treats an apostrophe before `{`, `}` or `#` as a quote. Double it. Test mobile strings through the app's i18n instance.
- Hermes has no `Intl.ListFormat` or other new `Intl` constructors, but Vitest on Node has them. Shared code that builds one passes the tests and throws on a device. Polyfills load from `index.js` before `expo-router/entry`.
- Android ignores an accessibility node with zero opacity or fully off-screen. Announce through `AccessibilityInfo.announceForAccessibility`. Android's key map has arrow keys but no Home or End.
- Expo SAF copy deletes an existing destination document. Android Auto Backup restores SharedPreferences but not SecureStore, so AsyncStorage state is never restored.
- expo-router resolves a bare `/` to the first group index whatever `Stack.Protected` hides. A replace to a guarded-out route does nothing. Navigate from an unguarded screen to an explicit destination.

## Bottom sheets

- Use TrueSheet (`@lodev09/react-native-true-sheet`), never `@gorhom/bottom-sheet`. Its `present()` silently does nothing on the New Architecture in release builds. `components/ui/sheet.tsx` is the one styling seam.
- Never navigate in the same tick as a close. Never unmount a presented sheet. Take `{ sheetRef, closeSheet }` from `useSheetHost()`. Call `closeSheet()`, or `closeSheet(action)` for work after the close. A close that no tap started passes the action twice: `closeSheet(action, action)`.
- On iOS, an unmounted presented sheet leaves its controller on screen, and that controller takes every touch. A decorative layer never presents a native controller, because a sheet that opens during a `Modal` crossfade becomes that `Modal`'s child.
- When the open condition reads state that the close path does not own, render the sheet through `useSheetPresence(open)` (`components/ui/sheet-presence.ts`). Pass `key={sheetKey}` and `ref={sheetRef}`. Never call `onClose` yourself.
- Reference wiring: `app/(tabs)/calendar.tsx`.
