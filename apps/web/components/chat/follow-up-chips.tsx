'use client'

import { useTranslations } from 'next-intl'

export function FollowUpChips({ followUps, onSelect }: Readonly<{
  followUps: readonly string[]
  onSelect: (text: string) => void
}>) {
  const t = useTranslations()
  if (followUps.length < 2) return null
  return <div aria-label={t('chat.followUps.label')} role="group" className="flex flex-col gap-2 px-4 pb-3">
    <span className="text-xs text-[var(--fg-3)]">{t('chat.followUps.label')}</span>
    <div className="flex flex-wrap gap-2">
      {followUps.slice(0, 3).map((text) => <button
        key={text}
        type="button"
        onClick={() => onSelect(text)}
        className="min-h-11 rounded-full bg-[var(--bg-well)] px-4 text-sm font-medium text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg-1)]"
      >{text}</button>)}
    </div>
  </div>
}
