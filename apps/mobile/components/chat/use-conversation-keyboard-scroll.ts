import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { Keyboard } from 'react-native'

interface ScrollableConversation {
  scrollToEnd: (params?: { animated?: boolean }) => void
}

const alwaysFollow = () => true

export function useConversationKeyboardScroll(
  listRef: RefObject<ScrollableConversation | null>,
  shouldFollow: () => boolean = alwaysFollow,
) {
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

  const followAfterDismissal = useCallback(() => {
    if (!restoreOnLayout.current) return
    if (shouldFollow()) listRef.current?.scrollToEnd({ animated: false })
    restoreOnLayout.current = false
  }, [listRef, shouldFollow])

  const onLayout = useCallback(() => {
    if (restoreOnLayout.current) {
      followAfterDismissal()
    } else if (keyboardVisible.current && composerFocused.current && shouldFollow()) {
      listRef.current?.scrollToEnd({ animated: false })
    }
  }, [listRef, followAfterDismissal, shouldFollow])

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
      requestAnimationFrame(followAfterDismissal)
    })
    return () => {
      show.remove()
      hide.remove()
    }
  }, [listRef, followAfterDismissal, shouldFollow])

  return { onLayout, onComposerFocus, onComposerBlur }
}
