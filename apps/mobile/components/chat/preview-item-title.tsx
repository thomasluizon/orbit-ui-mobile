import type { PreviewItemTitleProps } from '@orbit/shared/chat'
import { usePreviewTitle } from '@/hooks/use-preview-title'
import { useLayoutEffect, useRef, useState } from 'react'
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native'
import { Input } from '@/components/ui/input'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { PersonalText } from '@/components/ui/personal-text'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'

export function PreviewItemTitle(props: Readonly<PreviewItemTitleProps>) {
  const title = usePreviewTitle(props)
  const [interacting, setInteracting] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const controlRef = useRef<View>(null)
  useLayoutEffect(() => {
    if (!title.editing && title.restoreFocus && controlRef.current) {
      controlRef.current.focus()
      AccessibilityInfo.sendAccessibilityEvent(controlRef.current, 'focus')
    }
  }, [title.editing, title.restoreFocus])
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const titleColor = (pressed: boolean) => {
    if (!props.proposed) return tokens.fg1
    return pressed || interacting ? tokens.fg2 : tokens.fg3
  }
  if (title.editing && props.rename) return <Input hideLabel autoFocus label={props.rename.label} value={title.draft} onChange={title.setDraft} onSubmit={() => void title.save(true)} onBlur={() => void title.save()} onCancel={title.cancel} disabled={props.rename.disabled} />
  return <InsetFocusPressable ref={controlRef} accessibilityRole="button" accessibilityLabel={props.title} accessibilityState={{ disabled: props.rename?.disabled, ...(!props.rename ? { expanded } : {}) }} disabled={props.rename?.disabled} onPress={props.rename ? title.start : () => setExpanded(!expanded)} onFocus={() => setInteracting(true)} onBlur={() => setInteracting(false)} onHoverIn={() => setInteracting(true)} onHoverOut={() => setInteracting(false)} style={({ pressed }) => [styles.row, { backgroundColor: pressed || interacting ? tokens.bgHover : 'transparent' }]}>{({ pressed }) => <>{props.icon ? <Text accessible={false} style={[styles.text, { color: tokens.fg1 }]}>{props.icon}</Text> : null}<View style={styles.words}><PersonalText expanded={!props.rename && expanded} style={{ ...styles.text, color: titleColor(pressed) }}>{props.title}</PersonalText></View></>}</InsetFocusPressable>
}

const styles = StyleSheet.create({
  row: { minHeight: TOUCH_TARGET_MIN, minWidth: 0, marginHorizontal: -8, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4 },
  words: { flex: 1, minWidth: 0 },
  text: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 19.6 },
})
