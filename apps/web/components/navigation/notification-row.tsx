'use client'

import { PersonalText } from '@/components/ui/personal-text'
import { DestinationIcon } from '@/components/navigation/destination-icon'

import { useTranslations } from 'next-intl'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { formatNotificationRelativeTime, getNotificationTargetKey, getDestinationForLabel } from '@orbit/shared/utils'
import { CircleDot, Gift, Trash2 } from '@/components/ui/icons'
import { useFlag } from '@/hooks/use-flag'
import { useViewportMatch } from '@/hooks/use-viewport-match'

function NotificationTargetIcon({ targetKey, color }: Readonly<{
  targetKey: NonNullable<ReturnType<typeof getNotificationTargetKey>>
  color: string
}>) {
  const destination = getDestinationForLabel(targetKey)
  if (destination) return <DestinationIcon destination={destination} size={16} color={color} />
  const Icon = targetKey === 'profile.wrappedTitle' ? Gift : CircleDot
  return <Icon size={16} color={color} aria-hidden="true" />
}

/** The unread mark settles with the selection motion: in on the preset, out on its shorter exit, and at once under reduced motion. */
function unreadSettle(properties: readonly string[], unread: boolean, reducedMotion: boolean): string {
  if (reducedMotion) return 'none'
  const timing = unread ? 'var(--motion-selection-enter) var(--motion-ease-standard)' : 'var(--motion-selection-exit) var(--motion-ease-exit)'
  return properties.map((property) => `${property} ${timing}`).join(', ')
}

/** The row to focus after a delete: the next row that stays, else the previous one, else the list. */
function focusAfterDelete(row: Element | null): Element | null {
  for (let next = row?.nextElementSibling; next; next = next.nextElementSibling) if (!next.hasAttribute('inert')) return next.querySelector('button')
  for (let previous = row?.previousElementSibling; previous; previous = previous.previousElementSibling) if (!previous.hasAttribute('inert')) return previous.querySelector('button')
  return row?.closest('ul') ?? null
}

const UNREAD_SURFACE = { background: 'var(--bg-card)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }
const READ_SURFACE = { background: 'transparent', boxShadow: 'inset 0 0 0 1px transparent' }

/** The fill and the ring of the row. On the Orbit logic a read row keeps a clear fill and ring, so both can settle. */
function rowSurface(unread: boolean, guided: boolean, reducedMotion: boolean) {
  if (!guided) return unread ? UNREAD_SURFACE : undefined
  return { ...(unread ? UNREAD_SURFACE : READ_SURFACE), transition: unreadSettle(['background-color', 'box-shadow'], unread, reducedMotion) }
}

/** The unread dot. On the Orbit logic it stays mounted and fades, so the mark settles as the row turns read. */
function UnreadDot({ unread, guided, reducedMotion }: Readonly<{ unread: boolean; guided: boolean; reducedMotion: boolean }>) {
  if (guided) return <span data-unread-mark={unread ? 'unread' : 'read'} data-unread-dot={unread ? '' : undefined} className="size-2 rounded-full bg-[var(--fg-1)]" style={{ opacity: unread ? 1 : 0, transition: unreadSettle(['opacity'], unread, reducedMotion) }} />
  return unread ? <span data-unread-dot="" className="size-2 rounded-full bg-[var(--fg-1)]" /> : null
}

function settleState(guided: boolean, reducedMotion: boolean): 'still' | 'motion' | undefined {
  if (!guided) return undefined
  return reducedMotion ? 'still' : 'motion'
}

export function NotificationRow({ item, onOpen, onDelete, element: Row = 'li' }: Readonly<{
  item: NotificationItem
  onOpen: (item: NotificationItem) => void
  onDelete: (item: NotificationItem) => void
  /** `div` where a motion `li` already wraps the row. Default `li`. */
  element?: 'li' | 'div'
}>) {
  const t = useTranslations()
  const guided = useFlag('orbit_guided_flows')
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const targetKey = getNotificationTargetKey(item.url, item.habitId)
  const unread = !item.isRead
  return (
    <Row data-read={item.isRead} data-unread-settle={settleState(guided, reducedMotion)} className="orbit-notification-surface flex items-stretch gap-1 rounded-[var(--r-well)]"
      style={rowSurface(unread, guided, reducedMotion)}>
      <button type="button" onClick={() => onOpen(item)}
        aria-label={`${item.title}. ${t(item.isRead ? 'notifications.read' : 'notifications.unread')}${targetKey ? `. ${t(targetKey)}` : ''}`}
        className="transition-[background-color] duration-[var(--dur-hover)] ease-[var(--ease-standard)] orbit-notification-row flex min-h-[var(--touch-min)] min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-[var(--r-well)] border-0 bg-transparent p-4 text-left ">
        <span aria-hidden="true" data-unread-column="" className="flex w-2 shrink-0 self-stretch items-center">
          <UnreadDot unread={unread} guided={guided} reducedMotion={reducedMotion} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-baseline gap-2">
            <PersonalText data-notification-title="" className="min-w-0 flex-1 text-base"
              style={{ lineHeight: 1.4, fontWeight: item.isRead ? 400 : 500, color: item.isRead ? 'var(--fg-2)' : 'var(--fg-1)' }}>{item.title}</PersonalText>
            <span className="shrink-0 font-mono text-xs text-[var(--fg-2)]">
              {formatNotificationRelativeTime(item.createdAtUtc, (key, values) => t(`notifications.${key}`, values))}
            </span>
          </span>
          <span className="text-sm text-[var(--fg-2)]" style={{ lineHeight: 1.5, overflowWrap: 'anywhere' }}>{item.body}</span>
          {targetKey ? <span className="flex items-center gap-2 font-mono text-xs text-[var(--fg-2)]">
            <NotificationTargetIcon targetKey={targetKey} color="var(--fg-3)" />{t(targetKey)}
          </span> : null}
        </span>
      </button>
      <button type="button" aria-label={t('notifications.deleteNotification', { title: item.title })}
        onClick={(event) => {
          const destination = focusAfterDelete(event.currentTarget.closest('li'))
          if (destination instanceof HTMLElement) destination.focus()
          onDelete(item)
        }}
        className="transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] orbit-notification-row orbit-notification-delete grid size-[var(--touch-min)] shrink-0 cursor-pointer touch-manipulation self-center place-items-center rounded-full border-0 bg-transparent ">
        <Trash2 size={20} color="var(--status-bad)" aria-hidden="true" focusable="false" />
      </button>
    </Row>
  )
}
