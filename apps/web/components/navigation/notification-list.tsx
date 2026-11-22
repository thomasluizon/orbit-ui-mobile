'use client'

import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { ShellCentredRegion } from '@/components/shell/shell-centred-region'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { useTranslations } from 'next-intl'
import { ListMotionItem, ListPresence, ListScope } from '@/components/motion/list-motion'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'
import { Skeleton } from '@/components/ui/skeleton'
import { NotificationRow } from './notification-row'

const NOTIFICATION_SKELETON_LINES = [['80%', 22], ['100%', 21], ['32%', 16]] as const

function GuidedRows({ items, scope, onOpen, onDelete }: Readonly<Pick<NotificationListProps, 'items' | 'scope' | 'onOpen' | 'onDelete'>>) {
  return (
    <ListScope scope={scope}><ListPresence>
      {items.map((item) => <ListMotionItem as="li" key={item.id}><NotificationRow element="div" item={item} onOpen={onOpen} onDelete={onDelete} /></ListMotionItem>)}
    </ListPresence></ListScope>
  )
}

interface NotificationListProps {
  items: NotificationItem[]
  scope: string
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  onOpen: (item: NotificationItem) => void
  onDelete: (item: NotificationItem) => void
}

function SkeletonRows() {
  return Array.from({ length: 5 }, (_, index) => (
    <li key={index} aria-hidden="true" className="flex gap-3 rounded-[var(--r-well)] p-4">
      <span className="w-2 shrink-0" />
      <span className="flex flex-1 flex-col gap-2">
        {NOTIFICATION_SKELETON_LINES.map(([width, height], line) => (
          <span key={line} data-skeleton-line="" className="block" style={{ width, height }}><Skeleton variant="fill" grouped /></span>
        ))}
      </span>
    </li>
  ))
}

function InboxState({ failed, onRetry }: Readonly<{ failed: boolean; onRetry: () => void }>) {
  const t = useTranslations()
  const stateMascotSize = useStateMascotSize()
  const mascot = <OrbitMascot size={stateMascotSize} />
  return (
    <li className="flex flex-1 flex-col"><ShellCentredRegion><div data-notification-state={failed ? 'failed' : 'empty'} className="flex flex-col items-center gap-4 rounded-[var(--r-card)] p-8 text-center">
      {failed ? <>
        {mascot}
        <p className="text-sm text-[var(--fg-3)]">{t('notifications.loadError')}</p>
        <IconButton label={t('common.retry')} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
      </> : <>
        {mascot}
        <p className="text-sm text-[var(--fg-3)]">{t('notifications.empty')}</p>
      </>}
    </div></ShellCentredRegion></li>
  )
}

export function NotificationList({ items, scope, isLoading, isError, onRetry, onOpen, onDelete }: Readonly<NotificationListProps>) {
  const t = useTranslations()
  const rest = isLoading ? <SkeletonRows /> : <InboxState failed={isError} onRetry={onRetry} />
  return (
    <ul tabIndex={-1} aria-label={t('notifications.title')} aria-busy={isLoading}
      className={`orbit-content-frame m-0 flex flex-1 list-none flex-col gap-2 py-4 ${'relative'}`}>
      <GuidedRows items={items} scope={scope} onOpen={onOpen} onDelete={onDelete} />
      {items.length > 0 ? null : rest}
    </ul>
  )
}
