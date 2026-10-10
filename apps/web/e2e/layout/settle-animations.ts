export async function settleAnimations(scope: Document | Element = document): Promise<void> {
  const waited = new Set<Promise<Animation>>()
  let animations = scope.getAnimations({ subtree: true })
  do {
    const finished = animations.map((animation) => animation.finished)
    for (const promise of finished) waited.add(promise)
    await Promise.allSettled(finished)
    animations = scope.getAnimations({ subtree: true }).filter((animation) => !waited.has(animation.finished))
  } while (animations.length > 0)
}
