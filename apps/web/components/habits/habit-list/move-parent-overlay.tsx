'use client'

import { SPACING } from '@orbit/shared/theme'


import { useState } from 'react'
import { Home, Search } from '@/components/ui/icons'
import { getMoveParentPickerRows } from '@orbit/shared/utils'
import { Input } from '@/components/ui/input'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { ActionRow } from '@/components/ui/action-row'
import { RadioGroup } from '@/components/ui/radio-row'
import { RadioRow } from '@/components/ui/select-check'

import type { MoveParentOption } from '@orbit/shared/utils'
export type { MoveParentOption } from '@orbit/shared/utils'

interface MoveParentOverlayProps {
  selectionOnly?: boolean
  inventoryState?: 'loading' | 'error'
  onRetryInventory?: () => void
  t: (key: string, params?: Record<string, string | number | Date>) => string
  open: boolean
  isMoving: boolean
  movingHabitTitle: string | null
  movingHabitParentId: string | null | undefined
  options: MoveParentOption[]
  selectedMoveParentId: string | null | undefined
  canSubmit: boolean
  onClose: () => void
  onConfirm: () => void
  onSelectOption: (optionId: string | null) => void
}

const eyebrowStyle = {
  margin: SPACING.s0,
  fontFamily: 'var(--font-mono)',
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
      textMode={option.id === null ? undefined : 'personal'}
      description={undefined}
      selected={selected}
      {...availability}
      depth={option.depth}
      meta={option.childCount > 0 ? String(option.childCount) : undefined}
      tag={isCurrentParent ? currentLabel : undefined}
      leading={option.id === null
        ? <Home size={20} strokeWidth={1.8} color="var(--fg-2)" />
        : <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>{option.emoji ?? '·'}</span>}
      onSelect={() => onSelect(option.id)}
    />
  )
}

/** Move-parent picker overlay (web). Presentational — the parent HabitList owns
 *  the move state and supplies the validated option list plus handlers. */
function MoveInventoryStatus({ state, t, onRetry }: Readonly<{ state?: 'loading' | 'error'; t: MoveParentOverlayProps['t']; onRetry?: () => void }>) {
  if (!state) return null
  return <div role="status"><p>{t(state === 'loading' ? 'common.loading' : 'habits.loadError')}</p>{state === 'error' ? <PillButton variant="ghost" size="sm" onClick={onRetry}>{t('common.retry')}</PillButton> : null}</div>
}

function MoveParentActions({ selectionOnly, t, isMoving, canSubmit, onClose, onConfirm }: Readonly<Pick<MoveParentOverlayProps, 'selectionOnly' | 't' | 'isMoving' | 'canSubmit' | 'onConfirm'> & { onClose: () => void }>) {
  if (selectionOnly) return null
  return <ActionRow><PillButton size="sm" variant="ghost" disabled={isMoving} onClick={onClose}>{t('common.cancel')}</PillButton><PillButton size="sm" disabled={!canSubmit} loading={isMoving} onClick={onConfirm}>{t('habits.moveParent.confirm')}</PillButton></ActionRow>
}

export function MoveParentOverlay({
  selectionOnly = false,
  inventoryState,
  onRetryInventory,
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

  const { rootOption, showSearch, treeRows, isSearchEmpty } = getMoveParentPickerRows(options, searchQuery)


  return (
    open ? (<Sheet
      ref={sheetRef}
      open
      onClose={isMoving ? undefined : () => {
        setSearchQuery('')
        onClose()
      }}
      title={t(selectionOnly ? 'habits.form.parentHabit' : 'habits.moveParent.title')}
      actions={selectionOnly ? undefined : <MoveParentActions selectionOnly={false} t={t} isMoving={isMoving} canSubmit={canSubmit} onClose={() => closeSheet()} onConfirm={onConfirm} />}
    >
      <div className="flex flex-col" style={{ gap: 8 }}>
        <MoveInventoryStatus state={inventoryState} t={t} onRetry={onRetryInventory} />
        {!selectionOnly && movingHabitTitle ? (
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
            trailing={<Search size={20} strokeWidth={1.8} color="var(--fg-3)" />}
          />
        )}

        {treeRows.length > 0 && (
          <span style={eyebrowStyle}>{t('habits.moveParent.destinations')}</span>
        )}

        <RadioGroup
          aria-label={t('habits.moveParent.destinations')}
          className="flex flex-col"
          style={{ gap: 4 }}
        >
          {rootOption && (
            <MoveTargetRow
              option={rootOption}
              selected={rootOption.id === selectedMoveParentId}
              isCurrentParent={rootOption.id === movingHabitParentId}
              currentLabel={t('habits.moveParent.currentParent')}
              onSelect={onSelectOption}
            />
          )}

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
        </RadioGroup>

        {isSearchEmpty && (
          <p
            className="text-center"
            style={{
              margin: SPACING.s0,
              padding: "var(--orbit-space-16) var(--orbit-space-0)",
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
