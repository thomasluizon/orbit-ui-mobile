'use client'

import { useTranslations } from 'next-intl'
import { ChevronLeft, HelpCircle, Share2, X } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

type AppBarRightVariant = 'help' | 'close' | 'share'

/** Kit NavHeader: 56px transparent bar — equal flexible side slots (min 40px)
 *  keep the uppercase title truly centered regardless of trailing cluster width. */
interface AppBarProps {
  back?: boolean
  /** Accessibility label for the back/leading button. Defaults to t('common.back'). */
  backLabel?: string
  onBack?: () => void
  leadingIcon?: ReactNode
  /** Mark rendered immediately before the centered title (e.g. Astra's avatar). */
  titleIcon?: ReactNode
  /** Centered uppercase label. Omit for bars whose content carries its own heading. */
  title?: string
  subtitle?: string
  /** Arbitrary right-slot cluster; takes precedence over `right`. */
  trailing?: ReactNode
  /** Standard right-slot action: help (ringed), close, or share. */
  right?: AppBarRightVariant
  onRight?: () => void
  /** Accessibility label for the `right` action. Defaults to the matching common.* key. */
  rightLabel?: string
}

const iconButtonClass =
  'appearance-none border-0 bg-transparent cursor-pointer p-0 inline-flex items-center justify-center transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:scale-[0.92]'

const iconButtonStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 999,
  color: 'var(--fg-1)',
}

export function AppBar({
  back = false,
  backLabel,
  onBack,
  leadingIcon,
  titleIcon,
  title,
  subtitle,
  trailing,
  right,
  onRight,
  rightLabel,
}: Readonly<AppBarProps>) {
  const t = useTranslations('common')
  const resolvedBackLabel = backLabel ?? t('back')

  const rightAction = right ? (
    <button
      type="button"
      aria-label={
        rightLabel ??
        (right === 'help' ? t('help') : right === 'close' ? t('close') : t('share'))
      }
      onClick={onRight}
      className={iconButtonClass}
      style={
        right === 'help'
          ? {
              ...iconButtonStyle,
              boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)',
            }
          : iconButtonStyle
      }
    >
      {right === 'help' && <HelpCircle size={22} strokeWidth={1.8} />}
      {right === 'close' && <X size={24} strokeWidth={1.8} />}
      {right === 'share' && <Share2 size={21} strokeWidth={1.8} />}
    </button>
  ) : null

  return (
    <div
      className="flex items-center shrink-0"
      style={{ minHeight: 56, padding: '8px 14px', gap: 4 }}
    >
      <div className="flex justify-start" style={{ flex: '1 0 0%', minWidth: 40 }}>
        {back || onBack ? (
          <button
            type="button"
            aria-label={resolvedBackLabel}
            onClick={onBack}
            className={iconButtonClass}
            style={iconButtonStyle}
          >
            {back ? <ChevronLeft size={26} strokeWidth={2} /> : leadingIcon}
          </button>
        ) : leadingIcon ? (
          <span
            aria-hidden="true"
            className="inline-flex items-center justify-center"
            style={{ width: 40, height: 40, color: 'var(--fg-1)' }}
          >
            {leadingIcon}
          </span>
        ) : null}
      </div>

      {(title || titleIcon) && (
        <div className="flex flex-col justify-center min-w-0" style={{ gap: 2 }}>
          <div className="flex items-center justify-center min-w-0" style={{ gap: 8 }}>
            {titleIcon}
            {title && (
              <span
                className="overflow-hidden whitespace-nowrap text-ellipsis"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: '0.09em',
                  textTransform: 'uppercase',
                  color: 'var(--fg-1)',
                }}
              >
                {title}
              </span>
            )}
          </div>
          {subtitle && (
            <div
              className="overflow-hidden whitespace-nowrap text-ellipsis text-center"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--fg-3)',
                letterSpacing: '0.02em',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      )}

      <div
        className="flex items-center justify-end"
        style={{ flex: '1 0 0%', minWidth: 40, gap: 10 }}
      >
        {trailing ?? rightAction}
      </div>
    </div>
  )
}
