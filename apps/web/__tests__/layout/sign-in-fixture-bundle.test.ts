// @vitest-environment node
import { expect, it } from 'vitest'
import { buildSignInFixture } from '../../e2e/layout/sign-in-fixture-bundle'

it('bundles the sign-in column fixture for the browser with no server module in its graph', async () => {
  const bundle = await buildSignInFixture('e2e/layout/steady-sign-in-column-fixture.tsx', { steadyFlow: true })
  expect(bundle.errors).toEqual([])
  expect(bundle.outputFiles).toHaveLength(1)
  const inputs = Object.keys(bundle.metafile.inputs)
  expect(inputs.some((file) => file.endsWith('app/(auth)/login/login-content.tsx'))).toBe(true)
  expect(inputs.some((file) => file.endsWith('e2e/layout/steady-sign-in-flow.ts'))).toBe(true)
  expect(inputs.filter((file) => /node_modules\/(@sentry\/nextjs\/|next\/dist\/compiled\/gzip-size\/)/.test(file))).toEqual([])
}, 60_000)
