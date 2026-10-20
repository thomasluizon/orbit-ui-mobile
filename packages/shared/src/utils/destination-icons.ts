import type { ShellDestinationId } from './shell-destinations'

export const DESTINATION_ICONS = {
  hoje: { labelKey: 'nav.today', commandId: 'today', outline: 'Home', filled: 'HomeFilled' },
  calendario: { labelKey: 'nav.calendar', commandId: 'calendar', outline: 'CalendarDays', filled: 'CalendarDaysFilled' },
  progresso: { labelKey: 'nav.progress', commandId: 'progress', outline: 'LayoutDashboard', filled: 'LayoutDashboardFilled' },
  perfil: { labelKey: 'nav.profile', commandId: 'profile', outline: 'User', filled: 'UserFilled' },
} as const satisfies Record<ShellDestinationId, { labelKey: string; commandId: string; outline: string; filled: string }>

export const SHELL_DESTINATION_IDS = Object.keys(DESTINATION_ICONS) as ShellDestinationId[]
export type DestinationIconName = (typeof DESTINATION_ICONS)[ShellDestinationId]['outline' | 'filled']

export function getDestinationForLabel(labelKey: string): ShellDestinationId | undefined {
  return SHELL_DESTINATION_IDS.find((id) => DESTINATION_ICONS[id].labelKey === labelKey)
}

export function getDestinationForCommand(commandId: string): ShellDestinationId | undefined {
  return SHELL_DESTINATION_IDS.find((id) => DESTINATION_ICONS[id].commandId === commandId)
}
