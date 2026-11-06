import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, StyleSheet, View, type GestureResponderEvent } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { ASTRA_BUTTON_SIZE, ASTRA_BUTTON_GAP, ASTRA_BUTTON_CLEARANCE, ASTRA_DRAG_THRESHOLD, ASTRA_POSITION_KEY, clampAstraButton, getAstraButtonClearance, moveAstraButton, parseAstraButtonPosition, resolveAstraButtonArea, snapAstraButton, type AstraButtonArea, type AstraButtonPoint, type AstraMoveDirection } from '@orbit/shared/utils'
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
  const [viewport, setViewport] = useState<AstraButtonArea>({ width: 0, height: 0 })
  const area = resolveAstraButtonArea({ top: 0, bottom: viewport.height, width: viewport.width }, [viewport.height - chrome.floorInset])
  const pageBottom = viewport.height - chrome.pageInset
  const [saved, setSaved] = useState<AstraButtonPoint | null>(null)
  const [dragged, setDragged] = useState<AstraButtonPoint | null>(null)
  const [snapping, setSnapping] = useState(false)
  const [moving, setMoving] = useState(false)
  const openConversation = useUIStore(state => state.setAstraConversationOpen)
  const blocked = useUIStore(state => state.showCreateModal || state.isSelectMode || state.openOverlayIds.length > 0 || state.astraConversationOpen)
  const obstacles = [
    ...(hasFab ? [{ x: (area.width + Math.min(area.width, SHELL_CONTENT_MAX_WIDTH)) / 2 - 76, y: pageBottom - 76, width: 60, height: 60 }] : []),
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
  const translation = useAstraTranslation(positionX, positionY, snapping, !!dragged, reducedMotion)
  function finish(point: AstraButtonPoint) {
    const next = snapAstraButton(point, area, obstacles)
    setSnapping(true)
    setDragged(null)
    setSaved(next)
    void AsyncStorage.setItem(ASTRA_POSITION_KEY, JSON.stringify(next)).catch(captureError)
  }
  const { cancelGesture, ...gesture } = useAstraGesture(position, translation, area, setDragged, finish)
  const renderedPosition = position && (snapping && !dragged && !reducedMotion ? translation : position)
  return <View testID="astra-button-area" pointerEvents="box-none" style={[styles.area, { top: chrome.top }, sideInsets]} onLayout={event => { setSnapping(false); setViewport(event.nativeEvent.layout) }}>
    {(position || area.width === 0) && !blocked ? <Animated.View testID="astra-button-position"
      {...gesture}
      style={[styles.position, renderedPosition ? { left: 0, top: 0, transform: [{ translateX: renderedPosition.x }, { translateY: renderedPosition.y }] } : { right: ASTRA_BUTTON_GAP, bottom: chrome.pageInset + ASTRA_BUTTON_SIZE + ASTRA_BUTTON_GAP + ASTRA_BUTTON_CLEARANCE }]}>
      <Fab neutral lifted={dragged !== null} testID="astra-button" label={t('shell.astraButton.open')} accessibilityHint={t('shell.astraButton.hint')}
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

function useAstraTranslation(positionX: number | undefined, positionY: number | undefined, snapping: boolean, dragging: boolean, reducedMotion: boolean) {
  const translation = useMemo(() => ({ x: new Animated.Value(0), y: new Animated.Value(0) }), [])
  useEffect(() => {
    if (positionX === undefined || positionY === undefined) return
    if (!snapping || reducedMotion || dragging) { translation.x.stopAnimation(); translation.y.stopAnimation(); translation.x.setValue(positionX); translation.y.setValue(positionY); return }
    const easing = toAnimatedEasing(motionEasings.enter)
    const animation = Animated.parallel([
      Animated.timing(translation.x, { toValue: positionX, duration: motionDurations.base, easing, useNativeDriver: true }),
      Animated.timing(translation.y, { toValue: positionY, duration: motionDurations.base, easing, useNativeDriver: true }),
    ])
    animation.start()
    return () => animation.stop()
  }, [positionX, positionY, dragging, reducedMotion, snapping, translation])
  return translation
}

interface AstraGesture {
  pointer: AstraButtonPoint
  latest: AstraButtonPoint
  button: AstraButtonPoint | null
  dragging: boolean
  released: boolean
}

function useAstraGesture(position: AstraButtonPoint | null, translation: ReturnType<typeof useAstraTranslation>, area: AstraButtonArea,
  onDrag: (point: AstraButtonPoint | null) => void, onFinish: (point: AstraButtonPoint) => void) {
  const origin = useRef<AstraGesture | null>(null)
  function continueGesture(start: AstraGesture) {
    if (origin.current !== start || !start.button || !start.dragging) return
    const point = clampAstraButton({ x: start.button.x + start.latest.x - start.pointer.x,
      y: start.button.y + start.latest.y - start.pointer.y }, area)
    if (start.released) { origin.current = null; onFinish(point) }
    else onDrag(point)
  }
  function updateGesture(event: GestureResponderEvent, released = false) {
    const start = origin.current
    if (!start) return
    start.latest = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }
    start.dragging = true
    start.released = released
    continueGesture(start)
  }
  const cancelGesture = () => { origin.current = null; onDrag(null) }
  return {
    cancelGesture,
    onStartShouldSetResponderCapture: (event: GestureResponderEvent) => {
      const pointer = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }
      const start: AstraGesture | null = position ? { pointer, latest: pointer, button: null, dragging: false, released: false } : null
      origin.current = start
      if (start) {
        let displayedX: number | undefined
        let displayedY: number | undefined
        const capture = () => {
          if (displayedX === undefined || displayedY === undefined) return
          start.button = { x: displayedX, y: displayedY }
          continueGesture(start)
        }
        translation.x.stopAnimation(x => { displayedX = x; capture() })
        translation.y.stopAnimation(y => { displayedY = y; capture() })
      }
      return false
    },
    onMoveShouldSetResponderCapture: (event: GestureResponderEvent) => !!origin.current && Math.hypot(event.nativeEvent.pageX - origin.current.pointer.x, event.nativeEvent.pageY - origin.current.pointer.y) >= ASTRA_DRAG_THRESHOLD,
    onResponderGrant: updateGesture,
    onResponderMove: updateGesture,
    onResponderRelease: (event: GestureResponderEvent) => updateGesture(event, true),
    onResponderTerminate: cancelGesture,
  }
}
