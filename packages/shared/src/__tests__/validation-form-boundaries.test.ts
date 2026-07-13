import { describe, expect, it } from 'vitest'
import { goalFormSchema } from '../validation/goal-form'
import { habitFormSchema } from '../validation/habit-form'

describe('goalFormSchema targetValue positive() boundary', () => {
  it('rejects zero exactly at the positive() boundary', () => {
    const result = goalFormSchema.safeParse({ title: 'Read daily', targetValue: 0 })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues).toHaveLength(1)
    const [issue] = result.error.issues
    expect(issue?.path).toEqual(['targetValue'])
    expect(issue?.code).toBe('too_small')
    expect(issue?.message).toBe('Too small: expected number to be >0')
  })

  it('rejects the smallest representable negative number below the boundary', () => {
    const result = goalFormSchema.safeParse({
      title: 'Read daily',
      targetValue: -Number.MIN_VALUE,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    const [issue] = result.error.issues
    expect(issue?.path).toEqual(['targetValue'])
    expect(issue?.code).toBe('too_small')
  })

  it('accepts the smallest representable positive number just past the boundary', () => {
    const result = goalFormSchema.safeParse({
      title: 'Read daily',
      targetValue: Number.MIN_VALUE,
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.targetValue).toBe(Number.MIN_VALUE)
  })

  it('accepts a null targetValue without applying the positive() constraint', () => {
    const result = goalFormSchema.safeParse({ title: 'Read daily', targetValue: null })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.targetValue).toBeNull()
  })

  it('treats an omitted targetValue as undefined', () => {
    const result = goalFormSchema.safeParse({ title: 'Read daily' })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.targetValue).toBeUndefined()
  })
})

describe('habitFormSchema frequencyQuantity int().min(1) boundary', () => {
  it('rejects a fractional value with an int type issue', () => {
    const result = habitFormSchema.safeParse({ title: 'Run', frequencyQuantity: 1.5 })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues).toHaveLength(1)
    const [issue] = result.error.issues
    expect(issue?.path).toEqual(['frequencyQuantity'])
    expect(issue?.code).toBe('invalid_type')
    expect(issue?.message).toBe('Invalid input: expected int, received number')
  })

  it('rejects zero exactly at the min(1) boundary with a too_small issue', () => {
    const result = habitFormSchema.safeParse({ title: 'Run', frequencyQuantity: 0 })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues).toHaveLength(1)
    const [issue] = result.error.issues
    expect(issue?.path).toEqual(['frequencyQuantity'])
    expect(issue?.code).toBe('too_small')
    expect(issue?.message).toBe('Too small: expected number to be >=1')
  })

  it('rejects a negative integer below the min(1) boundary', () => {
    const result = habitFormSchema.safeParse({ title: 'Run', frequencyQuantity: -3 })
    expect(result.success).toBe(false)
    if (result.success) return
    const [issue] = result.error.issues
    expect(issue?.path).toEqual(['frequencyQuantity'])
    expect(issue?.code).toBe('too_small')
  })

  it('accepts the smallest valid integer exactly at the min(1) boundary', () => {
    const result = habitFormSchema.safeParse({ title: 'Run', frequencyQuantity: 1 })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.frequencyQuantity).toBe(1)
  })

  it('accepts a larger valid integer', () => {
    const result = habitFormSchema.safeParse({ title: 'Run', frequencyQuantity: 7 })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.frequencyQuantity).toBe(7)
  })

  it('accepts a null frequencyQuantity without applying the int/min constraints', () => {
    const result = habitFormSchema.safeParse({ title: 'Run', frequencyQuantity: null })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.frequencyQuantity).toBeNull()
  })

  it('treats an omitted frequencyQuantity as undefined', () => {
    const result = habitFormSchema.safeParse({ title: 'Run' })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.frequencyQuantity).toBeUndefined()
  })
})
