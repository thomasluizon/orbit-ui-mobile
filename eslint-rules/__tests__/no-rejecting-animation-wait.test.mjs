import { RuleTester, ESLint } from 'eslint'
import parser from '@typescript-eslint/parser'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
RuleTester.describe = describe
RuleTester.it = it
RuleTester.afterAll = afterAll
const tester = new RuleTester({ languageOptions: { parser } })
const unsafeWait = 'Promise.all(document.getAnimations().map(animation => animation.finished))'
const webRoot = fileURLToPath(new URL('../../apps/web/', import.meta.url))

tester.run('no-rejecting-animation-wait', require('../no-rejecting-animation-wait.cjs'), {
  valid: [
    'Promise.allSettled(document.getAnimations().map(animation => animation.finished))',
    'Promise.all(requests.map(request => request.response))',
    'scope.evaluate(settleAnimations)',
    'Promise[method]([animation.finished])',
    'Promise.all(animations.map(animation => animation[completion]))',
  ].map((code) => ({ code, filename: 'apps/web/e2e/layout/animation-settlement.spec.ts' })).concat([
    {
      code: unsafeWait,
      filename: fileURLToPath(new URL('../../apps/web/__tests__/support/settle-animations.test.ts', import.meta.url)),
    },
  ]),
  invalid: [
    unsafeWait,
    'Promise.all(transitions.map((animation) => animation.finished))',
    'Promise["all"]([animation["finished"]])',
    'const completions = animations.map(animation => animation.finished); Promise.all(completions)',
    'const completion = animation.finished; const completions = [completion]; Promise.all(completions)',
  ].map((code) => ({ code, filename: 'apps/web/e2e/layout/animation-settlement.spec.ts', errors: [{ messageId: 'rejectingWait' }] })).concat([
    {
      code: unsafeWait,
      filename: fileURLToPath(new URL('../../apps/web/e2e/layout/animation-settlement.spec.ts', import.meta.url)),
      errors: [{ messageId: 'rejectingWait' }],
    },
  ]),
})

it('enforces the web e2e scope through the installed ESLint config', async () => {
  const eslint = new ESLint({ cwd: webRoot })
  const config = await eslint.calculateConfigForFile('e2e/layout/animation-settlement.spec.ts')
  expect(config.rules['local/no-rejecting-animation-wait'][0]).toBe(2)
})
