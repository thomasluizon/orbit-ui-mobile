'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight, Check, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { AppOverlay } from '@/components/ui/app-overlay'

function formatTime(dateStr: string, t: ReturnType<typeof useTranslations>): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return t('notifications.now')
  if (diffMin < 60) return t('notifications.minutesAgo', { n: diffMin })
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return t('notifications.hoursAgo', { n: diffHours })
  const diffDays = Math.floor(diffHours / 24)
  return t('notifications.daysAgo', { n: diffDays })
}

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
}: NotificationDetailModalProps) {
  const t = useTranslations()
  const router = useRouter()

  function handleView() {
    const url = notification.url
    if (url && url.startsWith('/') && !url.startsWith('//')) {
      onOpenChange(false)
      router.push(url)
    }
  }

  function handleDelete() {
    onDelete(notification.id)
    onOpenChange(false)
  }

  const hasViewableUrl = notification.url && notification.url.startsWith('/') && !notification.url.startsWith('//')

  return (
    <AppOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={notification.title}
      footer={
        <div className="flex items-center gap-3">
          {hasViewableUrl && (
            <button
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[var(--radius-lg)] bg-primary/10 text-primary font-semibold text-sm hover:bg-primary/15 transition-colors"
              onClick={handleView}
            >
              <ArrowRight className="size-4" />
              {t('notifications.view')}
            </button>
          )}
          {!notification.isRead && (
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
        <p className="text-xs text-text-muted">{formatTime(notification.createdAtUtc, t)}</p>

        {/* Body */}
        <p className="text-sm text-text-secondary whitespace-pre-wrap">{notification.body}</p>
      </div>
    </AppOverlay>
  )
}
