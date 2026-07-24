/**
 * RuleTester coverage for the Phase 1 guard-migration rules (REBUILD.md 6.1):
 * the lint-tier replacements for forbid-ts-antipatterns (double assertion,
 * unjustified eslint-disable) and forbid-mobile-supabase-eager. Valid cases pin
 * the shapes that must stay silent so the gate never false-positives on real
 * Orbit code.
 */

import { RuleTester } from 'eslint'
import tsParser from '@typescript-eslint/parser'
import { afterAll, describe, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

RuleTester.describe = describe
RuleTester.it = it
RuleTester.afterAll = afterAll

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})

const rule = (name) => require(`../${name}.cjs`)

ruleTester.run('no-double-assertion', rule('no-double-assertion'), {
  valid: [
    'const habit = value as Habit',
    'const count = input as unknown',
    'const narrowed = JSON.parse(raw) as { id: string }',
    'const widened = habit as Habit | undefined',
  ],
  invalid: [
    { code: 'const habit = value as unknown as Habit', errors: [{ messageId: 'doubleAssertion' }] },
    { code: 'const habit = value as any as Habit', errors: [{ messageId: 'doubleAssertion' }] },
    {
      code: 'fn(payload as unknown as Record<string, string>)',
      errors: [{ messageId: 'doubleAssertion' }],
    },
  ],
})

ruleTester.run('no-unjustified-disable', rule('no-unjustified-disable'), {
  valid: [
    'const a = 1 // eslint-disable-line no-console -- test asserts raw console output',
    '/* eslint-disable no-console -- fixture prints to stdout by design */\nconst b = 2',
    '// eslint-disable-next-line no-undef -- tooling directive fixture\nconst c = 3',
    '// a normal comment mentioning nothing special\nconst d = 4',
  ],
  invalid: [
    {
      code: '// eslint-disable-next-line no-console\nconsole.error("x")',
      errors: [{ messageId: 'missingReason' }],
    },
    {
      code: '/* eslint-disable no-console */\nconst b = 2',
      errors: [{ messageId: 'missingReason' }],
    },
    {
      code: 'const a = 1 // eslint-disable-line no-console',
      errors: [{ messageId: 'missingReason' }],
    },
  ],
})

ruleTester.run('mobile-supabase-lazy', rule('mobile-supabase-lazy'), {
  valid: [
    'let client = null\nexport function getSupabaseClient() {\n  if (!client) client = createClient(url, key)\n  return client\n}',
    'export const getSupabase = () => createClient(url, key)',
    'export function assertConfig() { if (!url) throw new Error("missing url") }',
  ],
  invalid: [
    {
      code: 'if (!url) throw new Error("missing url")',
      errors: [{ messageId: 'moduleThrow' }],
    },
    {
      code: 'throw new Error("boom")',
      errors: [{ messageId: 'moduleThrow' }],
    },
    {
      code: 'export const supabase = createClient(url, key)',
      errors: [{ messageId: 'eagerInit' }],
    },
    {
      code: 'const supabase: SupabaseClient = createClient(url, key)',
      errors: [{ messageId: 'eagerInit' }],
    },
  ],
})
