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

export const desktopPushRegistrationSchema = z.object({
  endpoint: z.string().min(1),
  p256dh: z.enum(['apns', 'wns']),
  auth: z.enum(['apns', 'wns']),
  apnsTopic: z.enum(['org.useorbit.desktop', 'org.useorbit.desktop.staging']).nullable(),
  deviceId: z.uuid(),
})

export type DesktopPushRegistration = z.infer<typeof desktopPushRegistrationSchema>
