/**
 * The `expo` package root entry (node_modules/expo/src/Expo.ts) pulls in `./Expo.fx`, whose winter
 * runtime calls `require('./ImportMetaRegistry')` on a TypeScript file. Metro rewrites that call at
 * bundle time; Node's CommonJS loader cannot, so the whole entry dies under Vitest. Every symbol the
 * app takes from `expo` is re-exported there from `expo-modules-core`, which loads cleanly, so this
 * double forwards the same names and drops only the bundler runtime.
 */
export {
  EventEmitter,
  SharedObject,
  SharedRef,
  NativeModule,
  requireNativeModule,
  requireOptionalNativeModule,
  requireNativeViewManager as requireNativeView,
  registerWebModule,
  reloadAppAsync,
  installOnUIRuntime,
  PermissionStatus,
  createPermissionHook,
} from 'expo-modules-core'
