'use client'

import { useState } from 'react'
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

export function NotificationBell() {
  const t = useTranslations()
  const { notifications, unreadCount, isLoading } = useNotifications()
  const markAsRead = useMarkNotificationRead()
  const markAllAsRead = useMarkAllNotificationsRead()
  const deleteNotification = useDeleteNotification()
  const deleteAll = useDeleteAllNotifications()

  const [isOpen, setIsOpen] = useState(false)
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

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
    deleteNotification.mutate(id)
    setSelectedNotification(null)
  }

  const trigger = (
    <button
      aria-label={unreadCount > 0 ? plural(t('notifications.bellWithCount', { count: unreadCount }), unreadCount) : t('notifications.bell')}
      aria-expanded={isOpen}
      aria-controls="notification-dropdown"
      className="relative size-9 flex items-center justify-center rounded-full bg-surface-elevated/60 hover:bg-surface-elevated border border-border-muted hover:border-border transition-all duration-200 text-text-secondary hover:text-text-primary"
      onClick={() => setIsOpen((prev) => !prev)}
    >
      <Bell className="size-4" aria-hidden="true" />
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 size-4.5 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-gentle-pulse"
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
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
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-muted">
          <h3 className="text-sm font-bold text-text-primary">{t('notifications.title')}</h3>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                onClick={() => markAllAsRead.mutate()}
              >
                {t('notifications.markAllRead')}
              </button>
            )}
            {notifications.length > 0 && (
              <button
                aria-label={t('notifications.deleteAll')}
                className="p-1 text-text-muted hover:text-red-500 transition-colors rounded-full hover:bg-red-500/10"
                onClick={() => deleteAll.mutate()}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <ul
          id="notification-dropdown"
          className="flex-1 overflow-y-auto list-none m-0 p-0"
          aria-label={t('notifications.title')}
        >
          {isLoading && notifications.length === 0 && (
            <li className="p-4 space-y-3" aria-label={t('common.loading')}>
              <div className="h-12 bg-surface-elevated rounded-xl animate-pulse" />
              <div className="h-12 bg-surface-elevated rounded-xl animate-pulse" />
            </li>
          )}
          {!isLoading && notifications.length === 0 && (
            <li className="p-6 text-center">
              <BellOff className="size-8 text-text-muted mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm text-text-muted">{t('notifications.empty')}</p>
            </li>
          )}
          {notifications.length > 0 &&
            notifications.map((item) => (
              <li
                key={item.id}
                className={`px-4 py-3 flex items-start gap-3 transition-all duration-150 hover:bg-surface-elevated ${
                  item.isRead ? '' : 'bg-primary/5'
                }`}
              >
                <div
                  aria-hidden="true"
                  className={`shrink-0 mt-1 size-2 rounded-full ${
                    item.isRead ? 'bg-transparent' : 'bg-primary'
                  }`}
                />
                <button
                  className="flex-1 min-w-0 text-left"
                  aria-label={item.title}
                  onClick={() => handleClick(item)}
                >
                  <p className="text-sm font-medium text-text-primary truncate">{item.title}</p>
                  <p className="text-xs text-text-secondary">{item.body}</p>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    {formatNotificationRelativeTime(item.createdAtUtc, (key, values) =>
                      t(`notifications.${key}`, values),
                    )}
                  </p>
                </button>
                <button
                  aria-label={t('notifications.deleteNotification')}
                  className="shrink-0 p-1 text-text-muted hover:text-red-500 transition-colors rounded-full hover:bg-red-500/10"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteNotification.mutate(item.id)
                  }}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
        </ul>
      </Popover>

      {/* Detail Modal */}
      {selectedNotification && (
        <NotificationDetailModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          notification={selectedNotification}
          onMarkAsRead={handleModalMarkAsRead}
          onDelete={handleModalDelete}
        />
      )}
    </>
  )
}
