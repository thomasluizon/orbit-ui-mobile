'use client'

import { PersonalText } from '@/components/ui/personal-text'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown } from '@/components/ui/icons'

export function SupportReplyEmail({ email }: Readonly<{ email: string }>) {
  const t = useTranslations()
  const id = useId()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <button
        type="button"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-describedby={`${id}-value ${id}-hint`}
        aria-controls={`${id}-value`}
        aria-expanded={expanded}
        disabled={!email}
        onClick={() => setExpanded(!expanded)}
        className="flex overflow-hidden min-h-[48px] w-full min-w-0 flex-col gap-2 rounded-[var(--r-well)] bg-transparent px-4 py-3 text-start text-[var(--fg-1)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] enabled:cursor-pointer enabled:hover:bg-[var(--bg-hover-opaque)] enabled:active:bg-[var(--bg-hover-opaque)] focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span className="flex w-full items-center justify-between gap-3 text-sm text-[var(--fg-2)]">
          <span id={`${id}-label`}>{t('profile.support.email')}</span>
          {email ? <ChevronDown size={20} strokeWidth={1.5} aria-hidden className={expanded ? 'shrink-0 rotate-180' : 'shrink-0'} /> : null}
        </span>
        <PersonalText
          expanded={expanded}
          id={`${id}-value`}
          translate="no"
          className="w-full min-w-0 text-base leading-[1.5]"
        >
          {email}
        </PersonalText>
      </button>
      <p id={`${id}-hint`} className="text-sm leading-[1.5] text-[var(--fg-3)]">
        {t('profile.support.emailLockedReason')}
      </p>
    </div>
  )
}
