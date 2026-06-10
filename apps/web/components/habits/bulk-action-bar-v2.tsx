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

/** v8 floating bulk action bar. Square icon buttons, mono selected count. */
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
  onClick: () => void
}

function BulkBtn({ icon: Icon, label, onClick }: Readonly<BulkBtnProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="appearance-none border-0 cursor-pointer flex items-center justify-center"
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        background: 'transparent',
        color: 'var(--fg-1)',
      }}
    >
      <Icon size={18} strokeWidth={1.6} />
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

  return createPortal(
    <motion.div
      data-testid="bulk-action-bar"
      className="fixed left-1/2 -translate-x-1/2 z-50 flex flex-col"
      style={{
        bottom: 88,
        width: 'calc(100% - var(--app-px) * 2)',
        maxWidth: 'calc(var(--app-max-w) - var(--app-px) * 2)',
        gap: 10,
        background: 'var(--bg-elev)',
        borderRadius: 12,
        padding: '10px 12px 12px',
        boxShadow:
          '0 8px 24px rgba(0,0,0,0.30), inset 0 0 0 1px var(--hairline)',
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
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--fg-1)',
        }}
      >
        <span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {selectedCount}
          </span>
          {' '}
          {plural(t('common.selected', { n: selectedCount }), selectedCount).replace(/^\d+\s*/, '')}
        </span>
        <button
          type="button"
          onClick={allSelected ? onDeselectAll : onSelectAll}
          className="appearance-none border-0 bg-transparent cursor-pointer"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--fg-3)',
            padding: '4px 6px',
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
        <BulkBtn icon={CheckCircle2} label={t('habits.logHabit')} onClick={onBulkLog} />
        <BulkBtn icon={FastForward} label={t('habits.skipHabit')} onClick={onBulkSkip} />
        <BulkBtn icon={Trash2} label={t('common.delete')} onClick={onBulkDelete} />
        <div className="flex-1" />
        <BulkBtn icon={X} label={t('common.cancel')} onClick={onCancel} />
      </div>
    </motion.div>,
    document.body,
  )
}
