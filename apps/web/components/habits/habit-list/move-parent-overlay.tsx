'use client'

import { useMemo, useState } from 'react'
import { Home, Search } from '@/components/ui/icons'
import { filterMoveTargetsBySearch } from '@orbit/shared/utils'
import { Input } from '@/components/ui/input'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { RadioRow } from '@/components/ui/radio-row'

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
  const availability = option.disabled
    ? { disabled: true as const, reason: option.reason ?? currentLabel }
    : { disabled: false as const }

  return (
    <RadioRow
      label={option.label}
      description={undefined}
      selected={selected}
      {...availability}
      depth={option.depth}
      meta={option.childCount > 0 ? String(option.childCount) : undefined}
      tag={isCurrentParent ? currentLabel : undefined}
      leading={option.id === null
        ? <Home size={18} strokeWidth={1.8} color="var(--fg-2)" />
        : <span style={{ fontSize: 16, lineHeight: 1 }}>{option.emoji ?? '·'}</span>}
      onSelect={() => onSelect(option.id)}
    />
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
  const { sheetRef, closeSheet } = useSheetHost()

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
    open ? (<Sheet
      ref={sheetRef}
      open
      onClose={isMoving ? undefined : () => {
        setSearchQuery('')
        onClose()
      }}
      title={t('habits.moveParent.title')}
      actions={
        <div className="flex" style={{ gap: 12 }}>
          <PillButton variant="ghost" disabled={isMoving} onClick={() => closeSheet()}>
            {t('common.cancel')}
          </PillButton>
          <PillButton

            disabled={!canSubmit}
            loading={isMoving}
            onClick={onConfirm}

          >
            {isMoving ? t('habits.moveParent.moving') : t('habits.moveParent.confirm')}
          </PillButton>
        </div>
      }
    >
      <div className="flex flex-col" style={{ gap: 10 }}>
        {movingHabitTitle ? (
          <p className="text-sm text-[var(--fg-3)]">
            {t('habits.moveParent.description', { name: movingHabitTitle })}
          </p>
        ) : null}
        {showSearch && (
          <Input
            label={t('habits.moveParent.searchPlaceholder')}
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t('habits.moveParent.searchPlaceholder')}
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
    </Sheet>) : null
  )
}
