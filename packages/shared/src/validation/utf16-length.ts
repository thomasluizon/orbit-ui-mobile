import { z } from 'zod'

export function utf16Length(bound: 'min' | 'max' | 'length', limit: number, message?: string): z.core.$ZodCheck<string> {
  return z.superRefine<string>((value, context) => {
    const length = value.length
    const tooSmall = bound !== 'max' && length < limit
    const tooBig = bound !== 'min' && length > limit
    if (!tooSmall && !tooBig) return
    context.addIssue({
      ...(tooSmall ? { code: 'too_small', minimum: limit } as const : { code: 'too_big', maximum: limit } as const),
      origin: 'string',
      inclusive: true,
      ...(bound === 'length' ? { exact: true } : {}),
      ...(message === undefined ? {} : { message }),
    })
  })
}
