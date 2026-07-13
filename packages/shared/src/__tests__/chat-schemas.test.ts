import { describe, expect, it } from 'vitest'
import { actionResultSchema, chatStreamEventSchema } from '../types/chat'

const validClarificationRequest = {
  question: 'Which reading habit did you mean?',
  operationId: '123e4567-e89b-12d3-a456-426614174000',
  missingArgumentKey: 'habitId',
  quickActions: [{ label: 'Morning Reading', value: 'reading-morning' }],
}

describe('actionResultSchema superRefine', () => {
  it('rejects a NeedsClarification result missing its clarificationRequest with a specific issue', () => {
    const result = actionResultSchema.safeParse({
      type: 'CreateHabit',
      status: 'NeedsClarification',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues).toHaveLength(1)
    const issue = result.error.issues[0]
    expect(issue?.code).toBe('custom')
    expect(issue?.path).toEqual(['clarificationRequest'])
    expect(issue?.message).toBe('clarificationRequest is required when status is NeedsClarification')
  })

  it('treats an explicitly null clarificationRequest as missing for NeedsClarification', () => {
    const result = actionResultSchema.safeParse({
      type: 'CreateHabit',
      status: 'NeedsClarification',
      clarificationRequest: null,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues[0]?.path).toEqual(['clarificationRequest'])
  })

  it('accepts a NeedsClarification result carrying a valid clarificationRequest', () => {
    const result = actionResultSchema.safeParse({
      type: 'CreateHabit',
      status: 'NeedsClarification',
      clarificationRequest: validClarificationRequest,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.clarificationRequest?.missingArgumentKey).toBe('habitId')
    expect(result.data.clarificationRequest?.quickActions).toHaveLength(1)
  })

  it('does not fire the refinement for statuses other than NeedsClarification', () => {
    for (const status of ['Success', 'Failed', 'Suggestion'] as const) {
      const result = actionResultSchema.safeParse({ type: 'CreateHabit', status })
      expect(result.success).toBe(true)
    }
  })
})

describe('chatStreamEventSchema discriminatedUnion', () => {
  it('parses the payload-less started and reset variants to their member', () => {
    expect(chatStreamEventSchema.parse({ type: 'started' }).type).toBe('started')
    expect(chatStreamEventSchema.parse({ type: 'reset' }).type).toBe('reset')
  })

  it('parses the round variant and preserves its iteration', () => {
    const parsed = chatStreamEventSchema.parse({ type: 'round', iteration: 3 })
    expect(parsed.type).toBe('round')
    if (parsed.type === 'round') expect(parsed.iteration).toBe(3)
  })

  it('parses the delta variant and preserves its text', () => {
    const parsed = chatStreamEventSchema.parse({ type: 'delta', text: 'partial answer' })
    expect(parsed.type).toBe('delta')
    if (parsed.type === 'delta') expect(parsed.text).toBe('partial answer')
  })

  it('parses the error variant and keeps its optional code when present', () => {
    const parsed = chatStreamEventSchema.parse({
      type: 'error',
      status: 503,
      error: 'busy',
      code: 'OVERLOADED',
    })

    expect(parsed.type).toBe('error')
    if (parsed.type !== 'error') return
    expect(parsed.status).toBe(503)
    expect(parsed.error).toBe('busy')
    expect(parsed.code).toBe('OVERLOADED')
  })

  it('leaves the error variant code undefined when omitted', () => {
    const parsed = chatStreamEventSchema.parse({ type: 'error', status: 500, error: 'boom' })
    expect(parsed.type).toBe('error')
    if (parsed.type === 'error') expect(parsed.code).toBeUndefined()
  })

  it('parses the final variant and validates its nested chat response', () => {
    const parsed = chatStreamEventSchema.parse({
      type: 'final',
      response: { actions: [{ type: 'CreateHabit', status: 'Success', entityId: 'habit-1' }] },
    })

    expect(parsed.type).toBe('final')
    if (parsed.type !== 'final') return
    expect(parsed.response.actions).toHaveLength(1)
    expect(parsed.response.actions[0]?.status).toBe('Success')
  })

  it('rejects an unknown discriminant value at the type path', () => {
    const result = chatStreamEventSchema.safeParse({ type: 'heartbeat' })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues[0]?.code).toBe('invalid_union')
    expect(result.error.issues[0]?.path).toEqual(['type'])
  })

  it('rejects a matched variant whose field has the wrong type', () => {
    const result = chatStreamEventSchema.safeParse({ type: 'round', iteration: 'not-a-number' })

    expect(result.success).toBe(false)
    if (result.success) return
    const issue = result.error.issues[0]
    expect(issue?.code).toBe('invalid_type')
    expect(issue?.path).toEqual(['iteration'])
  })

  it('rejects a matched variant missing a required field', () => {
    const result = chatStreamEventSchema.safeParse({ type: 'error', error: 'boom' })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues[0]?.path).toEqual(['status'])
  })

  it('rejects a matched variant missing its string payload', () => {
    const result = chatStreamEventSchema.safeParse({ type: 'delta' })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues[0]?.path).toEqual(['text'])
  })

  it('recurses into the nested response schema and surfaces its refinement failure', () => {
    const result = chatStreamEventSchema.safeParse({
      type: 'final',
      response: { actions: [{ type: 'CreateHabit', status: 'NeedsClarification' }] },
    })

    expect(result.success).toBe(false)
    if (result.success) return
    const issue = result.error.issues[0]
    expect(issue?.path).toEqual(['response', 'actions', 0, 'clarificationRequest'])
    expect(issue?.message).toBe('clarificationRequest is required when status is NeedsClarification')
  })
})
