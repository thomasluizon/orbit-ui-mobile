import { resolve } from 'node:path'
import { build } from 'esbuild'

/** Bundles the sign-in column fixture for the browser, with the login flow replaced by the steady one. The graph must hold no server module: esbuild refuses a Node built-in on this platform. */
export function bundleSteadySignInFixture(define: Record<string, string> = {}) {
  return build({
    entryPoints: [resolve('e2e/layout/steady-sign-in-column-fixture.tsx')], bundle: true, write: false, metafile: true,
    platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: resolve('tsconfig.json'),
    define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"', ...define },
    plugins: [{
      name: 'steady-sign-in-flow',
      setup(fixtureBuild) {
        fixtureBuild.onResolve({ filter: /^\.\/use-login-flow$/ }, () => ({ path: resolve('e2e/layout/steady-sign-in-flow.ts') }))
      },
    }],
  })
}
