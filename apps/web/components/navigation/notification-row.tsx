'use client'

import { useTranslations } from 'next-intl'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { formatNotificationRelativeTime, getNotificationTargetKey } from '@orbit/shared/utils'
import { Calendar, ChartLine, CircleDot, Home, Trash2, User } from '@/components/ui/icons'

const TARGET_ICONS = {
  'nav.today': Home,
  'nav.calendar': Calendar,
  'nav.progress': ChartLine,
  'nav.profile': User,
  'notifications.habit': CircleDot,
}

export function NotificationRow({ item, onOpen, onDelete }: Readonly<{
  item: NotificationItem
  onOpen: (item: NotificationItem) => void
  onDelete: (item: NotificationItem) => void
}>) {
  const t = useTranslations()
  const targetKey = getNotificationTargetKey(item.url, item.habitId)
  const TargetIcon = targetKey ? TARGET_ICONS[targetKey] : null
  return (
    <li data-read={item.isRead} className="flex items-stretch gap-1 rounded-[var(--r-well)]"
      style={item.isRead ? undefined : { background: 'var(--bg-card)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}>
      <button type="button" onClick={() => onOpen(item)}
        aria-label={`${item.title}. ${t(item.isRead ? 'notifications.read' : 'notifications.unread')}${targetKey ? `. ${t(targetKey)}` : ''}`}
        className="orbit-notification-row flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-[var(--r-well)] border-0 bg-transparent p-4 text-left hover:bg-[var(--bg-hover)]">
        <span aria-hidden="true" data-unread-column="" className="flex w-2 shrink-0 self-stretch items-center">
          {!item.isRead ? <span data-unread-dot="" className="size-2 rounded-full bg-[var(--fg-1)]" /> : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-baseline gap-2">
            <span data-notification-title="" className="min-w-0 flex-1 text-base"
              style={{ lineHeight: 1.4, fontWeight: item.isRead ? 400 : 500, color: item.isRead ? 'var(--fg-2)' : 'var(--fg-1)', overflowWrap: 'anywhere' }}>{item.title}</span>
            <span className="shrink-0 font-mono text-xs text-[var(--fg-4)]">
              {formatNotificationRelativeTime(item.createdAtUtc, (key, values) => t(`notifications.${key}`, values))}
            </span>
          </span>
          <span className="text-sm text-[var(--fg-3)]" style={{ lineHeight: 1.5, overflowWrap: 'anywhere' }}>{item.body}</span>
          {targetKey && TargetIcon ? <span className="flex items-center gap-2 font-mono text-xs text-[var(--fg-4)]">
            <TargetIcon size={16} aria-hidden="true" />{t(targetKey)}
          </span> : null}
        </span>
      </button>
      <button type="button" aria-label={t('notifications.deleteNotification', { title: item.title })}
        onClick={() => onDelete(item)}
        className="grid size-11 shrink-0 cursor-pointer place-items-center self-center rounded-full border-0 bg-transparent text-[var(--status-bad)] hover:bg-[var(--bg-hover)]">
        <Trash2 size={20} aria-hidden="true" />
      </button>
    </li>
  )
}
