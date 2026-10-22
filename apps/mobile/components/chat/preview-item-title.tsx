import type { PreviewItemTitleProps } from '@orbit/shared/chat'
import { usePreviewTitle } from '@/hooks/use-preview-title'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Input } from '@/components/ui/input'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { PersonalText } from '@/components/ui/personal-text'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'

export function PreviewItemTitle(props: Readonly<PreviewItemTitleProps>) {
  const title = usePreviewTitle(props)
  const [interacting, setInteracting] = useState(false)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const content = <>{props.icon ? <Text accessible={false} style={[styles.text, { color: tokens.fg1 }]}>{props.icon}</Text> : null}<View style={styles.words}><PersonalText style={{ ...styles.text, color: props.proposed ? tokens.fg3 : tokens.fg1 }}>{props.title}</PersonalText></View></>
  if (title.editing && props.rename) return <Input hideLabel autoFocus label={props.rename.label} value={title.draft} onChange={title.setDraft} onSubmit={() => void title.save()} onBlur={() => void title.save()} onCancel={title.cancel} disabled={props.rename.disabled} />
  if (!props.rename) return <View style={styles.row}>{content}</View>
  return <InsetFocusPressable accessibilityRole="button" accessibilityLabel={props.title} accessibilityState={{ disabled: props.rename.disabled }} disabled={props.rename.disabled} onPress={title.start} onFocus={() => setInteracting(true)} onBlur={() => setInteracting(false)} onHoverIn={() => setInteracting(true)} onHoverOut={() => setInteracting(false)} style={({ pressed }) => [styles.row, { backgroundColor: pressed || interacting ? tokens.bgHover : 'transparent' }]}>{content}</InsetFocusPressable>
}

const styles = StyleSheet.create({
  row: { minHeight: TOUCH_TARGET_MIN, minWidth: 0, marginHorizontal: -8, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  words: { flex: 1, minWidth: 0 },
  text: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 19.6 },
})
