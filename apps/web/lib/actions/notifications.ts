'use client'

import * as serverActions from '@/app/actions/notifications'
import { bindAccountServerAction } from '@/lib/client-action'

export const markNotificationRead = bindAccountServerAction(serverActions.markNotificationRead)
export const markAllNotificationsRead = bindAccountServerAction(serverActions.markAllNotificationsRead)
export const deleteNotification = bindAccountServerAction(serverActions.deleteNotification)
export const deleteAllNotifications = bindAccountServerAction(serverActions.deleteAllNotifications)
export const subscribePush = bindAccountServerAction(serverActions.subscribePush)
export const unsubscribePush = bindAccountServerAction(serverActions.unsubscribePush)
