import { useEffect, useMemo, useRef, useState } from 'react'
import type { ToastProps } from '@orbit/shared/contracts/feedback'
import { zLayers } from '@orbit/shared/theme'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Check } from '@/components/ui/icons'
import { createTokensV2, radius, shadowsV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useAppToastStore } from '@/stores/app-toast-store'

const MINIMUM_DONE_LIFE_MS = 5000

function useDoneTimer(
  kind: ToastProps['kind'],
  message: string,
  doneAfterMs: number | undefined,
  onDone: (() => void) | undefined,
  paused: boolean,
) {
  const remainingMs = useRef(MINIMUM_DONE_LIFE_MS)
  const completed = useRef(false)

  useEffect(() => {
    remainingMs.current = Math.max(MINIMUM_DONE_LIFE_MS, doneAfterMs ?? MINIMUM_DONE_LIFE_MS)
    completed.current = false
  }, [doneAfterMs, kind, message, onDone])

  useEffect(() => {
    if (kind !== 'done' || paused || completed.current || !onDone) return

    const startedAt = Date.now()
    const timer = setTimeout(() => {
      if (completed.current) return
      completed.current = true
      remainingMs.current = 0
      onDone()
    }, remainingMs.current)

    return () => {
      clearTimeout(timer)
      if (!completed.current) {
        remainingMs.current = Math.max(0, remainingMs.current - (Date.now() - startedAt))
      }
    }
  }, [kind, onDone, paused])
}

function WorkingMark({ color }: Readonly<{ color: string }>) {
  return (
    <View style={styles.workingMark} testID="toast-working-mark" accessibilityElementsHidden>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  )
}

/** Stable Android live-region feedback. It owns no position, scrim, focus, or z-index. */
export function Toast(props: Readonly<ToastProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const [announcedMessage, setAnnouncedMessage] = useState('')
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const onDone = props.kind === 'done' ? props.onDone : undefined
  const doneAfterMs = props.kind === 'done' ? props.doneAfterMs : undefined

  useDoneTimer(props.kind, props.message, doneAfterMs, onDone, hovered || focused)

  useEffect(() => {
    const timer = setTimeout(() => setAnnouncedMessage(props.message), 0)
    return () => clearTimeout(timer)
  }, [props.message])

  return (
    <Pressable
      accessible
      accessibilityLiveRegion={props.kind === 'lost' ? 'assertive' : 'polite'}
      accessibilityRole={props.kind === 'lost' ? 'alert' : undefined}
      accessibilityLabel={
        props.kind === 'lost' && announcedMessage
          ? `${announcedMessage}. ${props.detail}`
          : announcedMessage
      }
      focusable={false}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.toast,
        {
          backgroundColor: tokens.bgSheet,
          borderColor: tokens.hairline,
        },
      ]}
      testID={`toast-${props.kind}`}
    >
      {props.kind === 'working' ? <WorkingMark color={tokens.fg2} /> : null}
      {props.kind === 'done' ? (
        <View
          style={[styles.doneMark, { backgroundColor: tokens.statusDone }]}
          testID="toast-done-mark"
          accessibilityElementsHidden
        >
          <Check size={16} strokeWidth={2.4} color={tokens.bg} />
        </View>
      ) : null}
      {(props.kind === 'neutral' || props.kind === 'lost') && props.icon ? (
        <View style={styles.icon} accessibilityElementsHidden>
          {props.icon}
        </View>
      ) : null}

      <View style={styles.copy}>
        <Text style={[styles.message, { color: tokens.fg1 }]}>{announcedMessage}</Text>
        {props.kind === 'lost' && announcedMessage ? (
          <Text style={[styles.detail, { color: tokens.fg3 }]}>{props.detail}</Text>
        ) : null}
      </View>

      {(props.kind === 'neutral' || props.kind === 'lost') && props.actionLabel ? (
        <Pressable
          onPress={props.onAction}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityRole="button"
          accessibilityLabel={props.actionLabel}
          hitSlop={8}
          style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}
          testID="toast-action"
        >
          <Text style={[styles.actionText, { color: tokens.fg1 }]}>{props.actionLabel}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  )
}

/** Legacy root mount. The host owns placement and adapts the queue to the prop-driven Toast. */
export function AppToast() {
  const currentToast = useAppToastStore((state) => state.currentToast)
  const triggerAction = useAppToastStore((state) => state.triggerAction)

  if (!currentToast) return null

  const toast = currentToast.toast
  const hostedToast =
    (toast.kind === 'neutral' || toast.kind === 'lost') && toast.actionLabel
      ? { ...toast, onAction: triggerAction }
      : toast

  return (
    <View pointerEvents="box-none" style={styles.host}>
      <Toast {...hostedToast} />
    </View>
  )
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 64,
    left: 16,
    right: 16,
    zIndex: zLayers.toast,
  },
  toast: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: 16,
    ...shadowsV2.shadow2,
  },
  workingMark: { flexDirection: 'row', gap: 4 },
  dot: { width: 4, height: 4, borderRadius: radius.full },
  doneMark: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { flexShrink: 0 },
  copy: { flex: 1, gap: 4 },
  message: { fontFamily: 'Geist_500Medium', fontSize: 14 },
  detail: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
  action: { padding: 8 },
  actionText: {
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  pressed: { opacity: 0.7 },
})
