'use client'

import { AppOverlay } from '@/components/ui/app-overlay'
import { PillButton } from '@/components/ui/pill-button'

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
      {options.length > 0 ? (
        <div className="flex flex-col" style={{ gap: 10 }}>
          {options.map((option) => {
            const selected = option.id === selectedMoveParentId
            return (
              <button
                key={option.id ?? '__root__'}
                type="button"
                className={`w-full appearance-none border-0 text-left transition-[background-color,box-shadow,transform,opacity] duration-[var(--dur-fast)] ease-[var(--ease-standard)] ${
                  selected
                    ? 'bg-[rgba(var(--primary-rgb),0.10)] shadow-[inset_0_0_0_1.5px_var(--primary)]'
                    : 'bg-[var(--bg-field)] shadow-[inset_0_0_0_1px_var(--hairline)]'
                } ${
                  option.disabled
                    ? 'opacity-50 cursor-not-allowed'
                    : `cursor-pointer active:scale-[0.99]${
                        selected
                          ? ''
                          : ' hover:bg-[color-mix(in_srgb,var(--fg-1)_8%,transparent)]'
                      }`
                }`}
                style={{
                  borderRadius: 14,
                  padding: '12px 14px',
                  paddingLeft: option.id === null ? 14 : 14 + option.depth * 18,
                }}
                disabled={option.disabled}
                onClick={() => onSelectOption(option.id)}
              >
                <div className="flex items-center justify-between" style={{ gap: 12 }}>
                  <span
                    className="truncate"
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 14,
                      fontWeight: 500,
                      color: 'var(--fg-1)',
                    }}
                  >
                    {option.label}
                  </span>
                  {option.id === movingHabitParentId && (
                    <span
                      className="shrink-0 uppercase"
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: 10.5,
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        color: 'var(--fg-3)',
                      }}
                    >
                      {t('habits.moveParent.currentParent')}
                    </span>
                  )}
                </div>
                {option.reason && (
                  <p
                    style={{
                      margin: '5px 0 0',
                      fontFamily: 'var(--font-sans)',
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
          })}
        </div>
      ) : (
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
          {t('habits.moveParent.noOptions')}
        </p>
      )}
    </AppOverlay>
  )
}
