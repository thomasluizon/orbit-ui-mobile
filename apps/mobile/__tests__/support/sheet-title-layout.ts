import { PersonalText } from '@/components/ui/personal-text'
import { Text } from 'react-native'
import type { ReactTestRenderer } from 'react-test-renderer'

export function deliverTitleLines(header: ReactTestRenderer, lines: string[]) {
  const probe = header.root.findAll((node) => node.type === PersonalText)[0]!
    .findAll((node) => node.type === Text && typeof node.props.onTextLayout === 'function')[0]!
  const onTextLayout = probe.props.onTextLayout
  if (typeof onTextLayout !== 'function') throw new Error('Title measurement callback missing')
  onTextLayout({ nativeEvent: { lines: lines.map((text, index) => ({
    text, x: 0, y: index * 24, width: 200, height: 24, ascender: 18, descender: 0, capHeight: 16, xHeight: 12,
  })) } })
}
