'use client'

import { Orbit, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface HabitAskAstraButtonProps {
  askPrompt: string
  onPress: () => void
}

export function HabitAskAstraButton({
  askPrompt,
  onPress,
}: Readonly<HabitAskAstraButtonProps>) {
  const t = useTranslations()
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={`${t('habits.detail.askAstraEyebrow')}: ${askPrompt}`}
      className="block w-full text-left appearance-none border-0 bg-transparent cursor-pointer transition-[background-color,transform] duration-150 ease-out hover:bg-[var(--bg-elev-pressed)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary active:scale-[0.99]"
      style={{ borderRadius: 8, padding: '8px 10px', margin: '-8px -10px' }}
    >
      <div className="flex items-center gap-3">
        <div className="relative flex-1 min-w-0" style={{ paddingLeft: 14 }}>
          <span
            aria-hidden="true"
            className="absolute rounded-[1px]"
            style={{ left: 0, top: 4, bottom: 4, width: 2, background: 'var(--primary)' }}
          />
          <div className="inline-flex items-center" style={{ gap: 6, marginBottom: 6 }}>
            <Orbit size={12} strokeWidth={1.7} color="var(--primary)" />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                fontWeight: 500,
                letterSpacing: '0.06em',
                color: 'var(--fg-3)',
              }}
            >
              {t('habits.detail.askAstraEyebrow')}
            </span>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 15,
              lineHeight: 1.5,
              color: 'var(--fg-2)',
              textWrap: 'pretty',
            }}
          >
            {askPrompt}
          </div>
        </div>
        <ChevronRight
          size={16}
          strokeWidth={1.7}
          color="var(--fg-3)"
          aria-hidden="true"
          className="shrink-0"
        />
      </div>
    </button>
  )
}
