'use client'

import { createPortal } from 'react-dom'
import {
  CheckCircle2,
  FastForward,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { plural } from '@/lib/plural'

/** Floating bulk action toolbar on an elevated solid sheet surface. */
export interface BulkActionBarV2Props {
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
  icon: LucideIcon
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
      <Icon size={22} strokeWidth={1.8} />
    </button>
  )
}

export function BulkActionBarV2({
  selectedCount,
  allSelected,
  onSelectAll,
  onDeselectAll,
  onBulkLog,
  onBulkSkip,
  onBulkDelete,
  onCancel,
}: Readonly<BulkActionBarV2Props>) {
  const t = useTranslations()
  const prefersReducedMotion = useReducedMotion()
  const motionPreset = resolveMotionPreset('selection', Boolean(prefersReducedMotion))
  const nothingSelected = selectedCount === 0

  return createPortal(
    <motion.div
      data-testid="bulk-action-bar"
      className="fixed left-1/2 -translate-x-1/2 z-50 flex flex-col bottom-[88px] w-[calc(100%-var(--app-px)*2)] max-w-[calc(var(--app-max-w)-var(--app-px)*2)] md:sticky md:left-auto md:translate-x-0 md:mx-auto md:bottom-6 md:w-fit md:max-w-[480px]"
      style={{
        gap: 8,
        background: 'var(--bg-sheet)',
        borderRadius: 20,
        padding: '12px 14px',
        boxShadow: 'var(--shadow-2), inset 0 0 0 1px var(--hairline)',
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
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            fontWeight: 500,
            padding: '14px 10px',
            margin: '-10px -4px',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
            textDecorationColor: 'var(--hairline-strong)',
            textDecorationThickness: 1,
          }}
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
          color="var(--status-skip)"
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
    </motion.div>,
    document.querySelector('main') ?? document.body,
  )
}
