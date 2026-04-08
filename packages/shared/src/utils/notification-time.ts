export interface NotificationTimeTranslationAdapter {
  now: string
  minutesAgo: string
  hoursAgo: string
  daysAgo: string
}

export function formatNotificationRelativeTime(
  dateStr: string,
  translate: (key: keyof NotificationTimeTranslationAdapter, values?: { n: number }) => string,
  now: Date = new Date(),
): string {
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) {
    return translate('now')
  }

  if (diffMin < 60) {
    return translate('minutesAgo', { n: diffMin })
  }

  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) {
    return translate('hoursAgo', { n: diffHours })
  }

  const diffDays = Math.floor(diffHours / 24)
  return translate('daysAgo', { n: diffDays })
}
