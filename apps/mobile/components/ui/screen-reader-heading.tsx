import { Text } from 'react-native'

export function ScreenReaderHeading({ title }: Readonly<{ title: string }>) {
  return <Text accessible accessibilityRole="header"
    style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', color: 'transparent' }}>
    {title}
  </Text>
}
