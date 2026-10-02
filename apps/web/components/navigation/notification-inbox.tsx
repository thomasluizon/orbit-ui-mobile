'use client'

import { useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { useNotificationInbox } from '@/hooks/use-notification-inbox'
import { useMarkNotificationRead, useMarkAllNotificationsRead, useDeleteNotification, useDeleteAllNotifications } from '@/hooks/use-notifications'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useResetOnAccountChange } from '@/hooks/use-session-reset'
import { cancelPendingNotificationDelete, clearFailedNotificationDeletes, queuePendingNotificationDelete } from '@/lib/pending-notification-deletes'
import { PageHeader } from '@/components/ui/page-header'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { MoreVertical } from '@/components/ui/icons'
import { Menu } from '@/components/ui/menu'
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
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const menuAnchorRef = useRef<HTMLButtonElement>(null)

  useResetOnAccountChange(() => {
    setSelected(null)
    setDetailOpen(false)
    setConfirmOpen(false)
    setMenuOpen(false)
  })

  function requestDeleteNotification(item: NotificationItem) {
    queuePendingNotificationDelete(item.id, () => deleteNotification.mutateAsync(item.id))
  }

  return (
    <section className="flex w-full flex-col">
      <PageHeader title={t('notifications.title')} backLabel={t('common.back')}
        onBack={() => goBack('/')} action={inbox.visibleNotifications.length > 0 ? <button ref={menuAnchorRef} type="button"
          aria-label={t('notifications.options')} aria-expanded={menuOpen} aria-controls={menuId}
          onClick={() => setMenuOpen((open) => !open)}
          className="grid min-h-[48px] w-[48px] shrink-0 cursor-pointer place-items-center rounded-full text-[var(--fg-2)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:enabled:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2">
          <MoreVertical size={20} aria-hidden="true" />
        </button> : undefined}
        refreshKey={`${inbox.visibleUnreadCount}:${inbox.visibleNotifications.length}:${menuOpen}`} />
      <Menu id={menuId} open={menuOpen} anchorRef={menuAnchorRef} title={t('common.options')}
        items={[
          ...(inbox.visibleUnreadCount > 0 ? [{ id: 'read', label: t('notifications.markAllReadMenu'), icon: 'check' }] : []),
          ...(inbox.visibleNotifications.length > 0 ? [{ id: 'clear', label: t('notifications.deleteAll'), icon: 'trash', destructive: true }] : []),
        ]}
        onClose={() => setMenuOpen(false)} onSelect={(id) => {
          if (id === 'read') markAllAsRead.mutate()
          else if (id === 'clear') setConfirmOpen(true)
        }} />
      <div className="lg:ms-12 lg:ps-4">
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
