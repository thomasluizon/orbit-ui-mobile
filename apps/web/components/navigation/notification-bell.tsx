'use client'

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { Bell, BellOff, Trash2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { formatNotificationRelativeTime } from '@orbit/shared/utils'
import { plural } from '@/lib/plural'
import type { NotificationItem } from '@orbit/shared/types/notification'
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDeleteNotification,
  useDeleteAllNotifications,
} from '@/hooks/use-notifications'
import { Popover } from '@/components/ui/popover'
import { NotificationDetailModal } from './notification-detail-modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useAppToast } from '@/hooks/use-app-toast'
import {
  cancelPendingNotificationDelete,
  getPendingNotificationDeleteIdsSnapshot,
  queuePendingNotificationDelete,
  subscribePendingNotificationDeleteIds,
} from '@/lib/pending-notification-deletes'

export function NotificationBell() {
  const t = useTranslations()
  const { notifications, isLoading } = useNotifications()
  const markAsRead = useMarkNotificationRead()
  const markAllAsRead = useMarkAllNotificationsRead()
  const deleteNotification = useDeleteNotification()
  const deleteAll = useDeleteAllNotifications()
  const { showQueued } = useAppToast()

  const [isOpen, setIsOpen] = useState(false)
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)
  const pendingDeleteIds = useSyncExternalStore(
    subscribePendingNotificationDeleteIds,
    getPendingNotificationDeleteIdsSnapshot,
    getPendingNotificationDeleteIdsSnapshot,
  )
  const pendingDeleteIdSet = useMemo(() => new Set(pendingDeleteIds), [pendingDeleteIds])

  const visibleNotifications = useMemo(
    () => notifications.filter((item) => !pendingDeleteIdSet.has(item.id)),
    [notifications, pendingDeleteIdSet],
  )
  const visibleUnreadCount = useMemo(
    () => visibleNotifications.filter((item) => !item.isRead).length,
    [visibleNotifications],
  )

  const cancelPendingDelete = useCallback((notificationId: string) => {
    cancelPendingNotificationDelete(notificationId)
  }, [])

  const requestDeleteNotification = useCallback((notification: NotificationItem) => {
    const queued = queuePendingNotificationDelete(notification.id, () => {
      deleteNotification.mutate(notification.id)
    })
    if (!queued) return

    showQueued(t('notifications.deleteQueued'), t('notifications.deleteUndo'), () => {
      cancelPendingDelete(notification.id)
    })
  }, [cancelPendingDelete, deleteNotification, showQueued, t])

  function handleClick(notification: NotificationItem) {
    setIsOpen(false)
    setSelectedNotification(notification)
    setIsModalOpen(true)
    if (!notification.isRead) {
      markAsRead.mutate(notification.id)
    }
  }

  function handleModalMarkAsRead(id: string) {
    markAsRead.mutate(id)
  }

  function handleModalDelete(id: string) {
    const notification = notifications.find((item) => item.id === id)
    if (notification) {
      requestDeleteNotification(notification)
    }
    setSelectedNotification(null)
  }

  const trigger = (
    <button
      type="button"
      data-tour="tour-notification-bell"
      aria-label={visibleUnreadCount > 0 ? plural(t('notifications.bellWithCount', { count: visibleUnreadCount }), visibleUnreadCount) : t('notifications.bell')}
      aria-expanded={isOpen}
      aria-controls="notification-dropdown"
      className="relative appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center text-[var(--fg-1)] transition-[background-color] duration-150 ease-out hover:bg-[var(--bg-elev)]"
      style={{
        width: 40,
        height: 40,
        borderRadius: 999,
        boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)',
      }}
      onClick={() => setIsOpen((prev) => !prev)}
    >
      <Bell size={22} strokeWidth={1.8} aria-hidden="true" />
      {visibleUnreadCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute"
          style={{
            top: 7,
            right: 7,
            width: 8,
            height: 8,
            borderRadius: 999,
            background: 'var(--primary)',
            boxShadow: '0 0 0 2px var(--bg)',
          }}
        />
      )}
    </button>
  )

  return (
    <>
      <Popover
        trigger={trigger}
        open={isOpen}
        onOpenChange={setIsOpen}
        placement="bottom-end"
        className="w-80 max-h-96 flex flex-col overflow-hidden"
      >
        <div
          className="flex items-center justify-between"
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--hairline)',
          }}
        >
          <h3
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 15,
              fontWeight: 500,
              color: 'var(--fg-1)',
            }}
          >
            {t('notifications.title')}
          </h3>
          <div className="flex items-center gap-2">
            {visibleUnreadCount > 0 && (
              <button
                type="button"
                className="appearance-none border-0 bg-transparent cursor-pointer transition-opacity duration-150 hover:opacity-80"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  fontWeight: 500,
                  padding: '6px 4px',
                  color: 'var(--fg-2)',
                }}
                onClick={() => markAllAsRead.mutate()}
              >
                {t('notifications.markAllRead')}
              </button>
            )}
            {visibleNotifications.length > 0 && (
              <button
                type="button"
                aria-label={t('notifications.deleteAll')}
                className="appearance-none border-0 bg-transparent cursor-pointer rounded-full text-[var(--fg-3)] hover:text-[var(--status-bad)] transition-colors duration-150"
                style={{ padding: 6 }}
                onClick={() => setShowDeleteAllConfirm(true)}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <ul
          id="notification-dropdown"
          className="flex-1 overflow-y-auto list-none m-0 p-0"
          aria-label={t('notifications.title')}
        >
          {isLoading && visibleNotifications.length === 0 && (
            <li className="p-4 space-y-3" aria-label={t('common.loading')}>
              <div
                className="animate-pulse"
                style={{ height: 48, borderRadius: 12, background: 'var(--bg-elev)' }}
              />
              <div
                className="animate-pulse"
                style={{ height: 48, borderRadius: 12, background: 'var(--bg-elev)' }}
              />
            </li>
          )}
          {!isLoading && visibleNotifications.length === 0 && (
            <li className="p-6 text-center">
              <BellOff
                className="size-8 mx-auto mb-2"
                strokeWidth={1.4}
                color="var(--fg-3)"
                aria-hidden="true"
              />
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  color: 'var(--fg-3)',
                }}
              >
                {t('notifications.empty')}
              </p>
            </li>
          )}
          {visibleNotifications.length > 0 &&
            visibleNotifications.map((item) => (
              <li
                key={item.id}
                className="flex items-start transition-[background-color] duration-150 hover:bg-[var(--bg-elev)]"
                style={{
                  gap: 10,
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--hairline)',
                  background: item.isRead
                    ? 'transparent'
                    : 'rgba(var(--primary-rgb), 0.08)',
                }}
              >
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left appearance-none border-0 bg-transparent cursor-pointer p-0"
                  aria-label={item.title}
                  onClick={() => handleClick(item)}
                >
                  <span className="flex items-baseline justify-between" style={{ gap: 8 }}>
                    <span
                      className="truncate"
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: 15,
                        fontWeight: item.isRead ? 400 : 500,
                        color: 'var(--fg-1)',
                      }}
                    >
                      {item.title}
                    </span>
                    <span
                      className="shrink-0"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: 'var(--fg-4)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatNotificationRelativeTime(item.createdAtUtc, (key, values) =>
                        t(`notifications.${key}`, values),
                      )}
                    </span>
                  </span>
                  <span
                    className="block"
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 13,
                      lineHeight: 1.4,
                      color: 'var(--fg-3)',
                      marginTop: 2,
                    }}
                  >
                    {item.body}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={t('notifications.deleteNotification')}
                  className="shrink-0 appearance-none border-0 bg-transparent cursor-pointer rounded-full text-[var(--fg-4)] hover:text-[var(--status-bad)] transition-colors duration-150"
                  style={{ padding: 8, margin: -4 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    requestDeleteNotification(item)
                  }}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
        </ul>
      </Popover>

      {selectedNotification && (
        <NotificationDetailModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          notification={selectedNotification}
          onMarkAsRead={handleModalMarkAsRead}
          onDelete={handleModalDelete}
        />
      )}
      <ConfirmDialog
        open={showDeleteAllConfirm}
        onOpenChange={setShowDeleteAllConfirm}
        title={t('notifications.deleteAllConfirmTitle')}
        description={t('notifications.deleteAllConfirmDescription')}
        confirmLabel={t('notifications.deleteAll')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => deleteAll.mutate()}
        variant="danger"
      />
    </>
  )
}
