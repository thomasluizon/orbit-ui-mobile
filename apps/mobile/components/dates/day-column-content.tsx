import { useContext, type ReactNode } from 'react'
import { View } from 'react-native'
import { MONTH_GRID_TARGET_MIN } from '@orbit/shared/theme'
import { DayColumnPosition } from './month-selection'

export function DayColumnContent({ children }: Readonly<{ children: ReactNode }>) {
  const position = useContext(DayColumnPosition)
  return <View style={{ width: '100%', maxWidth: MONTH_GRID_TARGET_MIN, minHeight: MONTH_GRID_TARGET_MIN, flexDirection: 'row', alignItems: 'center' }}>
    <View style={{ flex: position }} />{children}<View style={{ flex: 1 - position }} />
  </View>
}
