import { z } from 'zod'

export const validationErrorDetailSchema = z.object({
  code: z.string(),
  message: z.string(),
})

export const validationErrorDetailsSchema = z.record(z.string(), z.array(validationErrorDetailSchema))

export const validationErrorsSchema = z.record(z.string(), z.array(z.string()))

export const validationFailureSchema = z.object({
  type: z.literal('ValidationFailure'),
  status: z.literal(400),
  requestId: z.string(),
  errors: validationErrorsSchema,
  errorDetails: validationErrorDetailsSchema.optional(),
})

export type ValidationErrorDetails = z.infer<typeof validationErrorDetailsSchema>

export const apiErrorSchema = z.object({
  error: z.string(),
  errors: validationErrorsSchema.optional(),
  errorDetails: validationErrorDetailsSchema.optional(),
})

export type APIError = z.infer<typeof apiErrorSchema>
