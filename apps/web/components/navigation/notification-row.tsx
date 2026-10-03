'use client'

import { DestinationIcon } from '@/components/navigation/destination-icon'

import { useTranslations } from 'next-intl'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { formatNotificationRelativeTime, getNotificationTargetKey, getDestinationForLabel } from '@orbit/shared/utils'
import { CircleDot, Gift, Trash2 } from '@/components/ui/icons'

function NotificationTargetIcon({ targetKey, color }: Readonly<{
  targetKey: NonNullable<ReturnType<typeof getNotificationTargetKey>>
  color: string
}>) {
  const destination = getDestinationForLabel(targetKey)
  if (destination) return <DestinationIcon destination={destination} size={16} color={color} />
  const Icon = targetKey === 'profile.wrappedTitle' ? Gift : CircleDot
  return <Icon size={16} color={color} aria-hidden="true" />
}

export function NotificationRow({ item, onOpen, onDelete }: Readonly<{
  item: NotificationItem
  onOpen: (item: NotificationItem) => void
  onDelete: (item: NotificationItem) => void
}>) {
  const t = useTranslations()
  const targetKey = getNotificationTargetKey(item.url, item.habitId)
  return (
    <li data-read={item.isRead} className="flex items-stretch gap-1 rounded-[var(--r-well)]"
      style={item.isRead ? undefined : { background: 'var(--bg-card)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}>
      <button type="button" onClick={() => onOpen(item)}
        style={{ transition: 'background-color var(--dur-hover) var(--ease-standard)' }}
        aria-label={`${item.title}. ${t(item.isRead ? 'notifications.read' : 'notifications.unread')}${targetKey ? `. ${t(targetKey)}` : ''}`}
        className="orbit-notification-row flex min-h-[var(--touch-min)] min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-[var(--r-well)] border-0 bg-transparent p-4 text-left hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]">
        <span aria-hidden="true" data-unread-column="" className="flex w-2 shrink-0 self-stretch items-center">
          {!item.isRead ? <span data-unread-dot="" className="size-2 rounded-full bg-[var(--fg-1)]" /> : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-baseline gap-2">
            <span data-notification-title="" className="min-w-0 flex-1 text-base"
              style={{ lineHeight: 1.4, fontWeight: item.isRead ? 400 : 500, color: item.isRead ? 'var(--fg-2)' : 'var(--fg-1)', overflowWrap: 'anywhere' }}>{item.title}</span>
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
          const row = event.currentTarget.closest('li')
          const destination = row?.nextElementSibling?.querySelector('button')
            ?? row?.previousElementSibling?.querySelector('button') ?? row?.closest('ul')
          if (destination instanceof HTMLElement) destination.focus()
          onDelete(item)
        }}
        style={{ transition: 'background-color var(--dur-hover-control) var(--ease-standard)' }}
        className="orbit-notification-row grid size-[var(--touch-min)] shrink-0 cursor-pointer touch-manipulation self-center place-items-center rounded-full border-0 bg-transparent hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]">
        <Trash2 size={20} color="var(--status-bad)" aria-hidden="true" focusable="false" />
      </button>
    </li>
  )
}
