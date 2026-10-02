'use client'

import { ActionRow } from '@/components/ui/action-row'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { useNotificationInbox } from '@/hooks/use-notification-inbox'
import { useMarkNotificationRead, useMarkAllNotificationsRead, useDeleteNotification, useDeleteAllNotifications } from '@/hooks/use-notifications'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useResetOnAccountChange } from '@/hooks/use-session-reset'
import { cancelPendingNotificationDelete, clearFailedNotificationDeletes, queuePendingNotificationDelete } from '@/lib/pending-notification-deletes'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/pill-button'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { NotificationBellDisplay } from './notification-bell'
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

  useResetOnAccountChange(() => {
    setSelected(null)
    setDetailOpen(false)
    setConfirmOpen(false)
  })

  function requestDeleteNotification(item: NotificationItem) {
    queuePendingNotificationDelete(item.id, () => deleteNotification.mutateAsync(item.id))
  }

  return (
    <section className="flex w-full flex-col">
      <PageHeader title={t('notifications.title')} backLabel={t('common.back')}
        onBack={() => goBack('/')} action={<NotificationBellDisplay count={inbox.visibleUnreadCount} />}
        refreshKey={`${inbox.visibleUnreadCount}:${inbox.visibleNotifications.length}`}
        footer={inbox.visibleUnreadCount > 0 || inbox.visibleNotifications.length > 0 ? <div className="flex flex-wrap items-center gap-2 px-2 pb-2"><ActionRow>
          {inbox.visibleUnreadCount > 0 ? (
            /* eslint-disable-next-line local/max-button-words -- granted canvas label, Orbit Avisos.dc.html:206 (D42) */
            <Button variant="ghost" size="sm"
              onClick={() => markAllAsRead.mutate()}>{t('notifications.markAllRead')}</Button>
          ) : null}
          {inbox.visibleNotifications.length > 0 ? <Button variant="ghost" size="sm"
            onClick={() => setConfirmOpen(true)}>{t('notifications.deleteAll')}</Button> : null}
        </ActionRow></div> : undefined}
      />
      <div className="lg:ms-12 lg:ps-3">
        <NotificationList items={inbox.visibleNotifications} isLoading={inbox.isLoading} isError={inbox.isError}
          onRetry={() => void inbox.refetch()} onDelete={requestDeleteNotification}
          onOpen={(item) => { setSelected(item); setDetailOpen(true) }} />
      </div>
      {selected ? <NotificationDetailModal open={detailOpen} onOpenChange={setDetailOpen}
        notification={inbox.notifications.find((item) => item.id === selected.id) ?? selected}
        onMarkAsRead={(id) => markAsRead.mutate(id)}
        onDelete={() => requestDeleteNotification(selected)} /> : null}
      <ConfirmSheet open={confirmOpen} title={t('notifications.deleteAllConfirmTitle')}
        message={t('notifications.deleteAllConfirmDescription', { count: inbox.visibleNotifications.length })}
        confirmLabel={t('notifications.deleteAllAction')} destructive inlineActions
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false)
          inbox.pendingDeleteIds.forEach(cancelPendingNotificationDelete)
          clearFailedNotificationDeletes()
          deleteAll.mutate()
        }} />
    </section>
  )
}
