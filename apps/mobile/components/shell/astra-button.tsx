import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { ASTRA_BUTTON_SIZE, ASTRA_BUTTON_GAP, ASTRA_BUTTON_CLEARANCE, ASTRA_BUTTON_AT_REST, ASTRA_POSITION_KEY, advanceAstraButtonGesture, getAstraButtonClearance, moveAstraButton, parseAstraButtonPosition, resolveAstraButtonArea, snapAstraButton, type AstraButtonArea, type AstraButtonGesture, type AstraButtonGestureEvent, type AstraButtonPoint, type AstraMoveDirection } from '@orbit/shared/utils'
import { SHELL_CONTENT_MAX_WIDTH, zLayers, motionDurations, motionEasings } from '@orbit/shared/theme'
import { Fab } from '@/components/ui/fab'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { useUIStore } from '@/stores/ui-store'
import { useAppTheme } from '@/lib/use-app-theme'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { createTokensV2 } from '@/lib/theme'
import { captureError } from '@/lib/sentry'
import { useShellSideInsets } from './shell-side-insets'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { ListRow } from '@/components/ui/list-row'

export interface AstraButtonChrome {
  top: number
  floorInset: number
  pageInset: number
  scrollToTopTop: number
  scrollToTopHeight: number
}

export function AstraButton({ hasFab, chrome, onClearanceChange }: Readonly<{ hasFab: boolean; chrome: AstraButtonChrome; onClearanceChange?: (height: number) => void }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const reducedMotion = usePrefersReducedMotion()
  const sideInsets = useShellSideInsets()
  const windowWidth = useWindowDimensions().width
  const fallbackRight = ASTRA_BUTTON_GAP + Math.max(0, (windowWidth - sideInsets.left - sideInsets.right - SHELL_CONTENT_MAX_WIDTH) / 2)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const columnStart = (viewport.width - Math.min(viewport.width, SHELL_CONTENT_MAX_WIDTH)) / 2
  const area = resolveAstraButtonArea({ top: 0, bottom: viewport.height, width: viewport.width }, [viewport.height - chrome.floorInset],
    { start: columnStart, end: viewport.width - columnStart })
  const pageBottom = viewport.height - chrome.pageInset
  const [saved, setSaved] = useState<AstraButtonPoint | null>(null)
  const [dragged, setDragged] = useState<AstraButtonPoint | null>(null)
  const [snapping, setSnapping] = useState(false)
  const [moving, setMoving] = useState(false)
  const openConversation = useUIStore(state => state.setAstraConversationOpen)
  const blocked = useUIStore(state => state.showCreateModal || state.isSelectMode || state.openOverlayIds.length > 0 || state.astraConversationOpen)
  const obstacles = [
    ...(hasFab ? [{ x: area.column.end - ASTRA_BUTTON_SIZE - ASTRA_BUTTON_GAP, y: pageBottom - 76, width: 60, height: 60 }] : []),
    ...(chrome.scrollToTopHeight ? [{ x: 0, y: chrome.scrollToTopTop, width: area.width, height: chrome.scrollToTopHeight }] : []),
  ]
  const position = dragged ?? snapAstraButton(saved, area, obstacles)
  const positionX = position?.x
  const positionY = position?.y
  const clearance = blocked ? 0 : getAstraButtonClearance(position, pageBottom)
  useEffect(() => { onClearanceChange?.(clearance) }, [clearance, onClearanceChange])
  useEffect(() => () => onClearanceChange?.(0), [onClearanceChange])
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
  const snapMotion = useAstraTranslation(positionX, positionY, snapping, !!dragged, reducedMotion)
  function finish(point: AstraButtonPoint) {
    const next = snapAstraButton(point, area, obstacles)
    setSnapping(true)
    setDragged(null)
    setSaved(next)
    void AsyncStorage.setItem(ASTRA_POSITION_KEY, JSON.stringify(next)).catch(captureError)
  }
  const { cancelGesture, ...gesture } = useAstraGesture(position, snapMotion, area, setDragged, finish)
  const renderedPosition = position && (snapping && !dragged && !reducedMotion ? snapMotion.translation : position)
  return <View testID="astra-button-area" pointerEvents="box-none" style={[styles.area, { top: chrome.top }, sideInsets]} onLayout={event => { setSnapping(false); setViewport(event.nativeEvent.layout) }}>
    {(position || area.width === 0) && !blocked ? <Animated.View testID="astra-button-position"
      {...gesture}
      style={[styles.position, renderedPosition ? { left: 0, top: 0, transform: [{ translateX: renderedPosition.x }, { translateY: renderedPosition.y }] } : { right: fallbackRight, bottom: chrome.pageInset + ASTRA_BUTTON_SIZE + ASTRA_BUTTON_GAP + ASTRA_BUTTON_CLEARANCE }]}>
      <Fab neutral blockNativeResponder lifted={dragged !== null} testID="astra-button" label={t('shell.astraButton.open')} accessibilityHint={t('shell.astraButton.hint')}
        accessibilityActions={(['left', 'right', 'up', 'down'] as const).map(direction => ({ name: direction, label: t(`shell.astraButton.${direction}`) }))}
        onAccessibilityAction={event => {
          const direction = event.nativeEvent.actionName
          if (position && ['left', 'right', 'up', 'down'].includes(direction)) finish(moveAstraButton(position, direction as AstraMoveDirection, area))
        }} onLongPress={() => { cancelGesture(); setMoving(true) }} onClick={() => { cancelGesture(); openConversation(true) }}><AstraGlyph size={24} color={tokens.fg1} /></Fab>
    </Animated.View> : null}
    {moving ? <AstraMoveSheet onMove={direction => { if (position) finish(moveAstraButton(position, direction, area)) }} onClose={() => setMoving(false)} /> : null}
  </View>
}

const styles = StyleSheet.create({
  area: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: zLayers.sticky },
  position: { position: 'absolute', width: ASTRA_BUTTON_SIZE, height: ASTRA_BUTTON_SIZE, zIndex: zLayers.sticky },
})

function AstraMoveSheet({ onMove, onClose }: Readonly<{ onMove: (direction: AstraMoveDirection) => void; onClose: () => void }>) {
  const { t } = useTranslation()
  const { sheetRef, closeSheet } = useSheetHost()
  return <Sheet ref={sheetRef} open title={t('shell.astraButton.move')} onClose={onClose}>
    {(['left', 'right', 'up', 'down'] as const).map(direction => <ListRow key={direction} title={t(`shell.astraButton.${direction}`)}
      icon={`arrow-${direction}`} chevron={false} onClick={() => closeSheet(() => { onClose(); onMove(direction) })} />)}
  </Sheet>
}

/** A native-driven value answers reads only on a later Android animation batch, so a drag could not start where an interrupted snap stopped. */
const SNAP_USES_NATIVE_DRIVER = false

function useAstraTranslation(positionX: number | undefined, positionY: number | undefined, snapping: boolean, dragging: boolean, reducedMotion: boolean) {
  const translation = useMemo(() => ({ x: new Animated.Value(0), y: new Animated.Value(0) }), [])
  const displayed = useRef<AstraButtonPoint>({ x: 0, y: 0 })
  useEffect(() => {
    const xListener = translation.x.addListener(({ value }) => { displayed.current = { ...displayed.current, x: value } })
    const yListener = translation.y.addListener(({ value }) => { displayed.current = { ...displayed.current, y: value } })
    return () => { translation.x.removeListener(xListener); translation.y.removeListener(yListener) }
  }, [translation])
  useEffect(() => {
    if (positionX === undefined || positionY === undefined) return
    if (!snapping || reducedMotion || dragging) { translation.x.stopAnimation(); translation.y.stopAnimation(); translation.x.setValue(positionX); translation.y.setValue(positionY); return }
    const easing = toAnimatedEasing(motionEasings.enter)
    const animation = Animated.parallel([
      Animated.timing(translation.x, { toValue: positionX, duration: motionDurations.base, easing, useNativeDriver: SNAP_USES_NATIVE_DRIVER }),
      Animated.timing(translation.y, { toValue: positionY, duration: motionDurations.base, easing, useNativeDriver: SNAP_USES_NATIVE_DRIVER }),
    ])
    animation.start()
    return () => animation.stop()
  }, [positionX, positionY, dragging, reducedMotion, snapping, translation])
  return { translation, displayed }
}

function pointerOf(event: GestureResponderEvent): AstraButtonPoint {
  return { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }
}

function useAstraGesture(position: AstraButtonPoint | null, { translation, displayed }: ReturnType<typeof useAstraTranslation>, area: AstraButtonArea,
  onDrag: (point: AstraButtonPoint | null) => void, onFinish: (point: AstraButtonPoint) => void) {
  const gesture = useRef<AstraButtonGesture>(ASTRA_BUTTON_AT_REST)
  function advance(event: AstraButtonGestureEvent) {
    gesture.current = advanceAstraButtonGesture(gesture.current, event, area)
    if (gesture.current.phase === 'dragging') onDrag(gesture.current.point)
    if (gesture.current.phase === 'settled') onFinish(gesture.current.point)
  }
  const cancelGesture = () => { gesture.current = ASTRA_BUTTON_AT_REST; onDrag(null) }
  return {
    cancelGesture,
    onStartShouldSetResponderCapture: (event: GestureResponderEvent) => {
      gesture.current = ASTRA_BUTTON_AT_REST
      if (position) {
        translation.x.stopAnimation()
        translation.y.stopAnimation()
        gesture.current = advanceAstraButtonGesture(gesture.current, { type: 'press', pointer: pointerOf(event), origin: displayed.current }, area)
      }
      return false
    },
    onMoveShouldSetResponderCapture: (event: GestureResponderEvent) => advanceAstraButtonGesture(gesture.current, { type: 'move', pointer: pointerOf(event) }, area).phase === 'dragging',
    onResponderGrant: (event: GestureResponderEvent) => { advance({ type: 'move', pointer: pointerOf(event) }); return true },
    onResponderMove: (event: GestureResponderEvent) => advance({ type: 'move', pointer: pointerOf(event) }),
    onResponderRelease: (event: GestureResponderEvent) => advance({ type: 'release', pointer: pointerOf(event) }),
    onResponderTerminationRequest: () => false,
    onResponderTerminate: cancelGesture,
  }
}
