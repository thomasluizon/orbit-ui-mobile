import { z } from 'zod'

export const notificationItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  url: z.string().nullable(),
  habitId: z.string().nullable(),
  isRead: z.boolean(),
  createdAtUtc: z.string(),
})

export type NotificationItem = z.infer<typeof notificationItemSchema>

export const notificationsResponseSchema = z.object({
  items: z.array(notificationItemSchema),
  unreadCount: z.number(),
})

export type NotificationsResponse = z.infer<typeof notificationsResponseSchema>

export const unsubscribePushInputSchema = z.object({
  endpoint: z.string(),
  p256dh: z.string().nullable().optional(),
  auth: z.string().nullable().optional(),
  releaseOtherAccount: z.boolean().optional(),
})

export type UnsubscribePushInput = z.infer<typeof unsubscribePushInputSchema>
