'use client'

import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { ShellCentredRegion } from '@/components/shell/shell-centred-region'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { useTranslations } from 'next-intl'
import { ListMotionItem, ListPresence, ListScope } from '@/components/motion/list-motion'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'
import { useFlag } from '@/hooks/use-flag'
import { NotificationRow } from './notification-row'

/**
 * The rows on the Orbit logic. A row the person deletes leaves with `list-exit` and the gap closes; undo returns it with
 * `list-enter`. A change of `scope` (the inbox itself changed) moves no row.
 */
function GuidedRows({ items, scope, onOpen, onDelete }: Readonly<Pick<NotificationListProps, 'items' | 'scope' | 'onOpen' | 'onDelete'>>) {
  return (
    <ListScope scope={scope}><ListPresence>
      {items.map((item) => <ListMotionItem as="li" key={item.id}><NotificationRow element="div" item={item} onOpen={onOpen} onDelete={onDelete} /></ListMotionItem>)}
    </ListPresence></ListScope>
  )
}

interface NotificationListProps {
  items: NotificationItem[]
  /** The ids the inbox holds, pending deletes included. It changes only when the inbox itself changes. */
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
      <span className="flex flex-1 flex-col gap-2 motion-safe:animate-pulse">
        {[['80%', 22], ['100%', 21], ['32%', 16]].map(([width, height], line) => (
          <span key={line} data-skeleton-line="" className="rounded-full bg-[var(--bg-elev)]" style={{ width, height }} />
        ))}
      </span>
    </li>
  ))
}

/** The empty inbox and the failed inbox. On the Orbit logic both show Orbit in Parado at the state size; the failed inbox keeps its message and retry. */
function InboxState({ failed, guided, onRetry }: Readonly<{ failed: boolean; guided: boolean; onRetry: () => void }>) {
  const t = useTranslations()
  const stateMascotSize = useStateMascotSize()
  const mascot = guided ? <OrbitMascot size={stateMascotSize} /> : null
  return (
    <li className="flex flex-1 flex-col"><ShellCentredRegion><div data-notification-state={failed ? 'failed' : 'empty'} className="flex flex-col items-center gap-4 rounded-[var(--r-card)] p-8 text-center">
      {failed ? <>
        {mascot}
        <p className="text-sm text-[var(--fg-3)]">{t('notifications.loadError')}</p>
        <IconButton label={t('common.retry')} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
      </> : <>
        {mascot ?? <OrbitMascot size={96} />}
        <p className="text-sm text-[var(--fg-3)]">{t('notifications.empty')}</p>
      </>}
    </div></ShellCentredRegion></li>
  )
}

export function NotificationList({ items, scope, isLoading, isError, onRetry, onOpen, onDelete }: Readonly<NotificationListProps>) {
  const t = useTranslations()
  const guided = useFlag('orbit_guided_flows')
  const rest = isLoading ? <SkeletonRows /> : <InboxState failed={isError} guided={guided} onRetry={onRetry} />
  return (
    <ul tabIndex={-1} aria-label={t('notifications.title')} aria-busy={isLoading}
      className={`orbit-content-frame m-0 flex flex-1 list-none flex-col gap-2 py-4 ${guided ? 'relative' : ''}`}>
      {guided ? <GuidedRows items={items} scope={scope} onOpen={onOpen} onDelete={onDelete} /> : items.map((item) => <NotificationRow key={item.id} item={item} onOpen={onOpen} onDelete={onDelete} />)}
      {items.length > 0 ? null : rest}
    </ul>
  )
}
