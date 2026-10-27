import { useContext } from 'react'
import { View, type ViewProps } from 'react-native'
import { ShellSideInsetsContext, useShellContentStyle } from './shell-side-insets'

export function ShellContent({ style, children, inset = true, ...props }: Readonly<ViewProps & { inset?: boolean }>) {
  const owned = useContext(ShellSideInsetsContext)
  const contentStyle = useShellContentStyle()
  return <View {...props} style={[contentStyle, !inset && { maxWidth: undefined, paddingLeft: 0, paddingRight: 0 }, style]}>
    <ShellSideInsetsContext.Provider value={owned || inset}>{children}</ShellSideInsetsContext.Provider>
  </View>
}
