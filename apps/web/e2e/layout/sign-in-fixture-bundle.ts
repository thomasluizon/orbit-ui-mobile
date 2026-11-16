import { resolve } from 'node:path'
import { build, type Plugin } from 'esbuild'

const steadySignInFlow: Plugin = {
  name: 'steady-sign-in-flow',
  setup(fixtureBuild) {
    fixtureBuild.onResolve({ filter: /^\.\/use-login-flow$/ }, () => ({ path: resolve('e2e/layout/steady-sign-in-flow.ts') }))
  },
}

/** Bundles a sign-in layout fixture for the browser. The browser entry of Sentry takes the place of `@sentry/nextjs`, whose client entry pulls Next's router and its Node-only modules. */
export async function bundleSignInFixture(entry: string, options: Readonly<{ steadyFlow?: boolean; define?: Record<string, string> }> = {}) {
  const bundle = await build({
    entryPoints: [resolve(entry)], bundle: true, write: false,
    platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: resolve('tsconfig.json'),
    alias: { '@sentry/nextjs': '@sentry/browser' },
    define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"', ...options.define },
    plugins: options.steadyFlow ? [steadySignInFlow] : [],
  })
  return bundle.outputFiles[0]!.text
}
