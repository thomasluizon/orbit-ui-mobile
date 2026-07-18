import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Copy,
  FastForward,
  Pencil,
  Plus,
  Trash2,
  type LucideIcon,
} from '@/components/ui/icons'
import { useTranslations } from 'next-intl'

interface HabitRowMenuProps {
  close: () => void
  onEdit?: () => void
  onDuplicate?: () => void
  onAddSubHabit?: () => void
  onMoveParent?: () => void
  onSkip?: () => void
  onReschedule?: () => void
  onDelete?: () => void
  onEnterSelectMode?: () => void
  onDrillInto?: () => void
  t: ReturnType<typeof useTranslations>
}

export function HabitRowMenu({
  close,
  onEdit,
  onDuplicate,
  onAddSubHabit,
  onMoveParent,
  onSkip,
  onReschedule,
  onDelete,
  onEnterSelectMode,
  onDrillInto,
  t,
}: Readonly<HabitRowMenuProps>) {
  function run(handler?: () => void) {
    return () => {
      handler?.()
      close()
    }
  }

  return (
    <div role="menu">
      {onAddSubHabit && <MenuItem icon={Plus} label={t('habits.form.addSubHabit')} onClick={run(onAddSubHabit)} />}
      {onMoveParent && <MenuItem icon={ArrowRight} label={t('habits.moveParent.button')} onClick={run(onMoveParent)} />}
      {onSkip && <MenuItem icon={FastForward} label={t('habits.actions.skip')} onClick={run(onSkip)} tone="warning" />}
      {onReschedule && <MenuItem icon={CalendarClock} label={t('habits.actions.reschedule')} onClick={run(onReschedule)} />}
      {onEdit && <MenuItem icon={Pencil} label={t('common.edit')} onClick={run(onEdit)} />}
      {onDuplicate && <MenuItem icon={Copy} label={t('habits.actions.duplicate')} onClick={run(onDuplicate)} />}
      {onEnterSelectMode && <MenuItem icon={CheckCircle2} label={t('common.select')} onClick={run(onEnterSelectMode)} />}
      {onDrillInto && <MenuItem icon={ChevronRight} label={t('habits.actions.openSubHabits')} onClick={run(onDrillInto)} />}
      {onDelete && (
        <>
          <div
            aria-hidden="true"
            style={{
              height: 1,
              margin: '4px 8px',
              background: 'var(--hairline)',
            }}
          />
          <MenuItem icon={Trash2} label={t('habits.deleteHabit')} onClick={run(onDelete)} tone="danger" />
        </>
      )}
    </div>
  )
}

interface MenuItemProps {
  icon: LucideIcon
  label: string
  onClick: () => void
  tone?: 'default' | 'warning' | 'danger'
}

function MenuItem({ icon: Icon, label, onClick, tone = 'default' }: Readonly<MenuItemProps>) {
  let color: string
  if (tone === 'danger') {
    color = 'var(--status-bad-text)'
  } else if (tone === 'warning') {
    color = 'var(--status-overdue-text)'
  } else {
    color = 'var(--fg-1)'
  }
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className="appearance-none border-0 bg-transparent w-full flex items-center text-left transition-colors hover:bg-[var(--bg-elev-pressed)]"
      style={{
        gap: 10,
        padding: '11px 12px',
        color,
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
        cursor: 'pointer',
      }}
    >
      <Icon size={16} strokeWidth={1.8} />
      <span>{label}</span>
    </button>
  )
}
