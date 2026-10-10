import { useId } from 'react'
import Link from 'next/link'
import type { useTranslations } from 'next-intl'

interface ReminderPermissionNoticeProps {
  visible: boolean
  t: ReturnType<typeof useTranslations>
}

export function ReminderPermissionNotice({ visible, t }: Readonly<ReminderPermissionNoticeProps>) {
  const descriptionId = useId()

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className={visible ? "rounded-[12px] bg-[var(--bg-well)]" : "sr-only"}>
        {visible && (
          <Link
            href="/profile/notifications"
            target="_blank"
            rel="noopener noreferrer"
            aria-describedby={descriptionId}
            className="flex touch-manipulation min-h-[48px] items-center rounded-[12px] px-2 py-2 text-xs leading-[1.5] text-[var(--fg-2)] motion-safe:transition-[background-color] motion-safe:duration-[var(--dur-hover-control)] motion-safe:ease-[var(--ease-standard)] hover:bg-[var(--bg-hover-opaque)] active:bg-[var(--bg-hover-opaque)] motion-safe:active:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--fg-1)]"
          >
            <span className="text-pretty">{t('habits.form.reminderPermissionNeeded')}</span>
          </Link>
        )}
      </div>
      {visible && <span id={descriptionId} className="sr-only">{t('habits.form.reminderSettingsDescription')}</span>}
    </>
  )
}
