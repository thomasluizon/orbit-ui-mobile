'use client'

import { SPACING } from '@orbit/shared/theme'


import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Home, Search } from '@/components/ui/icons'
import { plural } from '@/lib/plural'
import { filterMoveTargetsBySearch } from '@orbit/shared/utils'
import { Input } from '@/components/ui/input'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { ActionRow } from '@/components/ui/action-row'
import { RadioGroup } from '@/components/ui/radio-row'
import { RadioRow } from '@/components/ui/select-check'

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
  movingHabitCount?: number
  error?: string | null
  movingHabitParentId: string | null | undefined
  options: MoveParentOption[]
  selectedMoveParentId: string | null | undefined
  canSubmit: boolean
  onClose: () => void
  onConfirm: () => void | Promise<boolean>
  onSelectOption: (optionId: string | null) => void
}

const SEARCH_THRESHOLD = 8

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
export function MoveParentOverlay({
  t,
  open,
  isMoving,
  movingHabitTitle,
  movingHabitParentId,
  movingHabitCount,
  error,
  options,
  selectedMoveParentId,
  canSubmit,
  onClose,
  onConfirm,
  onSelectOption,
}: Readonly<MoveParentOverlayProps>) {
  const [searchQuery, setSearchQuery] = useState('')
  const hasPositionedRef = useRef(false)
  useEffect(() => { if (!open) hasPositionedRef.current = false }, [open])
  const title = t(movingHabitCount === undefined ? 'habits.moveParent.title' : 'habits.moveParent.titleMany')
  async function confirmMove() {
    if (await onConfirm() === true) {
      closeSheet(finishClose)
    }
  }

  function finishClose() {
    setSearchQuery('')
    onClose()
  }
  const { sheetRef, closeSheet } = useSheetHost()
  const focusRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const positionOptions = useCallback((element: HTMLDivElement | null) => {
    scrollRef.current = element
    if (!element || hasPositionedRef.current) return
    const current = element.querySelector<HTMLElement>('[data-current-parent="true"]')
    const previous = current?.previousElementSibling as HTMLElement | null
    element.scrollTop = current ? Math.max(0, current.offsetTop - (previous?.offsetHeight ?? 0)) : 0
    hasPositionedRef.current = true
  }, [])

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
      virtualizedBody
      boundedBody
      initialFocus={focusRef}
      open
      onClose={isMoving ? undefined : finishClose}
      title={title}
      actions={
        <ActionRow>
          <PillButton size="sm" variant="ghost" disabled={isMoving} onClick={() => closeSheet()}>
            {t('common.cancel')}
          </PillButton>
          <PillButton size="sm" disabled={!canSubmit} loading={isMoving} onClick={() => void confirmMove()}>
            {movingHabitCount === undefined ? t('habits.moveParent.confirm')
              : plural(t('habits.moveParent.confirmMany', { count: movingHabitCount }), movingHabitCount)}
          </PillButton>
        </ActionRow>
      }
    >
      <div ref={focusRef} tabIndex={-1} className="flex flex-col min-h-0" style={{ gap: 8 }}>
        {movingHabitCount !== undefined ? (
          <p className="text-sm text-[var(--fg-3)]">{t('habits.moveParent.descriptionMany')}</p>
        ) : movingHabitTitle ? (
          <p className="text-sm text-[var(--fg-3)]">
            {t('habits.moveParent.description', { name: movingHabitTitle })}
          </p>
        ) : null}
        {showSearch && (
          <Input
            label={t('habits.moveParent.searchPlaceholder')}
            value={searchQuery}
            onChange={(query) => {
              setSearchQuery(query)
              if (scrollRef.current) scrollRef.current.scrollTop = 0
            }}
            placeholder={t('habits.moveParent.searchPlaceholder')}
            trailing={<Search size={20} strokeWidth={1.8} color="var(--fg-3)" />}
          />
        )}

        {treeRows.length > 0 && (
          <span style={eyebrowStyle}>{t('habits.moveParent.destinations')}</span>
        )}

        <RadioGroup
          aria-label={t('habits.moveParent.destinations')}
          className="flex flex-col min-h-0"
          style={{ gap: 4 }}
        >
          {rootOption && (
            <MoveTargetRow
              option={rootOption}
              selected={!rootOption.disabled && rootOption.id === selectedMoveParentId}
              isCurrentParent={rootOption.id === movingHabitParentId}
              currentLabel={t('habits.moveParent.currentParent')}
              onSelect={onSelectOption}
            />
          )}

          <div ref={positionOptions} data-slot="move-destinations-scroll" className="flex flex-col overflow-y-auto overscroll-contain min-h-0 relative" style={{ gap: 4 }}>
          {treeRows.map((option) => (
            <div key={option.id} data-current-parent={option.id === movingHabitParentId}>
              <MoveTargetRow
                option={option}
                selected={!option.disabled && option.id === selectedMoveParentId}
                isCurrentParent={option.id === movingHabitParentId}
                currentLabel={t('habits.moveParent.currentParent')}
                onSelect={onSelectOption}
              />
            </div>
          ))}
          </div>
        </RadioGroup>

        <p role="status" className="whitespace-pre-line text-sm text-[var(--fg-2)]">{error}</p>
        {options.length > 0 && options.every((option) => option.disabled) && (
          <p className="text-sm text-[var(--fg-3)]">{t('habits.moveParent.noDestinations')}</p>
        )}
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
