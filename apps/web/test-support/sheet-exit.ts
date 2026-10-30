export function goBackDuringSheetExit(button: Element) {
  return new Promise<{ mountedDuringBack: boolean; animationCount: number }>((resolve, reject) => {
    if (!(button instanceof HTMLButtonElement)) { reject(new Error('Expected the Keep editing button')); return }
    const panel = button.closest('[role="dialog"]')
    if (!panel) { reject(new Error('Expected the discard dialog')); return }
    let frame = 0
    let animations: Animation[] = []
    const observer = new MutationObserver(() => {
      if (!panel.hasAttribute('data-ending-style')) return
      observer.disconnect()
      waitForAnimation()
    })
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error(animations.length
        ? 'Expected browser Back to restore the creation guard during sheet exit'
        : 'Expected a real sheet exit transition'))
    }, 3000)
    function cleanup() {
      observer.disconnect()
      cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
      window.removeEventListener('popstate', onRestored)
      animations.forEach((animation) => animation.play())
    }
    const onRestored = () => {
      if (Reflect.get(Object(history.state), 'orbitHabitCreateSentinel') !== true) return
      const mountedDuringBack = panel.isConnected && panel.hasAttribute('data-ending-style')
      cleanup()
      resolve({ mountedDuringBack, animationCount: animations.length })
    }
    const waitForAnimation = () => {
      animations = panel.hasAttribute('data-ending-style') ? panel.getAnimations() : []
      if (!animations.length) {
        frame = requestAnimationFrame(waitForAnimation)
        return
      }
      animations.forEach((animation) => animation.pause())
      window.addEventListener('popstate', onRestored)
      history.back()
    }
    const waitForEntrance = () => {
      if (panel.hasAttribute('data-starting-style') || panel.getAnimations().length) {
        frame = requestAnimationFrame(waitForEntrance)
        return
      }
      observer.observe(panel, { attributes: true, attributeFilter: ['data-ending-style'] })
      button.click()
    }
    frame = requestAnimationFrame(waitForEntrance)
  })
}
