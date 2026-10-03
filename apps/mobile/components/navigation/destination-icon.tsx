import { DESTINATION_ICONS, type DestinationIconName, type ShellDestinationId } from '@orbit/shared/utils'
import { CalendarDays, CalendarDaysFilled, Home, HomeFilled, LayoutDashboard, LayoutDashboardFilled, User, UserFilled } from '@/components/ui/icons'

const DESTINATION_ICON_COMPONENTS = { CalendarDays, CalendarDaysFilled, Home, HomeFilled, LayoutDashboard, LayoutDashboardFilled, User, UserFilled } satisfies Record<DestinationIconName, typeof Home>

export function getDestinationIcon(destination: ShellDestinationId, active = false) {
  return DESTINATION_ICON_COMPONENTS[DESTINATION_ICONS[destination][active ? 'filled' : 'outline']]
}

export function DestinationIcon({ destination, active = false, size = 24, color }: Readonly<{
  destination: ShellDestinationId
  active?: boolean
  size?: 16 | 20 | 24
  color?: string
}>) {
  const Icon = DESTINATION_ICON_COMPONENTS[DESTINATION_ICONS[destination][active ? 'filled' : 'outline']]
  return <Icon size={size} strokeWidth={active ? 2 : 1.5} color={color} accessible={false} />
}
