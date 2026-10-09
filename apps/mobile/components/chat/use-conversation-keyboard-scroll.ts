import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { Keyboard } from 'react-native'

interface ScrollableConversation {
  scrollToEnd: (params?: { animated?: boolean }) => void
  scrollToOffset: (params: { offset: number; animated?: boolean }) => void
}

const alwaysFollow = () => true

export function useConversationKeyboardScroll(
  listRef: RefObject<ScrollableConversation | null>,
  shouldFollow: () => boolean = alwaysFollow,
) {
  const previousOffset = useRef(0)
  const keyboardVisible = useRef(false)
  const composerFocused = useRef(false)
  const restoreOnLayout = useRef(false)

  const onComposerFocus = useCallback(() => {
    composerFocused.current = true
    if (keyboardVisible.current && shouldFollow()) listRef.current?.scrollToEnd({ animated: false })
  }, [listRef, shouldFollow])

  const onComposerBlur = useCallback(() => {
    composerFocused.current = false
  }, [])

  const restorePreviousOffset = useCallback(() => {
    if (!restoreOnLayout.current) return
    if (shouldFollow()) listRef.current?.scrollToOffset({ offset: previousOffset.current, animated: false })
    restoreOnLayout.current = false
  }, [listRef, shouldFollow])

  const onScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    if (!keyboardVisible.current && !restoreOnLayout.current) {
      previousOffset.current = event.nativeEvent.contentOffset.y
    }
  }, [])

  const onLayout = useCallback(() => {
    if (restoreOnLayout.current) {
      restorePreviousOffset()
    } else if (keyboardVisible.current && composerFocused.current && shouldFollow()) {
      listRef.current?.scrollToEnd({ animated: false })
    }
  }, [listRef, restorePreviousOffset, shouldFollow])

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      keyboardVisible.current = true
      restoreOnLayout.current = false
      if (composerFocused.current && shouldFollow()) {
        requestAnimationFrame(() => {
          if (shouldFollow()) listRef.current?.scrollToEnd({ animated: false })
        })
      }
    })
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardVisible.current = false
      restoreOnLayout.current = true
      requestAnimationFrame(restorePreviousOffset)
    })
    return () => {
      show.remove()
      hide.remove()
    }
  }, [listRef, restorePreviousOffset, shouldFollow])

  return { onScroll, onLayout, onComposerFocus, onComposerBlur }
}
