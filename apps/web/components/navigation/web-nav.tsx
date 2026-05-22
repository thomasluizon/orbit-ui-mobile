'use client'

import { BottomTabBar, type BottomTab } from './bottom-tab-bar'

/** Phone-frame nav: bottom tab bar at every width (v8 design is a 412px phone shell). */
interface WebNavProps {
  active: BottomTab
  onTab?: (id: BottomTab) => void
  onFab?: () => void
  astraUnread?: boolean
  showFab?: boolean
}

export function WebNav(props: Readonly<WebNavProps>) {
  return <BottomTabBar {...props} />
}
