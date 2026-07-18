'use client'

import { Trash2 } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { normalizeUserFactCategory } from '@orbit/shared/utils'
import { RadioGlyph } from '@/components/ui/select-check'
import type { UserFact } from '@orbit/shared/types/user-fact'

interface FactItemProps {
  fact: UserFact
  selectMode: boolean
  isSelected: boolean
  onToggleSelection: () => void
  onDelete: () => void
}

const categoryBadgeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  // react-doctor-disable-next-line no-tiny-text -- intentional pill badge matching DESIGN.md Badge (10.5/600 UPPERCASE); not body text https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  fontSize: 10,
  fontWeight: 500,
  color: 'var(--fg-3)',
  letterSpacing: '0.06em',
  padding: '2px 7px',
  borderRadius: 999,
  alignSelf: 'flex-start',
  boxShadow: 'inset 0 0 0 1px var(--hairline-strong)',
}

export function FactItem({
  fact,
  selectMode,
  isSelected,
  onToggleSelection,
  onDelete,
}: Readonly<FactItemProps>) {
  const t = useTranslations()
  const category = fact.category ? normalizeUserFactCategory(fact.category) : null
  const categoryLabel = category
    ? t(`profile.facts.${category}`).toUpperCase()
    : null

  const cardStyle: React.CSSProperties = {
    padding: '14px 16px',
    gap: 12,
    borderRadius: 16,
    background: isSelected
      ? 'rgba(var(--primary-rgb), 0.08)'
      : 'var(--bg-card)',
    boxShadow: isSelected
      ? 'inset 0 0 0 1px rgba(var(--primary-rgb), 0.28)'
      : 'inset 0 0 0 1px var(--hairline)',
  }

  const Inner = (
    <>
      {selectMode && <RadioGlyph selected={isSelected} size={18} />}
      <div className="flex-1 min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {categoryLabel && (
          <span style={categoryBadgeStyle}>
            {categoryLabel}
          </span>
        )}
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            lineHeight: 1.45,
            color: 'var(--fg-1)',
          }}
        >
          {fact.factText}
        </span>
      </div>
      {!selectMode && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('common.delete')}
          className="icon-btn shrink-0 hover:text-[var(--status-bad)]"
          style={{ width: 40, height: 40, margin: -8, color: 'var(--fg-3)' }}
        >
          <Trash2 size={18} strokeWidth={1.8} />
        </button>
      )}
    </>
  )

  if (selectMode) {
    return (
      <button
        type="button"
        onClick={onToggleSelection}
        aria-pressed={isSelected}
        className="appearance-none border-0 cursor-pointer w-full text-left flex items-center transition-[background-color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:-translate-y-px active:translate-y-0 active:scale-[0.99]"
        style={cardStyle}
      >
        {Inner}
      </button>
    )
  }

  return (
    <div className="flex items-center" style={cardStyle}>
      {Inner}
    </div>
  )
}
