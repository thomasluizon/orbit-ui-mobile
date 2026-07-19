'use client'

import { useMemo, useState } from 'react'
import { Home, Search } from '@/components/ui/icons'
import { filterMoveTargetsBySearch } from '@orbit/shared/utils'
import { AppOverlay } from '@/components/ui/app-overlay'
import { FieldInput } from '@/components/ui/field-input'
import { PillButton } from '@/components/ui/pill-button'
import { RadioGlyph } from '@/components/ui/select-check'

export interface MoveParentOption {
  id: string | null
  label: string
  emoji: string | null
  depth: number
  childCount: number
  disabled: boolean
  reason: string | null
}

interface MoveParentOverlayProps {
  t: (key: string, params?: Record<string, string | number | Date>) => string
  open: boolean
  isMoving: boolean
  movingHabitTitle: string | null
  movingHabitParentId: string | null
  options: MoveParentOption[]
  selectedMoveParentId: string | null
  canSubmit: boolean
  onClose: () => void
  onConfirm: () => void
  onSelectOption: (optionId: string | null) => void
}

const SEARCH_THRESHOLD = 8

const eyebrowStyle = {
  margin: '2px 0 0',
  fontFamily: 'var(--font-sans)',
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--fg-3)',
} as const

function MoveTargetRow({
  option,
  selected,
  isCurrentParent,
  currentLabel,
  onSelect,
}: Readonly<{
  option: MoveParentOption
  selected: boolean
  isCurrentParent: boolean
  currentLabel: string
  onSelect: (optionId: string | null) => void
}>) {
  const isRoot = option.id === null

  let ringClass: string
  if (selected) {
    ringClass = 'bg-[rgba(var(--primary-rgb),0.10)] shadow-[inset_0_0_0_1.5px_var(--primary)]'
  } else if (isRoot) {
    ringClass = 'bg-transparent'
  } else {
    ringClass = 'bg-[var(--bg-field)] shadow-[inset_0_0_0_1px_var(--hairline)]'
  }

  const hoverClass = selected ? '' : ' hover:bg-[color-mix(in_srgb,var(--fg-1)_8%,transparent)]'
  const stateClass = option.disabled
    ? 'opacity-50 cursor-not-allowed'
    : `cursor-pointer active:scale-[0.98]${hoverClass}`

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={option.disabled}
      onClick={() => onSelect(option.id)}
      className={`w-full appearance-none text-left transition-[transform,box-shadow,background-color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] ${ringClass} ${stateClass}`}
      style={{
        border: '1px solid transparent',
        borderStyle: !selected && isRoot ? 'dashed' : 'solid',
        borderColor: !selected && isRoot ? 'var(--hairline-strong)' : 'transparent',
        borderRadius: 14,
        padding: '8px 12px',
      }}
    >
      <div className="flex items-center" style={{ gap: 10 }}>
        {option.depth > 0 && (
          <span aria-hidden="true" className="shrink-0" style={{ width: option.depth * 20 }} />
        )}
        <span
          className="grid shrink-0 place-items-center"
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            background: isRoot ? 'transparent' : 'var(--bg-well)',
            boxShadow: isRoot ? 'inset 0 0 0 1px var(--hairline)' : undefined,
          }}
        >
          {isRoot ? (
            <Home size={18} strokeWidth={1.8} color="var(--fg-2)" />
          ) : (
            <span style={{ fontSize: 16, lineHeight: 1 }}>{option.emoji ?? '·'}</span>
          )}
        </span>
        <span
          className="flex-1 truncate"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--fg-1)',
          }}
        >
          {option.label}
        </span>
        {option.childCount > 0 && (
          <span
            className="shrink-0"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--fg-3)',
            }}
          >
            {option.childCount}
          </span>
        )}
        {isCurrentParent && (
          <span
            className="shrink-0 uppercase"
            style={{
              fontFamily: 'var(--font-sans)',
              // react-doctor-disable-next-line no-tiny-text -- intentional uppercase "current parent" tag pill (badge meta scale per DESIGN.md), not body text https://github.com/thomasluizon/orbit-ui-mobile/issues/243
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: '0.06em',
              color: 'var(--fg-3)',
            }}
          >
            {currentLabel}
          </span>
        )}
        {selected && <RadioGlyph selected size={22} />}
      </div>
      {option.reason && (
        <p
          style={{
            margin: '4px 0 0',
            paddingLeft: option.depth * 20,
            fontFamily: 'var(--font-sans)',
            // react-doctor-disable-next-line no-tiny-text -- intentional secondary suggestion-reason caption (meta scale per DESIGN.md), de-emphasized below the option label https://github.com/thomasluizon/orbit-ui-mobile/issues/243
            fontSize: 11,
            lineHeight: 1.4,
            color: 'var(--fg-3)',
          }}
        >
          {option.reason}
        </p>
      )}
    </button>
  )
}

/** Move-parent picker overlay (web). Presentational — the parent HabitList owns
 *  the move state and supplies the validated option list plus handlers. */
export function MoveParentOverlay({
  t,
  open,
  isMoving,
  movingHabitTitle,
  movingHabitParentId,
  options,
  selectedMoveParentId,
  canSubmit,
  onClose,
  onConfirm,
  onSelectOption,
}: Readonly<MoveParentOverlayProps>) {
  const [searchQuery, setSearchQuery] = useState('')

  const rootOption = useMemo(
    () => options.find((option) => option.id === null) ?? null,
    [options],
  )
  const destinationCount = useMemo(
    () => options.reduce((total, option) => (option.id === null ? total : total + 1), 0),
    [options],
  )
  const showSearch = destinationCount > SEARCH_THRESHOLD

  const treeRows = useMemo(() => {
    const rows = showSearch ? filterMoveTargetsBySearch(options, searchQuery) : options
    return rows.filter((option) => option.id !== null)
  }, [options, showSearch, searchQuery])

  const isSearchEmpty = showSearch && searchQuery.trim().length > 0 && treeRows.length === 0

  return (
    <AppOverlay
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setSearchQuery('')
          onClose()
        }
      }}
      dismissible={!isMoving}
      title={t('habits.moveParent.title')}
      description={movingHabitTitle ? t('habits.moveParent.description', { name: movingHabitTitle }) : undefined}
      footer={
        <div className="flex" style={{ gap: 12 }}>
          <PillButton
            variant="ghost"
            fullWidth
            disabled={isMoving}
            onClick={onClose}
            className="flex-1"
          >
            {t('common.cancel')}
          </PillButton>
          <PillButton
            fullWidth
            disabled={!canSubmit}
            busy={isMoving}
            onClick={onConfirm}
            className="flex-1"
          >
            {isMoving ? t('habits.moveParent.moving') : t('habits.moveParent.confirm')}
          </PillButton>
        </div>
      }
    >
      <div className="flex flex-col" style={{ gap: 10 }}>
        {showSearch && (
          <FieldInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t('habits.moveParent.searchPlaceholder')}
            ariaLabel={t('habits.moveParent.searchPlaceholder')}
            trailing={<Search size={18} strokeWidth={1.8} color="var(--fg-3)" />}
          />
        )}

        {rootOption && (
          <MoveTargetRow
            option={rootOption}
            selected={rootOption.id === selectedMoveParentId}
            isCurrentParent={rootOption.id === movingHabitParentId}
            currentLabel={t('habits.moveParent.currentParent')}
            onSelect={onSelectOption}
          />
        )}

        {treeRows.length > 0 && (
          <span style={eyebrowStyle}>{t('habits.moveParent.destinations')}</span>
        )}

        <div className="flex flex-col" role="radiogroup" style={{ gap: 6 }}>
          {treeRows.map((option) => (
            <MoveTargetRow
              key={option.id}
              option={option}
              selected={option.id === selectedMoveParentId}
              isCurrentParent={option.id === movingHabitParentId}
              currentLabel={t('habits.moveParent.currentParent')}
              onSelect={onSelectOption}
            />
          ))}
        </div>

        {isSearchEmpty && (
          <p
            className="text-center"
            style={{
              margin: 0,
              padding: '16px 0',
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              color: 'var(--fg-3)',
            }}
          >
            {t('habits.moveParent.noSearchResults')}
          </p>
        )}
      </div>
    </AppOverlay>
  )
}
