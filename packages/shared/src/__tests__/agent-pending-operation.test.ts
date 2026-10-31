import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { z } from 'zod'
import en from '../i18n/en.json'
import pt from '../i18n/pt-BR.json'
import { describe, expect, it } from 'vitest'
import {
  getAgentCapabilityLabelKey,
  getAgentOperationLabelKey,
  getAgentPolicyReasonKey,
} from '../utils/agent-pending-operation'

describe('getAgentCapabilityLabelKey', () => {
  it('maps every confirmation-gated capability id to a hyphen-folded key', () => {
    expect(getAgentCapabilityLabelKey('habits.bulk.write')).toBe(
      'chat.pendingOp.capability.habits-bulk-write',
    )
    expect(getAgentCapabilityLabelKey('habits.delete')).toBe(
      'chat.pendingOp.capability.habits-delete',
    )
    expect(getAgentCapabilityLabelKey('account.manage')).toBe(
      'chat.pendingOp.capability.account-manage',
    )
  })

  it('returns null for capabilities without a localized label', () => {
    expect(getAgentCapabilityLabelKey('habits.read')).toBeNull()
    expect(getAgentCapabilityLabelKey('unknown.capability')).toBeNull()
  })
})

describe('getAgentOperationLabelKey', () => {
  it('maps operation symbols and capability ids to local copy', () => {
    expect(getAgentOperationLabelKey('DeleteHabit')).toBe('chat.operation.source.deleteHabit')
    expect(getAgentOperationLabelKey('habits.bulk.delete')).toBe(
      'chat.pendingOp.capability.habits-bulk-delete',
    )
  })

  it('returns null instead of exposing an unknown server symbol', () => {
    expect(getAgentOperationLabelKey('UnknownPascalCaseOperation')).toBeNull()
  })
})

describe('getAgentPolicyReasonKey', () => {
  it('maps known policy reasons to friendly-copy keys', () => {
    expect(getAgentPolicyReasonKey('confirmation_required')).toBe(
      'chat.pendingOp.errors.confirmation_required',
    )
    expect(getAgentPolicyReasonKey('step_up_required')).toBe(
      'chat.pendingOp.errors.step_up_required',
    )
  })

  it('returns null for unknown, empty, or missing reasons so raw codes never render', () => {
    expect(getAgentPolicyReasonKey('missing_scope:delete_habits')).toBeNull()
    expect(getAgentPolicyReasonKey('')).toBeNull()
    expect(getAgentPolicyReasonKey(null)).toBeNull()
    expect(getAgentPolicyReasonKey(undefined)).toBeNull()
  })
})

const catalogToolSchema = z.object({ writes: z.boolean(), function: z.object({ name: z.string() }) })
const catalog = z.object({
  tools: z.array(catalogToolSchema), legacyTools: z.array(catalogToolSchema),
  postReadTools: z.array(catalogToolSchema), habitSetupTools: z.array(catalogToolSchema),
}).parse(parse(readFileSync(new URL('../../../../evals/astra/catalog.yaml', import.meta.url), 'utf8')))
const writeSources = [...new Set(Object.values(catalog).flat().filter(tool => tool.writes).map(tool => tool.function.name))]

it.each(writeSources)('localizes the pinned write source %s in both languages', source => {
  const key = getAgentOperationLabelKey(source)
  expect(key, source).not.toBeNull()
  for (const messages of [en, pt]) {
    const label = key?.split('.').reduce<unknown>((current, segment) =>
      current && typeof current === 'object' ? (current as Record<string, unknown>)[segment] : undefined, messages)
    expect(label, `${source}: ${key}`).toBeTypeOf('string')
    expect(label).not.toBe('')
  }
})
