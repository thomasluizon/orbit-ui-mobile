'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { useNotificationInbox } from '@/hooks/use-notification-inbox'
import { useMarkNotificationRead, useMarkAllNotificationsRead, useDeleteNotification, useDeleteAllNotifications } from '@/hooks/use-notifications'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { cancelPendingNotificationDelete, queuePendingNotificationDelete } from '@/lib/pending-notification-deletes'
import { ArrowLeft } from '@/components/ui/icons'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { NotificationBell } from './notification-bell'
import { NotificationDetailModal } from './notification-detail-modal'
import { NotificationList } from './notification-list'

export function NotificationInbox() {
  const t = useTranslations()
  const goBack = useGoBackOrFallback()
  const inbox = useNotificationInbox()
  const markAsRead = useMarkNotificationRead()
  const markAllAsRead = useMarkAllNotificationsRead()
  const deleteNotification = useDeleteNotification()
  const deleteAll = useDeleteAllNotifications()
  const [selected, setSelected] = useState<NotificationItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  function requestDeleteNotification(item: NotificationItem) {
    queuePendingNotificationDelete(item.id, () => deleteNotification.mutate(item.id))
  }

  return (
    <section className="mx-auto flex w-full max-w-[560px] flex-col">
      <header className="flex flex-col shadow-[inset_0_-1px_0_var(--hairline)]">
        <div className="flex items-center gap-2 px-3 pt-2">
          <button type="button" aria-label={t('common.back')} onClick={() => goBack('/')}
            className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full hover:bg-[var(--bg-hover)]">
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <h1 className="min-w-0 flex-1 text-xl font-medium">{t('notifications.title')}</h1>
          <NotificationBell />
        </div>
        <div className="flex flex-wrap items-center gap-2 px-2 pb-2">
          {inbox.visibleUnreadCount > 0 ? <button type="button" className="min-h-11 cursor-pointer rounded-full px-2 text-sm text-[var(--fg-1)] hover:bg-[var(--bg-hover)]"
            onClick={() => markAllAsRead.mutate()}>{t('notifications.markAllRead')}</button> : null}
          {inbox.visibleNotifications.length > 0 ? <button type="button" className="min-h-11 cursor-pointer rounded-full px-2 text-sm text-[var(--fg-1)] hover:bg-[var(--bg-hover)]"
            onClick={() => setConfirmOpen(true)}>{t('notifications.deleteAll')}</button> : null}
        </div>
      </header>
      <NotificationList items={inbox.visibleNotifications} isLoading={inbox.isLoading} isError={inbox.isError}
        onRetry={() => void inbox.refetch()} onDelete={requestDeleteNotification}
        onOpen={(item) => { setSelected(item); setDetailOpen(true) }} />
      {selected ? <NotificationDetailModal open={detailOpen} onOpenChange={setDetailOpen}
        notification={inbox.notifications.find((item) => item.id === selected.id) ?? selected}
        onMarkAsRead={(id) => markAsRead.mutate(id)}
        onDelete={() => requestDeleteNotification(selected)} /> : null}
      <ConfirmSheet open={confirmOpen} title={t('notifications.deleteAllConfirmTitle')}
        message={t('notifications.deleteAllConfirmDescription', { count: inbox.notifications.length })}
        confirmLabel={t('notifications.delete')} destructive
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false)
          inbox.pendingDeleteIds.forEach(cancelPendingNotificationDelete)
          deleteAll.mutate()
        }} />
    </section>
  )
}
