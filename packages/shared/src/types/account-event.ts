import { z } from 'zod'
import { utf16Length } from '../validation/utf16-length'

export const accountChangeSchema = z.object({
  kind: z.string().check(utf16Length('min', 1)),
  op: z.string().check(utf16Length('min', 1)),
  ids: z.array(z.uuid()),
  dates: z.array(z.iso.date()).nullish(),
})

export const accountEventPayloadSchema = z.object({
  v: z.literal(1),
  changes: z.array(accountChangeSchema),
  origin: z.string().nullish(),
})

export const accountEventTicketSchema = z.object({
  ticket: z.string().check(utf16Length('min', 1)),
  expiresAtUtc: z.iso.datetime({ offset: true }),
})

export type AccountChange = z.infer<typeof accountChangeSchema>
export type AccountEventPayload = z.infer<typeof accountEventPayloadSchema>
