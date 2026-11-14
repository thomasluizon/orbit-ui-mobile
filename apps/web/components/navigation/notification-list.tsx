'use client'

import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { ShellCentredRegion } from '@/components/shell/shell-centred-region'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { useTranslations } from 'next-intl'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { Skeleton } from '@/components/ui/skeleton'
import { NotificationRow } from './notification-row'

/** Width and height of the title, body and target lines that a notification row draws. */
const NOTIFICATION_SKELETON_LINES = [['80%', 22], ['100%', 21], ['32%', 16]] as const

export function NotificationList({ items, isLoading, isError, onRetry, onOpen, onDelete }: Readonly<{
  items: NotificationItem[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  onOpen: (item: NotificationItem) => void
  onDelete: (item: NotificationItem) => void
}>) {
  const t = useTranslations()
  return (
    <ul tabIndex={-1} aria-label={t('notifications.title')} aria-busy={isLoading}
      className="orbit-content-frame m-0 flex flex-1 list-none flex-col gap-2 py-4">
      {items.length > 0 ? items.map((item) => <NotificationRow key={item.id} item={item} onOpen={onOpen} onDelete={onDelete} />)
        : isLoading ? Array.from({ length: 5 }, (_, index) => (
          <li key={index} aria-hidden="true" className="flex gap-3 rounded-[var(--r-well)] p-4">
            <span className="w-2 shrink-0" />
            <span className="flex flex-1 flex-col gap-2">
              {NOTIFICATION_SKELETON_LINES.map(([width, height], line) => (
                <span key={line} data-skeleton-line="" className="block" style={{ width, height }}><Skeleton variant="fill" grouped /></span>
              ))}
            </span>
          </li>
        )) : (
          <li className="flex flex-1 flex-col"><ShellCentredRegion><div className="flex flex-col items-center gap-4 rounded-[var(--r-card)] p-8 text-center">
            {isError ? <>
              <p className="text-sm text-[var(--fg-3)]">{t('notifications.loadError')}</p>
              <IconButton label={t('common.retry')} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
            </> : <>
              <OrbitMascot size={96} />
              <p className="text-sm text-[var(--fg-3)]">{t('notifications.empty')}</p>
            </>}
          </div></ShellCentredRegion></li>
        )}
    </ul>
  )
}
