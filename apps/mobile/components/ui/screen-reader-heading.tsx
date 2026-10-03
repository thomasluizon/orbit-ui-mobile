import type { Ref } from 'react'
import { Text } from 'react-native'

export function ScreenReaderHeading({ title, ref }: Readonly<{ title: string; ref?: Ref<Text> }>) {
  return <Text ref={ref} accessible accessibilityRole="header"
    style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', color: 'transparent' }}>
    {title}
  </Text>
}
