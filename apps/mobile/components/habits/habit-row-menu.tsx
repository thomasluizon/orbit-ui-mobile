import { Pressable, Text, View } from 'react-native'
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
} from 'lucide-react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import type { HabitRowActions } from './habit-row'
import { styles } from './habit-row-styles'

interface HabitRowMenuBodyProps {
  actions: HabitRowActions
  hasChildren: boolean
  isSelectMode: boolean
  close: () => void
  t: (key: string) => string
  tokens: ReturnType<typeof createTokensV2>
}

export function HabitRowMenuBody({
  actions,
  hasChildren,
  isSelectMode,
  close,
  t,
  tokens,
}: Readonly<HabitRowMenuBodyProps>) {
  const run = (handler?: () => void) => () => {
    close()
    handler?.()
  }

  const canSelect = !isSelectMode && !!actions.onEnterSelectMode
  const canDrillInto = hasChildren && !!actions.onDrillInto

  return (
    <>
      {actions.onAddSubHabit ? (
        <MenuItem
          icon={Plus}
          label={t('habits.form.addSubHabit')}
          color={tokens.fg1}
          onPress={run(actions.onAddSubHabit)}
        />
      ) : null}
      {actions.onMoveParent ? (
        <MenuItem
          icon={ArrowRight}
          label={t('habits.moveParent.button')}
          color={tokens.fg1}
          onPress={run(actions.onMoveParent)}
        />
      ) : null}
      {actions.onSkip ? (
        <MenuItem
          icon={FastForward}
          label={t('habits.actions.skip')}
          color={tokens.statusOverdueText}
          onPress={run(actions.onSkip)}
        />
      ) : null}
      {actions.onReschedule ? (
        <MenuItem
          icon={CalendarClock}
          label={t('habits.actions.reschedule')}
          color={tokens.fg1}
          onPress={run(actions.onReschedule)}
        />
      ) : null}
      {actions.onEdit ? (
        <MenuItem
          icon={Pencil}
          label={t('common.edit')}
          color={tokens.fg1}
          onPress={run(actions.onEdit)}
        />
      ) : null}
      {actions.onDuplicate ? (
        <MenuItem
          icon={Copy}
          label={t('habits.actions.duplicate')}
          color={tokens.fg1}
          onPress={run(actions.onDuplicate)}
        />
      ) : null}
      {canSelect ? (
        <MenuItem
          icon={CheckCircle2}
          label={t('common.select')}
          color={tokens.fg1}
          onPress={run(actions.onEnterSelectMode)}
        />
      ) : null}
      {canDrillInto ? (
        <MenuItem
          icon={ChevronRight}
          label={t('habits.actions.openSubHabits')}
          color={tokens.fg1}
          onPress={run(actions.onDrillInto)}
        />
      ) : null}
      {actions.onDelete ? (
        <>
          <View
            style={[styles.menuDivider, { backgroundColor: tokens.hairline }]}
          />
          <MenuItem
            icon={Trash2}
            label={t('habits.deleteHabit')}
            color={tokens.statusBadText}
            onPress={run(actions.onDelete)}
          />
        </>
      ) : null}
    </>
  )
}

interface MenuItemProps {
  icon: LucideIcon
  label: string
  color: string
  onPress: () => void
}

function MenuItem({ icon: Icon, label, color, onPress }: Readonly<MenuItemProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      style={({ pressed }) => [
        styles.menuItem,
        { backgroundColor: pressed ? tokens.bgElevPressed : 'transparent' },
      ]}
    >
      <Icon size={16} color={color} strokeWidth={1.8} />
      <Text style={[styles.menuItemLabel, { color }]}>{label}</Text>
    </Pressable>
  )
}
