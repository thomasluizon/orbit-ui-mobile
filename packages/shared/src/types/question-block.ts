import { z } from 'zod'
import { utf16Length } from '../validation/utf16-length'

function text(maximum: number) {
  return z.string().refine(value => value.trim().length > 0).check(utf16Length('max', maximum))
}

function decimalIntegers(values: number[]): bigint[] {
  const decimals = values.map(value => {
    const [coefficient, exponent = '0'] = value.toString().split('e')
    const [whole, fraction = ''] = coefficient!.split('.')
    return { integer: BigInt(whole! + fraction), scale: fraction.length - Number(exponent) }
  })
  const scale = Math.max(0, ...decimals.map(value => value.scale))
  return decimals.map(value => value.integer * 10n ** BigInt(scale - value.scale))
}

export function isOnQuestionStep(value: number, minimum: number, step: number): boolean {
  const [integer, start, increment] = decimalIntegers([value, minimum, step])
  return increment! > 0n && (integer! - start!) % increment! === 0n
}

export function questionSliderValue(minimum: number, maximum: number, step: number, fraction: number): number {
  const [start, end, increment, denominator] = decimalIntegers([minimum, maximum, step, 1])
  const ticks = Math.round(Math.max(0, Math.min(1, fraction)) * Number((end! - start!) / increment!))
  return Number(`${start! + BigInt(ticks) * increment!}e-${denominator!.toString().length - 1}`)
}

const optionSchema = z.object({ id: text(80), label: text(120), recommended: z.boolean().optional() })
const base = { id: text(80), prompt: text(500), allowFreeText: z.boolean() }
const options = z.array(optionSchema).min(2).max(10).refine(values => new Set(values.map(value => value.id)).size === values.length)

export const questionSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...base, type: z.literal('singleChoice'), options: options.refine(values => values.filter(value => value.recommended).length <= 1) }),
  z.strictObject({ ...base, type: z.literal('multipleChoice'), options: options.refine(values => values.every(value => !value.recommended)) }),
  z.strictObject({ ...base, type: z.literal('scale'), allowFreeText: z.literal(false), lowLabel: text(120), highLabel: text(120) }),
  z.strictObject({ ...base, type: z.literal('slider'), allowFreeText: z.literal(false), min: z.number().min(-1e9).max(1e9), max: z.number().min(-1e9).max(1e9), step: z.number().positive(), unit: text(24) })
    .refine(value => value.max > value.min && isOnQuestionStep(value.max, value.min, value.step)),
  z.strictObject({ ...base, type: z.literal('yesNo') }),
])

export const questionAnswerSchema = z.object({
  questionId: text(80),
  selectedIds: z.array(text(80)).max(10).refine(values => new Set(values).size === values.length).optional(),
  number: z.number().optional(),
  boolean: z.boolean().optional(),
  freeText: text(500).optional(),
})

export const questionBlockSchema = z.object({
  blockId: z.uuid(),
  questions: z.array(questionSchema).min(1).max(10).refine(values => new Set(values.map(value => value.id)).size === values.length),
  expiresAtUtc: z.iso.datetime(),
  title: z.string().check(utf16Length('max', 120)).optional(),
  intro: text(500).optional(),
  progress: z.object({ current: z.number().int().nonnegative(), total: z.number().int().positive() }).refine(value => value.current <= value.total).optional(),
})

export type Question = z.infer<typeof questionSchema>
export type QuestionAnswer = z.infer<typeof questionAnswerSchema>
export type QuestionBlock = z.infer<typeof questionBlockSchema>
