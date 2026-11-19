import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { repositoryRoot } from '../test-support/repository-root'

type Messages = { readonly [key: string]: Messages | string }
type Rule = { readonly reason?: string }

const messages = JSON.parse(readFileSync(join(repositoryRoot, 'packages/shared/src/i18n/en.json'), 'utf8')) as Messages
const rules = JSON.parse(readFileSync(join(repositoryRoot, 'tools/feature-parity-rules.json'), 'utf8')) as Record<string, unknown>
const topLevelNamespaces = new Set(Object.keys(messages))

function hasMessage(key: string): boolean {
  let node: Messages | string | undefined = messages
  for (const part of key.split('.')) {
    if (typeof node !== 'object') return false
    node = node[part]
  }
  return node !== undefined
}

function namedMessageKeys(reason: string): string[] {
  const candidates = reason.match(/\b[a-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+\b/g) ?? []
  return candidates.filter((candidate) => topLevelNamespaces.has(candidate.split('.')[0]!))
}

describe('feature parity rule reasons', () => {
  it('name only message keys that exist in en.json', () => {
    const missing: string[] = []
    for (const [section, entries] of Object.entries(rules)) {
      if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) continue
      for (const [id, rule] of Object.entries(entries as Record<string, Rule>)) {
        if (typeof rule.reason !== 'string') continue
        for (const key of namedMessageKeys(rule.reason)) if (!hasMessage(key)) missing.push(`${section} ${id} names ${key}`)
      }
    }
    expect(missing).toEqual([])
  })
})
