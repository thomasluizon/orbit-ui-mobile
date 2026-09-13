'use client'

import type { NotificationItem } from '@orbit/shared/types/notification'
import { useTranslations } from 'next-intl'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { NotificationRow } from './notification-row'

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
    <ul aria-label={t('notifications.title')} aria-busy={isLoading}
      className="m-0 flex list-none flex-col gap-2 p-4">
      {items.length > 0 ? items.map((item) => <NotificationRow key={item.id} item={item} onOpen={onOpen} onDelete={onDelete} />)
        : isLoading ? Array.from({ length: 5 }, (_, index) => (
          <li key={index} aria-hidden="true" className="flex gap-3 rounded-[var(--r-well)] p-4">
            <span className="w-2 shrink-0" />
            <span className="flex flex-1 flex-col gap-2 motion-safe:animate-pulse">
              {[['80%', 22], ['100%', 21], ['32%', 16]].map(([width, height], line) => (
                <span key={line} data-skeleton-line="" className="rounded-full bg-[var(--bg-elev)]" style={{ width, height }} />
              ))}
            </span>
          </li>
        )) : (
          <li className="flex flex-col items-center gap-4 rounded-[var(--r-card)] p-8 text-center">
            {isError ? <>
              <p className="text-sm text-[var(--fg-3)]">{t('notifications.loadError')}</p>
              {/* eslint-disable-next-line local/max-button-words -- ORB-68 owns this existing label. */}
              <button type="button" className="chip" onClick={onRetry}>{t('common.retry')}</button>
            </> : <>
              <OrbitMark size={96} />
              <p className="text-sm text-[var(--fg-3)]">{t('notifications.empty')}</p>
            </>}
          </li>
        )}
    </ul>
  )
}
