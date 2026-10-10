export function prepareAnimationSettlementScenario(mode: 'cancel' | 'replace' | 'replay') {
  const scope = document.createElement('div')
  scope.id = 'animation-settlement'
  const target = document.createElement('div')
  target.style.cssText = 'opacity: 1; transition: opacity 60s linear;'
  scope.append(target)
  document.body.append(scope)
  void getComputedStyle(target).opacity
  target.style.opacity = '0'
  const [transition] = target.getAnimations()
  if (!(transition instanceof CSSTransition)) throw new Error('The scenario requires a running CSS transition')
  const readAnimations = scope.getAnimations.bind(scope)
  let reads = 0
  scope.getAnimations = (options) => {
    const animations = readAnimations(options)
    scope.dataset.reads = String(++reads)
    if (reads === 1) queueMicrotask(() => {
      if (mode === 'replay') {
        transition.finish()
        transition.currentTime = 0
        transition.play()
        void transition.finished.then(() => { scope.dataset.settled = 'true' })
        requestAnimationFrame(() => transition.finish())
      } else {
        transition.cancel()
        if (mode === 'replace') {
          const replacement = target.animate([{ opacity: 0 }, { opacity: 1 }], 1)
          void replacement.finished.then(() => { scope.dataset.settled = 'true' })
        } else scope.dataset.settled = 'true'
      }
    })
    return animations
  }
  return { kind: transition.constructor.name, state: transition.playState }
}
