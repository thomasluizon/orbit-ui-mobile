import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { Keyboard } from 'react-native'

interface ScrollableConversation {
  scrollToEnd: (params?: { animated?: boolean }) => void
  scrollToOffset: (params: { offset: number; animated?: boolean }) => void
}

export function useConversationKeyboardScroll(
  listRef: RefObject<ScrollableConversation | null>,
) {
  const previousOffset = useRef(0)
  const keyboardVisible = useRef(false)
  const restoreOnLayout = useRef(false)

  const restorePreviousOffset = useCallback(() => {
    if (!restoreOnLayout.current) return
    listRef.current?.scrollToOffset({ offset: previousOffset.current, animated: false })
    restoreOnLayout.current = false
  }, [listRef])

  const onScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    if (!keyboardVisible.current && !restoreOnLayout.current) {
      previousOffset.current = event.nativeEvent.contentOffset.y
    }
  }, [])

  const onLayout = useCallback(() => {
    if (restoreOnLayout.current) {
      restorePreviousOffset()
    } else if (keyboardVisible.current) {
      listRef.current?.scrollToEnd({ animated: false })
    }
  }, [listRef, restorePreviousOffset])

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      keyboardVisible.current = true
      restoreOnLayout.current = false
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }))
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
  }, [listRef, restorePreviousOffset])

  return { onScroll, onLayout }
}
