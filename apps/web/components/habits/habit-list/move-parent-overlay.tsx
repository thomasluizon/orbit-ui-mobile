'use client'

import { SPACING } from '@orbit/shared/theme'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Home, Search } from '@/components/ui/icons'
import { plural } from '@/lib/plural'
import { getMoveParentRowAvailability, getMoveParentPickerRows, getMoveParentScrollOffset, type MoveParentPickerProps, type MoveParentRowProps } from '@orbit/shared/utils/move-parent'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { ActionRow } from '@/components/ui/action-row'
import { RadioGroup } from '@/components/ui/radio-row'
import { RadioRow } from '@/components/ui/select-check'

export type { MoveParentOption } from '@orbit/shared/utils/move-parent'

interface MoveParentOverlayProps extends MoveParentPickerProps {
  t: (key: string, params?: Record<string, string | number | Date>) => string
  open: boolean
  isMoving: boolean
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
}: Readonly<MoveParentRowProps>) {
  const availability = getMoveParentRowAvailability(option, currentLabel)

  return (
    <RadioRow
      label={option.label}
      textMode={option.id === null ? undefined : 'personal'}
      description={undefined}
      selected={!option.disabled && selected}
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

function MoveInventoryBody({ state, onRetry, t, children }: Readonly<{
  state: MoveParentPickerProps['inventoryState']; onRetry: MoveParentPickerProps['onRetryInventory']; t: MoveParentOverlayProps['t']; children: ReactNode
}>) {
  if (state === 'loading') return <Skeleton variant="habit-row" label={t('common.loading')} />
  return <>
    {state ? <ErrorState message={t('errors.fetchHabits')}
      action={<PillButton size="sm" variant="ghost" onClick={onRetry}>{t('common.retry')}</PillButton>} /> : null}
    {state === 'error' ? null : children}
  </>
}

export function MoveParentOverlay({
  t,
  open,
  isMoving,
  movingHabitTitle,
  movingHabitParentId,
  movingHabitCount,
  error,
  options,
  inventoryState,
  onRetryInventory,
  selectedMoveParentId,
  canSubmit,
  onClose,
  onConfirm,
  onSelectOption,
}: Readonly<MoveParentOverlayProps>) {
  const [searchQuery, setSearchQuery] = useState('')
  const hasPositionedRef = useRef(false)
  useEffect(() => { if (!open || inventoryState) hasPositionedRef.current = false }, [open, inventoryState])
  const title = movingHabitCount === undefined ? t('habits.moveParent.title')
    : plural(t('habits.moveParent.titleMany', { count: movingHabitCount }), movingHabitCount)
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
    element.scrollTop = getMoveParentScrollOffset(current ? { y: current.offsetTop, height: current.offsetHeight } : null, previous?.offsetHeight ?? 0)
    hasPositionedRef.current = true
  }, [])

  const { rootOption, showSearch, treeRows, isSearchEmpty } = useMemo(
    () => getMoveParentPickerRows(options, searchQuery), [options, searchQuery],
  )

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
            {t('habits.moveParent.confirm')}
          </PillButton>
        </ActionRow>
      }
    >
      <div ref={focusRef} tabIndex={-1} className="flex flex-col min-h-0" style={{ gap: 8 }}>
        <MoveInventoryBody state={inventoryState} onRetry={onRetryInventory} t={t}>

        {movingHabitCount === undefined && movingHabitTitle ? (
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
              selected={rootOption.id === selectedMoveParentId}
              isCurrentParent={rootOption.id === movingHabitParentId}
              currentLabel={t('habits.moveParent.currentParent')}
              onSelect={onSelectOption}
            />
          )}

          <div ref={positionOptions} data-slot="move-destinations-scroll" className="flex flex-col overflow-y-auto overscroll-contain min-h-0 relative" style={{ gap: 4 }}>
          {treeRows.map((option) => (
            <div key={option.id} data-move-parent-id={option.id} data-current-parent={option.id === movingHabitParentId}>
              <MoveTargetRow
                option={option}
                selected={option.id === selectedMoveParentId}
                isCurrentParent={option.id === movingHabitParentId}
                currentLabel={t('habits.moveParent.currentParent')}
                onSelect={onSelectOption}
              />
            </div>
          ))}
          </div>
        </RadioGroup>

        <p role="status" className={error ? 'text-sm text-[var(--fg-2)]' : 'sr-only'}>{error}</p>
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
        </MoveInventoryBody>
      </div>
    </Sheet>) : null
  )
}
