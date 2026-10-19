import type { MenuItem } from '../contracts/overlay/Menu'
import type { HabitFrequencyFilter } from '../stores/ui-store'
import { HABIT_FREQUENCY_FILTER_OPTIONS, toggleHabitFrequencyFilter } from './habit-frequency-filter'

interface TodayMenuActions {
  onToggleSelect: () => void
  onToggleCollapse: () => void
  onRefresh: () => void
  onToggleCompleted: () => void
}

interface TodayMenuLabels {
  selectLabel: string
  collapseLabel: string
  refreshLabel: string
  completedLabel: string
  allCollapsed: boolean
  showCompleted: boolean
  isFetching: boolean
}

export interface TodayDateControlProps extends TodayMenuActions, TodayMenuLabels {
  menuHeading?: string
  shortDayName?: string
  headerActive?: boolean
  dayName: string
  numericDate: string
  isTodaySelected: boolean
  nextDisabled: boolean
  previousLabel: string
  goToTodayLabel: string
  nextLabel: string
  moreLabel: string
  onGoToPreviousDay: () => void
  onGoToToday: () => void
  onGoToNextDay: () => void
  searchLabel: string
  onSearch: () => void
}

export function buildTodayHeaderMenuItems(props: Readonly<TodayMenuLabels>, frequencyMenu: boolean, frequencyUnit: HabitFrequencyFilter | undefined, translate: (key: string) => string): MenuItem[] {
  if (frequencyMenu) return HABIT_FREQUENCY_FILTER_OPTIONS.map((option) => ({
    id: option.id, label: translate(option.labelKey), checked: frequencyUnit === option.value,
  }))
  return [
    { id: 'select', label: props.selectLabel, icon: 'checkbox' },
    { id: 'collapse', label: props.collapseLabel, icon: props.allCollapsed ? 'chevrons-down' : 'chevrons-up' },
    { id: 'refresh', label: props.refreshLabel, icon: 'refresh', disabled: props.isFetching },
    { id: 'completed', label: props.completedLabel, icon: props.showCompleted ? 'eye-off' : 'eye' },
    { id: 'frequency', label: translate('habits.frequencyFilter'), icon: 'adjustments-horizontal' },
  ]
}

export function selectTodayHeaderMenuItem(id: string, frequencyMenu: boolean, frequencyUnit: HabitFrequencyFilter | undefined, actions: Readonly<TodayMenuActions> & {
  setFrequencyUnit: (value: HabitFrequencyFilter | undefined) => void
  openFrequencyMenu: () => void
}): void {
  if (frequencyMenu) { actions.setFrequencyUnit(toggleHabitFrequencyFilter(frequencyUnit, id)); return }
  if (id === 'frequency') { actions.openFrequencyMenu(); return }
  switch (id) {
    case 'select': actions.onToggleSelect(); break
    case 'collapse': actions.onToggleCollapse(); break
    case 'refresh': actions.onRefresh(); break
    case 'completed': actions.onToggleCompleted(); break
  }
}
