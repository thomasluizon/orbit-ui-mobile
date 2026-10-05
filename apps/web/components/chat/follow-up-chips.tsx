'use client'

import { useTranslations } from 'next-intl'

export function FollowUpChips({ followUps, onSelect }: Readonly<{
  followUps: readonly string[]
  onSelect: (text: string) => void
}>) {
  const t = useTranslations()
  if (followUps.length < 2) return null
  return <div aria-label={t('chat.followUps.label')} role="group" className="flex min-w-0 flex-col gap-[8px] pb-3">
    <span className="text-xs text-[var(--fg-3)]">{t('chat.followUps.label')}</span>
    <div className="flex min-w-0 flex-col gap-[8px]">
      {followUps.slice(0, 3).map((text) => <button
        key={text}
        type="button"
        onClick={() => onSelect(text)}
        aria-label={text}
        className="min-h-[var(--touch-min)] w-full min-w-0 max-w-full rounded-[12px] bg-[var(--bg-well)] px-[16px] py-[12px] text-start text-sm font-medium text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg-1)]"
      ><span className="block whitespace-normal leading-[1.4] [overflow-wrap:anywhere]">{text}</span></button>)}
    </div>
  </div>
}
