import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, StyleSheet, View, type GestureResponderEvent } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { ASTRA_BUTTON_SIZE, ASTRA_BUTTON_GAP, ASTRA_BUTTON_CLEARANCE, ASTRA_DRAG_THRESHOLD, ASTRA_POSITION_KEY, clampAstraButton, moveAstraButton, parseAstraButtonPosition, snapAstraButton, type AstraButtonArea, type AstraButtonPoint, type AstraMoveDirection } from '@orbit/shared/utils'
import { SHELL_CONTENT_MAX_WIDTH, zLayers, motionDurations } from '@orbit/shared/theme'
import { Fab } from '@/components/ui/fab'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { useUIStore } from '@/stores/ui-store'
import { useAppTheme } from '@/lib/use-app-theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { createTokensV2 } from '@/lib/theme'
import { captureError } from '@/lib/sentry'
import { useShellSideInsets } from './shell-side-insets'

export function AstraButton({ hasFab, scrollToTopHeight }: Readonly<{ hasFab: boolean; scrollToTopHeight: number }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const reducedMotion = usePrefersReducedMotion()
  const sideInsets = useShellSideInsets()
  const [area, setArea] = useState<AstraButtonArea>({ width: 0, height: 0 })
  const [saved, setSaved] = useState<AstraButtonPoint | null>(null)
  const [dragged, setDragged] = useState<AstraButtonPoint | null>(null)
  const [snapping, setSnapping] = useState(false)
  const origin = useRef<{ pointer: AstraButtonPoint; button: AstraButtonPoint } | null>(null)
  const openConversation = useUIStore(state => state.setAstraConversationOpen)
  const blocked = useUIStore(state => state.showCreateModal || state.isSelectMode || state.openOverlayIds.length > 0 || state.astraConversationOpen)
  const obstacles = [
    ...(hasFab ? [{ x: (area.width + Math.min(area.width, SHELL_CONTENT_MAX_WIDTH)) / 2 - 76, y: area.height - 76, width: 60, height: 60 }] : []),
    ...(scrollToTopHeight ? [{ x: 0, y: 8, width: area.width, height: scrollToTopHeight }] : []),
  ]
  const position = dragged ?? snapAstraButton(saved, area, obstacles)
  const positionX = position?.x
  const positionY = position?.y
  const translation = useMemo(() => ({ x: new Animated.Value(0), y: new Animated.Value(0) }), [])
  useEffect(() => {
    let active = true
    void AsyncStorage.getItem(ASTRA_POSITION_KEY).then(stored => { if (active) setSaved(parseAstraButtonPosition(stored)) }).catch(captureError)
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (dragged || !saved || positionX === undefined || positionY === undefined || saved.x === positionX && saved.y === positionY) return
    let active = true
    void Promise.resolve().then(() => {
      if (!active) return
      const next = { x: positionX, y: positionY }
      setSaved(next)
      return AsyncStorage.setItem(ASTRA_POSITION_KEY, JSON.stringify(next))
    }).catch(captureError)
    return () => { active = false }
  }, [saved, dragged, positionX, positionY])
  useEffect(() => {
    if (positionX === undefined || positionY === undefined) return
    if (!snapping || reducedMotion || dragged) { translation.x.stopAnimation(); translation.y.stopAnimation(); translation.x.setValue(positionX); translation.y.setValue(positionY); return }
    const animation = Animated.parallel([
      Animated.timing(translation.x, { toValue: positionX, duration: motionDurations.base, useNativeDriver: true }),
      Animated.timing(translation.y, { toValue: positionY, duration: motionDurations.base, useNativeDriver: true }),
    ])
    animation.start()
    return () => animation.stop()
  }, [positionX, positionY, dragged, reducedMotion, snapping, translation])
  function finish(point: AstraButtonPoint) {
    const next = snapAstraButton(point, area, obstacles)
    setSnapping(true)
    setDragged(null)
    setSaved(next)
    void AsyncStorage.setItem(ASTRA_POSITION_KEY, JSON.stringify(next)).catch(captureError)
  }
  function gesturePoint(event: GestureResponderEvent) {
    const start = origin.current!
    return clampAstraButton({ x: start.button.x + event.nativeEvent.pageX - start.pointer.x,
      y: start.button.y + event.nativeEvent.pageY - start.pointer.y }, area)
  }
  const renderedPosition = position && (snapping && !dragged && !reducedMotion ? translation : position)
  return <View testID="astra-button-area" pointerEvents="box-none" style={[StyleSheet.absoluteFill, sideInsets]} onLayout={event => { setSnapping(false); setArea(event.nativeEvent.layout) }}>
    {(position || area.width === 0) && !blocked ? <Animated.View testID="astra-button-position"
      onStartShouldSetResponderCapture={event => {
        origin.current = position ? { pointer: { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }, button: position } : null
        return false
      }}
      onMoveShouldSetResponderCapture={event => !!origin.current && Math.hypot(event.nativeEvent.pageX - origin.current.pointer.x, event.nativeEvent.pageY - origin.current.pointer.y) >= ASTRA_DRAG_THRESHOLD}
      onResponderGrant={event => { if (origin.current) setDragged(gesturePoint(event)) }}
      onResponderMove={event => { if (origin.current) setDragged(gesturePoint(event)) }}
      onResponderRelease={event => { if (origin.current) finish(gesturePoint(event)); origin.current = null }}
      onResponderTerminate={() => { origin.current = null; setDragged(null) }}
      style={[styles.position, renderedPosition ? { left: 0, top: 0, transform: [{ translateX: renderedPosition.x }, { translateY: renderedPosition.y }, { scale: dragged ? 0.96 : 1 }] } : { right: ASTRA_BUTTON_GAP, bottom: ASTRA_BUTTON_SIZE + ASTRA_BUTTON_GAP + ASTRA_BUTTON_CLEARANCE }]}>
      <Fab neutral testID="astra-button" label={t('shell.astraButton.open')} accessibilityHint={t('shell.astraButton.hint')}
        accessibilityActions={(['left', 'right', 'up', 'down'] as const).map(direction => ({ name: direction, label: t(`shell.astraButton.${direction}`) }))}
        onAccessibilityAction={event => {
          const direction = event.nativeEvent.actionName
          if (position && ['left', 'right', 'up', 'down'].includes(direction)) finish(moveAstraButton(position, direction as AstraMoveDirection, area))
        }} onClick={() => openConversation(true)}><AstraGlyph size={24} color={tokens.fg1} /></Fab>
    </Animated.View> : null}
  </View>
}

const styles = StyleSheet.create({ position: { position: 'absolute', width: ASTRA_BUTTON_SIZE, height: ASTRA_BUTTON_SIZE, zIndex: zLayers.sticky } })
