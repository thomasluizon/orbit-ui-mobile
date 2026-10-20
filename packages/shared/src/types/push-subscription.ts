import { z } from 'zod'

export const pushSubscriptionsResponseSchema = z.object({
  items: z.array(z.object({
    id: z.uuid(),
    transport: z.enum(['native', 'web']),
    createdAtUtc: z.iso.datetime({ offset: true }),
    endpointHash: z.string().regex(/^[0-9a-f]{64}$/),
  })),
  max: z.number().int(),
})

export type PushSubscriptionsResponse = z.infer<typeof pushSubscriptionsResponseSchema>
