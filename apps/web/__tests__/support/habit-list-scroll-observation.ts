export function observeBulkSkip(scroller: Element, frameDelay: number) {
  return { finished: new Promise<{
    departures: number
    offsets: { offset: number; departing: boolean }[]
    minimum: string
    remaining: number
    viewport: number
    maximum: number
  }>((done) => {
    const offsets: { offset: number; departing: boolean }[] = []
    let departures = 0
    let frame = 0
    let frameTimer = 0
    const finish = () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      clearTimeout(frameTimer)
      clearTimeout(deadline)
      done({ departures, offsets, remaining: scroller.querySelectorAll('[data-testid="habit-row"]').length,
        maximum: scroller.scrollHeight - scroller.clientHeight, viewport: scroller.clientHeight,
        minimum: scroller.querySelector<HTMLElement>('[data-shell-page-content]')!.style.minHeight })
    }
    const sample = () => {
      const departing = scroller.querySelectorAll('[data-list-motion][inert] [data-testid="habit-row"]').length
      departures = Math.max(departures, departing)
      offsets.push({ offset: scroller.scrollTop, departing: departing > 0 })
    }
    const sampleFrame = () => {
      sample()
      if (departures > 0 && scroller.querySelector('[data-testid="habit-row"]') === null) finish()
      else scheduleFrame()
    }
    const scheduleFrame = () => {
      frameTimer = window.setTimeout(() => { frame = requestAnimationFrame(sampleFrame) }, frameDelay)
    }
    const observer = new MutationObserver(sample)
    observer.observe(scroller, { subtree: true, childList: true, attributes: true, attributeFilter: ['inert'] })
    const deadline = window.setTimeout(finish, 5000)
    sample()
    scheduleFrame()
  }) }
}
