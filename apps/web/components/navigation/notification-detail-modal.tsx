'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  formatNotificationRelativeTime,
  getNotificationDetailActionVisibility,
  getNotificationTargetKey,
  isViewableNotificationUrl,
  resolveNotificationUrl,
} from '@orbit/shared/utils'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { Button } from '@/components/ui/pill-button'
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
  const targetKey = getNotificationTargetKey(notification.url)
  const router = useRouter()
  const { canView, canMarkAsRead } = getNotificationDetailActionVisibility(notification)
  const { sheetRef, closeSheet } = useSheetHost()

  function handleView() {
    const url = notification.url
    if (!url || !isViewableNotificationUrl(url)) return
    closeSheet(() => {
      onOpenChange(false)
      router.push(resolveNotificationUrl(url))
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
            <QuietLink onClick={() => onMarkAsRead(notification.id)}>
              {t('notifications.markAsRead')}
            </QuietLink>
          )}
          <QuietLink destructive onClick={handleDelete}>
            {t('notifications.delete')}
          </QuietLink>
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
            {targetKey ? ` · ${t(targetKey)}` : null}
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

interface QuietLinkProps {
  children: React.ReactNode
  onClick: () => void
  destructive?: boolean
}

function QuietLink({
  children,
  onClick,
  destructive = false,
}: Readonly<QuietLinkProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 cursor-pointer rounded-full px-2 text-sm hover:bg-[var(--bg-hover)]"
      style={destructive ? { color: 'var(--status-bad)' } : undefined}
    >
      {children}
    </button>
  )
}
