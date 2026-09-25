import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const packageRoot = new URL('../../', import.meta.url).pathname
const sourcePath = new URL('../hooks/tag-selection-core.ts', import.meta.url).pathname
const testPath = new URL('./tag-selection-core.test.ts', import.meta.url).pathname

describe('shared source import boundary', () => {
  it.each([
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
    'react-native',
    'next',
    'next/navigation',
    'react-native/gesture-handler',
  ])('rejects %s at error severity', async (moduleName) => {
    const eslint = new ESLint({ cwd: packageRoot })
    const [result] = await eslint.lintText(`import '${moduleName}'\n`, {
      filePath: sourcePath,
    })
    if (!result) throw new Error('ESLint returned no result for shared source')

    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'no-restricted-imports',
          severity: 2,
          message: expect.stringContaining('packages/shared/CLAUDE.md'),
        }),
      ]),
    )
  })

  it('allows test files to import React', async () => {
    const eslint = new ESLint({ cwd: packageRoot })
    const [result] = await eslint.lintText("import 'react'\n", {
      filePath: testPath,
    })
    if (!result) throw new Error('ESLint returned no result for shared test')

    expect(result.messages.some((message) => message.ruleId === 'no-restricted-imports')).toBe(false)
  })
})
