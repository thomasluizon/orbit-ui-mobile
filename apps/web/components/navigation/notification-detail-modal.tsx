'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  formatNotificationRelativeTime,
  getNotificationDetailActionVisibility,
  getNotificationTargetKey,
  getNotificationDestination,
} from '@orbit/shared/utils'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { Button } from '@/components/ui/pill-button'
import { useUIStore } from '@/stores/ui-store'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

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
  const wide = useIsWideDesktop()
  const targetKey = getNotificationTargetKey(notification.url, notification.habitId)
  const router = useRouter()
  const setAstraConversationOpen = useUIStore((state) => state.setAstraConversationOpen)
  const { canView, canMarkAsRead } = getNotificationDetailActionVisibility(notification)
  const { sheetRef, closeSheet } = useSheetHost()

  function handleView() {
    const destination = getNotificationDestination(notification.url, notification.habitId)
    if (!destination) return
    closeSheet(() => {
      onOpenChange(false)
      router.push(destination.url)
      if (destination.opensAstra) setAstraConversationOpen(true)
    })
  }

  function handleDelete() {
    onDelete(notification.id)
    closeSheet()
  }

  return (
    open ? (<Sheet
      ref={sheetRef}
      open
      onClose={() => onOpenChange(false)}
      title={notification.title}
      actions={
        <div className="flex flex-wrap items-center justify-end" style={{ gap: 8 }}>
          {canView && (
            <Button variant={wide ? 'secondary' : 'primary'} size="sm" onClick={handleView}>
              {targetKey ? t('notifications.openIn', { target: t(targetKey) }) : t('notifications.view')}
            </Button>
          )}
          {canMarkAsRead && (
            <Button variant="ghost" size="sm" onClick={() => onMarkAsRead(notification.id)}>
              {t('notifications.markAsRead')}
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            {t('notifications.delete')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        <div>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--fg-4)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatNotificationRelativeTime(notification.createdAtUtc, (key, values) =>
              t(`notifications.${key}`, values),
            )}
            {targetKey ? ` Ã‚Â· ${t(targetKey)}` : null}
          </p>
        </div>
        <div>
          <p
            className="whitespace-pre-wrap"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 17,
              color: 'var(--fg-2)',
              lineHeight: 1.55,
            }}
          >
            {notification.body}
          </p>
        </div>
      </div>
    </Sheet>) : null
  )
}
