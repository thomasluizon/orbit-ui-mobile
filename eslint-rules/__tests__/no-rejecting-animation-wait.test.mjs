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

tester.run('no-rejecting-animation-wait', require('../no-rejecting-animation-wait.cjs'), {
  valid: [
    'Promise.allSettled(document.getAnimations().map(animation => animation.finished))',
    'Promise.all(requests.map(request => request.response))',
    'scope.evaluate(settleAnimations)',
    'Promise[method]([animation.finished])',
    'Promise.all(animations.map(animation => animation[completion]))',
  ].map((code) => ({ code, filename: 'apps/web/e2e/layout/animation-settlement.spec.ts' })).concat([
    { code: unsafeWait, filename: 'apps/web/__tests__/support/settle-animations.test.ts' },
  ]),
  invalid: [
    unsafeWait,
    'Promise.all(transitions.map((animation) => animation.finished))',
    'Promise["all"]([animation["finished"]])',
    'const completions = animations.map(animation => animation.finished); Promise.all(completions)',
    'const completion = animation.finished; const completions = [completion]; Promise.all(completions)',
  ].map((code) => ({ code, filename: 'apps/web/e2e/layout/animation-settlement.spec.ts', errors: [{ messageId: 'rejectingWait' }] })),
})

it('enforces the web e2e scope through the installed ESLint config', async () => {
  const webRoot = fileURLToPath(new URL('../../apps/web/', import.meta.url))
  const eslint = new ESLint({ cwd: webRoot })
  const inside = await eslint.lintText(unsafeWait, { filePath: 'e2e/layout/animation-settlement.spec.ts' })
  const outside = await eslint.lintText(unsafeWait, { filePath: '__tests__/support/settle-animations.test.ts' })
  expect(inside[0].messages.filter((message) => message.ruleId === 'local/no-rejecting-animation-wait'))
    .toMatchObject([{ severity: 2 }])
  expect(outside[0].messages.filter((message) => message.ruleId === 'local/no-rejecting-animation-wait')).toEqual([])
}, 60_000)
