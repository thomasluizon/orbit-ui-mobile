// Reexport the native module. On web, it will be resolved to OrbitWidgetModule.web.ts
// and on native platforms to OrbitWidgetModule.ts
export { default } from './src/OrbitWidgetModule';
export * from  './src/OrbitWidget.types';
