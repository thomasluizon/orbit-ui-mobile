'use client'

import { AppOverlay } from '@/components/ui/app-overlay'

export interface MoveParentOption {
  id: string | null
  label: string
  depth: number
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
  return (
    <AppOverlay
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
      dismissible={!isMoving}
      title={t('habits.moveParent.title')}
      description={movingHabitTitle ? t('habits.moveParent.description', { name: movingHabitTitle }) : undefined}
      footer={
        <div className="flex gap-3">
          <button
            className="flex-1 py-3 rounded-xl border border-[var(--hairline)] text-[var(--fg-1)] font-bold text-sm hover:bg-[var(--bg-elev)]/80 transition-[background-color,border-color,color,opacity,transform] duration-150 disabled:opacity-50"
            disabled={isMoving}
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            className="flex-1 py-3 rounded-xl bg-[var(--primary)] text-white font-bold text-sm hover:bg-[var(--primary-pressed)] transition-[background-color,opacity,transform] duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!canSubmit}
            onClick={onConfirm}
          >
            {isMoving ? t('habits.moveParent.moving') : t('habits.moveParent.confirm')}
          </button>
        </div>
      }
    >
      {options.length > 0 ? (
        <div className="space-y-2">
          {options.map((option) => (
            <button
              key={option.id ?? '__root__'}
              className={`w-full text-left rounded-lg border px-3 py-2.5 transition-[background-color,border-color,color,opacity] duration-150 ${
                option.id === selectedMoveParentId
                  ? 'border-[var(--primary)] bg-[var(--bg-sunk)]'
                  : 'border-[var(--hairline)] bg-[var(--bg-elev)] hover:bg-[var(--bg-elev)]/80'
              } ${option.disabled ? 'opacity-50 cursor-not-allowed hover:bg-[var(--bg-elev)]' : ''}`}
              style={option.id === null ? undefined : { paddingLeft: `${0.75 + option.depth * 1.1}rem` }}
              disabled={option.disabled}
              onClick={() => onSelectOption(option.id)}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[var(--fg-1)] truncate">{option.label}</span>
                {option.id === movingHabitParentId && (
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--fg-3)]">
                    {t('habits.moveParent.currentParent')}
                  </span>
                )}
              </div>
              {option.reason && (
                <p className="text-[10px] text-[var(--fg-3)] mt-1">
                  {option.reason}
                </p>
              )}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--fg-3)] text-center py-4">
          {t('habits.moveParent.noOptions')}
        </p>
      )}
    </AppOverlay>
  )
}
