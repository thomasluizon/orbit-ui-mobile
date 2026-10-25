import type { ReactNode } from 'react'
import { View } from 'react-native'
import { useUIStore } from '@/stores/ui-store'
import { PortalHost } from '@rn-primitives/portal'
import { NativeWindowHost } from './native-window-host'

export function OverlayHost({ children }: Readonly<{ children: ReactNode }>) {
  const overlayOpen = useUIStore((state) => state.openOverlayIds.some((id) => id.startsWith('menu:')))
  return <NativeWindowHost>
    <View style={{ flex: 1 }} pointerEvents={overlayOpen ? 'none' : 'auto'} importantForAccessibility={overlayOpen ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={overlayOpen}>{children}</View>
    <PortalHost />
  </NativeWindowHost>
}
