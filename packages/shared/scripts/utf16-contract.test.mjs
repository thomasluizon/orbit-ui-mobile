import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { generate } from 'orval'
import { expect, it } from 'vitest'
import { contractOptions, sharedRoot } from './contract-source.mjs'
import { preserveUtf16Bounds } from './utf16-contract.mjs'

it('preserves request and response UTF-16 bounds from actual Orval output', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'orbit-utf16-'))
  const target = resolve(directory, 'api.generated.ts')
  const fields = {
    name: { type: 'string', minLength: 2, maxLength: 50 },
    exact: { type: 'string', minLength: 2, maxLength: 2 },
    formatted: { type: 'string', format: 'email', maxLength: 50 },
    count: { type: 'integer', minimum: 1, maximum: 50 },
    names: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', maxLength: 50 } },
  }
  const schema = { type: 'object', required: Object.keys(fields), properties: fields }
  const content = { 'application/json': { schema } }
  const document = {
    openapi: '3.0.3', info: { title: 'Length contract', version: '1.0' },
    paths: { '/names': { post: {
      requestBody: { required: true, content },
      responses: { 200: { description: 'Names', content } },
    } } },
  }
  try {
    await generate(contractOptions(document, target), sharedRoot, { throwOnError: true })
    const original = readFileSync(target, 'utf8')
    const converted = preserveUtf16Bounds(original)
    expect(converted).toContain("import { utf16Length } from '../../validation/utf16-length'")
    expect(preserveUtf16Bounds(converted)).toBe(converted)
    const helper = new URL('../src/validation/utf16-length.ts', import.meta.url).pathname
    const zod = new URL('../../../node_modules/zod/index.js', import.meta.url).pathname
    writeFileSync(target, converted.replace('../../validation/utf16-length', helper).replace("from 'zod'", `from '${zod}'`))
    const generated = await import(pathToFileURL(target).href)
    for (const validator of [generated.PostNamesBody, generated.PostNamesResponse]) {
      expect(validator.shape.name.safeParse('😀').success).toBe(true)
      expect(validator.shape.name.safeParse('a').success).toBe(false)
      expect(validator.shape.name.safeParse('a'.repeat(48) + '😀').success).toBe(true)
      expect(validator.shape.name.safeParse('a'.repeat(49) + '😀').success).toBe(false)
      expect(validator.shape.exact.safeParse('😀').success).toBe(true)
      expect(validator.shape.exact.safeParse('a😀').success).toBe(false)
      expect(validator.shape.formatted.safeParse('😀' + 'a'.repeat(44) + '@b.co').success).toBe(false)
      expect(validator.shape.count.safeParse(50).success).toBe(true)
      expect(validator.shape.count.safeParse(51).success).toBe(false)
      expect(validator.shape.names.safeParse(['😀', '😀']).success).toBe(true)
      expect(validator.shape.names.safeParse(['😀', '😀', '😀']).success).toBe(false)
      expect(validator.shape.names.safeParse(['a'.repeat(49) + '😀']).success).toBe(false)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

it('keeps generated output without string bounds byte-identical', () => {
  const snapshot = readFileSync(new URL('../src/types/__generated__/api.generated.ts', import.meta.url), 'utf8')
  expect(preserveUtf16Bounds(snapshot)).toBe(snapshot)
})
