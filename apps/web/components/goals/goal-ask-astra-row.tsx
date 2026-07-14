'use client'

import { ChevronRight, Orbit } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface GoalAskAstraRowProps {
  onClick: () => void
  className?: string
  style?: React.CSSProperties
}

/** Ask-Astra prompt row: Orbit glyph in a 28px primary-tint well, eyebrow and
 *  prompt copy beside it, chevron trailing. Rendered in the goal drawer footer. */
export function GoalAskAstraRow({ onClick, className, style }: Readonly<GoalAskAstraRowProps>) {
  const t = useTranslations()
  const prompt = t('goals.detail.askAstraDefault')
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${t('goals.detail.askAstraEyebrow')}: ${prompt}`}
      className={[
        'block w-full text-left appearance-none border-0 bg-transparent cursor-pointer transition-[background-color,transform] duration-150 ease-out hover:bg-[var(--bg-elev-pressed)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary active:scale-[0.99]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex shrink-0 items-center justify-center"
          style={{
            width: 28,
            height: 28,
            borderRadius: 9,
            background: 'rgba(var(--primary-rgb), 0.10)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--primary-rgb), 0.28)',
          }}
        >
          <Orbit size={15} strokeWidth={1.9} color="var(--primary)" />
        </span>
        <div className="min-w-0 flex-1">
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.06em',
              color: 'var(--fg-3)',
              marginBottom: 4,
            }}
          >
            {t('goals.detail.askAstraEyebrow')}
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
            {prompt}
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
