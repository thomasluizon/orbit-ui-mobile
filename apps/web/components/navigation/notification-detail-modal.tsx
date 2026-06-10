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

/** v8 chrome: flush body with mono timestamp eyebrow, and footer with quiet-link actions.
 *  Destructive Delete uses italic style instead of red. */
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
        <div className="flex items-center justify-end" style={{ gap: 22 }}>
          {canView && (
            <QuietLink onClick={handleView}>{t('notifications.view')}</QuietLink>
          )}
          {canMarkAsRead && (
            <QuietLink onClick={() => onMarkAsRead(notification.id)}>
              {t('notifications.markAsRead')}
            </QuietLink>
          )}
          <QuietLink destructive onClick={handleDelete}>
            {t('notifications.deleteNotification')}
          </QuietLink>
        </div>
      }
    >
      <div className="-mx-6">
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--hairline)' }}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--fg-3)',
              letterSpacing: '0.04em',
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
              fontSize: 14,
              color: 'var(--fg-2)',
              lineHeight: 1.5,
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
}

function QuietLink({ children, onClick, destructive = false }: Readonly<QuietLinkProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="appearance-none border-0 bg-transparent cursor-pointer"
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        fontWeight: 500,
        color: destructive ? 'var(--fg-3)' : 'var(--fg-1)',
        fontStyle: destructive ? 'italic' : 'normal',
        padding: 6,
      }}
    >
      {children}
    </button>
  )
}
