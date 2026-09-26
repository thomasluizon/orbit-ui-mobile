/**
 * The `expo` package root entry (node_modules/expo/src/Expo.ts) pulls in `./Expo.fx`, whose
 * winter runtime calls `require('./ImportMetaRegistry')` on a TypeScript file. Metro
 * rewrites that call at bundle time; Node's CommonJS loader cannot, so the whole entry dies
 * under Vitest.
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
