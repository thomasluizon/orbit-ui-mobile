import { StyleSheet, View, type ViewProps } from 'react-native'
import { useShellScrollerClearance } from './shell-scroller-clearance'

/** Fills the rest of its scroll content and centres its children between the shell header and the bottom chrome. */
export function ShellCentredRegion({ style, ...props }: Readonly<ViewProps>) {
  const clearance = useShellScrollerClearance()
  return <View testID="shell-centred-region" {...props} style={[styles.region, { paddingTop: clearance }, style]} />
}

const styles = StyleSheet.create({
  region: { flexGrow: 1, justifyContent: 'center' },
})
