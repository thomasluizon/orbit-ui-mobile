'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight, Check, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  formatNotificationRelativeTime,
  getNotificationDetailActionVisibility,
  isViewableNotificationUrl,
} from '@orbit/shared/utils'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { AppOverlay } from '@/components/ui/app-overlay'

interface NotificationDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  notification: NotificationItem
  onMarkAsRead: (id: string) => void
  onDelete: (id: string) => void
}

export function NotificationDetailModal({
  open,
  onOpenChange,
  notification,
  onMarkAsRead,
  onDelete,
}: Readonly<NotificationDetailModalProps>) {
  const t = useTranslations()
  const router = useRouter()
  const { canView, canMarkAsRead } = getNotificationDetailActionVisibility(notification)

  function handleView() {
    const url = notification.url
    if (url && isViewableNotificationUrl(url)) {
      onOpenChange(false)
      router.push(url)
    }
  }

  function handleDelete() {
    onDelete(notification.id)
    onOpenChange(false)
  }

  return (
    <AppOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={notification.title}
      footer={
        <div className="flex items-center gap-3">
          {canView && (
            <button
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[var(--radius-lg)] bg-primary/10 text-primary font-semibold text-sm hover:bg-primary/15 transition-colors"
              onClick={handleView}
            >
              <ArrowRight className="size-4" />
              {t('notifications.view')}
            </button>
          )}
          {canMarkAsRead && (
            <button
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[var(--radius-lg)] bg-primary/10 text-primary font-semibold text-sm hover:bg-primary/15 transition-colors"
              onClick={() => onMarkAsRead(notification.id)}
            >
              <Check className="size-4" />
              {t('notifications.markAsRead')}
            </button>
          )}
          <button
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[var(--radius-lg)] bg-red-500/10 text-red-500 font-semibold text-sm hover:bg-red-500/15 transition-colors"
            onClick={handleDelete}
          >
            <Trash2 className="size-4" />
            {t('notifications.deleteNotification')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Timestamp */}
        <p className="text-xs text-text-muted">
          {formatNotificationRelativeTime(notification.createdAtUtc, (key, values) =>
            t(`notifications.${key}` as Parameters<typeof t>[0], values),
          )}
        </p>

        {/* Body */}
        <p className="text-sm text-text-secondary whitespace-pre-wrap">{notification.body}</p>
      </div>
    </AppOverlay>
  )
}
