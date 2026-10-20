import { describe, expect, it } from 'vitest'
import { chatMessageSchema } from '../types/chat'
import { proactiveItemSchema } from '../types/proactive'
import { proactiveActionLabelKey } from '../utils/proactive'
import { proactiveApiResponses } from './factories'

describe('proactive API response contract', () => {
  it.each(proactiveApiResponses)('accepts serialized $trigger facts and chat embedding', (response) => {
    expect(proactiveItemSchema.parse(response)).toEqual(response)
    const message = {
      id: 'proactive-message', role: 'ai', content: response.text,
      timestamp: new Date(response.createdAtUtc), proactiveItem: response,
    }
    expect(chatMessageSchema.parse(message)).toEqual(message)
  })

  it('preserves null facts and unknown top-level trigger action labels', () => {
    const response = { ...proactiveApiResponses[0], trigger: 'FutureTrigger', facts: null }
    expect(proactiveItemSchema.parse(response)).toEqual(response)
    expect(proactiveActionLabelKey(response.trigger)).toBe('shell.composer.send')
  })

  it.each([1, true, {}, [], null, undefined])('rejects malformed nested trigger %j', (trigger) => {
    const response = proactiveApiResponses[0]!
    const parsed = proactiveItemSchema.safeParse({ ...response, facts: { ...response.facts, trigger } })
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(parsed.error.issues).toContainEqual(expect.objectContaining({ path: ['facts', 'trigger'] }))
  })
})
