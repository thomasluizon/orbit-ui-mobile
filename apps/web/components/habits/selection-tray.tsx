'use client'

import {
  CheckCircle2,
  FastForward,
  Trash2,
  X,
  type Icon,
} from '@/components/ui/icons'
// react-doctor-disable-next-line use-lazy-motion -- LazyMotion migration is app-wide (needs a shared provider + converting every motion.* across components/**); a partial per-file swap yields no bundle benefit and risks unprovided m https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { plural } from '@/lib/plural'

const SELECT_ALL_BUTTON_STYLE = {
  fontFamily: 'var(--font-sans)',
  fontSize: 12,
  fontWeight: 500,
  padding: '12px 8px',
  margin: '-8px -4px',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
  textDecorationColor: 'var(--hairline-strong)',
  textDecorationThickness: 1,
} as const

/** Selection actions rendered in the shell's pinned composer position. */
export interface SelectionTrayProps {
  selectedCount: number
  allSelected: boolean
  onSelectAll: () => void
  onDeselectAll: () => void
  onBulkLog: () => void
  onBulkSkip: () => void
  onBulkDelete: () => void
  onCancel: () => void
}

interface BulkBtnProps {
  icon: Icon
  label: string
  color: string
  onClick: () => void
  disabled?: boolean
}

function BulkBtn({ icon: Icon, label, color, onClick, disabled = false }: Readonly<BulkBtnProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className={`appearance-none border-0 flex items-center justify-center transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] ${
        disabled
          ? 'opacity-45'
          : 'cursor-pointer hover:bg-[var(--bg-sunk)] active:scale-[0.96]'
      }`}
      style={{
        width: 44,
        height: 44,
        borderRadius: 999,
        background: 'transparent',
        color,
      }}
    >
      <Icon size={20} strokeWidth={1.8} />
    </button>
  )
}

export function SelectionTray({
  selectedCount,
  allSelected,
  onSelectAll,
  onDeselectAll,
  onBulkLog,
  onBulkSkip,
  onBulkDelete,
  onCancel,
}: Readonly<SelectionTrayProps>) {
  const t = useTranslations()
  const prefersReducedMotion = useReducedMotion()
  const motionPreset = resolveMotionPreset('selection', Boolean(prefersReducedMotion))
  const nothingSelected = selectedCount === 0
  return (
    <motion.div
      data-testid="bulk-action-bar"
      className="mx-auto flex w-full max-w-[480px] flex-col"
      style={{
        gap: 8,
        background: 'var(--bg-sheet)',
        borderRadius: 20,
        padding: '12px 16px',
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
      }}
      initial={{
        opacity: 0,
        y: motionPreset.shift,
        scale: motionPreset.scaleFrom,
      }}
      animate={{
        opacity: 1,
        y: 0,
        scale: motionPreset.scaleTo,
      }}
      exit={{
        opacity: 0,
        y: motionPreset.shift,
        scale: motionPreset.scaleFrom,
      }}
      transition={{
        duration: motionPreset.enterDuration / 1000,
        ease: motionPreset.enterEasing,
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{
          gap: 16,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          fontWeight: 400,
          letterSpacing: '0.02em',
          color: 'var(--fg-3)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>
          <span style={{ fontWeight: 500, color: 'var(--fg-1)' }}>
            {selectedCount}
          </span>
          {' '}
          {plural(t('common.selectedSuffix'), selectedCount)}
        </span>
        <button
          type="button"
          onClick={allSelected ? onDeselectAll : onSelectAll}
          className="appearance-none border-0 bg-transparent cursor-pointer text-[var(--fg-3)] hover:text-[var(--fg-1)] active:scale-[0.96] transition-[color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)]"
          style={SELECT_ALL_BUTTON_STYLE}
        >
          {allSelected ? t('common.deselectAll') : t('common.selectAll')}
        </button>
      </div>
      <div className="flex items-center" style={{ gap: 4 }}>
        <BulkBtn
          icon={CheckCircle2}
          label={t('habits.bulkBar.log')}
          color="var(--primary)"
          onClick={onBulkLog}
          disabled={nothingSelected}
        />
        <BulkBtn
          icon={FastForward}
          label={t('habits.bulkBar.skip')}
          color="var(--fg-3)"
          onClick={onBulkSkip}
          disabled={nothingSelected}
        />
        <BulkBtn
          icon={Trash2}
          label={t('habits.bulkBar.delete')}
          color="var(--status-bad)"
          onClick={onBulkDelete}
          disabled={nothingSelected}
        />
        <div className="flex-1" />
        <BulkBtn
          icon={X}
          label={t('common.cancel')}
          color="var(--fg-2)"
          onClick={onCancel}
        />
      </div>
    </motion.div>
  )
}
