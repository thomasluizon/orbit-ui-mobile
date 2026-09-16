'use client'

import * as serverActions from '@/app/actions/notifications'
import { bindServerAction } from '@/lib/client-action'

export const markNotificationRead = bindServerAction(serverActions.markNotificationRead)
export const markAllNotificationsRead = bindServerAction(serverActions.markAllNotificationsRead)
export const deleteNotification = bindServerAction(serverActions.deleteNotification)
export const deleteAllNotifications = bindServerAction(serverActions.deleteAllNotifications)
export const subscribePush = bindServerAction(serverActions.subscribePush)
export const unsubscribePush = bindServerAction(serverActions.unsubscribePush)
