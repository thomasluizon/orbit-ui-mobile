'use client'

import { useRouter } from 'next/navigation'
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

/** Sheet chrome with a mono timestamp eyebrow, body copy, and quiet text-button actions. */
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
        <div className="flex flex-wrap items-center justify-end" style={{ gap: 10 }}>
          {canView && (
            <QuietLink primary onClick={handleView}>
              {t('notifications.view')}
            </QuietLink>
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
      <div className="overlay-bleed">
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--hairline)' }}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--fg-3)',
              letterSpacing: '0.02em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatNotificationRelativeTime(notification.createdAtUtc, (key, values) =>
              t(`notifications.${key}`, values),
            )}
          </p>
        </div>
        <div style={{ padding: '14px 20px' }}>
          <p
            className="whitespace-pre-wrap"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 15,
              color: 'var(--fg-2)',
              lineHeight: 1.55,
            }}
          >
            {notification.body}
          </p>
        </div>
      </div>
    </AppOverlay>
  )
}

interface QuietLinkProps {
  children: React.ReactNode
  onClick: () => void
  destructive?: boolean
  primary?: boolean
}

function QuietLink({
  children,
  onClick,
  destructive = false,
  primary = false,
}: Readonly<QuietLinkProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={primary ? 'chip chip-ai' : 'chip'}
      style={destructive ? { color: 'var(--status-bad)' } : undefined}
    >
      {children}
    </button>
  )
}
