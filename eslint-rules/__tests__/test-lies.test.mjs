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
  },
})

const rule = (name) => require(`../${name}.cjs`)

ruleTester.run('no-constant-echo-test', rule('no-constant-echo-test'), {
  valid: [
    'expect(count(input)).toBe(3)',
    'const X_LIMIT = 280; expect(X_LIMIT).toBe(280)',
    'import { fixture } from "../test-support/factories"; expect(fixture.id).toBe("a")',
    'import { fixture } from "./factories"; expect(fixture.id).toBe("a")',
    'import { helper } from "./helper.test"; expect(helper).toBe(1)',
    'import { X_LIMIT } from "../lib/x"; expect(X_LIMIT).toBe(other)',
    'import { X_LIMIT } from "../lib/x"; expect(X_LIMIT).toBeGreaterThan(3)',
    'import { X_LIMIT } from "../lib/x"; function run(X_LIMIT) { expect(X_LIMIT).toBe(280) }',
    'import { count } from "../lib/x"; expect(count(input)).toBe(3)',
  ],
  invalid: [
    {
      code: 'import { X_LIMIT } from "../lib/x"; expect(X_LIMIT).toBe(280)',
      errors: [{ messageId: 'constantEcho' }],
    },
    {
      code: 'import * as limits from "../lib/limits"; expect(limits.MAX).toEqual("a")',
      errors: [{ messageId: 'constantEcho' }],
    },
    {
      code: 'import { limits } from "../lib/limits"; expect(limits.MAX).toEqual("a")',
      errors: [{ messageId: 'constantEcho' }],
    },
    {
      code: 'import { ENABLED } from "../lib/x"; expect(ENABLED).toStrictEqual(true)',
      errors: [{ messageId: 'constantEcho' }],
    },
    {
      code: 'import { NOTHING } from "../lib/x"; expect(NOTHING).toBe(null)',
      errors: [{ messageId: 'constantEcho' }],
    },
    {
      code: 'import { LABEL } from "../lib/x"; expect(LABEL).toBe(`habits`)',
      errors: [{ messageId: 'constantEcho' }],
    },
  ],
})

ruleTester.run('no-source-text-test', rule('no-source-text-test'), {
  valid: [
    'import { readFileSync } from "node:fs"; readFileSync("fixture.json")',
    'import { readFileSync } from "node:fs"; readFileSync(join(root, "data/seed.json"), "utf8")',
    {
      code: 'import { readFileSync } from "node:fs"; readFileSync(join(root, "app/page.tsx"), "utf8")',
      filename: 'apps/web/__tests__/guards/ban.test.ts',
    },
    {
      code: 'import { readFileSync } from "node:fs"; readFileSync(join(root, "app/page.tsx"), "utf8")',
      filename: '/work/apps/web/__tests__/guards/ban.test.ts',
    },
    'import { readFileSync } from "./reader"; readFileSync("app/page.tsx")',
    'const readFileSync = (path) => path; readFileSync("app/page.tsx")',
    'import { readdirSync } from "node:fs"; readdirSync("app/page.tsx")',
  ],
  invalid: [
    {
      code: 'import { readFileSync } from "node:fs"; readFileSync(join(root, "app/page.tsx"), "utf8")',
      filename: 'apps/web/__tests__/page.test.ts',
      errors: [{ messageId: 'sourceText' }],
    },
    {
      code: 'import { readFileSync } from "fs"; readFileSync(`${dir}/route.ts`)',
      errors: [{ messageId: 'sourceText' }],
    },
    {
      code: 'import fs from "fs"; fs.promises.readFile("./theme.css")',
      errors: [{ messageId: 'sourceText' }],
    },
    {
      code: 'import * as fs from "node:fs"; fs.readFileSync("./a.mjs", "utf8")',
      errors: [{ messageId: 'sourceText' }],
    },
    {
      code: 'import { readFile } from "node:fs/promises"; await readFile(resolve("x/y.jsx"))',
      errors: [{ messageId: 'sourceText' }],
    },
    {
      code: 'import fsp from "fs/promises"; await fsp.readFile("x.cjs")',
      errors: [{ messageId: 'sourceText' }],
    },
    {
      code: 'import { promises as fs } from "node:fs"; await fs.readFile("x.js")',
      errors: [{ messageId: 'sourceText' }],
    },
    {
      code: 'import { readFileSync as read } from "node:fs"; read("x.tsx")',
      errors: [{ messageId: 'sourceText' }],
    },
  ],
})
